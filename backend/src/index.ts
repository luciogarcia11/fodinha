import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import {
  createRoom,
  getRoom,
  getAllRooms,
  joinRoom,
  joinAsSpectator,
  rejoinRoom,
  startGame,
  dealRound,
  updateConfig,
  disconnectPlayer,
  listPublicRooms,
  listWatchableRooms,
  cleanupEmptyRooms,
  deleteRoom,
  addChatMessage,
  addReaction,
  banPlayer as banPlayerRoom,
  setGameOverRoomsRef,
  updateRoomInCache,
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
import { getRoomReactions, checkRateLimit, cleanupInactiveRooms, saveRoom } from "./db/rooms";
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

// Environment variables
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const corsOrigins = CORS_ORIGIN === "*" ? "*" : CORS_ORIGIN.split(",").map(url => url.trim());

const app = express();
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
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

// More frequent cleanup of empty rooms (every 15 seconds)
// cleanupInactiveRooms removes from SQLite; we then purge the same rooms from the in-memory Map.
setInterval(() => {
  const deletedIds = cleanupInactiveRooms();
  for (const roomId of deletedIds) {
    deleteRoom(roomId); // idempotent: no-op if already removed from memory
  }
}, 15000);

const io = new Server(httpServer, {
  cors: { 
    origin: corsOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Cleanup de salas vazias periódico (a cada 30s)
setInterval(() => cleanupEmptyRooms(), 30000);

// Timers de vote-kick (roomId → timeout)
const voteKickTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Cooldown de iniciação de vote-kick (socketId → timestamp da última iniciação)
const voteInitiateCooldowns = new Map<string, number>();

/**
 * Obtém o próximo jogador na ordem de jogo (sentido horário = direita).
 * Usa bettingOrder como referência de ordem.
 */
function getNextPlayer(state: { bettingOrder: string[]; players: { id: string; isEliminated: boolean }[] }, currentPlayerId: string): string {
  const activeOrder = state.bettingOrder.filter(
    id => !state.players.find(p => p.id === id)?.isEliminated
  );
  const idx = activeOrder.indexOf(currentPlayerId);
  // Sentido horário: vai para o próximo na lista (esquerda para direita)
  return activeOrder[(idx + 1) % activeOrder.length];
}

// Timers de AFK (roomId -> timeout)
const afkTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Track rooms that have already ended to prevent duplicate game_over events
const gameOverRooms = new Set<string>();

// Timers de game-over: sala fica aberta 5 min para placar, depois fecha.
const gameOverTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelGameOverTimer(roomId: string): void {
  const t = gameOverTimers.get(roomId);
  if (t) { clearTimeout(t); gameOverTimers.delete(roomId); }
}

function startGameOverTimer(roomId: string): void {
  cancelGameOverTimer(roomId);
  const timer = setTimeout(() => {
    deleteRoom(roomId);
    gameOverRooms.delete(roomId);
    gameOverTimers.delete(roomId);
    io.to(roomId).emit('room:closed');
    console.log(`[Game Over Timer] Sala ${roomId} fechada após 5 minutos`);
  }, 300_000);
  gameOverTimers.set(roomId, timer);
}

// Inicializa a referência no roomManager para limpar quando sala for deletada
setGameOverRoomsRef(gameOverRooms);

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

/**
 * Verifica se o jogo acabou de forma segura, evitando game_over duplicado.
 * Retorna true se o game_over foi emitido, false caso contrário.
 */
function checkAndEmitGameOver(roomId: string, state: any): boolean {
  if (gameOverRooms.has(roomId)) {
    console.log(`[Game Over] Sala ${roomId} já está em game_over, ignorando`);
    return false;
  }

  const remaining = state.players.filter((p: any) => !p.isEliminated);
  if (remaining.length < 2) {
    state.phase = "game_over";
    gameOverRooms.add(roomId);
    saveRoom(state);
    const winner = remaining[0];
    io.to(roomId).emit("game:over", { winnerId: winner?.id ?? null });
    startGameOverTimer(roomId);
    console.log(`[Game Over] Sala ${roomId} finalizada - vencedor: ${winner?.name ?? 'nenhum'}`);
    return true;
  }
  return false;
}

function clearAfkTimer(roomId: string) {
  const existing = afkTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    afkTimers.delete(roomId);
  }
}

function handleAfkKick(roomId: string) {
  try {
    const state = getRoom(roomId);
    if (!state) return;
    const targetId = state.currentTurn;
    const target = state.players.find(p => p.id === targetId);
    if (!target) return;

    // Evita eliminação dupla - verifica se já foi eliminado
    if (target.isEliminated) {
      console.log(`[AFK] Jogador ${target.name} já foi eliminado, ignorando`);
      return;
    }

    console.log(`[AFK] Removendo jogador ${target.name} por inatividade na sala ${roomId}`);
    const nextTurn = getNextPlayer(state, targetId);
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
      state.currentTurn = nextTurn;
    }
  } else {
    state.bettingOrder = state.bettingOrder.filter((id) => id !== targetId);
  }

  io.to(targetId).emit("game:kicked", { message: "Você foi removido por inatividade (AFK)." });
  io.to(roomId).emit("game:playerQuit", { playerName: target.name });

  if (checkAndEmitGameOver(roomId, state)) {
    clearAfkTimer(roomId);
  } else {
    resetAfkTimer(roomId);
  }

  io.to(roomId).emit("game:stateUpdate", state);
  } catch (error) {
    console.error('[AFK] Erro ao processar kick por AFK:', error);
  }
}

io.on("connection", (socket) => {
  console.log(`🔌 Conectado: ${socket.id}`);

  // ===== ROOM:CREATE =====
  socket.on("room:create", ({ name }: { name: string }) => {
    try {
      // Rate limiting: 1 sala por minuto por IP/socket
      if (!checkRateLimit(socket.id, undefined, 'create_room', 1, 60)) {
        socket.emit("room:error", { message: "Aguarde 1 minuto antes de criar outra sala." });
        return;
      }

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
      if (!roomId || !sessionId || typeof roomId !== 'string' || typeof sessionId !== 'string'
          || roomId.length > 10 || sessionId.length > 64) {
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
      // Limpa o flag de game_over ao iniciar um novo jogo
      gameOverRooms.delete(roomId);
      cancelGameOverTimer(roomId);
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

        const bettingPlayer = state.players.find(p => p.id === socket.id);
        if (!bettingPlayer || bettingPlayer.isSpectator) return;

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
      
      // Verifica se o jogador já jogou nesta vaza
      const alreadyPlayed = state.currentTrick.some(trick => trick.playerId === socket.id);
      if (alreadyPlayed) return;

      const player = state.players.find((p) => p.id === socket.id);
      if (!player || player.isSpectator || cardIndex < 0 || cardIndex >= player.hand.length) return;

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

          // Captura o último jogador ANTES de limpar a vaza (necessário para regra do mão na amarração)
          const lastPlayedId = state.currentTrick.length > 0
            ? state.currentTrick[state.currentTrick.length - 1].playerId
            : null;

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

              // Filtra apenas jogadores que não foram eliminados nesta rodada
              const playersToShow = state.players.filter(p => !eliminated.includes(p.id));
              
              io.to(roomId).emit("game:roundEnd", {
                bets: state.bets,
                tricksTaken: state.tricksTaken,
                eliminated,
                players: playersToShow,
              });

              io.to(roomId).emit("game:stateUpdate", state);

              const gameWinner = checkGameOver(state.players);
              if (gameWinner !== null) {
                state.phase = "game_over";
                gameOverRooms.add(roomId);
                io.to(roomId).emit("game:over", { winnerId: gameWinner });
                console.log(`[Round End] Game over na sala ${roomId} - vencedor: ${gameWinner}`);
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
              // Vaza empatada: quem joga a próxima é o último que amarrou
              if (winnerId === null) {
                state.currentTurn = lastPlayedId ?? state.trickLeader;
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

  // ===== PLAYER:BECOMESPECTATOR =====
  socket.on("player:becomeSpectator", ({ roomId }: { roomId: string }) => {
    const state = getRoom(roomId);
    if (!state) return;
    const player = state.players.find(p => p.id === socket.id);
    if (!player || !player.isEliminated) return;
    player.isSpectator = true;
    io.to(roomId).emit("game:stateUpdate", state);
  });

  // ===== PLAYER:QUIT =====
  socket.on("player:quit", ({ roomId }: { roomId: string }) => {
    const state = getRoom(roomId);
    if (!state) return;

    const quitterName = state.players.find((p) => p.id === socket.id)?.name ?? "Jogador";
    const nextTurnQuit = getNextPlayer(state, socket.id);

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
      saveRoom(state);
      io.to(roomId).emit("game:over", { winnerId: lastPlayer?.id ?? null });
      startGameOverTimer(roomId);
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
      state.currentTurn = nextTurnQuit;
    }

    io.to(roomId).emit("game:stateUpdate", state);
    io.to(roomId).emit("game:playerQuit", { playerName: quitterName });
    resetAfkTimer(roomId);
  });

  // ===== VOTE:INITIATE =====
  socket.on("vote:initiate", ({ roomId, targetId }: { roomId: string; targetId: string }) => {
    const state = getRoom(roomId);
    if (!state || state.activeVoteKick) return;

    // Cooldown de 60s por socket para evitar spam
    const lastInitiated = voteInitiateCooldowns.get(socket.id) ?? 0;
    if (Date.now() - lastInitiated < 60_000) {
      const remaining = Math.ceil((60_000 - (Date.now() - lastInitiated)) / 1000);
      socket.emit("room:error", { message: `Aguarde ${remaining}s antes de iniciar outro votekick`, code: "VOTE_COOLDOWN", remaining });
      return;
    }

    const target = state.players.find(p => p.id === targetId && !p.isEliminated);
    if (!target || target.id === socket.id) return;

    voteInitiateCooldowns.set(socket.id, Date.now());

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
    needed: Math.floor(state.players.filter(p => !p.isEliminated).length / 2) + 1,
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
    const needed = Math.floor(activePlayers.length / 2) + 1;

    io.to(roomId).emit("vote:update", {
      votes: vote.votes.length,
      needed,
    });

    if (vote.votes.length >= needed) {
      // Kick aprovado
      const targetPlayer = state.players.find(p => p.id === vote.targetId);
      if (targetPlayer) {
        const nextTurnVote = getNextPlayer(state, vote.targetId);
        targetPlayer.isEliminated = true;
        targetPlayer.lives = 0;
        state.bettingOrder = state.bettingOrder.filter(id => id !== vote.targetId);

        // Se era a vez dele, avança
        if (state.currentTurn === vote.targetId) {
          state.currentTurn = nextTurnVote;
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

      checkAndEmitGameOver(roomId, state);

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
    const nextTurnBan = getNextPlayer(state, targetId);
    target.isEliminated = true;
    target.lives = 0;
    state.bettingOrder = state.bettingOrder.filter(id => id !== targetId);

    if (state.currentTurn === targetId) {
      state.currentTurn = nextTurnBan;
    }

    io.to(targetId).emit("game:kicked", { message: "Você foi banido pelo host." });
    io.to(roomId).emit("game:playerQuit", { playerName: target.name });

    checkAndEmitGameOver(roomId, state);

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

    const nextTurnKick = getNextPlayer(state, targetId);
    target.isEliminated = true;
    target.lives = 0;
    state.bettingOrder = state.bettingOrder.filter(id => id !== targetId);

    if (state.currentTurn === targetId) {
      state.currentTurn = nextTurnKick;
    }

    io.to(targetId).emit("game:kicked", { message: "Você foi removido pelo host." });
    io.to(roomId).emit("game:playerQuit", { playerName: target.name });

    checkAndEmitGameOver(roomId, state);

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

  // ===== GLOBAL CHAT:SEND =====
  socket.on("global:chat", ({ text }: { text: string }) => {
    // Basic sanitization
    const sanitized = text
      .replace(/[<>]/g, c => ({ '<': '&lt;', '>': '&gt;' }[c] ?? c))
      .trim()
      .slice(0, 200);

    if (!sanitized) return;

    // Random generic name since they might not be in a room yet
    const shortId = socket.id.substring(0, 4);
    const playerName = `Visitante-${shortId}`;
    
    // Check rate limit using socket.id as playerId, and undefined as roomId
    if (!checkRateLimit(socket.id, undefined, 'global_chat', 5, 30)) {
       return; // Limit exceeded
    }

    const message = addGlobalChatMessage(socket.id, playerName, sanitized);
    io.emit('global:chat', message);
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

  // ===== ROOM:LIST:WATCHABLE =====
  socket.on("room:listWatchable", () => {
    socket.emit("room:listWatchable", listWatchableRooms());
  });

  // ===== ROOM:JOIN:SPECTATOR =====
  socket.on("room:joinAsSpectator", ({ roomId, name }: { roomId: string; name: string }) => {
    try {
      const validatedName = validatePlayerName(name);
      const validatedRoomId = validateRoomId(roomId);
      const state = joinAsSpectator(validatedRoomId, socket.id, validatedName);
      if (!state) {
        socket.emit("room:error", { message: "Partida não encontrada, já encerrada ou cheia de espectadores." });
        return;
      }
      socket.join(validatedRoomId);
      const player = state.players.find(p => p.id === socket.id);
      socket.emit("room:sessionInfo", { sessionId: player?.sessionId });
      io.to(validatedRoomId).emit("game:stateUpdate", state);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao entrar como espectador';
      socket.emit("room:error", { message });
    }
  });

  // ===== DISCONNECT =====
  socket.on("disconnect", () => {
    console.log(`❌ Desconectado: ${socket.id}`);
    voteInitiateCooldowns.delete(socket.id);
    try {
      for (const [roomId, state] of getAllRooms()) {
        const player = state.players.find((p) => p.id === socket.id);
        if (!player) continue;

        console.log(`[Disconnect] Jogador ${player.name} desconectado da sala ${roomId} (fase: ${state.phase})`);

        if (state.phase === "lobby") {
          // No lobby: remove imediatamente
          disconnectPlayer(roomId, socket.id);
          io.to(roomId).emit("game:stateUpdate", state);
          break;
        }

        // Se está na fase de game_over, apenas marca como desconectado
        // e fecha a sala imediatamente se todos desconectaram
        if (state.phase === "game_over") {
          const p = state.players.find(q => q.id === socket.id);
          if (p) p.connected = false;
          const stillConnected = state.players.filter(q => q.connected);
          if (stillConnected.length === 0) {
            cancelGameOverTimer(roomId);
            deleteRoom(roomId);
            gameOverRooms.delete(roomId);
            io.to(roomId).emit('room:closed');
            console.log(`[Disconnect] Sala ${roomId} fechada imediatamente - todos desconectaram`);
          }
          break;
        }

        // Em jogo: marca como desconectado, inicia timer de 30s
        disconnectPlayer(roomId, socket.id, () => {
          try {
            // Timer expirou — jogador é eliminado
            console.log(`[Disconnect] Timer expirado para jogador ${player.name} na sala ${roomId}`);

            const freshState = getRoom(roomId);
            if (!freshState) {
              console.error(`[Disconnect] Sala ${roomId} não existe mais`);
              return;
            }

            const freshPlayer = freshState.players.find((p) => p.id === socket.id);
            if (!freshPlayer || freshPlayer.isEliminated) {
              console.log(`[Disconnect] Jogador já foi eliminado ou não encontrado, ignorando`);
              return;
            }

            // Elimina o jogador
            const nextTurnDisc = getNextPlayer(freshState, socket.id);
            freshPlayer.isEliminated = true;
            freshPlayer.lives = 0;

            const activePlayers = freshState.players.filter(p => !p.isEliminated);

            // Se era a vez dele, avança
            if (freshState.currentTurn === socket.id) {
              freshState.currentTurn = nextTurnDisc;
            }
            freshState.bettingOrder = freshState.bettingOrder.filter(id => id !== socket.id);

            // Se está no meio de uma vaza na fase de apostas, verifica se todos apostaram
            if (freshState.phase === "betting") {
              const remainingBettors = freshState.bettingOrder.filter(id => !(id in freshState.bets));
              if (remainingBettors.length === 0) {
                freshState.phase = "playing";
                freshState.currentTurn = freshState.trickLeader;
              }
            }

            checkAndEmitGameOver(roomId, freshState);

            io.to(roomId).emit("game:stateUpdate", freshState);
            io.to(roomId).emit("game:playerQuit", { playerName: player.name });
            resetAfkTimer(roomId);
          } catch (error) {
            console.error('[Disconnect] Erro no callback de eliminação:', error);
          }
        });

        io.to(roomId).emit("game:playerDisconnected", { playerName: player.name });
        io.to(roomId).emit("game:stateUpdate", state);
        break;
      }
    } catch (error) {
      console.error('[Disconnect] Erro ao processar desconexão:', error);
    }
  });
});

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
