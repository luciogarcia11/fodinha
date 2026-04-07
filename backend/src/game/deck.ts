import { Card, CardValue, Suit } from '../types';

const SUITS: Suit[] = ['clubs', 'hearts', 'spades', 'diamonds'];
const VALUES: CardValue[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

// Manilhas fixas: 4♣, 7♥, A♠, 7♦
const MANILHAS: Record<string, number> = {
  '4-clubs':    14, // zap — mais forte
  '7-hearts':   13,
  'A-spades':   12,
  '7-diamonds': 11,
};

// Força das cartas comuns (sem ser manilha)
const COMMON_STRENGTH: Record<CardValue, number> = {
  '3': 10,
  '2': 9,
  'A': 8,
  'K': 7,
  'J': 6,
  'Q': 5,
  '7': 4,
  '6': 3,
  '5': 2,
  '4': 1,
};

// Força dos naipes para desempate (maior = mais forte)
export const SUIT_STRENGTH: Record<Suit, number> = {
  'clubs':    4,
  'hearts':   3,
  'spades':   2,
  'diamonds': 1,
};

export type DeckColor = 'blue' | 'red' | 'green' | 'yellow' | 'brown' | 'black' | 'white';

export function buildDeck(deckColor: DeckColor = 'blue'): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const value of VALUES) {
      const key = `${value}-${suit}`;
      const isManilha = key in MANILHAS;
      const strength = isManilha ? MANILHAS[key] : COMMON_STRENGTH[value];

      deck.push({ value, suit, isManilha, strength, deckColor });
    }
  }

  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(deck: Card[], playerCount: number, cardsPerPlayer: number): Card[][] {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  for (let i = 0; i < cardsPerPlayer; i++) {
    for (let j = 0; j < playerCount; j++) {
      const card = deck.pop();
      if (card) hands[j].push(card);
    }
  }
  return hands;
}

/** Cores dos baralhos na ordem de escala (7 cores para modo insanidade) */
const DECK_COLORS: DeckColor[] = ['blue', 'red', 'green', 'yellow', 'brown', 'black', 'white'];

export const CARDS_PER_DECK = 40;
export const MAX_DECKS = 3;
export const MAX_TOTAL_CARDS = MAX_DECKS * CARDS_PER_DECK; // 120
export const INSANITY_MAX_DECKS = 7;
export const INSANITY_MAX_TOTAL_CARDS = INSANITY_MAX_DECKS * CARDS_PER_DECK; // 280

/**
 * Cria N baralhos com cores distintas.
 * @param count Número de baralhos (1-7; máx real definido pelo chamador)
 */
export function buildMultiDeck(count: number = 2): Card[] {
  const n = Math.min(INSANITY_MAX_DECKS, Math.max(1, count));
  const cards: Card[] = [];
  for (let i = 0; i < n; i++) {
    cards.push(...buildDeck(DECK_COLORS[i]));
  }
  return cards;
}