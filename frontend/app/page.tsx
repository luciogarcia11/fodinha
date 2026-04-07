'use client';

import { useState, useEffect } from 'react';
import { useGameContext } from '@/lib/gameContext';
import { useRouter } from 'next/navigation';
import Chat from '@/components/Chat';

export default function Home() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none');
  const [nameError, setNameError] = useState('');
  const { createRoom, joinRoom, roomId, gameState, error, clearError, kicked, globalChatMessages, sendGlobalChat } = useGameContext();
  const router = useRouter();

  useEffect(() => {
    if (roomId && gameState) {
      if (gameState.phase === 'lobby') {
        router.push(`/lobby?room=${roomId}`);
      } else {
        router.push(`/game?room=${roomId}`);
      }
    }
  }, [roomId, gameState, router]);

  useEffect(() => {
    clearError();
    setNameError('');
  }, [mode]);

  function handleCreate() {
    if (!name.trim()) {
      setNameError('Nome é obrigatório!');
      return;
    }
    setNameError('');
    createRoom(name.trim());
  }

  function handleJoin() {
    if (!name.trim()) {
      setNameError('Nome é obrigatório!');
      return;
    }
    if (!code.trim()) return;
    setNameError('');
    joinRoom(code, name.trim());
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-4">
      <div className="text-center">
        <h1 className="text-6xl font-black tracking-tight text-yellow-400 drop-shadow-lg">
          🃏 Fodinha
        </h1>
        <p className="text-green-300 mt-2 text-lg">Jogo de cartas multiplayer</p>
      </div>

      {(error || nameError) && (
        <div className="bg-red-600 text-white px-4 py-2 rounded-lg">
          {nameError || error}
        </div>
      )}

      {kicked && (
        <div className="bg-red-600 text-white px-4 py-2 rounded-lg">
          {kicked}
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
          <button
            onClick={() => router.push('/rooms')}
            className="bg-green-600/80 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-xl text-xl transition-all border border-green-500/50"
          >
            Salas Públicas
          </button>
        </div>
      )}

      {/* Chat global na página inicial */}
      {mode === 'none' && globalChatMessages && (
        <div className="fixed right-4 bottom-6 z-40">
          <Chat
            messages={globalChatMessages}
            send={sendGlobalChat}
            global
          />
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
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            className="bg-white/20 text-white placeholder-white/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-yellow-400 text-center"
            maxLength={16}
            autoFocus
          />
          <button
            onClick={handleCreate}
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
            className="bg-white/20 text-white placeholder-white/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-yellow-400 text-center"
            maxLength={16}
            autoFocus
          />
          <input
            type="text"
            placeholder="Código da sala"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            className="bg-white/20 text-white placeholder-white/50 px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-yellow-400 tracking-widest font-mono text-center"
            maxLength={5}
          />
          <button
            onClick={handleJoin}
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