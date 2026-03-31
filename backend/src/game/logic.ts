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
 * Resolve vaza no modo FDP.
 * Separa manilhas e comuns.
 * Anula TODAS as cartas comuns de mesmo valor (se houver 2 ou mais).
 * Manilhas nunca se anulam.
 */
function resolveVazaFDP(trick: PlayedCard[], suitTiebreakerRule: boolean): string | null {
  // Separa manilhas e comuns
  const manilhas = trick.filter(p => p.card.isManilha);
  const comuns = trick.filter(p => !p.card.isManilha);

  // Conta quantas vezes cada valor aparece entre as cartas comuns
  const valueCounts: Record<string, number> = {};
  for (const p of comuns) {
    valueCounts[p.card.value] = (valueCounts[p.card.value] ?? 0) + 1;
  }

  // Mantém apenas as cartas comuns que aparecem uma única vez
  const comunsRestantes = comuns.filter(p => valueCounts[p.card.value] === 1);

  // Candidatos finais: manilhas + comuns não anuladas
  const candidates = [...manilhas, ...comunsRestantes];

  if (candidates.length === 0) return null;

  // Encontra a maior força
  const maxStrength = Math.max(...candidates.map(p => p.card.strength));
  const winners = candidates.filter(p => p.card.strength === maxStrength);

  if (winners.length === 1) return winners[0].playerId;

  // Empate entre os mais fortes
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
  // Separa manilhas e comuns
  const manilhas = trick.filter(p => p.card.isManilha);
  const comuns = trick.filter(p => !p.card.isManilha);

  // Conta quantas vezes cada valor aparece entre as cartas comuns
  const valueCounts: Record<string, number> = {};
  for (const p of comuns) {
    valueCounts[p.card.value] = (valueCounts[p.card.value] ?? 0) + 1;
  }

  // Mantém apenas as cartas comuns que aparecem uma única vez
  const comunsRestantes = comuns.filter(p => valueCounts[p.card.value] === 1);

  // Candidatos finais: manilhas + comuns não anuladas
  const candidates = [...manilhas, ...comunsRestantes];

  if (candidates.length === 0) {
    return { winningCardPlayerId: null, isTied: true, lastStrongCardPlayerId: null };
  }

  // Encontra a maior força
  const maxStrength = Math.max(...candidates.map(p => p.card.strength));
  const winners = candidates.filter(p => p.card.strength === maxStrength);

  if (winners.length === 1) {
    return {
      winningCardPlayerId: winners[0].playerId,
      isTied: false,
      lastStrongCardPlayerId: winners[0].playerId,
    };
  }

  // Empate entre os mais fortes
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