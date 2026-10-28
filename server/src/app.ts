import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import {
  APP_VERSION,
  type ClientToServerEvents,
  type HealthResponse,
  type ServerToClientEvents,
} from '../../shared/protocol.js';
import { createWorldDefinition } from '../../shared/world.js';
import { attachRoomRealtime } from './rooms/realtime.js';
import { roomRoutes } from './rooms/routes.js';
import { RoomStore } from './rooms/store.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const clientDist = path.join(rootDir, 'client', 'dist');

export const defaultDbPath = path.join(rootDir, 'data', 'mineguard.sqlite');

export interface ServerOptions {
  /** SQLite file for runtime room state, or ':memory:'. Never committed to Git. */
  dbPath?: string;
}

export function createMineGuardServer(options: ServerOptions = {}) {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
  const startedAt = Date.now();
  const world = createWorldDefinition();
  const store = new RoomStore(options.dbPath ?? process.env.MINEGUARD_DB ?? defaultDbPath, world);
  const rooms = attachRoomRealtime(io, store);

  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'mineguard-server',
      version: APP_VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      serverTime: new Date().toISOString(),
      socketClients: io.engine.clientsCount,
    };
    res.json(body);
  });

  // The single shared terrain. Public: contains no scenario or hazard data.
  app.get('/api/world', (_req, res) => {
    res.json(world);
  });

  app.use('/api/rooms', roomRoutes(store, rooms));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Malformed JSON bodies get a JSON error, not Express's HTML page.
  app.use((err: { type?: string; status?: number }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
      return res.status(err.status ?? 400).json({ error: 'INVALID_REQUEST', message: 'Request body must be valid JSON.' });
    }
    next(err);
  });

  // One origin: when the client has been built, Express serves it so both
  // portals, the API and Socket.IO share the same host and port.
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  io.on('connection', (socket) => {
    socket.emit('server:hello', {
      socketId: socket.id,
      serverTime: new Date().toISOString(),
      version: APP_VERSION,
    });

    socket.on('system:ping', (echo, ack) => {
      if (typeof ack !== 'function') return;
      ack({ pong: true, serverTime: new Date().toISOString(), echo: String(echo).slice(0, 64) });
    });
  });

  httpServer.on('close', () => store.close());

  return { app, httpServer, io, store };
}
