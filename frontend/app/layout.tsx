import type { Metadata } from 'next';
import './globals.css';
import { GameProvider } from '@/lib/gameContext';

export const metadata: Metadata = {
  title: 'Fodinha',
  description: 'Jogo de cartas multiplayer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <GameProvider>
          {children}
        </GameProvider>
      </body>
    </html>
  );
}