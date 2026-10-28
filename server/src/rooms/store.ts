import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  MAX_ACTIVE_OBJECTS,
  canEditObjects,
  isValidCategory,
  normalizeCoordinate,
  COORDINATE_ERROR,
  type AttackerRoomSnapshot,
  type AuditAction,
  type ErrorCode,
  type ObjectKind,
  type ObjectSubtype,
  type PublicRoomSnapshot,
  type ScenarioAuditEvent,
  type ScenarioMode,
  type ScenarioObject,
  type ScenarioState,
} from '../../../shared/scenario.js';
import type { WorldDefinition } from '../../../shared/world.js';

// Runtime room state lives in SQLite on the host laptop (data/ is gitignored).
// Only a SHA-256 hash of each attacker token is stored.

export interface RoomRecord {
  id: string;
  code: string;
  mode: ScenarioMode;
  state: ScenarioState;
  revision: number;
}

export type Failure = { ok: false; status: number; error: ErrorCode; message: string; current?: ScenarioObject };
export type Result<T> = { ok: true; value: T } | Failure;

const fail = (status: number, error: ErrorCode, message: string, extra: Partial<Failure> = {}): Failure => ({
  ok: false,
  status,
  error,
  message,
  ...extra,
});

// No 0/O/1/I/L so codes are easy to read aloud and type on a phone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const HISTORY_LIMIT = 50;

const hashToken = (token: string) => crypto.createHash('sha256').update(token, 'utf8').digest();

interface ObjectRow {
  id: string;
  kind: ObjectKind;
  subtype: ObjectSubtype;
  x: number;
  z: number;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const toObject = (r: ObjectRow): ScenarioObject => ({
  id: r.id,
  kind: r.kind,
  subtype: r.subtype,
  x: r.x,
  z: r.z,
  revision: r.revision,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const pickFields = (o: ScenarioObject) => ({ kind: o.kind, subtype: o.subtype, x: o.x, z: o.z });

export class RoomStore {
  private db: DatabaseSync;

  constructor(
    dbPath: string,
    private world: WorldDefinition,
  ) {
    if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        attacker_token_hash BLOB NOT NULL,
        mode TEXT NOT NULL,
        state TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS objects (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id),
        kind TEXT NOT NULL,
        subtype TEXT NOT NULL,
        x REAL NOT NULL,
        z REAL NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS objects_room ON objects(room_id);
      CREATE TABLE IF NOT EXISTS audit (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id),
        revision INTEGER NOT NULL,
        object_id TEXT,
        action TEXT NOT NULL,
        server_time TEXT NOT NULL,
        mission_sim_time REAL,
        before_json TEXT,
        after_json TEXT
      );
      CREATE INDEX IF NOT EXISTS audit_room ON audit(room_id, revision);
    `);
  }

  /** Idempotent: the HTTP server can emit 'close' more than once during shutdown. */
  close() {
    if (this.db.isOpen) this.db.close();
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!this.db.prepare('SELECT 1 FROM rooms WHERE code = ?').get(code)) return code;
    }
  }

  createRoom(): { room: RoomRecord; attackerToken: string } {
    const now = new Date().toISOString();
    const room: RoomRecord = { id: crypto.randomUUID(), code: this.newCode(), mode: 'CHALLENGE', state: 'DRAFT', revision: 0 };
    const attackerToken = crypto.randomBytes(32).toString('base64url');
    this.db
      .prepare('INSERT INTO rooms (id, code, attacker_token_hash, mode, state, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(room.id, room.code, hashToken(attackerToken), room.mode, room.state, room.revision, now, now);
    return { room, attackerToken };
  }

  findRoom(code: unknown): RoomRecord | null {
    if (typeof code !== 'string') return null;
    const row = this.db.prepare('SELECT id, code, mode, state, revision FROM rooms WHERE code = ?').get(code.trim().toUpperCase());
    return (row as unknown as RoomRecord | undefined) ?? null;
  }

  verifyAttacker(room: RoomRecord, token: unknown): boolean {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return false;
    const row = this.db.prepare('SELECT attacker_token_hash AS h FROM rooms WHERE id = ?').get(room.id) as { h: Uint8Array } | undefined;
    if (!row) return false;
    return crypto.timingSafeEqual(Buffer.from(row.h), hashToken(token));
  }

  publicSnapshot(room: RoomRecord): PublicRoomSnapshot {
    return {
      roomCode: room.code,
      terrainId: this.world.terrainId,
      worldChecksum: this.world.checksum,
      mode: room.mode,
      state: room.state,
      scenarioRevision: room.revision,
    };
  }

  attackerSnapshot(room: RoomRecord): AttackerRoomSnapshot {
    const objects = (
      this.db
        .prepare('SELECT * FROM objects WHERE room_id = ? AND deleted_at IS NULL ORDER BY created_at, id')
        .all(room.id) as unknown as ObjectRow[]
    ).map(toObject);
    const history = (
      this.db
        .prepare('SELECT * FROM audit WHERE room_id = ? ORDER BY revision DESC LIMIT ?')
        .all(room.id, HISTORY_LIMIT) as unknown as Record<string, unknown>[]
    ).map(
      (a): ScenarioAuditEvent => ({
        id: a.id as string,
        objectId: (a.object_id as string | null) ?? null,
        action: a.action as AuditAction,
        revision: a.revision as number,
        serverTime: a.server_time as string,
        missionSimTime: (a.mission_sim_time as number | null) ?? null,
        before: a.before_json ? JSON.parse(a.before_json as string) : null,
        after: a.after_json ? JSON.parse(a.after_json as string) : null,
      }),
    );
    return { ...this.publicSnapshot(room), objects, history, maxActiveObjects: MAX_ACTIVE_OBJECTS };
  }

  /** Bump the room revision and append one audit record. Call inside a transaction. */
  private record(room: RoomRecord, action: AuditAction, objectId: string | null, before: unknown, after: unknown, now: string, missionSimTime: number | null = null) {
    room.revision += 1;
    this.db.prepare('UPDATE rooms SET revision = ?, mode = ?, state = ?, updated_at = ? WHERE id = ?').run(room.revision, room.mode, room.state, now, room.id);
    this.db
      .prepare('INSERT INTO audit (id, room_id, revision, object_id, action, server_time, mission_sim_time, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), room.id, room.revision, objectId, action, now, missionSimTime, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null);
  }

  private editableCheck(room: RoomRecord): Failure | null {
    if (canEditObjects(room.mode, room.state)) return null;
    return fail(409, 'STATE_LOCKED', `Scenario is ${room.state} in ${room.mode} mode; objects cannot be changed.`);
  }

  private activeObject(room: RoomRecord, id: unknown): ScenarioObject | null {
    if (typeof id !== 'string') return null;
    const row = this.db.prepare('SELECT * FROM objects WHERE id = ? AND room_id = ? AND deleted_at IS NULL').get(id, room.id);
    return row ? toObject(row as unknown as ObjectRow) : null;
  }

  createObject(room: RoomRecord, input: { kind?: unknown; subtype?: unknown; x?: unknown; z?: unknown }): Result<ScenarioObject> {
    const locked = this.editableCheck(room);
    if (locked) return locked;
    if (!isValidCategory(input.kind, input.subtype)) return fail(400, 'INVALID_OBJECT_TYPE', 'Unsupported object kind/subtype combination.');
    const pos = normalizeCoordinate(this.world, input.x, input.z);
    if (!pos) return fail(400, 'INVALID_COORDINATE', COORDINATE_ERROR);
    const count = (this.db.prepare('SELECT COUNT(*) AS n FROM objects WHERE room_id = ? AND deleted_at IS NULL').get(room.id) as { n: number }).n;
    if (count >= MAX_ACTIVE_OBJECTS) return fail(409, 'OBJECT_LIMIT', `A room can hold at most ${MAX_ACTIVE_OBJECTS} active objects.`);

    return this.transaction(() => {
      const now = new Date().toISOString();
      const obj: ScenarioObject = {
        id: crypto.randomUUID(),
        kind: input.kind as ObjectKind,
        subtype: input.subtype as ObjectSubtype,
        x: pos.x,
        z: pos.z,
        revision: room.revision + 1,
        createdAt: now,
        updatedAt: now,
      };
      this.db
        .prepare('INSERT INTO objects (id, room_id, kind, subtype, x, z, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(obj.id, room.id, obj.kind, obj.subtype, obj.x, obj.z, obj.revision, now, now);
      this.record(room, 'CREATE', obj.id, null, pickFields(obj), now);
      return { ok: true as const, value: obj };
    });
  }

  updateObject(
    room: RoomRecord,
    id: unknown,
    input: { baseRevision?: unknown; kind?: unknown; subtype?: unknown; x?: unknown; z?: unknown },
  ): Result<ScenarioObject> {
    const locked = this.editableCheck(room);
    if (locked) return locked;
    const current = this.activeObject(room, id);
    if (!current) return fail(404, 'OBJECT_NOT_FOUND', 'Object not found (it may have been deleted).');
    if (typeof input.baseRevision !== 'number') return fail(400, 'INVALID_REQUEST', 'baseRevision (the object revision being edited) is required.');
    if (input.baseRevision !== current.revision) {
      return fail(409, 'REVISION_CONFLICT', 'This object was changed by another session. Reload it and try again.', { current });
    }

    const typeGiven = input.kind !== undefined || input.subtype !== undefined;
    const kind = (input.kind ?? current.kind) as unknown;
    const subtype = (input.subtype ?? current.subtype) as unknown;
    if (!isValidCategory(kind, subtype)) return fail(400, 'INVALID_OBJECT_TYPE', 'Unsupported object kind/subtype combination.');

    const coordGiven = input.x !== undefined || input.z !== undefined;
    const pos = coordGiven ? normalizeCoordinate(this.world, input.x ?? current.x, input.z ?? current.z) : { x: current.x, z: current.z };
    if (!pos) return fail(400, 'INVALID_COORDINATE', COORDINATE_ERROR);
    if (!typeGiven && !coordGiven) return fail(400, 'INVALID_REQUEST', 'Nothing to update.');

    const typeChanged = kind !== current.kind || subtype !== current.subtype;
    const moved = pos.x !== current.x || pos.z !== current.z;
    if (!typeChanged && !moved) return { ok: true, value: current };

    return this.transaction(() => {
      const now = new Date().toISOString();
      const next: ScenarioObject = {
        ...current,
        kind: kind as ObjectKind,
        subtype: subtype as ObjectSubtype,
        x: pos.x,
        z: pos.z,
        revision: room.revision + 1,
        updatedAt: now,
      };
      this.db
        .prepare('UPDATE objects SET kind = ?, subtype = ?, x = ?, z = ?, revision = ?, updated_at = ? WHERE id = ?')
        .run(next.kind, next.subtype, next.x, next.z, next.revision, now, next.id);
      this.record(room, typeChanged ? 'UPDATE' : 'MOVE', next.id, pickFields(current), pickFields(next), now);
      return { ok: true as const, value: next };
    });
  }

  deleteObject(room: RoomRecord, id: unknown, baseRevision?: unknown): Result<{ id: string }> {
    const locked = this.editableCheck(room);
    if (locked) return locked;
    const current = this.activeObject(room, id);
    if (!current) return fail(404, 'OBJECT_NOT_FOUND', 'Object not found (it may have been deleted).');
    if (baseRevision !== undefined && baseRevision !== current.revision) {
      return fail(409, 'REVISION_CONFLICT', 'This object was changed by another session. Reload it and try again.', { current });
    }
    return this.transaction(() => {
      const now = new Date().toISOString();
      this.db.prepare('UPDATE objects SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, current.id);
      this.record(room, 'DELETE', current.id, pickFields(current), null, now);
      return { ok: true as const, value: { id: current.id } };
    });
  }

  setMode(room: RoomRecord, mode: unknown): Result<RoomRecord> {
    if (mode !== 'CHALLENGE' && mode !== 'LIVE') return fail(400, 'INVALID_REQUEST', 'mode must be CHALLENGE or LIVE.');
    if (room.state !== 'DRAFT') return fail(409, 'STATE_LOCKED', 'Mode can only be changed while the scenario is DRAFT.');
    if (mode === room.mode) return { ok: true, value: room };
    return this.transaction(() => {
      const before = { mode: room.mode };
      room.mode = mode;
      this.record(room, 'MODE_CHANGE', null, before, { mode }, new Date().toISOString());
      return { ok: true as const, value: room };
    });
  }

  lock(room: RoomRecord): Result<RoomRecord> {
    if (room.mode !== 'CHALLENGE') return fail(400, 'INVALID_REQUEST', 'Lock applies to Challenge mode only.');
    if (room.state !== 'DRAFT') return fail(409, 'STATE_LOCKED', `Scenario is already ${room.state}.`);
    return this.transaction(() => {
      room.state = 'LOCKED';
      this.record(room, 'LOCK', null, { state: 'DRAFT' }, { state: 'LOCKED' }, new Date().toISOString());
      return { ok: true as const, value: room };
    });
  }

  /**
   * Mission state transitions. Not exposed over HTTP/Socket in MG-004: the
   * mission engine (MG-007) will call this. Used now by tests to verify the
   * Live/Challenge edit matrix and audit groundwork.
   */
  setState(room: RoomRecord, state: ScenarioState, missionSimTime: number | null = null): RoomRecord {
    return this.transaction(() => {
      const before = { state: room.state };
      room.state = state;
      this.record(room, 'STATE_CHANGE', null, before, { state }, new Date().toISOString(), missionSimTime);
      return room;
    });
  }
}
