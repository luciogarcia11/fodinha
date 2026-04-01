"use client";

import { useEffect, useState } from "react";
import { useGameContext } from "@/lib/gameContext";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import CardComponent from "@/components/game/CardComponent";
import Chat from "@/components/Chat";
import { Player, TrickResult } from "@/lib/types";
import FanCards from "@/components/game/FanCards";

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
    becomeSpectator,
    joinAsSpectator,
    voteKickCooldownUntil,
    gameOverAt,
    playerQuitName,
    playerReconnectedName,
    playerDisconnectedName,
    kicked,
    voteKick,
    voteUpdate,
    voteComplete,
    initiateVoteKick,
    castVoteKick,
    hostBan,
    hostKick,
    clearPlayerQuit,
    clearPlayerReconnected,
    clearPlayerDisconnected,
    clearVoteComplete,
    chatMessages,
    sendChat,
  } = useGameContext();

  const router = useRouter();
  const searchParams = useSearchParams();
  const roomCode = searchParams.get("room");
  const spectateCode = searchParams.get("spectate");
  const [spectatorName, setSpectatorName] = useState("");
  const [showSpectatorJoin, setShowSpectatorJoin] = useState(false);
  const [showSpectators, setShowSpectators] = useState(false);
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
  const [hideMyCards, setHideMyCards] = useState(false);
  const [showVoteKickTarget, setShowVoteKickTarget] = useState<string | null>(
    null,
  );
  const [trickResultVisible, setTrickResultVisible] = useState<boolean>(false);
  const [prevTrickResult, setPrevTrickResult] = useState<TrickResult | null>(
    null,
  );
  // Cooldown de vote-kick: segundos restantes (atualizado por intervalo)
  const [voteKickCooldownSec, setVoteKickCooldownSec] = useState(0);
  // Conta regressiva do placar (5 min após game_over)
  const [gameOverCountdown, setGameOverCountdown] = useState(300);

  useEffect(() => {
    if (!voteKickCooldownUntil) return;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((voteKickCooldownUntil - Date.now()) / 1000));
      setVoteKickCooldownSec(rem);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [voteKickCooldownUntil]);

  useEffect(() => {
    if (!gameOverAt) return;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((gameOverAt + 300_000 - Date.now()) / 1000));
      setGameOverCountdown(rem);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [gameOverAt]);

  if (trickResult !== prevTrickResult) {
    setPrevTrickResult(trickResult);
    setTrickResultVisible(!!trickResult);
  }

  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === "lobby") router.push(`/lobby?room=${roomCode}`);
  }, [gameState, roomCode, router]);

  useEffect(() => {
    if (trickResultVisible && trickResult) {
      const t = setTimeout(() => {
        setTrickResultVisible(false);
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [trickResultVisible, trickResult]);

  useEffect(() => {
    if (!roundEnd) return;
    const t = setTimeout(() => {
      clearRoundEnd();
    }, 4000);
    return () => clearTimeout(t);
  }, [roundEnd, clearRoundEnd]);

  useEffect(() => {
    if (!playerQuitName) return;
    const t = setTimeout(() => clearPlayerQuit(), 3000);
    return () => clearTimeout(t);
  }, [playerQuitName, clearPlayerQuit]);

  useEffect(() => {
    if (!playerDisconnectedName) return;
    const t = setTimeout(() => clearPlayerDisconnected(), 3000);
    return () => clearTimeout(t);
  }, [playerDisconnectedName, clearPlayerDisconnected]);

  useEffect(() => {
    if (!playerReconnectedName) return;
    const t = setTimeout(() => clearPlayerReconnected(), 3000);
    return () => clearTimeout(t);
  }, [playerReconnectedName, clearPlayerReconnected]);

  useEffect(() => {
    if (!voteComplete) return;
    const t = setTimeout(() => clearVoteComplete(), 3000);
    return () => clearTimeout(t);
  }, [voteComplete, clearVoteComplete]);

  // Exibe modal de nome para entrar como espectador via ?spectate=CODIGO
  useEffect(() => {
    if (spectateCode && !roomCode && !gameState) {
      setShowSpectatorJoin(true);
    }
  }, [spectateCode, roomCode, gameState]);

  // Redirect if kicked
  useEffect(() => {
    if (kicked) {
      const t = setTimeout(() => {
        router.push("/");
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [kicked, router]);

  if (!gameState) {
    // Modal de entrada como espectador via ?spectate=CODIGO
    if (showSpectatorJoin && spectateCode) {
      return (
        <main className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-xs text-center">
            <h2 className="text-xl font-black text-indigo-400 mb-4">👁️ Assistir Partida</h2>
            <p className="text-white/60 text-sm mb-4">
              Sala <span className="font-mono text-yellow-400">{spectateCode.toUpperCase()}</span>
            </p>
            <input
              type="text"
              placeholder="Seu nome"
              value={spectatorName}
              onChange={(e) => setSpectatorName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && spectatorName.trim()) {
                  joinAsSpectator(spectateCode, spectatorName.trim());
                  setShowSpectatorJoin(false);
                }
              }}
              className="w-full bg-white/10 text-white placeholder-white/40 px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400 mb-4"
              maxLength={16}
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => { window.location.href = "/"; }}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (spectatorName.trim()) {
                    joinAsSpectator(spectateCode, spectatorName.trim());
                    setShowSpectatorJoin(false);
                  }
                }}
                disabled={!spectatorName.trim()}
                className="flex-1 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white font-bold py-2 rounded-lg text-sm"
              >
                Entrar
              </button>
            </div>
          </div>
        </main>
      );
    }
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-white/60 text-xl">Carregando jogo...</p>
      </main>
    );
  }

  if (gameState.phase === "game_over" || winnerId) {
    const winner = gameState.players.find((p) => p.id === winnerId);
    const mm = String(Math.floor(gameOverCountdown / 60)).padStart(2, '0');
    const ss = String(gameOverCountdown % 60).padStart(2, '0');
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6">
        <h1 className="text-4xl md:text-5xl font-black text-yellow-400">
          🏆 Fim de Jogo!
        </h1>
        <p className="text-xl md:text-2xl text-white">
          {winner?.id === myId ? "🎉 Você venceu!" : `${winner?.name} venceu!`}
        </p>
        <p className="text-white/40 text-sm">
          Sala fecha em <span className="font-mono text-white/70">{mm}:{ss}</span>
        </p>
        <button
          onClick={() => { window.location.href = "/"; }}
          className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-3 px-8 rounded-xl text-lg"
        >
          Voltar ao início
        </button>
      </main>
    );
  }

  const me = gameState.players.find((p) => p.id === myId);

  // Ordena os outros jogadores pela ordem de jogo (bettingOrder),
  // começando pelo próximo após mim → vai para a esquerda.
  // Sequência: esquerda → topo → direita (ordem de jogo da esq p/ dir).
  const playOrder = gameState.bettingOrder; // IDs na ordem de jogo
  const myOrderIndex = playOrder.indexOf(myId);
  // Monta lista dos outros na sequência a partir do próximo após mim
  const othersOrdered = (() => {
    const result: typeof gameState.players = [];
    const n = playOrder.length;
    for (let i = 1; i < n; i++) {
      const id = playOrder[(myOrderIndex + i) % n];
      const p = gameState.players.find((p) => p.id === id);
      if (p) result.push(p);
    }
    // Jogadores não presentes no bettingOrder (ex: eliminados) ficam no final
    gameState.players.forEach((p) => {
      if (p.id !== myId && !result.find((r) => r.id === p.id)) result.push(p);
    });
    return result;
  })();
  const others = othersOrdered;
  const activePlayers = gameState.players.filter((p) => !p.isEliminated);
  const isMyTurn = gameState.currentTurn === myId;

  const isCardOnForehead =
    gameState.config.cardOnForeheadRule && gameState.cardsThisRound === 1;

  const isBetting = gameState.phase === "betting";
  const isMyBetTurn = isBetting && gameState.currentTurn === myId;
  const alreadyBet = myId in gameState.bets;

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
    const showOtherCards = isCardOnForehead && !player.isEliminated;
    const isHost = gameState!.hostId === myId;
    const isMe = player.id === myId;
    const showControls = showVoteKickTarget === player.id;

    return (
      <div
        className={`flex flex-col items-center gap-1 p-1.5 md:p-2 rounded-xl transition-all
        min-w-[60px] md:min-w-[80px] max-w-[80px] md:max-w-[100px]
        ${isActive ? "bg-yellow-400/20 ring-2 ring-yellow-400" : "bg-white/5"}
        ${player.isEliminated ? "opacity-40" : ""}
      `}
      >
        <div className="flex items-center gap-0.5">
          {isDealer && (
            <span className="text-[10px] md:text-xs" title="Pé">
              🦶
            </span>
          )}
          <span
            className="text-[10px] md:text-xs font-bold text-white/80 truncate max-w-[60px] md:max-w-[80px] cursor-pointer"
            onClick={() =>
              !isMe &&
              !player.isEliminated &&
              setShowVoteKickTarget(showControls ? null : player.id)
            }
          >
            {player.name}
          </span>
        </div>
        <div className="text-[10px] md:text-xs">
          {renderLives(player.lives, gameState!.config.livesPerPlayer)}
        </div>
        {bet !== undefined && (
          <div className="text-[10px] md:text-xs text-yellow-300 font-mono">
            {taken}/{bet}
          </div>
        )}
        {cardOnTable ? (
          <CardComponent card={cardOnTable.card} small />
        ) : player.isEliminated ? (
          <span className="text-[10px] text-red-400 font-bold mt-1">💀</span>
        ) : showOtherCards ? (
          <div className="flex gap-0.5 flex-wrap justify-center max-w-[70px] md:max-w-[90px]">
            {player.hand.map((card, i) => (
              <CardComponent key={i} card={card} hidden={false} small />
            ))}
          </div>
        ) : (gameState!.players.find(p => p.id === myId)?.isSpectator) ? (
          // Espectador vê todas as cartas abertas
          <div className="flex gap-0.5 flex-wrap justify-center max-w-[70px] md:max-w-[90px]">
            {player.hand.map((card, i) => (
              <CardComponent key={i} card={card} hidden={false} small />
            ))}
          </div>
        ) : (
          <FanCards count={player.hand.length} hand={player.hand} />
        )}
        {/* Player action menu */}
        {showControls && !isMe && !player.isEliminated && (
          <div className="flex flex-col gap-1 mt-1">
            <button
              onClick={() => {
                initiateVoteKick(player.id);
                setShowVoteKickTarget(null);
              }}
              className="text-[9px] md:text-[10px] bg-purple-700/60 hover:bg-purple-700 text-white px-2 py-0.5 rounded disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={voteKickCooldownSec > 0}
            >
              {voteKickCooldownSec > 0 ? `⏳ Aguarde ${voteKickCooldownSec}s` : "🗳️ Votar kick"}
            </button>
            {isHost && (
              <>
                <button
                  onClick={() => {
                    hostKick(player.id);
                    setShowVoteKickTarget(null);
                  }}
                  className="text-[9px] md:text-[10px] bg-red-700/60 hover:bg-red-700 text-white px-2 py-0.5 rounded"
                >
                  🚪 Kick
                </button>
                <button
                  onClick={() => {
                    hostBan(player.id);
                    setShowVoteKickTarget(null);
                  }}
                  className="text-[9px] md:text-[10px] bg-red-900/60 hover:bg-red-900 text-white px-2 py-0.5 rounded"
                >
                  ⛔ Ban
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // Calcula posições absolutas dos jogadores ao redor da mesa.
  // Ângulos: +120° (direita) a -120° (esquerda), passando por 0° (topo).
  // O jogador na posição 0 da lista fica na DIREITA (próximo a jogar) → sentido anti-horário.
  function getPlayerPositions(
    count: number,
  ): { top: string; left: string; transform: string }[] {
    if (count === 0) return [];
    const positions: { top: string; left: string; transform: string }[] = [];
    const startDeg = 120;
    const endDeg = -120;
    for (let i = 0; i < count; i++) {
      const deg =
        count === 1 ? 0 : startDeg + (i * (endDeg - startDeg)) / (count - 1);
      const rad = (deg * Math.PI) / 180;
      // Elipse: rx=42% da largura, ry=40% da altura, centrado em 50%/50%
      const rx = 42;
      const ry = 40;
      const left = 50 + rx * Math.sin(rad);
      const top = 50 - ry * Math.cos(rad);
      positions.push({
        top: `${top}%`,
        left: `${left}%`,
        transform: "translate(-50%, -50%)",
      });
    }
    return positions;
  }

  const otherPositions = getPlayerPositions(others.length);

  return (
    <main className="min-h-screen flex flex-col relative overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-black/30 shrink-0">
        <span className="font-bold text-yellow-400 text-xs md:text-sm">
          🃏 Fodinha
        </span>
        <div className="flex flex-col items-center">
          <span className="text-white text-xs md:text-sm font-bold">
            Rodada {gameState.round} — {gameState.cardsThisRound} carta
            {gameState.cardsThisRound > 1 ? "s" : ""}
          </span>
          {isCardOnForehead && (
            <span className="text-yellow-300 text-[10px] md:text-xs animate-pulse">
              👀 Carta na Testa!
            </span>
          )}
        </div>
        <span className="text-white/40 text-[10px] md:text-xs font-mono">
          {roomCode}
        </span>
      </div>

      {/* Área da mesa — posição relativa para os jogadores absolutos */}
      <div className="flex-1 relative min-h-0">
        {/* Jogadores ao redor da mesa (posicionados absolutamente) */}
        {others.map((p, i) => (
          <div key={p.id} className="absolute z-10" style={otherPositions[i]}>
            <PlayerSlot player={p} />
          </div>
        ))}

        {/* Centro da mesa */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 md:gap-3 px-2 md:px-4 pointer-events-none">
          {/* Cartas na mesa */}
          <div
            className="flex gap-2 md:gap-3 flex-wrap justify-center min-h-20 md:min-h-24 items-center
            bg-green-900/40 rounded-2xl px-4 md:px-6 py-3 md:py-4 max-w-xs md:max-w-sm border border-green-700/30 pointer-events-auto"
          >
            {gameState.currentTrick.length > 0 ? (
              gameState.currentTrick.map((t) => {
                const ts = gameState.trickState;
                const isWinning = ts
                  ? ts.winningCardPlayerId === t.playerId && !ts.isTied
                  : false;
                const isTied = t.annulled;
                return (
                  <div
                    key={t.playerId}
                    className="flex flex-col items-center gap-1"
                  >
                    <CardComponent
                      card={t.card}
                      isWinning={isWinning}
                      isTied={isTied}
                    />
                    <span className="text-[10px] md:text-xs text-white/50">
                      {gameState.players.find((p) => p.id === t.playerId)?.name}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="text-white/20 text-xs md:text-sm">Mesa vazia</p>
            )}
          </div>

          {/* Resultado da vaza */}
          {trickResultVisible && trickResult && (
            <div className="bg-black/80 border border-yellow-400/30 rounded-2xl px-5 md:px-8 py-3 md:py-4 text-center pointer-events-auto">
              {trickResult.winnerId ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-2xl md:text-3xl">
                    {trickResult.winnerId === myId ? "🎉" : "🃏"}
                  </span>
                  <p className="text-yellow-400 font-black text-base md:text-lg">
                    {trickResult.winnerId === myId
                      ? "Você fez a vaza!"
                      : `${gameState.players.find((p) => p.id === trickResult.winnerId)?.name} fez a vaza!`}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-2xl md:text-3xl">🤝</span>
                  <p className="text-white/80 font-black text-base md:text-lg">
                    Ninguém fez a vaza!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Indicador de turno */}
          {gameState.phase === "playing" && (
            <div
              className={`rounded-xl px-3 md:px-4 py-2 text-xs md:text-sm font-bold text-center pointer-events-auto
              ${isMyTurn ? "bg-yellow-400 text-gray-900" : "bg-white/10 text-white/60"}`}
            >
              {isMyTurn
                ? selectedCard !== null
                  ? "👆 Clique novamente para jogar!"
                  : "👆 Sua vez! Selecione uma carta"
                : `⏳ Vez de ${gameState.players.find((p) => p.id === gameState.currentTurn)?.name}`}
            </div>
          )}

          {/* Fase de apostas */}
          {isBetting && (
            <div className="bg-black/60 rounded-2xl p-3 md:p-4 text-center w-full max-w-xs pointer-events-auto">
              {isMyBetTurn ? (
                <div>
                  <p className="text-white font-bold mb-1 text-sm md:text-base">
                    Quantas vazas você vai fazer?
                  </p>
                  {isLastBetter &&
                    gameState.cardsThisRound > 1 &&
                    forbiddenBet >= 0 &&
                    forbiddenBet <= gameState.cardsThisRound && (
                      <p className="text-red-400 text-xs mb-2">
                        Proibido apostar {forbiddenBet} (soma ficaria igual ao
                        nº de vazas)
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
                        className={`w-10 h-10 md:w-11 md:h-11 rounded-lg font-bold text-base md:text-lg transition-all
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
                  <p className="text-white/80 font-bold text-xs md:text-sm">
                    {alreadyBet
                      ? `✅ Você apostou ${gameState.bets[myId]}`
                      : "Aguarde sua vez de apostar..."}
                  </p>
                  <p className="text-white/40 text-[10px] md:text-xs mt-1">
                    Vez de{" "}
                    {
                      gameState.players.find(
                        (p) => p.id === gameState.currentTurn,
                      )?.name
                    }
                  </p>
                  <div className="flex gap-1 md:gap-2 flex-wrap justify-center mt-2">
                    {gameState.bettingOrder.map((id) => {
                      const p = gameState.players.find((x) => x.id === id);
                      const b = gameState.bets[id];
                      return (
                        <div
                          key={id}
                          className="text-[10px] md:text-xs bg-white/10 rounded px-1.5 md:px-2 py-0.5 md:py-1"
                        >
                          {p?.name}:{" "}
                          {b !== undefined ? (
                            <span className="text-yellow-300 font-bold">
                              {b}
                            </span>
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
        </div>
      </div>

      {/* Chat panel (right) */}
      <div className="absolute flex flex-col justify-end right-4 top-20 bottom-28 z-30 pointer-events-auto">
        <Chat messages={chatMessages} send={sendChat} compact players={gameState.players} />
      </div>

      {/* Minha mão — fixo na parte inferior */}
      {me && !me.isEliminated && (
        <div className="flex flex-col items-center gap-1.5 md:gap-2 pb-2 pt-2 shrink-0 bg-black/20">
          <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm flex-wrap justify-center px-2">
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
            <button
              onClick={() => setHideMyCards((h) => !h)}
              className="text-base md:text-lg opacity-60 hover:opacity-100 transition-opacity"
              title={hideMyCards ? "Mostrar cartas" : "Esconder cartas"}
            >
              {hideMyCards ? "🙈" : "👁️"}
            </button>
          </div>

          {isCardOnForehead && (
            <p className="text-yellow-300 text-[10px] md:text-xs">
              👁️ Você não vê sua carta — jogue às cegas!
            </p>
          )}

          <div className="flex gap-1.5 md:gap-2 flex-wrap justify-center px-2 md:px-4">
            {me.hand.map((card, idx) => (
              <CardComponent
                key={idx}
                card={card}
                hidden={isCardOnForehead || hideMyCards}
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

      {/* Barra de espectador — substitui mão para quem está assistindo */}
      {me && me.isSpectator && (
        <div className="flex items-center justify-center gap-4 py-3 shrink-0 bg-black/30 border-t border-white/10">
          <span className="text-white/50 text-sm font-bold">👁️ Assistindo a partida</span>
          <button
            onClick={() => { quitGame(); setTimeout(() => { window.location.href = "/"; }, 100); }}
            className="text-xs text-red-400/70 hover:text-red-400 bg-red-900/20 hover:bg-red-900/40 px-3 py-1.5 rounded-lg transition-all"
          >
            🚪 Sair
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-black/40 shrink-0 gap-2">
        <button
          onClick={() => setShowRules(true)}
          className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-all bg-white/10 hover:bg-white/20 px-2 md:px-3 py-1.5 rounded-lg"
        >
          📖 <span className="hidden sm:inline">Regras</span>
        </button>
        <div className="text-[10px] md:text-xs text-white/30 font-mono">
          Vazas: {gameState.trickNumber - 1}/{gameState.cardsThisRound}
        </div>
        <button
          onClick={() => setShowQuit(true)}
          className="flex items-center gap-1 text-xs text-red-400/70 hover:text-red-400 transition-all bg-red-900/20 hover:bg-red-900/40 px-2 md:px-3 py-1.5 rounded-lg"
        >
          🚪 <span className="hidden sm:inline">Sair</span>
        </button>
      </div>

      {/* Modal: Regras */}
      {showRules && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-3 md:p-4">
          <div className="bg-gray-900 rounded-2xl p-4 md:p-6 w-full max-w-md max-h-[85vh] overflow-y-auto">
            <h2 className="text-base md:text-xl font-black text-yellow-400 mb-3 md:mb-4">
              📖 Regras da Partida
            </h2>
            <div className="flex flex-col gap-2 md:gap-3 text-xs md:text-sm text-white/80">
              <div className="bg-white/5 rounded-lg p-2.5 md:p-3">
                <h3 className="font-bold text-white mb-1">🃏 Rodadas</h3>
                <p>
                  Começam com 1 carta, sobem até o máximo (
                  {gameState.config.maxRounds} cartas) e voltam. Quem errar a
                  aposta perde uma vida.
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5 md:p-3">
                <h3 className="font-bold text-white mb-1">
                  🔥 Ordem das Cartas
                </h3>
                <p className="font-mono text-[10px] md:text-xs leading-relaxed">
                  {CARD_ORDER}
                </p>
                <p className="text-[10px] md:text-xs text-yellow-300 mt-1">
                  4♣, 7♥, A♠ e 7♦ são manilhas (mais fortes)
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5 md:p-3">
                <h3 className="font-bold text-white mb-1">🦶 O Pé</h3>
                <p>
                  O último a apostar. Da 2ª rodada em diante, não pode deixar a
                  soma igual ao nº de vazas.
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5 md:p-3">
                <h3 className="font-bold text-white mb-1">🤝 Empate na Vaza</h3>
                <p>Se as cartas mais fortes empatarem, ninguém faz a vaza.</p>
                {gameState.config.fdpRule && (
                  <p className="text-[10px] md:text-xs text-yellow-300 mt-1">
                    ⚡ FDP ativo: comuns iguais se anulam.{gameState.config.fdpStartDoubleDeck ? " No baralho duplo, manilhas iguais também se anulam." : " Manilhas nunca."}
                  </p>
                )}
              </div>
              <div className="bg-white/5 rounded-lg p-2.5 md:p-3">
                <h3 className="font-bold text-white mb-1">
                  ❤️ Vidas e Eliminação
                </h3>
                <p>
                  Começa com {gameState.config.livesPerPlayer} vida
                  {gameState.config.livesPerPlayer > 1 ? "s" : ""}. Errar = -1
                  vida. Com 0, eliminado.
                </p>
              </div>
              {gameState.config.cardOnForeheadRule && (
                <div className="bg-white/5 rounded-lg p-2.5 md:p-3">
                  <h3 className="font-bold text-white mb-1">
                    👀 Carta na Testa
                  </h3>
                  <p>
                    Na rodada de 1 carta, você não vê a sua — mas vê a de todos
                    os outros!
                  </p>
                </div>
              )}
              <div className="bg-white/5 rounded-lg p-2.5 md:p-3">
                <h3 className="font-bold text-white mb-1">
                  💀 Eliminação Simultânea
                </h3>
                <p>
                  Se dois ou mais jogadores perderem a última vida na mesma
                  rodada, todos são eliminados juntos.
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5 md:p-3">
                <h3 className="font-bold text-white mb-1">👁️ Espectadores</h3>
                <p>
                  Eliminados continuam assistindo. Externos podem entrar via
                  hub de salas ou link <code className="text-yellow-300">/game?spectate=CODIGO</code>.
                  Máx. 10 espectadores por sala.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowRules(false)}
              className="mt-3 md:mt-4 w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-2 rounded-lg text-sm md:text-base"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Overlay para jogador eliminado aguardando escolha */}
      {me && me.isEliminated && !me.isSpectator && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-xs text-center flex flex-col gap-4">
            <div className="text-5xl">💀</div>
            <h2 className="text-xl font-black text-red-400">Você foi eliminado!</h2>
            <p className="text-white/60 text-sm">O jogo continua... Quer assistir?</p>
            <button
              onClick={becomeSpectator}
              className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-3 rounded-xl text-base transition-all"
            >
              👁️ Assistir como espectador
            </button>
            <button
              onClick={() => { quitGame(); setTimeout(() => { window.location.href = "/"; }, 100); }}
              className="bg-white/10 hover:bg-white/20 text-white/70 font-bold py-2 rounded-xl text-sm transition-all"
            >
              🚪 Sair do jogo
            </button>
          </div>
        </div>
      )}

      {/* Banner de espectador */}
      {me && me.isSpectator && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 bg-black/70 border border-white/20 rounded-full px-4 py-1 text-white/70 text-xs font-bold pointer-events-none">
          👁️ Modo Espectador — você vê todas as cartas
        </div>
      )}

      {/* Widget de espectadores (canto inferior esquerdo) */}
      {gameState.players.filter(p => p.isSpectator).length > 0 && (
        <div className="absolute bottom-20 left-2 z-30">
          <button
            onClick={() => setShowSpectators(s => !s)}
            className="bg-black/60 border border-white/20 rounded-full px-3 py-1 text-white/60 text-xs font-bold hover:bg-black/80"
          >
            👁️ {gameState.players.filter(p => p.isSpectator).length}
          </button>
          {showSpectators && (
            <div className="mt-1 bg-gray-900/90 border border-white/10 rounded-xl p-2 min-w-[120px]">
              <p className="text-white/40 text-[10px] font-bold uppercase mb-1">Espectadores</p>
              {gameState.players.filter(p => p.isSpectator).map(p => (
                <p key={p.id} className="text-white/70 text-xs py-0.5">{p.name}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Confirmar saída */}
      {showQuit && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-5 md:p-6 w-full max-w-xs text-center">
            <h2 className="text-lg md:text-xl font-black text-red-400 mb-2">
              🚪 Sair da Partida?
            </h2>
            <p className="text-white/60 text-xs md:text-sm mb-5 md:mb-6">
              Você será eliminado e os outros jogadores continuarão sem você.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowQuit(false)}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  quitGame();
                  setTimeout(() => {
                    window.location.href = "/";
                  }, 100);
                }}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg text-sm"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Painel fim de rodada */}
      {roundEnd && (
        <div className="absolute inset-0 bg-black/75 flex items-center justify-center z-40 p-3 md:p-4">
          <div className="bg-gray-900 rounded-2xl p-4 md:p-6 w-full max-w-sm">
            <h2 className="text-base md:text-xl font-black text-yellow-400 text-center mb-3 md:mb-4">
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
                    className={`flex items-center justify-between rounded-lg px-2.5 md:px-3 py-1.5 md:py-2
                    ${eliminado ? "bg-red-950/80 border border-red-700" : acertou ? "bg-green-900/50" : "bg-red-900/40"}`}
                  >
                    <div className="flex items-center gap-1.5 md:gap-2">
                      {eliminado && <span>💀</span>}
                      <span className="font-medium text-xs md:text-sm">
                        {p.name}
                      </span>
                    </div>
                    <span className="text-[10px] md:text-xs">
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
            <p className="text-white/30 text-[10px] md:text-xs text-center mt-3">
              Próxima rodada em instantes...
            </p>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
        {playerQuitName && (
          <div className="bg-red-900/90 text-white text-xs md:text-sm px-4 py-2 rounded-xl border border-red-700">
            🚪 {playerQuitName} saiu da partida
          </div>
        )}
        {playerDisconnectedName && (
          <div className="bg-orange-900/90 text-white text-xs md:text-sm px-4 py-2 rounded-xl border border-orange-700">
            📡 {playerDisconnectedName} desconectou (aguardando reconexão...)
          </div>
        )}
        {playerReconnectedName && (
          <div className="bg-green-900/90 text-white text-xs md:text-sm px-4 py-2 rounded-xl border border-green-700">
            ✅ {playerReconnectedName} reconectou!
          </div>
        )}
        {voteComplete && (
          <div className="bg-purple-900/90 text-white text-xs md:text-sm px-4 py-2 rounded-xl border border-purple-700">
            🗳️ {voteComplete.targetName} foi expulso por votação!
          </div>
        )}
      </div>

      {/* Vote-kick modal */}
      {voteKick && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-5 w-full max-w-xs text-center">
            <h2 className="text-lg font-black text-purple-400 mb-2">
              🗳️ Votação de Kick
            </h2>
            <p className="text-white/80 text-sm mb-1">
              Expulsar{" "}
              <span className="font-bold text-white">
                {
                  gameState.players.find((p) => p.id === voteKick.targetId)
                    ?.name
                }
              </span>
              ?
            </p>
            {voteUpdate && (
              <p className="text-white/50 text-xs mb-3">
                Votos: {voteUpdate.votes}/{voteUpdate.needed}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => castVoteKick()}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg text-sm"
              >
                Votar para expulsar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kicked overlay */}
      {kicked && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-[60] p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-xs text-center">
            <span className="text-4xl">🚫</span>
            <h2 className="text-xl font-black text-red-400 mt-3 mb-2">
              Você foi expulso!
            </h2>
            <p className="text-white/60 text-sm">Redirecionando...</p>
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
