import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import {
  createRoom,
  getRoom,
  joinRoom,
  startGame,
  dealRound,
  updateConfig,
  disconnectPlayer,
} from "./game/roomManager";
import {
  resolveVaza,
  getForbiddenBet,
  applyRoundResult,
  checkGameOver,
  getCardsForRound,
} from "./game/logic";

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.get("/health", (_, res) => res.json({ ok: true }));

io.on("connection", (socket) => {
  console.log(`🔌 Conectado: ${socket.id}`);

  socket.on("room:create", ({ name }: { name: string }) => {
    const state = createRoom(socket.id, name);
    socket.join(state.roomId);
    socket.emit("room:created", { roomId: state.roomId, state });
  });

  socket.on(
    "room:join",
    ({ roomId, name }: { roomId: string; name: string }) => {
      const state = joinRoom(roomId, socket.id, name);
      if (!state) {
        socket.emit("room:error", { message: "Sala não encontrada ou cheia." });
        return;
      }
      socket.join(roomId);
      io.to(roomId).emit("game:stateUpdate", state);
    },
  );

  socket.on("game:config", ({ roomId, config }: any) => {
    const state = getRoom(roomId);
    if (!state || state.hostId !== socket.id) return;
    const updated = updateConfig(roomId, config);
    if (updated) io.to(roomId).emit("game:stateUpdate", updated);
  });

  socket.on("game:start", ({ roomId }: { roomId: string }) => {
    const state = getRoom(roomId);
    if (!state || state.hostId !== socket.id) return;
    const started = startGame(roomId);
    if (started) io.to(roomId).emit("game:stateUpdate", started);
  });

  socket.on(
    "player:bet",
    ({ roomId, bet }: { roomId: string; bet: number }) => {
      const state = getRoom(roomId);
      if (!state || state.phase !== "betting") return;
      if (state.currentTurn !== socket.id) return;
      if (bet < 0 || bet > state.cardsThisRound) return;

      // Restrição do pé: a soma das apostas não pode ser igual ao número de vazas
      const isLast =
        state.bettingOrder.indexOf(socket.id) === state.bettingOrder.length - 1;
      if (isLast) {
        const forbidden = getForbiddenBet(state.bets, state.cardsThisRound);
        if (forbidden !== null && bet === forbidden) {
          socket.emit("room:error", {
            message: `Você não pode apostar ${forbidden} (seria igual ao número de vazas).`,
          });
          return;
        }
      }

      state.bets[socket.id] = bet;

      const idx = state.bettingOrder.indexOf(socket.id);
      if (idx < state.bettingOrder.length - 1) {
        state.currentTurn = state.bettingOrder[idx + 1];
      } else {
        // Todos apostaram → fase de jogo
        state.phase = "playing";
        state.currentTurn = state.trickLeader;
      }

      io.to(roomId).emit("game:stateUpdate", state);
    },
  );

  socket.on(
    "player:playCard",
    ({ roomId, cardIndex }: { roomId: string; cardIndex: number }) => {
      const state = getRoom(roomId);
      if (!state || state.phase !== "playing") return;
      if (state.currentTurn !== socket.id) return;

      const player = state.players.find((p) => p.id === socket.id);
      if (!player || cardIndex < 0 || cardIndex >= player.hand.length) return;

      const [card] = player.hand.splice(cardIndex, 1);
      state.currentTrick.push({ playerId: socket.id, card, annulled: false });

      const activePlayers = state.players.filter((p) => !p.isEliminated);

      if (state.currentTrick.length === activePlayers.length) {
        io.to(roomId).emit("game:stateUpdate", state);

        setTimeout(() => {
          const winnerId = resolveVaza(
            state.currentTrick,
            state.config.fdpRule,
          );

          if (winnerId) {
            state.tricksTaken[winnerId] =
              (state.tricksTaken[winnerId] ?? 0) + 1;
            state.trickLeader = winnerId;
          }

          io.to(roomId).emit("game:trickResult", {
            trick: state.currentTrick,
            winnerId,
          });

          state.currentTrick = [];
          state.trickNumber++;

          if (state.trickNumber > state.cardsThisRound) {
            const { updatedPlayers, eliminated } = applyRoundResult(
              state.players,
              state.bets,
              state.tricksTaken,
            );
            state.players = updatedPlayers;
            state.phase = "round_end";

            io.to(roomId).emit("game:roundEnd", {
              bets: state.bets,
              tricksTaken: state.tricksTaken,
              eliminated,
              players: state.players,
            });

            const gameWinner = checkGameOver(state.players);
            if (gameWinner !== null) {
              state.phase = "game_over";
              io.to(roomId).emit("game:over", { winnerId: gameWinner });
            } else {
              setTimeout(() => {
                state.round++;
                const activePlayers = state.players.filter(
                  (p) => !p.isEliminated,
                );
                state.dealerIndex =
                  (state.dealerIndex + 1) % activePlayers.length;

                const { cardsThisRound, ascending } = getCardsForRound(
                  state.round,
                  state.config.maxRounds,
                );
                state.cardsThisRound = cardsThisRound;
                state.ascending = ascending;

                dealRound(state);
                io.to(roomId).emit("game:stateUpdate", state);
              }, 4000);
            }
          } else {
            state.currentTurn = winnerId ?? state.trickLeader;
            io.to(roomId).emit("game:stateUpdate", state);
          }
        }, 4000);
      } else {
        const activeIds = activePlayers.map((p) => p.id);
        const currentIdx = activeIds.indexOf(socket.id);
        state.currentTurn = activeIds[(currentIdx + 1) % activeIds.length];
        io.to(roomId).emit("game:stateUpdate", state);
      }
    },
  );

  socket.on("disconnect", () => {
    console.log(`❌ Desconectado: ${socket.id}`);
    // Busca a sala do jogador
    for (const [roomId, state] of rooms as any) {
      const player = state.players.find((p: any) => p.id === socket.id);
      if (player) {
        disconnectPlayer(roomId, socket.id);
        io.to(roomId).emit("game:stateUpdate", state);
        break;
      }
    }
  });
});

// Exporta rooms para o handler de disconnect conseguir acessar
const rooms = new Map();
const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
