import { GameState, GameConfig, Player } from '../types';
import { buildDeck, shuffleDeck, dealCards } from './deck';
import { getCardsForRound } from './logic';

const rooms = new Map<string, GameState>();

export function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

export function createRoom(hostId: string, hostName: string): GameState {
  const roomId = generateRoomCode();
  const config: GameConfig = {
    livesPerPlayer: 3,
    fdpRule: false,
    cardOnForeheadRule: true,
    maxRounds: 0,
  };

  const host: Player = {
    id: hostId,
    name: hostName,
    lives: config.livesPerPlayer,
    hand: [],
    connected: true,
    isEliminated: false,
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
    dealerIndex: 0, // host é o pé na primeira rodada
    config,
  };

  rooms.set(roomId, state);
  return state;
}

export function getRoom(roomId: string): GameState | undefined {
  return rooms.get(roomId);
}

export function joinRoom(roomId: string, playerId: string, playerName: string): GameState | null {
  const state = rooms.get(roomId);
  if (!state || state.phase !== 'lobby') return null;
  if (state.players.length >= 10) return null;

  const existing = state.players.find(p => p.id === playerId);
  if (existing) {
    existing.connected = true;
    return state;
  }

  state.players.push({
    id: playerId,
    name: playerName,
    lives: state.config.livesPerPlayer,
    hand: [],
    connected: true,
    isEliminated: false,
  });

  return state;
}

export function startGame(roomId: string): GameState | null {
  const state = rooms.get(roomId);
  if (!state || state.players.length < 2) return null;

  const playerCount = state.players.length;
  state.config.maxRounds = Math.floor(40 / playerCount);

  state.players.forEach(p => {
    p.lives = state.config.livesPerPlayer;
    p.isEliminated = false;
  });

  // Host (índice 0) é o pé na primeira rodada
  state.dealerIndex = 0;
  state.round = 1;

  return dealRound(state);
}

export function dealRound(state: GameState): GameState {
  const { cardsThisRound } = getCardsForRound(state.round, state.config.maxRounds);
  state.cardsThisRound = cardsThisRound;

  const activePlayers = state.players.filter(p => !p.isEliminated);
  const deck = shuffleDeck(buildDeck());
  const hands = dealCards(deck, activePlayers.length, cardsThisRound);

  activePlayers.forEach((p, i) => {
    p.hand = hands[i];
  });

  // Ordem de apostas: começa DEPOIS do pé, o pé aposta por último
  const dealerIdx = state.dealerIndex % activePlayers.length;
  const firstBetIdx = (dealerIdx + 1) % activePlayers.length;

  // Rotaciona a lista de apostas: primeiro a falar é quem está após o pé
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

  // Primeiro a jogar também começa após o pé
  state.trickLeader = bettingOrder[0];
  state.currentTurn = bettingOrder[0];
  state.phase = 'betting';

  return state;
}

export function updateConfig(roomId: string, config: Partial<GameConfig>): GameState | null {
  const state = rooms.get(roomId);
  if (!state || state.phase !== 'lobby') return null;
  state.config = { ...state.config, ...config };
  return state;
}

export function disconnectPlayer(roomId: string, playerId: string): GameState | null {
  const state = rooms.get(roomId);
  if (!state) return null;

  const player = state.players.find(p => p.id === playerId);
  if (!player) return null;

  player.connected = false;

  if (state.phase !== 'lobby') {
    player.isEliminated = true;
    player.lives = 0;
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
}