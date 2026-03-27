export type Suit = 'clubs' | 'hearts' | 'spades' | 'diamonds';
export type CardValue = '4' | '5' | '6' | '7' | 'Q' | 'J' | 'K' | 'A' | '2' | '3';

export interface Card {
  value: CardValue;
  suit: Suit;
  isManilha: boolean;
  strength: number;
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
}

export interface GameConfig {
  livesPerPlayer: number;
  fdpRule: boolean;
  cardOnForeheadRule: boolean;
  maxRounds: number;
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
  config: GameConfig;
}

export interface TrickResult {
  trick: PlayedCard[];
  winnerId: string | null;
}

export interface RoundEndData {
  bets: Record<string, number>;
  tricksTaken: Record<string, number>;
  eliminated: string[];
  players: Player[];
}