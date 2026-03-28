import { GameState, PlayedCard, Player } from '../types';

/**
 * Resolve quem venceu a vaza.
 * Retorna o playerId do vencedor ou null se ninguém ganhou.
 */
export function resolveVaza(
  trick: PlayedCard[],
  fdpRule: boolean
): string | null {
  let candidates = [...trick];

  if (fdpRule) {
    // Separa manilhas e comuns
    const manilhas = candidates.filter(p => p.card.isManilha);
    const comuns = candidates.filter(p => !p.card.isManilha);

    // Anula comuns de mesmo valor
    const valueCounts: Record<string, number> = {};
    for (const p of comuns) {
      valueCounts[p.card.value] = (valueCounts[p.card.value] ?? 0) + 1;
    }
    const comunsRestantes = comuns.filter(p => valueCounts[p.card.value] === 1);

    // Candidatos finais: manilhas + comuns não anuladas
    candidates = [...manilhas, ...comunsRestantes];

    if (candidates.length === 0) return null;
  }

  // Encontra a maior força
  const maxStrength = Math.max(...candidates.map(p => p.card.strength));
  const winners = candidates.filter(p => p.card.strength === maxStrength);

  // Empate entre os mais fortes → sem vencedor
  if (winners.length > 1) return null;

  return winners[0].playerId;
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