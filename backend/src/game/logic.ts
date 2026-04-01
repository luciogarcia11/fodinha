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
 * Chave de anulação de uma carta para o modo FDP.
 * Manilhas: identidade completa (value-suit) — zap só anula outro zap do segundo baralho.
 * Comuns: apenas o valor — todos os Reis se anulam entre si independente de naipe.
 */
function tieKey(p: PlayedCard): string {
  return p.card.isManilha ? `${p.card.value}-${p.card.suit}` : p.card.value;
}

/**
 * Resolve vaza no modo FDP.
 * Cartas que compartilham a mesma chave de anulação (≥2 ocorrências) se cancelam.
 * Manilhas só se anulam com a manilha idêntica (possível em baralho duplo).
 * Múltiplas amarrações simultâneas (ex: dois Reis + dois Doses) são tratadas de uma vez.
 * Marca `annulled = true` nos PlayedCards cancelados (mutação in-place para UI).
 */
function resolveVazaFDP(trick: PlayedCard[], suitTiebreakerRule: boolean): string | null {
  // Conta por chave de anulação
  const keyCounts: Record<string, number> = {};
  for (const p of trick) {
    const k = tieKey(p);
    keyCounts[k] = (keyCounts[k] ?? 0) + 1;
  }

  // Marca anuladas e coleta candidatos sobreviventes
  const candidates: PlayedCard[] = [];
  for (const p of trick) {
    if (keyCounts[tieKey(p)] >= 2) {
      p.annulled = true;
    } else {
      candidates.push(p);
    }
  }

  if (candidates.length === 0) return null;

  // Carta mais forte entre as não anuladas vence
  const maxStrength = Math.max(...candidates.map(p => p.card.strength));
  const winners = candidates.filter(p => p.card.strength === maxStrength);

  if (winners.length === 1) return winners[0].playerId;

  // Empate residual (duas cartas iguais não anuladas — impossível com chave correcta, mas seguro)
  if (suitTiebreakerRule) {
    const maxSuit = Math.max(...winners.map(p => SUIT_STRENGTH[p.card.suit]));
    const suitWinners = winners.filter(p => SUIT_STRENGTH[p.card.suit] === maxSuit);
    if (suitWinners.length === 1) return suitWinners[0].playerId;
  }

  return null;
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
  // Conta por chave de anulação (mesma lógica de resolveVazaFDP)
  const keyCounts: Record<string, number> = {};
  for (const p of trick) {
    const k = tieKey(p);
    keyCounts[k] = (keyCounts[k] ?? 0) + 1;
  }

  // Marca annulled in-place e coleta candidatos (para feedback visual em tempo real)
  const candidates: PlayedCard[] = [];
  for (const p of trick) {
    if (keyCounts[tieKey(p)] >= 2) {
      p.annulled = true;
    } else {
      p.annulled = false;
      candidates.push(p);
    }
  }

  if (candidates.length === 0) {
    return { winningCardPlayerId: null, isTied: true, lastStrongCardPlayerId: null };
  }

  const maxStrength = Math.max(...candidates.map(p => p.card.strength));
  const winners = candidates.filter(p => p.card.strength === maxStrength);

  if (winners.length === 1) {
    return {
      winningCardPlayerId: winners[0].playerId,
      isTied: false,
      lastStrongCardPlayerId: winners[0].playerId,
    };
  }

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