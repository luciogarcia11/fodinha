export type Suit = 'clubs' | 'hearts' | 'spades' | 'diamonds';
export type CardValue = '4' | '5' | '6' | '7' | 'Q' | 'J' | 'K' | 'A' | '2' | '3';

export interface Card {
  value: CardValue;
  suit: Suit;
  isManilha: boolean;
  strength: number;
  deckColor?: 'blue' | 'red';
}

export interface PlayedCard {
  playerId: string;
  card: Card;
  annulled: boolean;
}

export interface Player {
  id: string;
  name: string;
  lives: number;
  hand: Card[];
  connected: boolean;
  isEliminated: boolean;
  isSpectator: boolean;
  sessionId: string;
}

export interface GameConfig {
  livesPerPlayer: number;
  fdpRule: boolean;
  fdpStartDoubleDeck: boolean;
  cardOnForeheadRule: boolean;
  suitTiebreakerRule: boolean;
  maxRounds: number;
  isPublic: boolean;
  deckCount: 1 | 2;  // Número de baralhos (1 ou 2)
}

export interface ChatMessage {
  id: string;
  roomId?: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp?: number;
  createdAt?: number;
}

export interface TrickState {
  winningCardPlayerId: string | null;
  isTied: boolean;
  lastStrongCardPlayerId: string | null;
}

export interface VoteKick {
  targetId: string;
  votes: string[];
  startTime: number;
}

export type GamePhase =
  | 'lobby'
  | 'betting'
  | 'playing'
  | 'round_end'
  | 'game_over';

export interface GameState {
  roomId: string;
  hostId: string;
  hostName: string;
  phase: GamePhase;
  round: number;
  cardsThisRound: number;
  ascending: boolean;
  players: Player[];
  currentTurn: string;
  bettingOrder: string[];
  bets: Record<string, number>;
  tricksTaken: Record<string, number>;
  currentTrick: PlayedCard[];
  trickLeader: string;
  trickNumber: number;
  dealerIndex: number;
  resolvingTrick: boolean;
  config: GameConfig;
  trickState: TrickState | null;
  activeVoteKick: VoteKick | null;
  bannedIds: string[];
  chatMessages: ChatMessage[];
}