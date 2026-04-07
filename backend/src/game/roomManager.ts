import { GameState, GameConfig, Player, ChatMessage } from '../types';
import { buildDeck, buildMultiDeck, shuffleDeck, dealCards, CARDS_PER_DECK, MAX_DECKS, MAX_TOTAL_CARDS } from './deck';
import { getCardsForRound } from './logic';
import crypto from 'crypto';
import {
  saveRoom,
  loadRoom,
  deleteRoom as deleteRoomDB,
  isPlayerBanned,
  addRoomChatMessage,
  addRoomReaction,
  checkRateLimit,
  updateRoomActivity,
  banPlayer as banPlayerDB,
  getBannedPlayers,
  loadRoomLastActivity,
} from '../db/rooms';

// In-memory cache for active rooms (synced with SQLite)
const rooms = new Map<string, GameState>();

// Referência ao Set de gameOverRooms do index.ts para limpar quando sala for deletada
let gameOverRoomsRef: Set<string> | null = null;

export function setGameOverRoomsRef(ref: Set<string>) {
  gameOverRoomsRef = ref;
}

// Timers de reconexão (sessionId → timeout)
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function generateSessionId(): string {
  return crypto.randomUUID();
}

export function createRoom(hostId: string, hostName: string): GameState {
  // Cleanup old rooms before creating new one to prevent accumulation
  cleanupEmptyRooms();
  
  const roomId = generateRoomCode();
  const config: GameConfig = {
    livesPerPlayer: 3,
    fdpRule: false,
    fdpStartDoubleDeck: false,
    cardOnForeheadRule: true,
    suitTiebreakerRule: false,
    maxRounds: 0,
    isPublic: true,
    deckCount: 1,  // Calculado dinamicamente a cada rodada
    maxPlayers: 14,
  };

  const host: Player = {
    id: hostId,
    name: hostName,
    lives: config.livesPerPlayer,
    hand: [],
    connected: true,
    isEliminated: false,
    isSpectator: false,
    sessionId: generateSessionId(),
    wasKicked: false,
  };

  const state: GameState = {
    roomId,
    hostId,
    hostName,
    phase: 'lobby',
    round: 1,
    cardsThisRound: 1,
    ascending: true,
    players: [host],
    currentTurn: '',
    bettingOrder: [],
    bets: {},
    tricksTaken: {},
    currentTrick: [],
    trickLeader: hostId,
    trickNumber: 1,
    dealerIndex: 0,
    resolvingTrick: false,
    config,
    trickState: null,
    activeVoteKick: null,
    bannedIds: [],
    chatMessages: [],
    spectatorQueue: [],
  };

  rooms.set(roomId, state);
  saveRoom(state); // Persist to SQLite
  return state;
}

export function getRoom(roomId: string): GameState | undefined {
  return rooms.get(roomId);
}

export function getAllRooms(): Map<string, GameState> {
  return rooms;
}

/**
 * Update a room in the in-memory cache (used for sync after reload from DB)
 */
export function updateRoomInCache(roomId: string, state: GameState): void {
  rooms.set(roomId, state);
}

export function joinRoom(roomId: string, playerId: string, playerName: string): { state: GameState; result: 'ok' | 'not_found' | 'full' | 'in_progress' | 'invalid_name' | 'banned' } {
  const state = rooms.get(roomId);
  if (!state) return { state: null as any, result: 'not_found' };
  if (state.phase !== 'lobby') {
    if (state.phase === 'game_over') return { state: null as any, result: 'not_found' };
    return { state, result: 'in_progress' };
  }

  // Check if player is banned
  if (isPlayerBanned(roomId, playerId)) return { state: null as any, result: 'banned' };

  const nonSpectators = state.players.filter(p => !p.isSpectator).length;
  if (nonSpectators >= state.config.maxPlayers) return { state, result: 'full' };

  // Validate player name
  if (!playerName || playerName.trim().length === 0 || playerName.trim().length > 16) {
    return { state: null as any, result: 'invalid_name' };
  }

  const existing = state.players.find(p => p.id === playerId);
  if (existing) {
    existing.connected = true;
    return { state, result: 'ok' };
  }

  const newPlayer: Player = {
    id: playerId,
    name: playerName.trim(),
    lives: state.config.livesPerPlayer,
    hand: [],
    connected: true,
    isEliminated: false,
    isSpectator: false,
    sessionId: generateSessionId(),
    wasKicked: false,
  };

  state.players.push(newPlayer);
  saveRoom(state); // Persist to SQLite

  return { state, result: 'ok' };
}

/**
 * Entra como espectador externo em uma partida.
 * Máximo de 10 espectadores por sala. Não adiciona ao bettingOrder.
 * Permite lobby (para salas cheias) e partidas ativas.
 */
export function joinAsSpectator(roomId: string, socketId: string, playerName: string): GameState | null {
  const state = rooms.get(roomId);
  if (!state) return null;
  if (state.phase === 'game_over') return null;

  if (!playerName || playerName.trim().length === 0 || playerName.trim().length > 16) return null;

  const spectatorCount = state.players.filter(p => p.isSpectator).length;
  if (spectatorCount >= 10) return null;

  // Evita duplicação
  const existing = state.players.find(p => p.id === socketId);
  if (existing) {
    existing.connected = true;
    return state;
  }

  const spectator: Player = {
    id: socketId,
    name: playerName.trim(),
    lives: 0,
    hand: [],
    connected: true,
    isEliminated: true,
    isSpectator: true,
    sessionId: generateSessionId(),
    wasKicked: false,
  };

  state.players.push(spectator);
  saveRoom(state);

  return state;
}

/**
 * Reconecta um jogador à sala usando sessionId.
 * Atualiza o socket id do jogador e cancela o timer de desconexão.
 * Garante que o cache em memória esteja sincronizado com o banco de dados.
 */
export function rejoinRoom(roomId: string, sessionId: string, newSocketId: string): GameState | null {
  // Prefer in-memory state to avoid overwriting concurrent changes.
  // Only fall back to DB if room is not in memory (cold-start recovery).
  const liveState = rooms.get(roomId);
  const state = liveState ?? loadRoom(roomId);
  if (!state) return null;

  if (!liveState) {
    rooms.set(roomId, state);
    console.log(`[Rejoin] Sala ${roomId} carregada do banco para jogador ${newSocketId} - chatMessages: ${state.chatMessages.length}`);
  }

  // Check if this session is banned (from SQLite)
  if (isPlayerBanned(roomId, sessionId)) return null;

  const player = state.players.find(p => p.sessionId === sessionId);
  if (!player) return null;

  // Cancela timer de eliminação, se existir
  const timerId = disconnectTimers.get(sessionId);
  if (timerId) {
    clearTimeout(timerId);
    disconnectTimers.delete(sessionId);
  }

  // Kicked players can only rejoin as spectators
  if (player.wasKicked && !player.isSpectator) {
    player.isSpectator = true;
    player.isEliminated = true;
    player.lives = 0;
  }

  player.id = newSocketId;
  player.connected = true;
  updateRoomActivity(roomId); // Update last activity

  return state;
}

/**
 * Recalcula maxRounds baseado no número de jogadores ativos e cartas disponíveis (até 3 baralhos).
 * Deve ser chamado sempre que o número de jogadores ativos mudar.
 */
export function recalcMaxRounds(state: GameState): void {
  const activePlayers = state.players.filter(p => !p.isEliminated && !p.isSpectator);
  if (activePlayers.length < 1) return;
  state.config.maxRounds = Math.floor(MAX_TOTAL_CARDS / activePlayers.length);
}

export function startGame(roomId: string): GameState | null {
  const state = rooms.get(roomId);
  if (!state || state.players.length < 2) return null;

  state.players.forEach(p => {
    if (!p.isSpectator) {
      p.lives = state.config.livesPerPlayer;
      p.isEliminated = false;
    }
  });

  state.dealerIndex = 0;
  state.round = 1;
  state.bannedIds = getBannedPlayers(roomId);

  recalcMaxRounds(state);
  saveRoom(state);
  return dealRound(state);
}

export function dealRound(state: GameState): GameState {
  const activePlayers = state.players.filter(p => !p.isEliminated && !p.isSpectator);
  if (activePlayers.length < 1) return state;

  // Recalcula maxRounds dinamicamente a cada rodada
  recalcMaxRounds(state);

  const { cardsThisRound, ascending } = getCardsForRound(state.round, state.config.maxRounds);
  state.cardsThisRound = cardsThisRound;
  state.ascending = ascending;

  // Escala dinâmica de baralhos: 1→2→3 conforme necessidade
  const cardsNeeded = activePlayers.length * cardsThisRound;
  const decksNeeded = Math.ceil(cardsNeeded / CARDS_PER_DECK);
  const minDecks = state.config.fdpRule && state.config.fdpStartDoubleDeck ? 2 : 1;
  const actualDecks = Math.min(MAX_DECKS, Math.max(minDecks, decksNeeded));

  state.config.deckCount = actualDecks;
  const deck = shuffleDeck(buildMultiDeck(actualDecks));
  const hands = dealCards(deck, activePlayers.length, cardsThisRound);

  activePlayers.forEach((p, i) => {
    p.hand = hands[i];
  });

  // Sentido anti-horário: a partir do dealer, incrementa índices (para a esquerda)
  const dealerIdx = state.dealerIndex % activePlayers.length;
  const firstBetIdx = (dealerIdx + 1) % activePlayers.length;

  const bettingOrder: string[] = [];
  for (let i = 0; i < activePlayers.length; i++) {
    const idx = (firstBetIdx + i) % activePlayers.length;
    bettingOrder.push(activePlayers[idx].id);
  }

  state.bettingOrder = bettingOrder;
  state.bets = {};
  state.tricksTaken = Object.fromEntries(activePlayers.map(p => [p.id, 0]));
  state.currentTrick = [];
  state.trickNumber = 1;
  state.trickLeader = bettingOrder[0];
  state.currentTurn = bettingOrder[0];
  state.phase = 'betting';
  state.resolvingTrick = false;
  state.trickState = null;

  return state;
}

export function updateConfig(roomId: string, config: Partial<GameConfig>): GameState | null {
  const state = rooms.get(roomId);
  if (!state || state.phase !== 'lobby') return null;
  // Valida maxPlayers (2-20)
  if (config.maxPlayers !== undefined) {
    config.maxPlayers = Math.max(2, Math.min(20, Math.floor(config.maxPlayers)));
  }
  state.config = { ...state.config, ...config };
  saveRoom(state);
  return state;
}

/**
 * Marca jogador como desconectado.
 * Em jogo: inicia timer de 30s antes de eliminar.
 * No lobby: remove imediatamente.
 * Retorna callback para quando o timer disparar (para eliminar e notificar).
 */
export function disconnectPlayer(
  roomId: string,
  playerId: string,
  onEliminate?: () => void
): GameState | null {
  const state = rooms.get(roomId);
  if (!state) return null;

  const player = state.players.find(p => p.id === playerId);
  if (!player) return null;

  // Cancela timer anterior se existir (evita duplicação)
  const existingTimer = disconnectTimers.get(player.sessionId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    disconnectTimers.delete(player.sessionId);
  }

  player.connected = false;

  if (state.phase !== 'lobby') {
    // Captura os dados necessários em closures para evitar perda de referência
    const sessionId = player.sessionId;
    const playerName = player.name;

    // Inicia timer de reconexão (30 segundos)
    const timer = setTimeout(() => {
      try {
        disconnectTimers.delete(sessionId);
        const currentState = rooms.get(roomId);
        if (!currentState) {
          console.error(`[Disconnect Timer] Sala ${roomId} não existe mais`);
          return;
        }

        const currentPlayer = currentState.players.find(p => p.sessionId === sessionId);
        if (!currentPlayer) {
          console.error(`[Disconnect Timer] Jogador ${playerName} não encontrado na sala ${roomId}`);
          return;
        }

        // Evita eliminação dupla
        if (currentPlayer.isEliminated) {
          console.log(`[Disconnect Timer] Jogador ${playerName} já foi eliminado, ignorando`);
          return;
        }

        console.log(`[Disconnect Timer] Eliminando jogador ${playerName} por timeout na sala ${roomId}`);
        currentPlayer.isEliminated = true;
        currentPlayer.lives = 0;

        if (onEliminate) {
          onEliminate();
        }
      } catch (error) {
        console.error('[Disconnect Timer] Erro ao processar eliminação:', error);
      }
    }, 30000);
    disconnectTimers.set(player.sessionId, timer);
  } else {
    // No lobby: remove jogador imediatamente
    state.players = state.players.filter(p => p.id !== playerId);
    
    // Se era o host e é o último jogador no lobby, deleta a sala
    if (playerId === state.hostId && state.players.length === 0) {
      console.log(`🗑️ Deletando sala ${roomId} - host saiu e sala ficou vazia`);
      rooms.delete(roomId);
      deleteRoomDB(roomId);
      return null; // Indica que a sala foi deletada
    }
  }

  if (playerId === state.hostId) {
    const nextHost = state.players.find(p => p.connected && !p.isEliminated);
    if (nextHost) {
      state.hostId = nextHost.id;
      state.hostName = nextHost.name;
    }
  }

  return state;
}

export function deleteRoom(roomId: string): void {
  rooms.delete(roomId);
  deleteRoomDB(roomId); // Delete from SQLite
}

/**
 * Lista salas públicas no lobby para o hub de salas.
 * Combina cache em memória com dados do SQLite.
 */
export function listPublicRooms(): Array<{
  roomId: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  config: GameConfig;
}> {
  // Get from SQLite for persistence
  const dbRooms = require('../db/rooms').listPublicRooms();

  // Merge with in-memory cache for real-time player counts
  const result = dbRooms.map((dbRoom: any) => {
    const cachedRoom = rooms.get(dbRoom.roomId);
    return {
      ...dbRoom,
      playerCount: cachedRoom
        ? cachedRoom.players.filter((p: any) => !p.isSpectator).length
        : dbRoom.playerCount,
    };
  });

  return result;
}

/**
 * Lista salas públicas em andamento para espectadores externos.
 */
export function listWatchableRooms(): Array<{
  roomId: string;
  hostName: string;
  phase: string;
  playerCount: number;
  spectatorCount: number;
  maxPlayers: number;
  config: GameConfig;
}> {
  const dbRooms = require('../db/rooms').listWatchableRoomsDB();

  return dbRooms.map((dbRoom: any) => {
    const cachedRoom = rooms.get(dbRoom.roomId);
    return {
      ...dbRoom,
      playerCount: cachedRoom
        ? cachedRoom.players.filter((p: any) => !p.isSpectator && !p.isEliminated).length
        : dbRoom.playerCount,
      spectatorCount: cachedRoom
        ? cachedRoom.players.filter((p: any) => p.isSpectator).length
        : 0,
    };
  }).filter((r: any) => r.playerCount > 0);
}

/**
 * Limpa salas vazias ou abandonadas.
 * Remove tanto do Map in-memory quanto do SQLite.
 * Verifica last_activity para não remover salas recentemente ativas (menos de 30 minutos).
 * Não remove salas que têm timers de reconexão ativos.
 */
export function cleanupEmptyRooms(): { removedCount: number; details: Array<{ roomId: string; phase: string; lastActivity?: number }> } {
  const removedRooms: Array<{ roomId: string; phase: string; lastActivity?: number }> = [];
  // Salas inativas há mais de 15 minutos sem nenhum jogador conectado são elegíveis para remoção.
  const fifteenMinutesAgo = Math.floor(Date.now() / 1000) - 900;

  for (const [roomId, state] of rooms) {
    const connected = state.players.filter(p => p.connected);
    // Sala em jogo sem nenhum jogador conectado — elegível para limpeza
    const shouldRemove = connected.length === 0 && state.phase !== 'lobby';

    // Remove lobby rooms with no players
    const shouldRemoveLobby = state.players.length === 0;

    if (shouldRemove || shouldRemoveLobby) {
      // Verifica se há timers de desconexão ativos para jogadores desta sala
      const hasActiveDisconnectTimers = state.players.some(p =>
        disconnectTimers.has(p.sessionId)
      );

      if (hasActiveDisconnectTimers) {
        console.log(`⏸️  Sala ${roomId} mantida (tem timers de reconexão ativos)`);
        continue;
      }

      // Get last activity from DB to check if room is recently active
      try {
        const lastActivity = loadRoomLastActivity(roomId);

        // Don't remove if recently active (less than 15 minutes)
        if (lastActivity && lastActivity > fifteenMinutesAgo) {
          console.log(`⏸️  Sala ${roomId} mantida (atividade recente: ${new Date(lastActivity * 1000).toISOString()})`);
          continue;
        }

        rooms.delete(roomId);
        deleteRoomDB(roomId);

        // Limpa timers de desconexão associados a esta sala
        state.players.forEach(player => {
          const timer = disconnectTimers.get(player.sessionId);
          if (timer) {
            clearTimeout(timer);
            disconnectTimers.delete(player.sessionId);
          }
        });

        // Limpa o flag de game_over se existir
        if (gameOverRoomsRef) {
          gameOverRoomsRef.delete(roomId);
        }

        console.log(`🗑️  Sala ${roomId} removida (fase: ${state.phase}, jogadores: ${state.players.length})`);
        removedRooms.push({
          roomId,
          phase: state.phase,
          lastActivity: lastActivity || undefined,
        });
      } catch (error) {
        console.error(`❌ Erro ao limpar sala ${roomId}:`, error);
      }
    }
  }

  return {
    removedCount: removedRooms.length,
    details: removedRooms,
  };
}

/**
 * Adiciona mensagem de chat à sala com rate limiting.
 * Sempre salva no banco de dados primeiro e depois atualiza o cache.
 */
export function addChatMessage(
  roomId: string,
  playerId: string,
  playerName: string,
  text: string
): ChatMessage | null {
  const state = rooms.get(roomId);
  if (!state) return null;

  // Rate limiting: 3 messages per 30 seconds
  if (!checkRateLimit(playerId, roomId, 'chat', 3, 30)) {
    return null; // Rate limit exceeded
  }

  // Sanitize text
  const sanitized = text
    .replace(/[<>]/g, c => ({ '<': '&lt;', '>': '&gt;' }[c] ?? c))
    .trim()
    .slice(0, 200);

  if (!sanitized) return null;

  // First save to database
  const message = addRoomChatMessage(roomId, playerId, playerName, sanitized);

  // Then update in-memory cache
  state.chatMessages.push(message);
  if (state.chatMessages.length > 30) {
    state.chatMessages = state.chatMessages.slice(-30);
  }

  updateRoomActivity(roomId);
  console.log(`[Chat] Mensagem adicionada à sala ${roomId}: ${playerName} - ${sanitized.substring(0, 30)}...`);
  return message;
}

/**
 * Adiciona reação de emoji à sala (tipo Meet).
 */
export function addReaction(roomId: string, playerId: string, emoji: string): void {
  if (!checkRateLimit(playerId, roomId, 'reaction', 10, 60)) {
    return; // Rate limit exceeded
  }

  addRoomReaction(roomId, playerId, emoji);
  updateRoomActivity(roomId);
}

/**
 * Ban player (persistent).
 */
export function banPlayer(roomId: string, sessionId: string, bannedBy: string, reason?: string): void {
  banPlayerDB(roomId, sessionId, bannedBy, reason);

  // Update in-memory state
  const state = rooms.get(roomId);
  if (state) {
    if (!state.bannedIds.includes(sessionId)) {
      state.bannedIds.push(sessionId);
    }
  }
}

/**
 * Adiciona espectador à fila de entrada.
 */
export function joinSpectatorQueue(roomId: string, playerId: string): number {
  const state = rooms.get(roomId);
  if (!state) return -1;

  const player = state.players.find(p => p.id === playerId);
  if (!player || !player.isSpectator) return -1;

  if (state.spectatorQueue.includes(playerId)) {
    return state.spectatorQueue.indexOf(playerId) + 1;
  }

  state.spectatorQueue.push(playerId);
  return state.spectatorQueue.length;
}

/**
 * Remove espectador da fila de entrada.
 */
export function leaveSpectatorQueue(roomId: string, playerId: string): void {
  const state = rooms.get(roomId);
  if (!state) return;

  state.spectatorQueue = state.spectatorQueue.filter(id => id !== playerId);
}

/**
 * Promove o primeiro espectador da fila para jogador ativo.
 * Vidas = max(1, floor(média de vidas dos jogadores ativos) - 1)
 */
export function promoteSpectatorFromQueue(roomId: string): Player | null {
  const state = rooms.get(roomId);
  if (!state || state.spectatorQueue.length === 0) return null;

  const activePlayers = state.players.filter(p => !p.isEliminated && !p.isSpectator);
  if (activePlayers.length >= state.config.maxPlayers) return null;

  // Find the first valid spectator in queue
  while (state.spectatorQueue.length > 0) {
    const nextId = state.spectatorQueue.shift()!;
    const player = state.players.find(p => p.id === nextId);
    if (!player || !player.connected || !player.isSpectator) continue;

    // Calculate lives: max(1, floor(avg active lives) - 1)
    const avgLives = activePlayers.length > 0
      ? Math.floor(activePlayers.reduce((sum, p) => sum + p.lives, 0) / activePlayers.length)
      : state.config.livesPerPlayer;
    const lives = Math.max(1, avgLives - 1);

    player.isSpectator = false;
    player.isEliminated = false;
    player.lives = lives;
    player.wasKicked = false;
    player.hand = [];

    saveRoom(state);
    return player;
  }

  return null;
}

/**
 * Retorna as posições na fila para broadcast.
 */
export function getSpectatorQueuePositions(roomId: string): Array<{ playerId: string; position: number }> {
  const state = rooms.get(roomId);
  if (!state) return [];

  return state.spectatorQueue.map((id, i) => ({ playerId: id, position: i + 1 }));
}