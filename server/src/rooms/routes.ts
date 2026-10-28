import express, { type Request, type Response } from 'express';
import type { CreateRoomResponse } from '../../../shared/scenario.js';
import type { Failure, RoomRecord, RoomStore } from './store.js';

export interface RoomEvents {
  /** Called after every successful mutation so sockets get role-filtered snapshots. */
  changed(room: RoomRecord): void;
}

const send = (res: Response, f: Failure) => {
  const body: Record<string, unknown> = { error: f.error, message: f.message };
  if (f.current) body.current = f.current;
  res.status(f.status).json(body);
};

function bearer(req: Request): string | null {
  const h = req.get('authorization');
  return h && h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

export function roomRoutes(store: RoomStore, events: RoomEvents) {
  const router = express.Router();

  router.post('/', (_req, res) => {
    const { room, attackerToken } = store.createRoom();
    const body: CreateRoomResponse = {
      roomCode: room.code,
      attackerToken,
      defenderPath: `/blue/${room.code}`,
      // Fragment, not query string: browsers never send it to the server, so it stays out of request logs.
      attackerPath: `/red#room=${room.code}&key=${attackerToken}`,
      snapshot: store.attackerSnapshot(room),
    };
    res.status(201).json(body);
  });

  // Public: room metadata only, never objects. Safe for anyone holding the code.
  router.get('/:code/public', (req, res) => {
    const room = store.findRoom(req.params.code);
    if (!room) return send(res, { ok: false, status: 404, error: 'ROOM_NOT_FOUND', message: 'Room not found.' });
    res.json(store.publicSnapshot(room));
  });

  // Everything under /attacker requires the private capability as a Bearer token.
  const attacker = express.Router({ mergeParams: true });
  attacker.use((req: Request<{ code: string }>, res, next) => {
    const room = store.findRoom(req.params.code);
    if (!room) return send(res, { ok: false, status: 404, error: 'ROOM_NOT_FOUND', message: 'Room not found.' });
    if (!store.verifyAttacker(room, bearer(req))) {
      return send(res, { ok: false, status: 401, error: 'ATTACKER_AUTH_REQUIRED', message: 'A valid private attacker link is required.' });
    }
    res.locals.room = room;
    next();
  });

  const finish = (res: Response, result: { ok: true } | Failure, status = 200) => {
    if (!result.ok) return send(res, result);
    const room = res.locals.room as RoomRecord;
    events.changed(room);
    res.status(status).json({ ...('value' in result ? { result: result.value } : {}), snapshot: store.attackerSnapshot(room) });
  };

  attacker.get('/snapshot', (_req, res) => {
    res.json(store.attackerSnapshot(res.locals.room as RoomRecord));
  });

  attacker.post('/objects', (req, res) => {
    finish(res, store.createObject(res.locals.room, req.body ?? {}), 201);
  });

  attacker.patch('/objects/:id', (req, res) => {
    finish(res, store.updateObject(res.locals.room, req.params.id, req.body ?? {}));
  });

  attacker.delete('/objects/:id', (req, res) => {
    const base = req.query.baseRevision === undefined ? undefined : Number(req.query.baseRevision);
    finish(res, store.deleteObject(res.locals.room, req.params.id, base));
  });

  attacker.post('/mode', (req, res) => {
    finish(res, store.setMode(res.locals.room, req.body?.mode));
  });

  attacker.post('/lock', (_req, res) => {
    finish(res, store.lock(res.locals.room));
  });

  router.use('/:code/attacker', attacker);
  return router;
}
