import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/protocol';

export type MineGuardSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Same origin as the page: Vite proxies in dev, Express serves in production.
export function connectSocket(): MineGuardSocket {
  return io();
}
