import { GameState, GameConfig, Player, ChatMessage } from '../types';
import { buildDeck, buildMultiDeck, shuffleDeck, dealCards } from './deck';
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
} from '../db/rooms';

// In-memory cache for active rooms (synced with SQLite)
const rooms = new Map<string, GameState>();

// Timers de reconexão (sessionId → timeout)
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function generateSessionId(): string {
  return crypto.randomUUID();
}

export function createRoom(hostId: string, hostName: string): GameState {
  const roomId = generateRoomCode();
  const config: GameConfig = {
    livesPerPlayer: 3,
    fdpRule: false,
    cardOnForeheadRule: true,
    suitTiebreakerRule: false,
    maxRounds: 0,
    isPublic: true,
  };

  const host: Player = {
    id: hostId,
    name: hostName,
    lives: config.livesPerPlayer,
    hand: [],
    connected: true,
    isEliminated: false,
    sessionId: generateSessionId(),
  };

  const state: GameState = {
    roomId,
    hostId,
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

export function joinRoom(roomId: string, playerId: string, playerName: string): GameState | null {
  const state = rooms.get(roomId);
  if (!state || state.phase !== 'lobby') return null;
  if (state.players.length >= 10) return null;

  // Validate player name
  if (!playerName || playerName.trim().length === 0 || playerName.trim().length > 16) {
    return null;
  }

  const existing = state.players.find(p => p.id === playerId);
  if (existing) {
    existing.connected = true;
    return state;
  }

  const newPlayer: Player = {
    id: playerId,
    name: playerName.trim(),
    lives: state.config.livesPerPlayer,
    hand: [],
    connected: true,
    isEliminated: false,
    sessionId: generateSessionId(),
  };

  state.players.push(newPlayer);
  saveRoom(state); // Persist to SQLite

  return state;
}

/**
 * Reconecta um jogador à sala usando sessionId.
 * Atualiza o socket id do jogador e cancela o timer de desconexão.
 */
export function rejoinRoom(roomId: string, sessionId: string, newSocketId: string): GameState | null {
  // Try to load from cache first
  let state: GameState | undefined | null = rooms.get(roomId);

  // If not in cache, try to load from SQLite
  if (!state) {
    state = loadRoom(roomId);
    if (state) {
      rooms.set(roomId, state);
    }
  }

  if (!state) return null;

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

  player.id = newSocketId;
  player.connected = true;
  updateRoomActivity(roomId); // Update last activity

  return state;
}

export function startGame(roomId: string): GameState | null {
  const state = rooms.get(roomId);
  if (!state || state.players.length < 2) return null;

  const playerCount = Math.max(1, state.players.length);
  if (state.config.fdpRule) {
    state.config.maxRounds = Math.floor(80 / playerCount);
  } else {
    state.config.maxRounds = Math.floor(40 / playerCount);
  }

  state.players.forEach(p => {
    p.lives = state.config.livesPerPlayer;
    p.isEliminated = false;
  });

  state.dealerIndex = 0;
  state.round = 1;
  state.bannedIds = getBannedPlayers(roomId); // Load bans from DB

  saveRoom(state); // Persist to SQLite
  return dealRound(state);
}

export function dealRound(state: GameState): GameState {
  const { cardsThisRound } = getCardsForRound(state.round, state.config.maxRounds);
  state.cardsThisRound = cardsThisRound;

  const activePlayers = state.players.filter(p => !p.isEliminated);

  // Usa multi-deck se FDP ativo
  const deck = state.config.fdpRule
    ? shuffleDeck(buildMultiDeck())
    : shuffleDeck(buildDeck('blue'));
  const hands = dealCards(deck, activePlayers.length, cardsThisRound);

  activePlayers.forEach((p, i) => {
    p.hand = hands[i];
  });

  // Sentido anti-horário: a partir do dealer, decrementa índices
  const dealerIdx = state.dealerIndex % activePlayers.length;
  const firstBetIdx = (dealerIdx - 1 + activePlayers.length) % activePlayers.length;

  const bettingOrder: string[] = [];
  for (let i = 0; i < activePlayers.length; i++) {
    const idx = (firstBetIdx - i + activePlayers.length) % activePlayers.length;
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
  state.config = { ...state.config, ...config };
  saveRoom(state); // Persist to SQLite
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

  player.connected = false;

  if (state.phase !== 'lobby') {
    // Inicia timer de reconexão (30 segundos)
    const timer = setTimeout(() => {
      player.isEliminated = true;
      player.lives = 0;
      disconnectTimers.delete(player.sessionId);
      if (onEliminate) onEliminate();
    }, 30000);
    disconnectTimers.set(player.sessionId, timer);
  } else {
    state.players = state.players.filter(p => p.id !== playerId);
  }

  if (playerId === state.hostId) {
    const nextHost = state.players.find(p => p.connected && !p.isEliminated);
    if (nextHost) state.hostId = nextHost.id;
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
      playerCount: cachedRoom ? cachedRoom.players.length : dbRoom.playerCount,
    };
  });

  return result;
}

/**
 * Limpa salas vazias ou abandonadas.
 */
export function cleanupEmptyRooms(): void {
  for (const [roomId, state] of rooms) {
    const connected = state.players.filter(p => p.connected);
    if (connected.length === 0 && state.phase !== 'lobby') {
      rooms.delete(roomId);
    }
    // Remove lobby rooms with no players
    if (state.players.length === 0) {
      rooms.delete(roomId);
    }
  }
}

/**
 * Adiciona mensagem de chat à sala com rate limiting.
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

  const message = addRoomChatMessage(roomId, playerId, playerName, sanitized);

  // Update in-memory cache
  state.chatMessages.push(message);
  if (state.chatMessages.length > 100) {
    state.chatMessages = state.chatMessages.slice(-100);
  }

  updateRoomActivity(roomId);
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