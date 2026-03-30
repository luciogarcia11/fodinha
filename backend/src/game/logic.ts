import { GameState, PlayedCard, Player, TrickState } from '../types';
import { SUIT_STRENGTH } from './deck';

/**
 * Resolve quem venceu a vaza.
 * Retorna o playerId do vencedor ou null se ninguém ganhou.
 *
 * Sem FDP: carta mais forte vence. Empate de strength → desempate por naipe (se ativo) ou null.
 * Com FDP: amarração — cartas processadas em ordem de jogo.
 *   Cartas de mesmo valor (e mesmo naipe se suitTiebreaker ativo) se anulam.
 *   Quando há amarração, volta a valer a maior carta anterior não anulada.
 */
export function resolveVaza(
  trick: PlayedCard[],
  fdpRule: boolean,
  suitTiebreakerRule: boolean = false
): string | null {
  if (trick.length === 0) return null;

  if (fdpRule) {
    return resolveVazaFDP(trick, suitTiebreakerRule);
  }

  return resolveVazaStandard(trick, suitTiebreakerRule);
}

function resolveVazaStandard(trick: PlayedCard[], suitTiebreakerRule: boolean): string | null {
  const maxStrength = Math.max(...trick.map(p => p.card.strength));
  const winners = trick.filter(p => p.card.strength === maxStrength);

  if (winners.length === 1) return winners[0].playerId;

  // Empate de strength
  if (suitTiebreakerRule) {
    // Desempate por naipe — maior naipe vence
    const maxSuit = Math.max(...winners.map(p => SUIT_STRENGTH[p.card.suit]));
    const suitWinners = winners.filter(p => SUIT_STRENGTH[p.card.suit] === maxSuit);
    if (suitWinners.length === 1) return suitWinners[0].playerId;
  }

  return null;
}

/**
 * Resolve vaza no modo FDP com amarração.
 * Processa cartas na ordem em que foram jogadas.
 * Cartas iguais se anulam (amarram), voltando a valer a maior anterior.
 */
function resolveVazaFDP(trick: PlayedCard[], suitTiebreakerRule: boolean): string | null {
  // Stack de cartas "vivas" — quando uma carta amarra com a atual vencedora,
  // ambas são removidas e a anterior volta a valer.
  // Cada entrada: { playerId, card, strength_effective }
  interface LiveCard {
    playerId: string;
    card: typeof trick[0]['card'];
  }

  const liveCards: LiveCard[] = [];

  for (const played of trick) {
    const { card } = played;

    // Verifica se essa carta amarra com alguma carta viva
    const matchIndex = liveCards.findIndex(lc => cardsMatch(lc.card, card, suitTiebreakerRule));

    if (matchIndex !== -1) {
      // Amarração! Remove a carta que amarrou
      liveCards.splice(matchIndex, 1);
      // A carta atual também é anulada (não entra no liveCards)
    } else {
      liveCards.push({ playerId: played.playerId, card });
    }
  }

  if (liveCards.length === 0) return null;

  // Encontra a carta mais forte entre as sobreviventes
  const maxStrength = Math.max(...liveCards.map(lc => lc.card.strength));
  const winners = liveCards.filter(lc => lc.card.strength === maxStrength);

  if (winners.length === 1) return winners[0].playerId;

  // Empate entre sobreviventes — desempate por naipe
  if (suitTiebreakerRule) {
    const maxSuit = Math.max(...winners.map(lc => SUIT_STRENGTH[lc.card.suit]));
    const suitWinners = winners.filter(lc => SUIT_STRENGTH[lc.card.suit] === maxSuit);
    if (suitWinners.length === 1) return suitWinners[0].playerId;
  }

  return null;
}

/**
 * Verifica se duas cartas "amarram" (se anulam).
 * FDP sem suit tiebreaker: mesmo valor entre comuns (manilhas nunca amarram)
 * FDP com suit tiebreaker: mesmo valor E mesmo naipe (cartas idênticas)
 */
function cardsMatch(
  a: { value: string; suit: string; isManilha: boolean; strength: number },
  b: { value: string; suit: string; isManilha: boolean; strength: number },
  suitTiebreakerRule: boolean
): boolean {
  // Manilhas nunca se anulam entre si
  if (a.isManilha || b.isManilha) return false;

  if (suitTiebreakerRule) {
    // Com desempate por naipe, só amarra se for carta idêntica (mesmo valor E naipe)
    return a.value === b.value && a.suit === b.suit;
  }

  // Sem desempate por naipe, amarra se mesmo valor
  return a.value === b.value;
}

/**
 * Calcula o estado atual da vaza em andamento (para visualização).
 * Retorna quem está vencendo, se há empate, e a última carta forte.
 */
export function calculateTrickState(
  trick: PlayedCard[],
  fdpRule: boolean,
  suitTiebreakerRule: boolean
): TrickState {
  if (trick.length === 0) {
    return { winningCardPlayerId: null, isTied: false, lastStrongCardPlayerId: null };
  }

  if (trick.length === 1) {
    return {
      winningCardPlayerId: trick[0].playerId,
      isTied: false,
      lastStrongCardPlayerId: trick[0].playerId,
    };
  }

  if (fdpRule) {
    return calculateTrickStateFDP(trick, suitTiebreakerRule);
  }

  return calculateTrickStateStandard(trick, suitTiebreakerRule);
}

function calculateTrickStateStandard(trick: PlayedCard[], suitTiebreakerRule: boolean): TrickState {
  const maxStrength = Math.max(...trick.map(p => p.card.strength));
  const winners = trick.filter(p => p.card.strength === maxStrength);

  if (winners.length === 1) {
    return {
      winningCardPlayerId: winners[0].playerId,
      isTied: false,
      lastStrongCardPlayerId: winners[0].playerId,
    };
  }

  // Empate
  if (suitTiebreakerRule) {
    const maxSuit = Math.max(...winners.map(p => SUIT_STRENGTH[p.card.suit]));
    const suitWinners = winners.filter(p => SUIT_STRENGTH[p.card.suit] === maxSuit);
    if (suitWinners.length === 1) {
      return {
        winningCardPlayerId: suitWinners[0].playerId,
        isTied: false,
        lastStrongCardPlayerId: suitWinners[0].playerId,
      };
    }
  }

  return {
    winningCardPlayerId: null,
    isTied: true,
    lastStrongCardPlayerId: null,
  };
}

function calculateTrickStateFDP(trick: PlayedCard[], suitTiebreakerRule: boolean): TrickState {
  interface LiveCard {
    playerId: string;
    card: typeof trick[0]['card'];
  }

  const liveCards: LiveCard[] = [];
  let lastStrongPlayerId: string | null = null;

  for (const played of trick) {
    const { card } = played;
    const matchIndex = liveCards.findIndex(lc => cardsMatch(lc.card, card, suitTiebreakerRule));

    if (matchIndex !== -1) {
      liveCards.splice(matchIndex, 1);
    } else {
      liveCards.push({ playerId: played.playerId, card });
    }
  }

  if (liveCards.length === 0) {
    return { winningCardPlayerId: null, isTied: true, lastStrongCardPlayerId: null };
  }

  const maxStrength = Math.max(...liveCards.map(lc => lc.card.strength));
  const winners = liveCards.filter(lc => lc.card.strength === maxStrength);

  if (winners.length === 1) {
    return {
      winningCardPlayerId: winners[0].playerId,
      isTied: false,
      lastStrongCardPlayerId: winners[0].playerId,
    };
  }

  if (suitTiebreakerRule) {
    const maxSuit = Math.max(...winners.map(lc => SUIT_STRENGTH[lc.card.suit]));
    const suitWinners = winners.filter(lc => SUIT_STRENGTH[lc.card.suit] === maxSuit);
    if (suitWinners.length === 1) {
      return {
        winningCardPlayerId: suitWinners[0].playerId,
        isTied: false,
        lastStrongCardPlayerId: suitWinners[0].playerId,
      };
    }
  }

  return {
    winningCardPlayerId: null,
    isTied: true,
    lastStrongCardPlayerId: liveCards.length > 0 ? liveCards[0].playerId : null,
  };
}

/**
 * Calcula quantas cartas cada rodada terá, considerando subida e descida.
 */
export function getCardsForRound(round: number, maxCards: number): {
  cardsThisRound: number;
  ascending: boolean;
} {
  // Rodadas: 1,2,...,max,max-1,...,1 = ciclo de (2*max - 1) rodadas
  const cycleLength = 2 * maxCards - 1;
  const pos = ((round - 1) % cycleLength) + 1;

  if (pos <= maxCards) {
    return { cardsThisRound: pos, ascending: true };
  } else {
    return { cardsThisRound: cycleLength - pos + 1, ascending: false };
  }
}

/**
 * Calcula o valor proibido para o último apostador.
 * Retorna o número que ele NÃO pode apostar (ou null se todos são válidos).
 */
export function getForbiddenBet(
  bets: Record<string, number>,
  totalTricks: number
): number | null {
  const currentSum = Object.values(bets).reduce((a, b) => a + b, 0);
  const forbidden = totalTricks - currentSum;
  if (forbidden >= 0 && forbidden <= totalTricks) return forbidden;
  return null;
}

/**
 * Aplica o resultado da rodada: quem errou a aposta perde 1 vida.
 * Retorna a lista de jogadores atualizada e os eliminados.
 */
export function applyRoundResult(
  players: Player[],
  bets: Record<string, number>,
  tricksTaken: Record<string, number>
): { updatedPlayers: Player[]; eliminated: string[] } {
  const eliminated: string[] = [];

  const updatedPlayers = players.map(p => {
    if (p.isEliminated) return { ...p };

    const bet = bets[p.id] ?? 0;
    const taken = tricksTaken[p.id] ?? 0;
    const lostLife = bet !== taken;
    const newLives = lostLife ? p.lives - 1 : p.lives;
    const isEliminated = newLives <= 0;

    if (isEliminated) eliminated.push(p.id);

    return { ...p, lives: newLives, isEliminated };
  });

  return { updatedPlayers, eliminated };
}

/**
 * Verifica se o jogo acabou (1 ou 0 jogadores vivos).
 * Retorna o id do vencedor ou null.
 */
export function checkGameOver(players: Player[]): string | null {
  const alive = players.filter(p => !p.isEliminated);
  if (alive.length <= 1) return alive[0]?.id ?? null;
  return null;
}

/**
 * Retorna a mão de um jogador sem revelar as cartas
 * (usado para "carta na testa" — retorna carta mascarada).
 */
export function maskOwnCard(state: GameState, requestingPlayerId: string) {
  return state.players.map(p => {
    if (p.id === requestingPlayerId) {
      // Não revela a própria carta na fase "carta na testa"
      return { ...p, hand: p.hand.map(() => ({ hidden: true })) };
    }
    return p;
  });
}