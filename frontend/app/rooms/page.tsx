"use client";

import { useEffect, useState } from "react";
import { useGameContext } from "@/lib/gameContext";
import { useRouter } from "next/navigation";

export default function RoomsPage() {
  const { publicRooms, fetchRooms, joinRoom, joinAsSpectator, watchableRooms, fetchWatchableRooms, roomId, gameState, error } = useGameContext();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetchRooms();
    fetchWatchableRooms();
    const interval = setInterval(() => { fetchRooms(); fetchWatchableRooms(); }, 3000);
    return () => clearInterval(interval);
  }, [fetchRooms, fetchWatchableRooms]);

  useEffect(() => {
    if (roomId && gameState) {
      if (gameState.phase === "lobby") {
        router.push(`/lobby?room=${roomId}`);
      } else {
        router.push(`/game?room=${roomId}`);
      }
    }
  }, [roomId, gameState, router]);

  function handleJoin(targetRoomId: string) {
    if (!name.trim()) {
      setNameError("Digite seu nome primeiro!");
      return;
    }
    setNameError("");
    joinRoom(targetRoomId, name.trim());
  }

  function handleWatch(targetRoomId: string) {
    if (!name.trim()) {
      setNameError("Digite seu nome primeiro!");
      return;
    }
    setNameError("");
    joinAsSpectator(targetRoomId, name.trim());
  }

  const phaseLabel: Record<string, string> = {
    betting: 'Apostas',
    playing: 'Jogando',
    round_end: 'Fim de rodada',
  };

  return (
    <main className="min-h-screen flex flex-col items-center gap-6 p-4 pt-8">
      <div className="text-center">
        <h1 className="text-4xl font-black text-yellow-400">🃏 Salas Públicas</h1>
        <p className="text-white/60 mt-1 text-sm">Encontre uma sala para jogar ou assistir</p>
      </div>

      {(error || nameError) && (
        <div className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm">
          {nameError || error}
        </div>
      )}

      <div className="w-full max-w-md">
        <input
          type="text"
          placeholder="Seu nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-white/10 text-white placeholder-white/40 px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400 mb-4"
          maxLength={16}
        />
      </div>

      {/* Lobbies abertas */}
      <div className="w-full max-w-md">
        <h2 className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2">🎮 Lobbies Abertos</h2>
        <div className="flex flex-col gap-3">
          {publicRooms.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-4">Nenhum lobby disponível</p>
          ) : (
            publicRooms.map((room) => (
              <div
                key={room.roomId}
                className="bg-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/15 transition-colors"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-yellow-400 font-bold tracking-wider">
                      {room.roomId}
                    </span>
                    <span className="text-white/40 text-xs">
                      por {room.hostName}
                    </span>
                  </div>
                  <div className="flex gap-2 text-[10px] text-white/40">
                    <span>{room.playerCount}/{room.maxPlayers} jogadores</span>
                    {room.config.fdpRule && <span className="text-yellow-400/60">FDP</span>}
                    {room.config.cardOnForeheadRule && <span className="text-yellow-400/60">Testa</span>}
                    {room.config.suitTiebreakerRule && <span className="text-yellow-400/60">Naipe</span>}
                    <span>{room.config.livesPerPlayer}❤️</span>
                  </div>
                </div>
                <button
                  onClick={() => handleJoin(room.roomId)}
                  className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold px-4 py-2 rounded-lg text-sm transition-all"
                >
                  Entrar
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Partidas em andamento */}
      {watchableRooms.length > 0 && (
        <div className="w-full max-w-md">
          <h2 className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2">👁️ Partidas em Andamento</h2>
          <div className="flex flex-col gap-3">
            {watchableRooms.map((room) => (
              <div
                key={room.roomId}
                className="bg-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/15 transition-colors"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-yellow-400 font-bold tracking-wider">
                      {room.roomId}
                    </span>
                    <span className="text-white/40 text-xs">por {room.hostName}</span>
                  </div>
                  <div className="flex gap-2 text-[10px] text-white/40">
                    <span className="text-green-400/70">{phaseLabel[room.phase] ?? room.phase}</span>
                    <span>{room.playerCount} jogadores</span>
                    {room.spectatorCount > 0 && <span>{room.spectatorCount} 👁️</span>}
                    {room.config.fdpRule && <span className="text-yellow-400/60">FDP</span>}
                    <span>{room.config.livesPerPlayer}❤️</span>
                  </div>
                </div>
                <button
                  onClick={() => handleWatch(room.roomId)}
                  disabled={room.spectatorCount >= 10}
                  className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-4 py-2 rounded-lg text-sm transition-all"
                >
                  Assistir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <a
        href="/"
        className="text-white/40 hover:text-white text-sm transition-colors mt-4"
      >
        ← Voltar ao início
      </a>
    </main>
  );
}
