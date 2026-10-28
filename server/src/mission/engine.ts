import crypto from 'node:crypto';
import {
  buildPlan,
  cumulative,
  flownSubsegments,
  poseAt,
  PLAYBACK_SPEEDS,
  type EndReason,
  type FlownSubsegment,
  type MissionErrorCode,
  type MissionPlan,
  type MissionSnapshot,
  type MissionStatus,
  type MissionTelemetry,
  type PlanInput,
  type PlaybackSpeed,
} from '../../../shared/mission.js';
import type { CoverageEstimate, PublicCandidate } from '../../../shared/sensor.js';
import type { WorldDefinition } from '../../../shared/world.js';
import type { RoomRecord, RoomStore } from '../rooms/store.js';

// Server-authoritative mission engine (MISSION_ACCEPTANCE.md sections 4-5).
// One active mission per room. The server clock advances flights; browsers only render.

export type MissionFailure = { ok: false; status: number; error: MissionErrorCode; message: string };
export type MissionResult<T> = { ok: true; value: T } | MissionFailure;

const fail = (status: number, error: MissionErrorCode, message: string): MissionFailure => ({ ok: false, status, error, message });

/** Longest real-time gap one tick will simulate (e.g. after the laptop sleeps). */
const MAX_TICK_SECONDS = 2;

export interface MissionEvents {
  /** Plan, status or config changed: send the full public snapshot. */
  missionChanged(room: RoomRecord, snapshot: MissionSnapshot): void;
  /** Per-tick position update. */
  telemetry(room: RoomRecord, telemetry: MissionTelemetry): void;
  /** Room state changed (RUNNING/PAUSED/FINISHED...): resend role-filtered room snapshots. */
  roomChanged(room: RoomRecord): void;
}

/**
 * Called with every actually-flown subsegment, in chronological order, split at
 * each crossed waypoint. MG-008 attaches the virtual sensor here.
 */
export type SweepHook = (room: RoomRecord, mission: ActiveMission, segments: FlownSubsegment[]) => void;

export interface ActiveMission {
  id: string;
  roomId: string;
  plan: MissionPlan;
  cum: number[];
  status: MissionStatus;
  endReason: EndReason | null;
  simTime: number;
  distance: number;
  speed: PlaybackSpeed;
  sequence: number;
  seed: string;
  pausedByRestart: boolean;
  /** Real-time ms of the last advance; only meaningful while RUNNING. */
  lastTick: number;
}

interface MissionRow {
  id: string;
  room_id: string;
  plan_json: string;
  status: MissionStatus;
  end_reason: EndReason | null;
  sim_time: number;
  distance: number;
  speed: number;
  sequence: number;
  seed: string;
  paused_by_restart: number;
}

export class MissionEngine {
  /** Latest mission per room id (active or finished), cached from SQLite. */
  private latest = new Map<string, ActiveMission>();
  private timer: NodeJS.Timeout | null = null;
  sweepHook: SweepHook = () => {};
  /** Provided by the sensor (MG-008). */
  coverageOf: (m: ActiveMission) => CoverageEstimate | null = () => null;
  candidatesOf: (missionId: string) => PublicCandidate[] = () => [];

  constructor(
    private store: RoomStore,
    private world: WorldDefinition,
    private events: MissionEvents,
    private opts: { tickMs?: number; now?: () => number } = {},
  ) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS mission_plans (
        room_id TEXT PRIMARY KEY REFERENCES rooms(id),
        id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        plan_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id),
        plan_json TEXT NOT NULL,
        status TEXT NOT NULL,
        end_reason TEXT,
        sim_time REAL NOT NULL,
        distance REAL NOT NULL,
        speed INTEGER NOT NULL,
        sequence INTEGER NOT NULL,
        seed TEXT NOT NULL,
        paused_by_restart INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS missions_room ON missions(room_id, created_at);
    `);
    this.recoverAfterRestart();
    store.missionClock = (roomId) => {
      const m = this.latest.get(roomId) ?? this.load(roomId);
      if (!m || (m.status !== 'RUNNING' && m.status !== 'PAUSED')) return null;
      return m.status === 'RUNNING' ? m.simTime + Math.min(MAX_TICK_SECONDS, (this.now() - m.lastTick) / 1000) * m.speed : m.simTime;
    };
  }

  private now() {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  start() {
    if (!this.timer) this.timer = setInterval(() => this.tickAll(), this.opts.tickMs ?? 100);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Fail closed: a mission that was RUNNING when the server died is restored as
   * PAUSED at its last persisted position. No unobserved flight is invented.
   */
  private recoverAfterRestart() {
    const rows = this.store.db.prepare("SELECT * FROM missions WHERE status = 'RUNNING'").all() as unknown as MissionRow[];
    for (const row of rows) {
      const m = this.fromRow(row);
      m.status = 'PAUSED';
      m.pausedByRestart = true;
      m.sequence += 1;
      this.persist(m);
      this.latest.set(m.roomId, m);
      const room = this.store.findRoomById(m.roomId);
      if (room && room.state === 'RUNNING') this.store.setState(room, 'PAUSED', m.simTime);
    }
  }

  private fromRow(row: MissionRow): ActiveMission {
    const plan = JSON.parse(row.plan_json) as MissionPlan;
    return {
      id: row.id,
      roomId: row.room_id,
      plan,
      cum: cumulative(plan.waypoints),
      status: row.status,
      endReason: row.end_reason,
      simTime: row.sim_time,
      distance: row.distance,
      speed: row.speed as PlaybackSpeed,
      sequence: row.sequence,
      seed: row.seed,
      pausedByRestart: row.paused_by_restart === 1,
      lastTick: this.now(),
    };
  }

  private load(roomId: string): ActiveMission | null {
    const row = this.store.db.prepare('SELECT * FROM missions WHERE room_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(roomId) as unknown as MissionRow | undefined;
    if (!row) return null;
    const m = this.fromRow(row);
    this.latest.set(roomId, m);
    return m;
  }

  private latestFor(room: RoomRecord): ActiveMission | null {
    return this.latest.get(room.id) ?? this.load(room.id);
  }

  /** The room's latest mission (any status), for the sensor. */
  latestMission(roomId: string): ActiveMission | null {
    return this.latest.get(roomId) ?? this.load(roomId);
  }

  private persist(m: ActiveMission) {
    this.store.db
      .prepare('UPDATE missions SET status = ?, end_reason = ?, sim_time = ?, distance = ?, speed = ?, sequence = ?, paused_by_restart = ?, updated_at = ? WHERE id = ?')
      .run(m.status, m.endReason, m.simTime, m.distance, m.speed, m.sequence, m.pausedByRestart ? 1 : 0, new Date().toISOString(), m.id);
  }

  plan(room: RoomRecord): MissionPlan | null {
    const row = this.store.db.prepare('SELECT plan_json FROM mission_plans WHERE room_id = ?').get(room.id) as { plan_json: string } | undefined;
    return row ? (JSON.parse(row.plan_json) as MissionPlan) : null;
  }

  private active(room: RoomRecord): ActiveMission | null {
    const m = this.latestFor(room);
    return m && (m.status === 'RUNNING' || m.status === 'PAUSED') ? m : null;
  }

  startBlockedReason(room: RoomRecord, plan: MissionPlan | null): string | null {
    const active = this.active(room);
    if (active) return `A mission is already ${active.status.toLowerCase()} in this room.`;
    if (room.state === 'FINISHED') return 'The last mission has finished. Choose "New mission" to fly again.';
    if (room.mode === 'CHALLENGE' && room.state === 'DRAFT') return 'Challenge mode: Red Team must lock the scenario before the flight can start.';
    if (!plan) return 'Confirm a route plan first.';
    return null;
  }

  telemetry(m: ActiveMission): MissionTelemetry {
    const pose = poseAt(m.plan.waypoints, m.cum, m.distance);
    const completedLegs = m.cum.slice(1).filter((c) => c <= m.distance + 1e-9).length;
    return {
      missionId: m.id,
      planId: m.plan.id,
      status: m.status,
      endReason: m.endReason,
      simTimeSeconds: m.simTime,
      routeDistanceCompleted: m.distance,
      routeLength: m.plan.routeLength,
      completedLegs,
      currentLegIndex: pose.legIndex,
      x: pose.x,
      z: pose.z,
      altitudeAboveGround: m.plan.altitudeAboveGround,
      headingRadians: pose.heading,
      playbackSpeed: m.speed,
      sequence: m.sequence,
      serverTime: new Date().toISOString(),
      pausedByRestart: m.pausedByRestart,
      coverage: this.coverageOf(m),
    };
  }

  snapshot(room: RoomRecord): MissionSnapshot {
    const plan = this.plan(room);
    const m = this.latestFor(room);
    return {
      roomCode: room.code,
      plan,
      mission: m ? { ...this.telemetry(m), plan: m.plan } : null,
      startBlockedReason: this.startBlockedReason(room, plan),
      candidates: m ? this.candidatesOf(m.id) : [],
    };
  }

  setPlan(room: RoomRecord, input: PlanInput): MissionResult<MissionPlan> {
    const active = this.active(room);
    if (active) return fail(409, 'INVALID_MISSION_STATE', `The route cannot change while a mission is ${active.status.toLowerCase()}. Stop it first.`);
    if (room.state === 'FINISHED') return fail(409, 'INVALID_MISSION_STATE', 'The last mission has finished. Choose "New mission" before planning again.');
    const built = buildPlan(this.world, input ?? {});
    if (!built.ok) return fail(400, built.error, built.message);
    const prev = this.plan(room);
    const plan: MissionPlan = { ...built.value, id: crypto.randomUUID(), planRevision: (prev?.planRevision ?? 0) + 1, createdAt: new Date().toISOString() };
    this.store.db
      .prepare('INSERT INTO mission_plans (room_id, id, revision, plan_json) VALUES (?, ?, ?, ?) ON CONFLICT(room_id) DO UPDATE SET id = excluded.id, revision = excluded.revision, plan_json = excluded.plan_json')
      .run(room.id, plan.id, plan.planRevision, JSON.stringify(plan));
    this.events.missionChanged(room, this.snapshot(room));
    return { ok: true, value: plan };
  }

  command(room: RoomRecord, cmd: Record<string, unknown>): MissionResult<MissionSnapshot> {
    const action = cmd?.action;
    if (action === 'START') return this.startMission(room, cmd);

    const m = this.latestFor(room);
    if (!m || typeof cmd.missionId !== 'string' || cmd.missionId !== m.id) return fail(404, 'MISSION_NOT_FOUND', 'No such mission in this room (it may have been replaced). Reload the mission.');

    if (action === 'NEW_MISSION') {
      if (m.status !== 'FINISHED' || room.state !== 'FINISHED') return fail(409, 'INVALID_MISSION_STATE', 'A new mission can only be prepared after the current one has finished.');
      // Back to the pre-flight state for this mode. Challenge stays locked; the previous mission record is kept.
      this.store.setState(room, room.mode === 'CHALLENGE' ? 'LOCKED' : 'DRAFT');
      return this.changed(room);
    }

    if (m.status === 'RUNNING') this.advance(room, m); // bring the clock up to now before any change
    switch (action) {
      case 'PAUSE':
        if (m.status !== 'RUNNING') return fail(409, 'INVALID_MISSION_STATE', `Cannot pause: mission is ${m.status}.`);
        m.status = 'PAUSED';
        this.store.setState(room, 'PAUSED', m.simTime);
        break;
      case 'RESUME':
        if (m.status !== 'PAUSED') return fail(409, 'INVALID_MISSION_STATE', `Cannot resume: mission is ${m.status}.`);
        m.status = 'RUNNING';
        m.pausedByRestart = false;
        m.lastTick = this.now();
        this.store.setState(room, 'RUNNING', m.simTime);
        break;
      case 'STOP':
        if (m.status !== 'RUNNING' && m.status !== 'PAUSED') return fail(409, 'INVALID_MISSION_STATE', `Cannot stop: mission is ${m.status}.`);
        this.finish(room, m, 'STOPPED_EARLY');
        break;
      case 'SET_SPEED': {
        const speed = cmd.playbackSpeed;
        if (!PLAYBACK_SPEEDS.includes(speed as PlaybackSpeed)) return fail(400, 'INVALID_REQUEST', 'playbackSpeed must be 1, 2 or 4.');
        if (m.status !== 'RUNNING' && m.status !== 'PAUSED') return fail(409, 'INVALID_MISSION_STATE', `Cannot change speed: mission is ${m.status}.`);
        m.speed = speed as PlaybackSpeed;
        break;
      }
      default:
        return fail(400, 'INVALID_REQUEST', 'action must be START, PAUSE, RESUME, STOP, SET_SPEED or NEW_MISSION.');
    }
    m.sequence += 1;
    this.persist(m);
    return this.changed(room);
  }

  private startMission(room: RoomRecord, cmd: Record<string, unknown>): MissionResult<MissionSnapshot> {
    const active = this.active(room);
    if (active) return fail(409, 'DUPLICATE_START', `A mission is already ${active.status.toLowerCase()} in this room.`);
    const plan = this.plan(room);
    if (plan && (cmd.planId !== plan.id || cmd.planRevision !== plan.planRevision)) {
      return fail(409, 'REVISION_CONFLICT', 'The route plan changed since you previewed it. Review the current plan and start again.');
    }
    const blocked = this.startBlockedReason(room, plan);
    if (blocked || !plan) return fail(409, 'INVALID_MISSION_STATE', blocked ?? 'Confirm a route plan first.');
    const speed = cmd.playbackSpeed === undefined ? 1 : cmd.playbackSpeed;
    if (!PLAYBACK_SPEEDS.includes(speed as PlaybackSpeed)) return fail(400, 'INVALID_REQUEST', 'playbackSpeed must be 1, 2 or 4.');

    const now = new Date().toISOString();
    const m: ActiveMission = {
      id: crypto.randomUUID(),
      roomId: room.id,
      plan,
      cum: cumulative(plan.waypoints),
      status: 'RUNNING',
      endReason: null,
      simTime: 0,
      distance: 0,
      speed: speed as PlaybackSpeed,
      sequence: 1,
      seed: crypto.randomBytes(16).toString('hex'),
      pausedByRestart: false,
      lastTick: this.now(),
    };
    this.store.db
      .prepare('INSERT INTO missions (id, room_id, plan_json, status, end_reason, sim_time, distance, speed, sequence, seed, paused_by_restart, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, 0, 0, ?, 1, ?, 0, ?, ?)')
      .run(m.id, room.id, JSON.stringify(plan), m.status, m.speed, m.seed, now, now);
    this.latest.set(room.id, m);
    this.store.setState(room, 'RUNNING', 0);
    return this.changed(room);
  }

  private changed(room: RoomRecord): MissionResult<MissionSnapshot> {
    const snap = this.snapshot(room);
    this.events.roomChanged(room);
    this.events.missionChanged(room, snap);
    return { ok: true, value: snap };
  }

  private finish(room: RoomRecord, m: ActiveMission, reason: EndReason) {
    m.status = 'FINISHED';
    m.endReason = reason;
    this.store.setState(room, 'FINISHED', m.simTime);
  }

  /** Advance one RUNNING mission to the current real time. */
  private advance(room: RoomRecord, m: ActiveMission) {
    const now = this.now();
    const realDelta = Math.min(MAX_TICK_SECONDS, Math.max(0, (now - m.lastTick) / 1000));
    m.lastTick = now;
    if (realDelta === 0) return;
    const t0 = m.simTime;
    const d0 = m.distance;
    const total = m.plan.routeLength;
    let t1 = t0 + realDelta * m.speed;
    let d1 = d0 + m.plan.baseSpeed * realDelta * m.speed;
    if (d1 >= total - 1e-9) {
      // Arrive exactly at the final waypoint at the exact sim time; never overshoot.
      d1 = total;
      t1 = t0 + (total - d0) / m.plan.baseSpeed;
    }
    const segments = flownSubsegments(m.plan.waypoints, m.cum, d0, d1, t0, t1);
    m.simTime = t1;
    m.distance = d1;
    m.sequence += 1;
    this.sweepHook(room, m, segments);
    if (d1 >= total) this.finish(room, m, 'ROUTE_COMPLETED');
  }

  /** One engine tick for every running mission. Public for deterministic tests. */
  tickAll() {
    for (const m of this.latest.values()) {
      if (m.status !== 'RUNNING') continue;
      const room = this.store.findRoomById(m.roomId);
      if (!room) continue;
      this.advance(room, m);
      this.persist(m);
      // advance() may have finished the mission; re-read the status (TS narrowed it to RUNNING).
      if ((m.status as MissionStatus) === 'FINISHED') this.changed(room);
      else this.events.telemetry(room, this.telemetry(m));
    }
  }
}
