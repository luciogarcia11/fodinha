import { io, Socket } from 'socket.io-client';

const URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

export const socket: Socket = io(URL, {
  autoConnect: false,
  // Reconexão automática habilitada com configurações sensatas
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});