import { useEffect, useState } from 'react';
import type { HealthResponse } from '../../../shared/protocol';
import { connectSocket } from './socket';

export interface ServerStatus {
  health: HealthResponse | null;
  healthError: string | null;
  socketConnected: boolean;
  socketId: string | null;
  pingMs: number | null;
}

export function useServerStatus(): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>({
    health: null,
    healthError: null,
    socketConnected: false,
    socketId: null,
    pingMs: null,
  });

  useEffect(() => {
    let cancelled = false;

    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<HealthResponse>;
      })
      .then((health) => !cancelled && setStatus((s) => ({ ...s, health, healthError: null })))
      .catch((err: Error) => !cancelled && setStatus((s) => ({ ...s, healthError: err.message })));

    const socket = connectSocket();
    socket.on('connect', () => {
      setStatus((s) => ({ ...s, socketConnected: true }));
      const sentAt = performance.now();
      socket.emit('system:ping', 'portal', () => {
        setStatus((s) => ({ ...s, pingMs: Math.round(performance.now() - sentAt) }));
      });
    });
    socket.on('server:hello', (hello) => setStatus((s) => ({ ...s, socketId: hello.socketId })));
    socket.on('disconnect', () => setStatus((s) => ({ ...s, socketConnected: false, socketId: null })));

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, []);

  return status;
}
