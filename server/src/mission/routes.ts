import express, { type Response } from 'express';
import type { RoomStore } from '../rooms/store.js';
import type { MissionEngine, MissionFailure } from './engine.js';

// Mission routes. The room code is the defender's guest credential: it allows
// planning and flying, never reading or editing Red's hidden scenario.

const send = (res: Response, f: MissionFailure) => res.status(f.status).json({ error: f.error, message: f.message });

export function missionRoutes(store: RoomStore, engine: MissionEngine) {
  const router = express.Router({ mergeParams: true });

  router.use((req, res, next) => {
    const room = store.findRoom((req.params as { code?: string }).code);
    if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND', message: 'Room not found.' });
    res.locals.room = room;
    next();
  });

  router.get('/', (_req, res) => {
    res.json(engine.snapshot(res.locals.room));
  });

  router.post('/plan', (req, res) => {
    const r = engine.setPlan(res.locals.room, req.body ?? {});
    if (!r.ok) return send(res, r);
    res.status(201).json({ plan: r.value, snapshot: engine.snapshot(res.locals.room) });
  });

  router.post('/command', (req, res) => {
    const r = engine.command(res.locals.room, req.body ?? {});
    if (!r.ok) return send(res, r);
    res.json({ snapshot: r.value });
  });

  return router;
}
