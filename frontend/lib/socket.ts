import { io, Socket } from 'socket.io-client';

const URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

export const socket: Socket = io(URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
  transports: ['websocket', 'polling'],
});

// Mantém uma cópia do socket ID atual para evitar perda de estado
export let currentSocketId: string | null = null;

socket.on('connect', () => {
  console.log('[Socket] Conectado:', socket.id);
  currentSocketId = socket.id ?? null;
});

socket.on('disconnect', (reason) => {
  console.log('[Socket] Desconectado:', reason);
  currentSocketId = null;
});

socket.io.on('reconnect', (attemptNumber) => {
  console.log('[Socket] Reconectado após', attemptNumber, 'tentativas');
  currentSocketId = socket.id ?? null;
});

socket.io.on('reconnect_attempt', (attemptNumber) => {
  console.log('[Socket] Tentando reconectar, tentativa:', attemptNumber);
});

socket.io.on('reconnect_failed', () => {
  console.log('[Socket] Falha ao reconectar');
  currentSocketId = null;
});