"use client";

import { useEffect, useRef, useState } from "react";
import { useGameContext } from "@/lib/gameContext";
import Chat from "@/components/Chat";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LobbyContent() {
  const { gameState, myId, startGame, updateConfig, roomId, chatMessages, sendChat, globalChatMessages, sendGlobalChat, leaveRoom } = useGameContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomCode = searchParams.get("room") ?? roomId;

  const lobbyEntryRef = useRef<number>(Date.now());
  const [countdown, setCountdown] = useState(300);

  useEffect(() => {
    lobbyEntryRef.current = Date.now();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lobbyEntryRef.current) / 1000);
      const remaining = Math.max(0, 300 - elapsed);
      setCountdown(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (gameState?.phase === "betting" || gameState?.phase === "playing") {
      router.push(`/game?room=${roomCode}`);
    }
  }, [gameState?.phase, router, roomCode]);

  if (!gameState) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-white/60 text-xl">Conectando...</p>
      </main>
    );
  }

  const isHost = gameState.hostId === myId;
  const canStart = gameState.players.length >= 2;

  const countdownMin = Math.floor(countdown / 60);
  const countdownSec = String(countdown % 60).padStart(2, "0");
  const countdownUrgent = countdown <= 60;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-4">
      <div className="text-center">
        <h1 className="text-4xl font-black text-yellow-400">🃏 Fodinha</h1>
        <p className="text-green-300 mt-1">Sala de espera</p>
        <p className={`text-xs mt-1 ${countdownUrgent ? "text-red-400 font-bold animate-pulse" : "text-white/30"}`}>
          ⏳ {countdownMin}:{countdownSec} para iniciar
        </p>
      </div>

      <div className="bg-white/10 rounded-2xl px-8 py-4 text-center">
        <p className="text-white/60 text-sm mb-1">Código da sala</p>
        <p className="text-4xl font-black font-mono tracking-widest text-yellow-400">
          {roomCode}
        </p>
        <p className="text-white/40 text-xs mt-1">
          Compartilhe com seus amigos
        </p>
      </div>

      <div className="bg-white/10 rounded-2xl p-4 w-full max-w-sm">
        <h2 className="font-bold text-lg mb-3">
          Jogadores ({gameState.players.length}/{gameState.config.maxPlayers ?? 14})
        </h2>
        <div className="flex flex-col gap-2">
          {gameState.players.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 bg-white/10 rounded-lg px-3 py-2"
            >
              <span className="text-xl">
                {p.id === gameState.hostId ? "👑" : "🎮"}
              </span>
              <span className="font-medium">{p.name}</span>
              {p.id === myId && (
                <span className="ml-auto text-xs text-yellow-400 font-bold">
                  Você
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white/10 rounded-2xl p-4 w-full max-w-sm">
        <h2 className="font-bold text-lg mb-3">⚙️ Configurações</h2>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Vidas por jogador</span>
            {isHost ? (
              <select
                className="bg-white/20 text-white rounded px-2 py-1 text-sm"
                value={gameState.config.livesPerPlayer}
                onChange={(e) =>
                  updateConfig({ livesPerPlayer: Number(e.target.value) })
                }
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n} className="text-gray-900">
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-yellow-400 font-bold text-sm">
                {gameState.config.livesPerPlayer}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">Regra FDP</span>
            {isHost ? (
              <input
                type="checkbox"
                className="w-5 h-5 accent-yellow-400"
                checked={gameState.config.fdpRule}
                onChange={(e) => updateConfig({ fdpRule: e.target.checked })}
              />
            ) : (
              <span
                className={`text-sm font-bold ${gameState.config.fdpRule ? "text-green-400" : "text-white/40"}`}
              >
                {gameState.config.fdpRule ? "✓ Ativa" : "✗ Inativa"}
              </span>
            )}
          </div>

          {/* Opção exclusiva Regra FDP: começar com baralho duplo */}
          {gameState.config.fdpRule && (
            <div className="flex items-center justify-between pl-4 border-l-2 border-yellow-400/40">
              <div className="flex flex-col">
                <span className="text-sm">Começar com 2 baralhos</span>
                <span className="text-[10px] text-white/40">Se desmarcado, usa 1 baralho até precisar de 2</span>
              </div>
              {isHost ? (
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-yellow-400 ml-3 shrink-0"
                  checked={gameState.config.fdpStartDoubleDeck ?? false}
                  onChange={(e) => updateConfig({ fdpStartDoubleDeck: e.target.checked })}
                />
              ) : (
                <span className={`text-sm font-bold ml-3 ${gameState.config.fdpStartDoubleDeck ? "text-green-400" : "text-white/40"}`}>
                  {gameState.config.fdpStartDoubleDeck ? "✓ Sim" : "✗ Não"}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm">Carta na Testa</span>
            {isHost ? (
              <input
                type="checkbox"
                className="w-5 h-5 accent-yellow-400"
                checked={gameState.config.cardOnForeheadRule}
                onChange={(e) =>
                  updateConfig({ cardOnForeheadRule: e.target.checked })
                }
              />
            ) : (
              <span
                className={`text-sm font-bold ${gameState.config.cardOnForeheadRule ? "text-green-400" : "text-white/40"}`}
              >
                {gameState.config.cardOnForeheadRule ? "✓ Ativa" : "✗ Inativa"}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">Desempate por Naipe</span>
            {isHost ? (
              <input
                type="checkbox"
                className="w-5 h-5 accent-yellow-400"
                checked={gameState.config.suitTiebreakerRule}
                onChange={(e) =>
                  updateConfig({ suitTiebreakerRule: e.target.checked })
                }
              />
            ) : (
              <span
                className={`text-sm font-bold ${gameState.config.suitTiebreakerRule ? "text-green-400" : "text-white/40"}`}
              >
                {gameState.config.suitTiebreakerRule ? "✓ Ativa" : "✗ Inativa"}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">Máx. Jogadores</span>
            {isHost ? (
              <select
                className="bg-white/20 text-white rounded px-2 py-1 text-sm"
                value={gameState.config.maxPlayers ?? 14}
                onChange={(e) =>
                  updateConfig({ maxPlayers: Number(e.target.value) })
                }
              >
                {Array.from({ length: 19 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n} className="text-gray-900">
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-yellow-400 font-bold text-sm">
                {gameState.config.maxPlayers ?? 14}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">Sala Pública</span>
            {isHost ? (
              <input
                type="checkbox"
                className="w-5 h-5 accent-yellow-400"
                checked={gameState.config.isPublic}
                onChange={(e) => updateConfig({ isPublic: e.target.checked })}
              />
            ) : (
              <span className={`text-sm font-bold ${gameState.config.isPublic ? "text-green-400" : "text-white/40"}`}>
                {gameState.config.isPublic ? "✓ Pública" : "✗ Privada"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chat in lobby - usa chat global se sala pública, chat da sala se privada */}
      <div className="fixed right-4 bottom-6 z-40">
        <Chat
          messages={gameState.config.isPublic && globalChatMessages ? globalChatMessages : chatMessages}
          send={gameState.config.isPublic ? sendGlobalChat : sendChat}
          compact
          global={gameState.config.isPublic}
        />
      </div>

      {isHost && (
        <button
          onClick={startGame}
          disabled={!canStart}
          className={`w-full max-w-sm font-bold py-4 rounded-xl text-xl transition-all shadow-lg
            ${
              canStart
                ? "bg-yellow-400 hover:bg-yellow-300 text-gray-900"
                : "bg-white/20 text-white/40 cursor-not-allowed"
            }`}
        >
          {canStart ? "🚀 Iniciar Jogo" : "Aguardando jogadores..."}
        </button>
      )}

      {!isHost && (
        <p className="text-white/50 text-center">
          Aguardando o host iniciar o jogo...
        </p>
      )}

      {/* Botão de sair da sala */}
      <button
        onClick={() => { leaveRoom(); router.push("/"); }}
        className="w-full max-w-sm bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl text-center transition-all shadow-lg flex items-center justify-center gap-2"
      >
        🏠 Sair da Sala
      </button>
    </main>
  );
}

export default function LobbyPage() {
  return (
    <Suspense>
      <LobbyContent />
    </Suspense>
  );
}
