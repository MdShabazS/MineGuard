import express, { type Response } from 'express';
import type { RoomRecord, RoomStore } from '../rooms/store.js';
import type { MissionEngine, MissionFailure } from './engine.js';
import type { SensorEngine } from './sensor.js';
import type { ResultsEngine } from './results.js';
import { renderPrintableReport } from './report.js';

// Mission routes. The room code is the defender's guest credential: it allows
// planning and flying, never reading or editing Red's hidden scenario.

const send = (res: Response, f: MissionFailure) => res.status(f.status).json({ error: f.error, message: f.message });

export function missionRoutes(store: RoomStore, engine: MissionEngine, sensor: SensorEngine, results: ResultsEngine, onReview: (room: RoomRecord) => void) {
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

  // Public candidates of the room's latest mission. Never private objects or decisions.
  router.get('/observations', (_req, res) => {
    const m = engine.latestMission(res.locals.room.id);
    res.json({ missionId: m?.id ?? null, candidates: m ? sensor.candidates(m.id) : [] });
  });

  // User review flag only: it never changes private truth or triggers a sensor trial.
  router.patch('/observations/:candidateId/review', (req, res) => {
    const review = req.body?.review;
    if (review !== 'NEW' && review !== 'REVIEWED') return res.status(400).json({ error: 'INVALID_REQUEST', message: 'review must be NEW or REVIEWED.' });
    const m = engine.latestMission(res.locals.room.id);
    const c = m ? sensor.review(m.id, req.params.candidateId, review) : null;
    if (!c) return res.status(404).json({ error: 'CANDIDATE_NOT_FOUND', message: 'No such candidate in this room\'s latest mission.' });
    onReview(res.locals.room);
    res.json({ candidate: c });
  });

  // MG-010: results are never available before explicit post-finish reveal.
  // The room code deliberately permits sharing results only AFTER revelation.
  router.get('/:missionId/reveal-state', (req, res) => {
    const result = results.state(res.locals.room, req.params.missionId);
    res.json(result);
  });

  router.post('/:missionId/reveal', (req, res) => {
    const result = results.reveal(res.locals.room, req.params.missionId);
    if (!result.ok) return res.status(result.status).json({ error: result.error, message: result.message });
    res.json({ result: result.value });
  });

  router.get('/:missionId/results', (req, res) => {
    const result = results.get(res.locals.room, req.params.missionId);
    if (!result.ok) return res.status(result.status).json({ error: result.error, message: result.message });
    res.json({ result: result.value });
  });

  router.get('/:missionId/report', (req, res) => {
    const result = results.get(res.locals.room, req.params.missionId);
    if (!result.ok) return res.status(result.status).json({ error: result.error, message: result.message });
    // Standalone HTML is intentionally NOT mislabelled a direct PDF download.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'");
    res.send(renderPrintableReport(result.value));
  });

  return router;
}
