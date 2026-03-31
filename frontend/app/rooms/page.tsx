"use client";

import { useEffect, useState } from "react";
import { useGameContext } from "@/lib/gameContext";
import { useRouter } from "next/navigation";

export default function RoomsPage() {
  const { publicRooms, fetchRooms, joinRoom, roomId, gameState, error } = useGameContext();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

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

  return (
    <main className="min-h-screen flex flex-col items-center gap-6 p-4 pt-8">
      <div className="text-center">
        <h1 className="text-4xl font-black text-yellow-400">🃏 Salas Públicas</h1>
        <p className="text-white/60 mt-1 text-sm">Encontre uma sala para jogar</p>
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

      <div className="w-full max-w-md flex flex-col gap-3">
        {publicRooms.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-white/30 text-lg">Nenhuma sala pública disponível</p>
            <p className="text-white/20 text-sm mt-1">Crie uma sala ou aguarde</p>
          </div>
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

      <a
        href="http://fodinhamineira.vercel.app/"
        className="text-white/40 hover:text-white text-sm transition-colors mt-4"
      >
        ← Voltar ao início
      </a>
    </main>
  );
}
