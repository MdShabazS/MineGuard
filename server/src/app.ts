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

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const clientDist = path.join(rootDir, 'client', 'dist');

export function createMineGuardServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
  const startedAt = Date.now();
  const world = createWorldDefinition();

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

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
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

  return { app, httpServer, io };
}
