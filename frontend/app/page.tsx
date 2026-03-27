'use client';

import { useState, useEffect } from 'react';
import { useGameContext } from '@/lib/gameContext';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none');
  const { createRoom, joinRoom, roomId, error, clearError } = useGameContext();
  const router = useRouter();

  useEffect(() => {
    if (roomId) {
      router.push(`/lobby?room=${roomId}`);
    }
  }, [roomId, router]);

  useEffect(() => {
    clearError();
  }, [mode]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-4">
      <div className="text-center">
        <h1 className="text-6xl font-black tracking-tight text-yellow-400 drop-shadow-lg">
          🃏 Fodinha
        </h1>
        <p className="text-green-300 mt-2 text-lg">Jogo de cartas multiplayer</p>
      </div>

      {error && (
        <div className="bg-red-600 text-white px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      {mode === 'none' && (
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button
            onClick={() => setMode('create')}
            className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-4 px-8 rounded-xl text-xl transition-all shadow-lg"
          >
            Criar Sala
          </button>
          <button
            onClick={() => setMode('join')}
            className="bg-white/10 hover:bg-white/20 text-white font-bold py-4 px-8 rounded-xl text-xl transition-all border border-white/20"
          >
            Entrar na Sala
          </button>
        </div>
      )}

      {mode === 'create' && (
        <div className="flex flex-col gap-4 w-full max-w-xs bg-white/10 p-6 rounded-2xl">
          <h2 className="text-xl font-bold text-center">Criar Sala</h2>
          <input
            type="text"
            placeholder="Seu nome"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && name.trim() && createRoom(name.trim())}
            className="bg-white/20 text-white placeholder-white/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-yellow-400"
            maxLength={16}
            autoFocus
          />
          <button
            onClick={() => name.trim() && createRoom(name.trim())}
            className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-3 rounded-lg transition-all"
          >
            Criar
          </button>
          <button onClick={() => setMode('none')} className="text-white/50 text-sm hover:text-white">
            Voltar
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div className="flex flex-col gap-4 w-full max-w-xs bg-white/10 p-6 rounded-2xl">
          <h2 className="text-xl font-bold text-center">Entrar na Sala</h2>
          <input
            type="text"
            placeholder="Seu nome"
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-white/20 text-white placeholder-white/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-yellow-400"
            maxLength={16}
            autoFocus
          />
          <input
            type="text"
            placeholder="Código da sala"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && name.trim() && code.trim() && joinRoom(code, name.trim())}
            className="bg-white/20 text-white placeholder-white/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-yellow-400 tracking-widest font-mono text-center"
            maxLength={5}
          />
          <button
            onClick={() => name.trim() && code.trim() && joinRoom(code, name.trim())}
            className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-3 rounded-lg transition-all"
          >
            Entrar
          </button>
          <button onClick={() => setMode('none')} className="text-white/50 text-sm hover:text-white">
            Voltar
          </button>
        </div>
      )}
    </main>
  );
}