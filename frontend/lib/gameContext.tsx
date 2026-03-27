'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useGame } from '@/hooks/useGame';

type GameContextType = ReturnType<typeof useGame>;

const GameContext = createContext<GameContextType | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const game = useGame();
  return <GameContext.Provider value={game}>{children}</GameContext.Provider>;
}

export function useGameContext() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGameContext deve ser usado dentro de GameProvider');
  return ctx;
}