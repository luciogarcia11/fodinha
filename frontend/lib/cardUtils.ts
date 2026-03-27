import { Card, Suit } from './types';

export const SUIT_SYMBOLS: Record<Suit, string> = {
  clubs:    '♣',
  hearts:   '♥',
  spades:   '♠',
  diamonds: '♦',
};

export const SUIT_COLORS: Record<Suit, string> = {
  clubs:    'text-gray-900',
  hearts:   'text-red-600',
  spades:   'text-gray-900',
  diamonds: 'text-red-600',
};

export function cardLabel(card: Card): string {
  return `${card.value}${SUIT_SYMBOLS[card.suit]}`;
}

export function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}