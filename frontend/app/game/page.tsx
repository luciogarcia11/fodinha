"use client";

import { useEffect, useState } from "react";
import { useGameContext } from "@/lib/gameContext";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import CardComponent from "@/components/game/CardComponent";
import { Player } from "@/lib/types";
import FanCards from "@/components/game/FanCards";

// Hierarquia para exibir na legenda
const CARD_ORDER = "4♣ > 7♥ > A♠ > 7♦ > 3 > 2 > A > K > J > Q > 7 > 6 > 5 > 4";

function GameContent() {
  const {
    gameState,
    myId,
    placeBet,
    playCard,
    trickResult,
    roundEnd,
    winnerId,
    clearRoundEnd,
    quitGame,
  } = useGameContext();

  const router = useRouter();
  const searchParams = useSearchParams();
  const roomCode = searchParams.get("room");
  const [selectedCardState, setSelectedCardState] = useState<{
    turnId: string | null;
    idx: number | null;
  }>({ turnId: null, idx: null });
  const selectedCard =
    selectedCardState.turnId === gameState?.currentTurn
      ? selectedCardState.idx
      : null;
  const [showRules, setShowRules] = useState(false);
  const [showQuit, setShowQuit] = useState(false);

  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === "lobby") router.push(`/lobby?room=${roomCode}`);
  }, [gameState, roomCode, router]);

  useEffect(() => {
    if (!roundEnd) return;
    const t = setTimeout(() => {
      clearRoundEnd();
    }, 4000);
    return () => clearTimeout(t);
  }, [roundEnd, clearRoundEnd]);

  if (!gameState) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-white/60 text-xl">Carregando jogo...</p>
      </main>
    );
  }

  // Fim de jogo
  if (gameState.phase === "game_over" || winnerId) {
    const winner = gameState.players.find((p) => p.id === winnerId);
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6">
        <h1 className="text-5xl font-black text-yellow-400">🏆 Fim de Jogo!</h1>
        <p className="text-2xl text-white">
          {winner?.id === myId ? "🎉 Você venceu!" : `${winner?.name} venceu!`}
        </p>
        <button
          onClick={() =>
            (window.location.href = "https://fodinhamineirafront.vercel.app/")
          }
          className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-3 px-8 rounded-xl text-lg"
        >
          Voltar ao início
        </button>
      </main>
    );
  }

  const me = gameState.players.find((p) => p.id === myId);
  const others = gameState.players.filter((p) => p.id !== myId);
  const activePlayers = gameState.players.filter((p) => !p.isEliminated);
  const isMyTurn = gameState.currentTurn === myId;

  // Carta na testa: só na rodada com 1 carta E regra ativa
  const isCardOnForehead =
    gameState.config.cardOnForeheadRule && gameState.cardsThisRound === 1;

  // Fase de apostas
  const isBetting = gameState.phase === "betting";
  const isMyBetTurn = isBetting && gameState.currentTurn === myId;
  const alreadyBet = myId in gameState.bets;

  // Aposta proibida (pé não pode deixar soma igual ao nº de vazas)
  const bettingIdx = gameState.bettingOrder.indexOf(myId);
  const isLastBetter = bettingIdx === gameState.bettingOrder.length - 1;
  const currentBetSum = Object.values(gameState.bets).reduce(
    (a, b) => a + b,
    0,
  );
  const forbiddenBet =
    isLastBetter && gameState.cardsThisRound > 1
      ? gameState.cardsThisRound - currentBetSum
      : -1;

  // Pé da rodada
  const dealerPlayer =
    activePlayers[gameState.dealerIndex % activePlayers.length];

  function handleCardClick(idx: number) {
    if (!gameState || !isMyTurn || gameState.phase !== "playing") return;
    if (selectedCard === idx) {
      playCard(idx);
      setSelectedCardState({ turnId: gameState.currentTurn, idx: null });
    } else {
      setSelectedCardState({ turnId: gameState.currentTurn, idx });
    }
  }

  function renderLives(lives: number, max: number) {
    return Array.from({ length: max }).map((_, i) => (
      <span key={i} className={i < lives ? "text-red-500" : "text-white/20"}>
        ♥
      </span>
    ));
  }

  function PlayerSlot({ player }: { player: Player }) {
    const isActive = gameState!.currentTurn === player.id;
    const isDealer = dealerPlayer?.id === player.id;
    const cardOnTable = gameState!.currentTrick.find(
      (t) => t.playerId === player.id,
    );
    const bet = gameState!.bets[player.id];
    const taken = gameState!.tricksTaken[player.id] ?? 0;

    // Na carta na testa: outros jogadores têm cartas VISÍVEIS para mim
    // A minha carta que fica oculta (tratado na minha mão abaixo)
    const showOtherCards = isCardOnForehead && !player.isEliminated;

    return (
      <div
        className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all min-w-20
        ${isActive ? "bg-yellow-400/20 ring-2 ring-yellow-400" : "bg-white/5"}
        ${player.isEliminated ? "opacity-40" : ""}
      `}
      >
        <div className="flex items-center gap-1">
          {isDealer && <span title="Pé">🦶</span>}
          <span className="text-xs font-bold text-white/80 truncate max-w-20">
            {player.name}
          </span>
          {player.id === myId && (
            <span className="text-xs text-yellow-400">(você)</span>
          )}
        </div>
        <div className="text-xs">
          {renderLives(player.lives, gameState!.config.livesPerPlayer)}
        </div>
        {bet !== undefined && (
          <div className="text-xs text-yellow-300 font-mono">
            {taken}/{bet}
          </div>
        )}

        {/* Carta jogada na mesa OU cartas na mão */}
        {cardOnTable ? (
          <CardComponent card={cardOnTable.card} small />
        ) : player.isEliminated ? (
          <span className="text-xs text-red-400 font-bold mt-1">
            💀 Eliminado
          </span>
        ) : showOtherCards ? (
          // Carta na testa: mostra as cartas reais do oponente lado a lado
          <div className="flex gap-0.5 flex-wrap justify-center max-w-28">
            {player.hand.map((card, i) => (
              <CardComponent key={i} card={card} hidden={false} small />
            ))}
          </div>
        ) : (
          // Normal: leque compacto
          <FanCards count={player.hand.length} />
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col relative overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/30 shrink-0">
        <span className="font-bold text-yellow-400 text-sm">🃏 Fodinha</span>
        <div className="flex flex-col items-center">
          <span className="text-white text-xs font-bold">
            Rodada {gameState.round} — {gameState.cardsThisRound} carta
            {gameState.cardsThisRound > 1 ? "s" : ""}
          </span>
          {isCardOnForehead && (
            <span className="text-yellow-300 text-xs animate-pulse">
              👀 Carta na Testa!
            </span>
          )}
        </div>
        <span className="text-white/40 text-xs font-mono">{roomCode}</span>
      </div>

      {/* Outros jogadores */}
      <div className="flex flex-wrap justify-center gap-3 p-3 shrink-0">
        {others.map((p) => (
          <PlayerSlot key={p.id} player={p} />
        ))}
      </div>

      {/* Mesa central */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
        {/* Cartas jogadas na vaza atual */}
        <div
          className="flex gap-3 flex-wrap justify-center min-h-28 items-center
          bg-green-900/30 rounded-2xl px-6 py-4 w-full max-w-lg border border-green-700/30"
        >
          {gameState.currentTrick.length > 0 ? (
            gameState.currentTrick.map((t) => (
              <div
                key={t.playerId}
                className="flex flex-col items-center gap-1"
              >
                <CardComponent card={t.card} />
                <span className="text-xs text-white/50">
                  {gameState.players.find((p) => p.id === t.playerId)?.name}
                </span>
              </div>
            ))
          ) : (
            <p className="text-white/20 text-sm">Mesa vazia</p>
          )}
        </div>

        {/* Resultado da vaza */}
        {trickResult && (
          <div className="bg-black/60 rounded-xl px-6 py-2 text-center">
            {trickResult.winnerId ? (
              <p className="text-yellow-400 font-bold">
                {trickResult.winnerId === myId
                  ? "🎉 Você fez a vaza!"
                  : `${gameState.players.find((p) => p.id === trickResult.winnerId)?.name} fez a vaza!`}
              </p>
            ) : (
              <p className="text-white/60 font-bold">🤝 Ninguém fez a vaza!</p>
            )}
          </div>
        )}

        {/* Fase de apostas */}
        {isBetting && (
          <div className="bg-black/50 rounded-2xl p-4 text-center w-full max-w-sm">
            {isMyBetTurn ? (
              <div>
                <p className="text-white font-bold mb-1">
                  Quantas vazas você vai fazer?
                </p>
                {isLastBetter &&
                  gameState.cardsThisRound > 1 &&
                  forbiddenBet >= 0 &&
                  forbiddenBet <= gameState.cardsThisRound && (
                    <p className="text-red-400 text-xs mb-2">
                      Proibido apostar {forbiddenBet} (soma ficaria igual ao nº
                      de vazas)
                    </p>
                  )}
                <div className="flex gap-2 flex-wrap justify-center">
                  {Array.from(
                    { length: gameState.cardsThisRound + 1 },
                    (_, i) => i,
                  ).map((n) => (
                    <button
                      key={n}
                      onClick={() => placeBet(n)}
                      disabled={
                        gameState.cardsThisRound > 1 && n === forbiddenBet
                      }
                      className={`w-11 h-11 rounded-lg font-bold text-lg transition-all
                        ${
                          gameState.cardsThisRound > 1 && n === forbiddenBet
                            ? "bg-white/10 text-white/20 cursor-not-allowed line-through"
                            : "bg-yellow-400 hover:bg-yellow-300 text-gray-900 active:scale-95"
                        }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-white/80 font-bold text-sm">
                  {alreadyBet
                    ? `✅ Você apostou ${gameState.bets[myId]}`
                    : "Aguarde sua vez de apostar..."}
                </p>
                <p className="text-white/40 text-xs mt-1">
                  Vez de{" "}
                  {
                    gameState.players.find(
                      (p) => p.id === gameState.currentTurn,
                    )?.name
                  }
                </p>
                {/* Apostas já feitas */}
                <div className="flex gap-2 flex-wrap justify-center mt-2">
                  {gameState.bettingOrder.map((id) => {
                    const p = gameState.players.find((x) => x.id === id);
                    const b = gameState.bets[id];
                    return (
                      <div
                        key={id}
                        className="text-xs bg-white/10 rounded px-2 py-1"
                      >
                        {p?.name}:{" "}
                        {b !== undefined ? (
                          <span className="text-yellow-300 font-bold">{b}</span>
                        ) : (
                          "..."
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Indicador de turno */}
        {gameState.phase === "playing" && (
          <div
            className={`rounded-xl px-4 py-2 text-sm font-bold text-center
            ${isMyTurn ? "bg-yellow-400 text-gray-900" : "bg-white/10 text-white/60"}`}
          >
            {isMyTurn
              ? selectedCard !== null
                ? "👆 Clique na carta novamente para jogar!"
                : "👆 Sua vez! Clique numa carta para selecionar"
              : `⏳ Vez de ${gameState.players.find((p) => p.id === gameState.currentTurn)?.name}`}
          </div>
        )}
      </div>

      {/* Minha mão */}
      {me && !me.isEliminated && (
        <div className="flex flex-col items-center gap-2 pb-2 pt-2 shrink-0 bg-black/20">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-bold">{me.name}</span>
            <span>
              {renderLives(me.lives, gameState.config.livesPerPlayer)}
            </span>
            {dealerPlayer?.id === myId && (
              <span title="Você é o pé">🦶 Pé</span>
            )}
            {gameState.bets[myId] !== undefined && (
              <span className="text-yellow-300 font-mono">
                apostei {gameState.bets[myId]} | fiz{" "}
                {gameState.tricksTaken[myId] ?? 0}
              </span>
            )}
          </div>

          {isCardOnForehead && (
            <p className="text-yellow-300 text-xs">
              👁️ Você não vê sua própria carta — jogue às cegas!
            </p>
          )}

          <div className="flex gap-2 flex-wrap justify-center px-4">
            {me.hand.map((card, idx) => (
              <CardComponent
                key={idx}
                card={card}
                hidden={isCardOnForehead}
                selected={selectedCard === idx}
                onClick={
                  isMyTurn && gameState.phase === "playing"
                    ? () => handleCardClick(idx)
                    : undefined
                }
                disabled={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Footer: Regras + Sair */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/40 shrink-0 gap-2">
        <button
          onClick={() => setShowRules(true)}
          className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-all bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg"
        >
          📖 Regras
        </button>

        <div className="flex gap-2 text-xs text-white/30 font-mono">
          <span>
            Vazas: {gameState.trickNumber - 1}/{gameState.cardsThisRound}
          </span>
        </div>

        <button
          onClick={() => setShowQuit(true)}
          className="flex items-center gap-1 text-xs text-red-400/70 hover:text-red-400 transition-all bg-red-900/20 hover:bg-red-900/40 px-3 py-1.5 rounded-lg"
        >
          🚪 Sair
        </button>
      </div>

      {/* Modal: Regras */}
      {showRules && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-black text-yellow-400 mb-4">
              📖 Regras da Partida
            </h2>

            <div className="flex flex-col gap-3 text-sm text-white/80">
              <div className="bg-white/5 rounded-lg p-3">
                <h3 className="font-bold text-white mb-1">🃏 Rodadas</h3>
                <p>
                  Começam com 1 carta, sobem até o máximo (
                  {gameState.config.maxRounds} cartas) e voltam. Quem errar a
                  aposta perde uma vida.
                </p>
              </div>

              <div className="bg-white/5 rounded-lg p-3">
                <h3 className="font-bold text-white mb-1">
                  🔥 Ordem das Cartas
                </h3>
                <p className="font-mono text-xs leading-relaxed">
                  {CARD_ORDER}
                </p>
                <p className="text-xs text-yellow-300 mt-1">
                  4♣, 7♥, A♠ e 7♦ são manilhas (mais fortes)
                </p>
              </div>

              <div className="bg-white/5 rounded-lg p-3">
                <h3 className="font-bold text-white mb-1">🦶 O Pé</h3>
                <p>
                  O pé é o último a apostar. Ele{" "}
                  <strong className="text-red-400">não pode</strong> fazer a
                  soma das apostas ficar igual ao número de vazas da rodada.
                </p>
              </div>

              <div className="bg-white/5 rounded-lg p-3">
                <h3 className="font-bold text-white mb-1">🤝 Empate na Vaza</h3>
                <p>Se as cartas mais fortes empatarem, ninguém faz a vaza.</p>
                {gameState.config.fdpRule && (
                  <p className="text-yellow-300 mt-1">
                    ⚡ FDP ativo: cartas comuns iguais se anulam. Manilhas nunca
                    se anulam.
                  </p>
                )}
              </div>

              <div className="bg-white/5 rounded-lg p-3">
                <h3 className="font-bold text-white mb-1">
                  ❤️ Vidas e Eliminação
                </h3>
                <p>
                  Cada jogador começa com {gameState.config.livesPerPlayer} vida
                  {gameState.config.livesPerPlayer > 1 ? "s" : ""}. Errar a
                  aposta = -1 vida. Com 0 vidas, é eliminado.
                </p>
              </div>

              {gameState.config.cardOnForeheadRule && (
                <div className="bg-white/5 rounded-lg p-3">
                  <h3 className="font-bold text-white mb-1">
                    👀 Carta na Testa
                  </h3>
                  <p>
                    Na rodada de 1 carta, você não vê a sua — mas vê a de todos
                    os outros!
                  </p>
                </div>
              )}

              <div className="bg-white/5 rounded-lg p-3">
                <h3 className="font-bold text-white mb-1">
                  💀 Eliminação Simultânea
                </h3>
                <p>
                  Se dois ou mais jogadores perderem a última vida na mesma
                  rodada, todos são eliminados juntos.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowRules(false)}
              className="mt-4 w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-2 rounded-lg"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal: Confirmar saída */}
      {showQuit && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-xs text-center">
            <h2 className="text-xl font-black text-red-400 mb-2">
              🚪 Sair da Partida?
            </h2>
            <p className="text-white/60 text-sm mb-6">
              Você será eliminado e os outros jogadores continuarão sem você.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowQuit(false)}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={() => router.push("/")}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Painel fim de rodada */}
      {roundEnd && (
        <div className="absolute inset-0 bg-black/75 flex items-center justify-center z-40 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-black text-yellow-400 text-center mb-4">
              Resultado — Rodada {gameState.round}
            </h2>
            <div className="flex flex-col gap-2">
              {roundEnd.players.map((p) => {
                const bet = roundEnd.bets[p.id] ?? 0;
                const taken = roundEnd.tricksTaken[p.id] ?? 0;
                const acertou = bet === taken;
                const eliminado = roundEnd.eliminated.includes(p.id);
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2
                    ${eliminado ? "bg-red-950/80 border border-red-700" : acertou ? "bg-green-900/50" : "bg-red-900/40"}`}
                  >
                    <div className="flex items-center gap-2">
                      {eliminado && <span>💀</span>}
                      <span className="font-medium text-sm">{p.name}</span>
                    </div>
                    <span className="text-xs">
                      apostou {bet}, fez {taken} →{" "}
                      <span
                        className={
                          eliminado
                            ? "text-red-400 font-black"
                            : acertou
                              ? "text-green-400"
                              : "text-red-400"
                        }
                      >
                        {eliminado
                          ? "ELIMINADO"
                          : acertou
                            ? "✓ ok"
                            : "✗ -1 vida"}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-white/30 text-xs text-center mt-3">
              Próxima rodada em instantes...
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

export default function GamePage() {
  return (
    <Suspense>
      <GameContent />
    </Suspense>
  );
}
