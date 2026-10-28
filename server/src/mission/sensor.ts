import crypto from 'node:crypto';
import type { FlownSubsegment } from '../../../shared/mission.js';
import type { AuditAction, ObjectKind, ObjectSubtype } from '../../../shared/scenario.js';
import {
  COVERAGE_RESOLUTION,
  decide,
  drawFromDigest,
  drawKey,
  firstEntry,
  FOOTPRINT_RADIUS,
  type CoverageEstimate,
  type PublicCandidate,
  type SensorOutcome,
} from '../../../shared/sensor.js';
import type { WorldDefinition } from '../../../shared/world.js';
import type { RoomRecord, RoomStore } from '../rooms/store.js';
import type { ActiveMission } from './engine.js';

// Server-only virtual sensor (DETECTION_ACCEPTANCE.md). Private truth stays in
// this module and SQLite; only PublicCandidate ever leaves for Blue.

/** A placement as it was active over a span of simulated time in one mission. */
export interface ObjectInterval {
  objectId: string;
  kind: ObjectKind;
  subtype: ObjectSubtype;
  x: number;
  z: number;
  revision: number | null;
  /** Sim time from which this placement exists (-Infinity = since before this tick). */
  from: number;
  /** Sim time at which it stopped existing (Infinity = still active). */
  until: number;
}

export interface Encounter {
  objectId: string;
  interval: ObjectInterval;
  simTime: number;
}

/**
 * Pure sweep: the first time each not-yet-decided object enters the footprint
 * along the ordered flown segments, respecting each placement's active span.
 * Results are sorted by entry time (ties by object id) so emission order is
 * deterministic whatever the tick size.
 */
export function sweep(segments: FlownSubsegment[], intervals: ObjectInterval[], decided: Set<string>, radius: number): Encounter[] {
  const found = new Map<string, Encounter>();
  for (const seg of segments) {
    const dt = seg.simTimeEnd - seg.simTimeStart;
    for (const iv of intervals) {
      if (decided.has(iv.objectId) || found.has(iv.objectId)) continue;
      // Clip the segment to the time this placement was active.
      const t0 = Math.max(seg.simTimeStart, iv.from);
      const t1 = Math.min(seg.simTimeEnd, iv.until);
      if (t1 < t0) continue;
      const sMin = dt > 0 ? (t0 - seg.simTimeStart) / dt : 0;
      const sMax = dt > 0 ? (t1 - seg.simTimeStart) / dt : 1;
      const s = firstEntry(seg.from.x, seg.from.z, seg.to.x, seg.to.z, iv.x, iv.z, radius, sMin, sMax);
      if (s !== null) found.set(iv.objectId, { objectId: iv.objectId, interval: iv, simTime: seg.simTimeStart + s * dt });
    }
  }
  return [...found.values()].sort((a, b) => a.simTime - b.simTime || (a.objectId < b.objectId ? -1 : 1));
}

/** Marks the cells of a 200x200 world grid covered by the footprint along each segment. */
export class CoverageGrid {
  readonly size: number;
  readonly cells: Uint8Array;
  covered = 0;

  constructor(world: WorldDefinition, private radius: number) {
    this.size = Math.round((world.xMax - world.xMin) / COVERAGE_RESOLUTION);
    this.cells = new Uint8Array(this.size * this.size);
  }

  add(seg: { from: { x: number; z: number }; to: { x: number; z: number } }) {
    const r = this.radius;
    const res = COVERAGE_RESOLUTION;
    const x0 = Math.max(0, Math.floor((Math.min(seg.from.x, seg.to.x) - r) / res));
    const x1 = Math.min(this.size - 1, Math.floor((Math.max(seg.from.x, seg.to.x) + r) / res));
    const z0 = Math.max(0, Math.floor((Math.min(seg.from.z, seg.to.z) - r) / res));
    const z1 = Math.min(this.size - 1, Math.floor((Math.max(seg.from.z, seg.to.z) + r) / res));
    for (let i = x0; i <= x1; i++) {
      for (let j = z0; j <= z1; j++) {
        const k = i * this.size + j;
        if (this.cells[k]) continue;
        // A cell counts when its centre is inside the swept footprint.
        if (firstEntry(seg.from.x, seg.from.z, seg.to.x, seg.to.z, (i + 0.5) * res, (j + 0.5) * res, r) !== null) {
          this.cells[k] = 1;
          this.covered++;
        }
      }
    }
  }

  estimate(rect: { xMin: number; xMax: number; zMin: number; zMax: number } | null): CoverageEstimate {
    const res = COVERAGE_RESOLUTION;
    let pct: number | null = null;
    if (rect) {
      let inRect = 0;
      let hit = 0;
      for (let i = 0; i < this.size; i++) {
        const cx = (i + 0.5) * res;
        if (cx < rect.xMin || cx > rect.xMax) continue;
        for (let j = 0; j < this.size; j++) {
          const cz = (j + 0.5) * res;
          if (cz < rect.zMin || cz > rect.zMax) continue;
          inRect++;
          hit += this.cells[i * this.size + j];
        }
      }
      pct = inRect > 0 ? Math.round((1000 * hit) / inRect) / 10 : null;
    }
    return { sweptArea: this.covered * res * res, gridCoveragePercent: pct, resolution: res };
  }
}

interface CandidateRow {
  id: string;
  mission_id: string;
  number: number;
  x: number;
  z: number;
  sim_time: number;
  sensor_mode: PublicCandidate['sensorMode'];
  footprint_profile: PublicCandidate['footprintProfile'];
  review: PublicCandidate['review'];
}

const toCandidate = (r: CandidateRow): PublicCandidate => ({
  candidateId: r.id,
  missionId: r.mission_id,
  number: r.number,
  x: r.x,
  z: r.z,
  simTimeSeconds: r.sim_time,
  source: 'SIMULATED',
  sensorMode: r.sensor_mode,
  footprintProfile: r.footprint_profile,
  review: r.review,
});

export interface SensorEvents {
  candidate(room: RoomRecord, candidate: PublicCandidate): void;
}

export class SensorEngine {
  private coverage = new Map<string, CoverageGrid>();
  /**
   * Placements retired or started mid-tick by Live edits, per mission. They
   * only matter for the tick in which the edit happened and are dropped after.
   */
  private retired = new Map<string, ObjectInterval[]>();
  private since = new Map<string, Map<string, number>>();

  constructor(
    private store: RoomStore,
    private world: WorldDefinition,
    private events: SensorEvents,
    private activeMission: (roomId: string) => ActiveMission | null,
  ) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS sensor_decisions (
        mission_id TEXT NOT NULL REFERENCES missions(id),
        object_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        candidate_id TEXT,
        first_sim_time REAL NOT NULL,
        kind TEXT NOT NULL,
        subtype TEXT NOT NULL,
        x REAL NOT NULL,
        z REAL NOT NULL,
        object_revision INTEGER,
        scenario_revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (mission_id, object_id)
      );
      CREATE TABLE IF NOT EXISTS candidates (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL REFERENCES missions(id),
        number INTEGER NOT NULL,
        x REAL NOT NULL,
        z REAL NOT NULL,
        sim_time REAL NOT NULL,
        sensor_mode TEXT NOT NULL,
        footprint_profile TEXT NOT NULL,
        review TEXT NOT NULL DEFAULT 'NEW',
        created_at TEXT NOT NULL,
        UNIQUE (mission_id, number)
      );
    `);
    store.onObjectChange = (room, action, objectId, before, after, simTime) => this.objectChanged(room, action, objectId, before, after, simTime);
  }

  /** Live edits during a mission: remember exactly when old placements ended and new ones began. */
  private objectChanged(room: RoomRecord, action: AuditAction, objectId: string | null, before: unknown, after: unknown, simTime: number | null) {
    const m = this.activeMission(room.id);
    if (!m || !objectId || simTime === null || (m.status !== 'RUNNING' && m.status !== 'PAUSED')) return;
    if (before && (action === 'MOVE' || action === 'UPDATE' || action === 'DELETE')) {
      const b = before as { kind: ObjectKind; subtype: ObjectSubtype; x: number; z: number };
      const list = this.retired.get(m.id) ?? [];
      list.push({ objectId, kind: b.kind, subtype: b.subtype, x: b.x, z: b.z, revision: null, from: this.since.get(m.id)?.get(objectId) ?? -Infinity, until: simTime });
      this.retired.set(m.id, list);
    }
    if (after && (action === 'CREATE' || action === 'MOVE' || action === 'UPDATE')) {
      const map = this.since.get(m.id) ?? new Map<string, number>();
      map.set(objectId, simTime);
      this.since.set(m.id, map);
    }
  }

  private grid(m: ActiveMission): CoverageGrid {
    let g = this.coverage.get(m.id);
    if (!g) {
      // Rebuild from the deterministic flown path (e.g. after a restart).
      g = new CoverageGrid(this.world, FOOTPRINT_RADIUS[m.plan.footprintProfile]);
      const pts = m.plan.waypoints;
      let left = m.distance;
      for (let i = 1; i < pts.length && left > 0; i++) {
        const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        const t = Math.min(1, left / len);
        g.add({ from: pts[i - 1], to: { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t } });
        left -= len;
      }
      this.coverage.set(m.id, g);
    }
    return g;
  }

  coverageFor(m: ActiveMission): CoverageEstimate {
    return this.grid(m).estimate(m.plan.grid);
  }

  candidates(missionId: string): PublicCandidate[] {
    return (this.store.db.prepare('SELECT * FROM candidates WHERE mission_id = ? ORDER BY number').all(missionId) as unknown as CandidateRow[]).map(toCandidate);
  }

  review(missionId: string, candidateId: unknown, review: unknown): PublicCandidate | null {
    if (review !== 'NEW' && review !== 'REVIEWED') return null;
    const res = this.store.db.prepare('UPDATE candidates SET review = ? WHERE id = ? AND mission_id = ?').run(review, String(candidateId), missionId);
    if (res.changes === 0) return null;
    return toCandidate(this.store.db.prepare('SELECT * FROM candidates WHERE id = ?').get(String(candidateId)) as unknown as CandidateRow);
  }

  /** Called by the mission engine with every flown subsegment, in order. */
  process(room: RoomRecord, m: ActiveMission, segments: FlownSubsegment[]) {
    if (segments.length === 0) return;
    const g = this.grid(m);
    for (const s of segments) g.add(s);

    const since = this.since.get(m.id);
    const objects = this.store.activeObjects(room);
    const intervals: ObjectInterval[] = [
      ...objects.map((o) => ({ objectId: o.id, kind: o.kind, subtype: o.subtype, x: o.x, z: o.z, revision: o.revision, from: since?.get(o.id) ?? -Infinity, until: Infinity })),
      ...(this.retired.get(m.id) ?? []),
    ];
    const decided = new Set(
      (this.store.db.prepare('SELECT object_id FROM sensor_decisions WHERE mission_id = ?').all(m.id) as { object_id: string }[]).map((r) => r.object_id),
    );
    const encounters = sweep(segments, intervals, decided, FOOTPRINT_RADIUS[m.plan.footprintProfile]);

    // These edits only affected spans inside this tick.
    const tEnd = segments[segments.length - 1].simTimeEnd;
    this.retired.set(m.id, (this.retired.get(m.id) ?? []).filter((iv) => iv.until > tEnd));
    if (since) for (const [id, t] of since) if (t <= tEnd) since.delete(id);

    for (const e of encounters) {
      const candidate = this.decideAndStore(room, m, e);
      if (candidate) this.events.candidate(room, candidate);
    }
  }

  /** Persist the private decision (and public candidate, if any) atomically, before anything is broadcast. */
  private decideAndStore(room: RoomRecord, m: ActiveMission, e: Encounter): PublicCandidate | null {
    const iv = e.interval;
    const u = drawFromDigest(crypto.createHash('sha256').update(drawKey(m.seed, m.id, iv.objectId), 'utf8').digest());
    const outcome: SensorOutcome = decide(m.plan.sensorMode, iv.kind, iv.subtype, u);
    const now = new Date().toISOString();
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      let candidate: PublicCandidate | null = null;
      if (outcome === 'DETECTED' || outcome === 'FALSE_ALARM') {
        const n = (this.store.db.prepare('SELECT COUNT(*) AS n FROM candidates WHERE mission_id = ?').get(m.id) as { n: number }).n + 1;
        candidate = {
          candidateId: crypto.randomUUID(),
          missionId: m.id,
          number: n,
          x: iv.x,
          z: iv.z,
          simTimeSeconds: e.simTime,
          source: 'SIMULATED',
          sensorMode: m.plan.sensorMode,
          footprintProfile: m.plan.footprintProfile,
          review: 'NEW',
        };
        this.store.db
          .prepare('INSERT INTO candidates (id, mission_id, number, x, z, sim_time, sensor_mode, footprint_profile, review, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(candidate.candidateId, m.id, n, candidate.x, candidate.z, candidate.simTimeSeconds, candidate.sensorMode, candidate.footprintProfile, 'NEW', now);
      }
      this.store.db
        .prepare(
          'INSERT INTO sensor_decisions (mission_id, object_id, outcome, candidate_id, first_sim_time, kind, subtype, x, z, object_revision, scenario_revision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(m.id, iv.objectId, outcome, candidate?.candidateId ?? null, e.simTime, iv.kind, iv.subtype, iv.x, iv.z, iv.revision, room.revision, now);
      this.store.db.exec('COMMIT');
      return candidate;
    } catch (err) {
      this.store.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Private per-object decisions for a mission (for MG-010 results; never sent to Blue before reveal). */
  decisions(missionId: string) {
    return this.store.db.prepare('SELECT * FROM sensor_decisions WHERE mission_id = ? ORDER BY first_sim_time, object_id').all(missionId) as unknown as {
      object_id: string;
      outcome: SensorOutcome;
      candidate_id: string | null;
      first_sim_time: number;
    }[];
  }
}
