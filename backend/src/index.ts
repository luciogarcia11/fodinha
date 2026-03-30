import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import {
  createRoom,
  getRoom,
  getAllRooms,
  joinRoom,
  rejoinRoom,
  startGame,
  dealRound,
  updateConfig,
  disconnectPlayer,
  listPublicRooms,
  cleanupEmptyRooms,
  addChatMessage,
  addReaction,
  banPlayer as banPlayerRoom,
} from "./game/roomManager";
import {
  resolveVaza,
  calculateTrickState,
  getForbiddenBet,
  applyRoundResult,
  checkGameOver,
  getCardsForRound,
} from "./game/logic";
import {
  initializeDatabase,
  cleanupExpiredRateLimits,
  cleanupOldReactions,
  getGlobalChatMessages,
  addGlobalChatMessage,
} from "./db/schema";
import { getRoomReactions } from "./db/rooms";
import {
  validatePlayerName,
  validateRoomCode,
  validateChatMessage,
  validateEmoji,
  validateBet,
  validateCardIndex,
  validateRoomId,
  validateSessionId,
} from "./middleware/validation";

const app = express();
app.use(cors());
app.use(express.json({ limit: '10kb' }));

const httpServer = createServer(app);

// Initialize database
initializeDatabase();
console.log('💾 SQLite database initialized');

// Periodic cleanup
setInterval(() => {
  cleanupExpiredRateLimits();
  cleanupOldReactions();
}, 60000);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.get("/health", (_, res) => res.json({ ok: true }));

// REST: listar salas públicas
app.get("/api/rooms", (_, res) => {
  res.json(listPublicRooms());
});

// REST: chat global (lobby)
app.get("/api/chat/global", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  res.json(getGlobalChatMessages(limit));
});

// REST: enviar mensagem no chat global
app.post("/api/chat/global", (req, res) => {
  const { playerId, playerName, text } = req.body;

  // Validation
  if (!playerId || !playerName || !text) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (typeof text !== 'string' || text.length > 200) {
    return res.status(400).json({ error: 'Invalid message length' });
  }

  if (playerName.length > 16) {
    return res.status(400).json({ error: 'Invalid player name length' });
  }

  // Sanitize
  const sanitized = text
    .replace(/[<>]/g, c => ({ '<': '&lt;', '>': '&gt;' }[c] ?? c))
    .trim()
    .slice(0, 200);

  if (!sanitized) {
    return res.status(400).json({ error: 'Empty message' });
  }

  const message = addGlobalChatMessage(playerId, playerName, sanitized);
  io.emit('global:chat', message);
  res.json({ success: true, message });
});

// REST: reações de sala
app.get("/api/rooms/:roomId/reactions", (req, res) => {
  const { roomId } = req.params;
  res.json(getRoomReactions(roomId));
});

// Cleanup de salas vazias periódico (a cada 60s)
setInterval(() => cleanupEmptyRooms(), 60000);

// Timers de vote-kick (roomId → timeout)
const voteKickTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Obtém o próximo jogador na ordem de jogo (sentido anti-horário).
 * Usa bettingOrder como referência de ordem.
 */
function getNextPlayer(state: { bettingOrder: string[]; players: { id: string; isEliminated: boolean }[] }, currentPlayerId: string): string {
  const activeOrder = state.bettingOrder.filter(
    id => !state.players.find(p => p.id === id)?.isEliminated
  );
  const idx = activeOrder.indexOf(currentPlayerId);
  return activeOrder[(idx + 1) % activeOrder.length];
}

// Timers de AFK (roomId -> timeout)
const afkTimers = new Map<string, ReturnType<typeof setTimeout>>();

function resetAfkTimer(roomId: string) {
  const existing = afkTimers.get(roomId);
  if (existing) clearTimeout(existing);

  const state = getRoom(roomId);
  if (!state || (state.phase !== 'betting' && state.phase !== 'playing') || state.resolvingTrick) {
    afkTimers.delete(roomId);
    return;
  }

  const timer = setTimeout(() => {
    handleAfkKick(roomId);
  }, 60000); // 1 minuto
  afkTimers.set(roomId, timer);
}

function clearAfkTimer(roomId: string) {
  const existing = afkTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    afkTimers.delete(roomId);
  }
}

function handleAfkKick(roomId: string) {
  const state = getRoom(roomId);
  if (!state) return;
  const targetId = state.currentTurn;
  const target = state.players.find(p => p.id === targetId);
  if (!target) return;

  target.isEliminated = true;
  target.lives = 0;
  
  if (state.phase === "betting") {
    const idx = state.bettingOrder.indexOf(targetId);
    state.bettingOrder = state.bettingOrder.filter((id) => id !== targetId);
    if (state.bettingOrder.length > 0) {
      const nextIdx = Math.min(idx, state.bettingOrder.length - 1);
      state.currentTurn = state.bettingOrder[nextIdx];
      if (Object.keys(state.bets).length >= state.bettingOrder.length) {
        state.phase = "playing";
        state.currentTurn = state.trickLeader;
      }
    }
  } else if (state.phase === "playing") {
    state.currentTrick = state.currentTrick.filter(t => t.playerId !== targetId);
    state.bettingOrder = state.bettingOrder.filter((id) => id !== targetId);
    if (state.players.filter(p => !p.isEliminated).length > 0) {
      state.currentTurn = getNextPlayer(state, targetId);
    }
  } else {
    state.bettingOrder = state.bettingOrder.filter((id) => id !== targetId);
  }

  io.to(targetId).emit("game:kicked", { message: "Você foi removido por inatividade (AFK)." });
  io.to(roomId).emit("game:playerQuit", { playerName: target.name });

  const remaining = state.players.filter(p => !p.isEliminated);
  if (remaining.length < 2) {
    state.phase = "game_over";
    io.to(roomId).emit("game:over", { winnerId: remaining[0]?.id ?? null });
    clearAfkTimer(roomId);
  } else {
    resetAfkTimer(roomId);
  }

  io.to(roomId).emit("game:stateUpdate", state);
}

io.on("connection", (socket) => {
  console.log(`🔌 Conectado: ${socket.id}`);

  // ===== ROOM:CREATE =====
  socket.on("room:create", ({ name }: { name: string }) => {
    try {
      const validatedName = validatePlayerName(name);
      const state = createRoom(socket.id, validatedName);
      socket.join(state.roomId);
      const player = state.players.find(p => p.id === socket.id);
      socket.emit("room:created", {
        roomId: state.roomId,
        state,
        sessionId: player?.sessionId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao criar sala';
      socket.emit("room:error", { message });
    }
  });

  // ===== ROOM:JOIN =====
  socket.on(
    "room:join",
    ({ roomId, name }: { roomId: string; name: string }) => {
      try {
        const validatedName = validatePlayerName(name);
        const validatedRoomId = validateRoomId(roomId);
        const state = joinRoom(validatedRoomId, socket.id, validatedName);
        if (!state) {
          socket.emit("room:error", { message: "Sala não encontrada, cheia ou você está banido." });
          return;
        }
        socket.join(validatedRoomId);
        const player = state.players.find(p => p.id === socket.id);
        socket.emit("room:sessionInfo", { sessionId: player?.sessionId });
        io.to(validatedRoomId).emit("game:stateUpdate", state);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao entrar na sala';
        socket.emit("room:error", { message });
      }
    },
  );

  // ===== ROOM:REJOIN (sessão) =====
  socket.on(
    "room:rejoin",
    ({ roomId, sessionId }: { roomId: string; sessionId: string }) => {
      if (!roomId || !sessionId) {
        socket.emit("room:rejoinFailed", { message: "Dados de sessão inválidos." });
        return;
      }
      const state = rejoinRoom(roomId, sessionId, socket.id);
      if (!state) {
        socket.emit("room:rejoinFailed", { message: "Sala não encontrada ou sessão expirada." });
        return;
      }
      socket.join(roomId);
      io.to(roomId).emit("game:playerReconnected", {
        playerName: state.players.find(p => p.id === socket.id)?.name ?? "Jogador",
      });
      io.to(roomId).emit("game:stateUpdate", state);
    },
  );

  // ===== GAME:CONFIG =====
  socket.on("game:config", ({ roomId, config }: any) => {
    const state = getRoom(roomId);
    if (!state || state.hostId !== socket.id) return;
    const updated = updateConfig(roomId, config);
    if (updated) io.to(roomId).emit("game:stateUpdate", updated);
  });

  // ===== GAME:START =====
  socket.on("game:start", ({ roomId }: { roomId: string }) => {
    const state = getRoom(roomId);
    if (!state || state.hostId !== socket.id) return;
    const started = startGame(roomId);
    if (started) {
      io.to(roomId).emit("game:stateUpdate", started);
      resetAfkTimer(roomId);
    }
  });

  // ===== PLAYER:BET =====
  socket.on(
    "player:bet",
    ({ roomId, bet }: { roomId: string; bet: number }) => {
      try {
        const validatedRoomId = validateRoomId(roomId);
        const state = getRoom(validatedRoomId);
        if (!state || state.phase !== "betting") {
          socket.emit("room:error", { message: "Não é hora de apostar" });
          return;
        }

        if (state.currentTurn !== socket.id) {
          socket.emit("room:error", { message: "Não é sua vez de apostar" });
          return;
        }

        const isLast =
          state.bettingOrder.indexOf(socket.id) === state.bettingOrder.length - 1;
        const forbidden = isLast && state.cardsThisRound > 1
          ? getForbiddenBet(state.bets, state.cardsThisRound)
          : null;

        const validatedBet = validateBet(bet, state.cardsThisRound, forbidden);

        state.bets[socket.id] = validatedBet;

        const idx = state.bettingOrder.indexOf(socket.id);
        if (idx < state.bettingOrder.length - 1) {
          state.currentTurn = state.bettingOrder[idx + 1];
        } else {
          state.phase = "playing";
          state.currentTurn = state.trickLeader;
        }

        io.to(validatedRoomId).emit("game:stateUpdate", state);
        resetAfkTimer(validatedRoomId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao fazer aposta';
        socket.emit("room:error", { message });
      }
    },
  );

  // ===== PLAYER:PLAYCARD =====
  socket.on(
    "player:playCard",
    ({ roomId, cardIndex }: { roomId: string; cardIndex: number }) => {
      const state = getRoom(roomId);
      if (!state || state.phase !== "playing") return;
      if (state.currentTurn !== socket.id) return;
      if (state.resolvingTrick) return;

      const player = state.players.find((p) => p.id === socket.id);
      if (!player || cardIndex < 0 || cardIndex >= player.hand.length) return;

      const [card] = player.hand.splice(cardIndex, 1);
      state.currentTrick.push({ playerId: socket.id, card, annulled: false });

      // Calcula estado da vaza para visualização
      state.trickState = calculateTrickState(
        state.currentTrick,
        state.config.fdpRule,
        state.config.suitTiebreakerRule,
      );

      const activePlayers = state.players.filter((p) => !p.isEliminated);

      if (state.currentTrick.length === activePlayers.length) {
        state.resolvingTrick = true;
        clearAfkTimer(roomId);
        io.to(roomId).emit("game:stateUpdate", state);

        setTimeout(() => {
          const winnerId = resolveVaza(
            state.currentTrick,
            state.config.fdpRule,
            state.config.suitTiebreakerRule,
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

          setTimeout(() => {
            state.resolvingTrick = false;
            state.currentTrick = [];
            state.trickState = null;
            state.trickNumber++;

            if (state.trickNumber > state.cardsThisRound) {
              const { updatedPlayers, eliminated } = applyRoundResult(
                state.players,
                state.bets,
                state.tricksTaken,
              );
              state.players = updatedPlayers;
              state.phase = "round_end";

              state.players = [...state.players];

              io.to(roomId).emit("game:roundEnd", {
                bets: state.bets,
                tricksTaken: state.tricksTaken,
                eliminated,
                players: state.players,
              });

              io.to(roomId).emit("game:stateUpdate", state);

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
                  resetAfkTimer(roomId);
                }, 4000);
              }
            } else {
              // Vaza empatada: quem joga é o último que amarrou (última carta da vaza)
              if (winnerId === null) {
                const lastPlayed = state.currentTrick[state.currentTrick.length - 1];
                state.currentTurn = lastPlayed?.playerId ?? state.trickLeader;
                state.trickLeader = state.currentTurn;
              } else {
                state.currentTurn = winnerId;
              }
              io.to(roomId).emit("game:stateUpdate", state);
              resetAfkTimer(roomId);
            }
          }, 2000);
        }, 2000);
      } else {
        // Próximo jogador na ordem (anti-horário via bettingOrder)
        state.currentTurn = getNextPlayer(state, socket.id);
        io.to(roomId).emit("game:stateUpdate", state);
        resetAfkTimer(roomId);
      }
    },
  );

  // ===== PLAYER:QUIT =====
  socket.on("player:quit", ({ roomId }: { roomId: string }) => {
    const state = getRoom(roomId);
    if (!state) return;

    const quitterName = state.players.find((p) => p.id === socket.id)?.name ?? "Jogador";

    disconnectPlayer(roomId, socket.id);
    // Elimina imediatamente no quit (não espera 30s)
    const player = state.players.find(p => p.id === socket.id);
    if (player) {
      player.isEliminated = true;
      player.lives = 0;
    }
    socket.leave(roomId);

    const activePlayers = state.players.filter((p) => !p.isEliminated);

    if (activePlayers.length < 2) {
      const lastPlayer = activePlayers[0];
      state.phase = "game_over";
      io.to(roomId).emit("game:over", { winnerId: lastPlayer?.id ?? null });
      io.to(roomId).emit("game:stateUpdate", state);
      return;
    }

    // Se era a vez dele apostar, passa para o próximo
    if (state.phase === "betting" && state.currentTurn === socket.id) {
      const idx = state.bettingOrder.indexOf(socket.id);
      state.bettingOrder = state.bettingOrder.filter((id) => id !== socket.id);
      if (state.bettingOrder.length > 0) {
        const nextIdx = Math.min(idx, state.bettingOrder.length - 1);
        state.currentTurn = state.bettingOrder[nextIdx];

        // Se todos já apostaram, começa a jogar
        if (Object.keys(state.bets).length >= state.bettingOrder.length) {
          state.phase = "playing";
          state.currentTurn = state.trickLeader;
        }
      }
    } else {
      state.bettingOrder = state.bettingOrder.filter((id) => id !== socket.id);
    }

    // Se era a vez dele jogar, avança
    if (state.phase === "playing" && state.currentTurn === socket.id) {
      // Remove carta dele da vaza atual se estiver
      state.currentTrick = state.currentTrick.filter(t => t.playerId !== socket.id);
      state.currentTurn = getNextPlayer(state, socket.id);
    }

    io.to(roomId).emit("game:stateUpdate", state);
    io.to(roomId).emit("game:playerQuit", { playerName: quitterName });
    resetAfkTimer(roomId);
  });

  // ===== VOTE:INITIATE =====
  socket.on("vote:initiate", ({ roomId, targetId }: { roomId: string; targetId: string }) => {
    const state = getRoom(roomId);
    if (!state || state.activeVoteKick) return;

    const target = state.players.find(p => p.id === targetId && !p.isEliminated);
    if (!target || target.id === socket.id) return;

    state.activeVoteKick = {
      targetId,
      votes: [socket.id], // Quem inicia já vota a favor
      startTime: Date.now(),
    };

    io.to(roomId).emit("vote:started", {
      targetId,
      targetName: target.name,
      initiatorName: state.players.find(p => p.id === socket.id)?.name ?? "Jogador",
      votes: state.activeVoteKick.votes.length,
      needed: Math.ceil(state.players.filter(p => !p.isEliminated).length / 2),
    });

    // Timer de 30s para expirar votação
    const timer = setTimeout(() => {
      if (state.activeVoteKick?.targetId === targetId) {
        state.activeVoteKick = null;
        io.to(roomId).emit("vote:expired");
        io.to(roomId).emit("game:stateUpdate", state);
      }
      voteKickTimers.delete(roomId);
    }, 30000);
    voteKickTimers.set(roomId, timer);
  });

  // ===== VOTE:CAST =====
  socket.on("vote:cast", ({ roomId }: { roomId: string }) => {
    const state = getRoom(roomId);
    if (!state || !state.activeVoteKick) return;

    const vote = state.activeVoteKick;
    if (vote.votes.includes(socket.id)) return;
    if (socket.id === vote.targetId) return;

    vote.votes.push(socket.id);

    const activePlayers = state.players.filter(p => !p.isEliminated);
    const needed = Math.ceil(activePlayers.length / 2);

    io.to(roomId).emit("vote:update", {
      votes: vote.votes.length,
      needed,
    });

    if (vote.votes.length >= needed) {
      // Kick aprovado
      const targetPlayer = state.players.find(p => p.id === vote.targetId);
      if (targetPlayer) {
        targetPlayer.isEliminated = true;
        targetPlayer.lives = 0;
        state.bettingOrder = state.bettingOrder.filter(id => id !== vote.targetId);

        // Se era a vez dele, avança
        if (state.currentTurn === vote.targetId) {
          state.currentTurn = getNextPlayer(state, vote.targetId);
        }
      }

      io.to(roomId).emit("vote:kickComplete", {
        targetId: vote.targetId,
        targetName: targetPlayer?.name ?? "Jogador",
      });
      // Notifica o kickado
      io.to(vote.targetId).emit("game:kicked", { message: "Você foi removido por votação." });

      state.activeVoteKick = null;
      const kickTimer = voteKickTimers.get(roomId);
      if (kickTimer) { clearTimeout(kickTimer); voteKickTimers.delete(roomId); }

      // Verifica game over
      const remaining = state.players.filter(p => !p.isEliminated);
      if (remaining.length < 2) {
        state.phase = "game_over";
        io.to(roomId).emit("game:over", { winnerId: remaining[0]?.id ?? null });
      }

      io.to(roomId).emit("game:stateUpdate", state);
      resetAfkTimer(roomId);
    }
  });

  // ===== HOST:BAN =====
  socket.on("host:ban", ({ roomId, targetId }: { roomId: string; targetId: string }) => {
    const state = getRoom(roomId);
    if (!state || state.hostId !== socket.id) return;
    if (targetId === socket.id) return;

    const target = state.players.find(p => p.id === targetId);
    if (!target) return;

    // Ban persistent via SQLite
    banPlayerRoom(roomId, target.sessionId, socket.id, 'Banido pelo host');

    // Elimina do jogo
    target.isEliminated = true;
    target.lives = 0;
    state.bettingOrder = state.bettingOrder.filter(id => id !== targetId);

    if (state.currentTurn === targetId) {
      state.currentTurn = getNextPlayer(state, targetId);
    }

    io.to(targetId).emit("game:kicked", { message: "Você foi banido pelo host." });
    io.to(roomId).emit("game:playerQuit", { playerName: target.name });

    // Verifica game over
    const remaining = state.players.filter(p => !p.isEliminated);
    if (remaining.length < 2) {
      state.phase = "game_over";
      io.to(roomId).emit("game:over", { winnerId: remaining[0]?.id ?? null });
    }

    io.to(roomId).emit("game:stateUpdate", state);
    resetAfkTimer(roomId);
  });

  // ===== HOST:KICK =====
  socket.on("host:kick", ({ roomId, targetId }: { roomId: string; targetId: string }) => {
    const state = getRoom(roomId);
    if (!state || state.hostId !== socket.id) return;
    if (targetId === socket.id) return;

    const target = state.players.find(p => p.id === targetId);
    if (!target) return;

    target.isEliminated = true;
    target.lives = 0;
    state.bettingOrder = state.bettingOrder.filter(id => id !== targetId);

    if (state.currentTurn === targetId) {
      state.currentTurn = getNextPlayer(state, targetId);
    }

    io.to(targetId).emit("game:kicked", { message: "Você foi removido pelo host." });
    io.to(roomId).emit("game:playerQuit", { playerName: target.name });

    const remaining = state.players.filter(p => !p.isEliminated);
    if (remaining.length < 2) {
      state.phase = "game_over";
      io.to(roomId).emit("game:over", { winnerId: remaining[0]?.id ?? null });
    }

    io.to(roomId).emit("game:stateUpdate", state);
    resetAfkTimer(roomId);
  });

  // ===== CHAT:SEND =====
  socket.on("chat:send", ({ roomId, text }: { roomId: string; text: string }) => {
    const state = getRoom(roomId);
    if (!state) return;

    const player = state.players.find(p => p.id === socket.id);
    if (!player) return;

    // Rate limiting and sanitization handled in addChatMessage
    const message = addChatMessage(roomId, socket.id, player.name, text);
    if (message) {
      io.to(roomId).emit("chat:message", message);
    }
  });

  // ===== REACTION:SEND =====
  socket.on("reaction:send", ({ roomId, emoji }: { roomId: string; emoji: string }) => {
    const state = getRoom(roomId);
    if (!state) return;

    const player = state.players.find(p => p.id === socket.id);
    if (!player) return;

    // Validate emoji (basic check)
    if (!emoji || typeof emoji !== 'string' || emoji.length > 4) {
      return;
    }

    addReaction(roomId, socket.id, emoji);
    io.to(roomId).emit("reaction:new", {
      playerId: socket.id,
      playerName: player.name,
      emoji,
      timestamp: Date.now(),
    });
  });

  // ===== ROOM:LIST (via socket for real-time) =====
  socket.on("room:list", () => {
    socket.emit("room:list", listPublicRooms());
  });

  // ===== DISCONNECT =====
  socket.on("disconnect", () => {
    console.log(`❌ Desconectado: ${socket.id}`);
    for (const [roomId, state] of getAllRooms()) {
      const player = state.players.find((p) => p.id === socket.id);
      if (!player) continue;

      if (state.phase === "lobby") {
        // No lobby: remove imediatamente
        disconnectPlayer(roomId, socket.id);
        io.to(roomId).emit("game:stateUpdate", state);
        break;
      }

      // Em jogo: marca como desconectado, inicia timer de 30s
      disconnectPlayer(roomId, socket.id, () => {
        // Timer expirou — jogador é eliminado
        const activePlayers = state.players.filter(p => !p.isEliminated);

        // Se era a vez dele, avança
        if (state.currentTurn === socket.id) {
          state.currentTurn = getNextPlayer(state, socket.id);
        }
        state.bettingOrder = state.bettingOrder.filter(id => id !== socket.id);

        // Se está no meio de uma vaza na fase de apostas, verifica se todos apostaram
        if (state.phase === "betting") {
          const remainingBettors = state.bettingOrder.filter(id => !(id in state.bets));
          if (remainingBettors.length === 0) {
            state.phase = "playing";
            state.currentTurn = state.trickLeader;
          }
        }

        // Verifica game over 
        const remaining = state.players.filter(p => !p.isEliminated);
        if (remaining.length < 2) {
          state.phase = "game_over";
          io.to(roomId).emit("game:over", { winnerId: remaining[0]?.id ?? null });
        }

        io.to(roomId).emit("game:stateUpdate", state);
        io.to(roomId).emit("game:playerQuit", { playerName: player.name });
        resetAfkTimer(roomId);
      });

      io.to(roomId).emit("game:playerDisconnected", { playerName: player.name });
      io.to(roomId).emit("game:stateUpdate", state);
      break;
    }
  });
});

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
