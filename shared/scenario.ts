// Scenario model shared by server and client (MG-004, see docs/specs/SCENARIO_CONTRACT.md).
// Everything here is fictional simulation data: no real hazards, no GPS.

import { isInBounds, roundCoord, type WorldDefinition } from './world.js';

export type ScenarioMode = 'CHALLENGE' | 'LIVE';
export type ScenarioState = 'DRAFT' | 'LOCKED' | 'RUNNING' | 'PAUSED' | 'FINISHED';
export type ObjectKind = 'HAZARD' | 'DECOY';
export type HazardSubtype = 'SURFACE' | 'OBSCURED' | 'BURIED';
export type DecoySubtype = 'ROCK' | 'SCRAP' | 'CONTAINER';
export type ObjectSubtype = HazardSubtype | DecoySubtype;

export const SUBTYPES: Record<ObjectKind, readonly ObjectSubtype[]> = {
  HAZARD: ['SURFACE', 'OBSCURED', 'BURIED'],
  DECOY: ['ROCK', 'SCRAP', 'CONTAINER'],
};

export interface ObjectCategory {
  kind: ObjectKind;
  subtype: ObjectSubtype;
  label: string;
}

export const OBJECT_CATEGORIES: readonly ObjectCategory[] = [
  { kind: 'HAZARD', subtype: 'SURFACE', label: 'Surface-visible virtual hazard' },
  { kind: 'HAZARD', subtype: 'OBSCURED', label: 'Partially obscured virtual hazard' },
  { kind: 'HAZARD', subtype: 'BURIED', label: 'Buried virtual hazard (synthetic)' },
  { kind: 'DECOY', subtype: 'ROCK', label: 'Rock decoy' },
  { kind: 'DECOY', subtype: 'SCRAP', label: 'Scrap decoy' },
  { kind: 'DECOY', subtype: 'CONTAINER', label: 'Container decoy' },
];

export function categoryLabel(kind: ObjectKind, subtype: ObjectSubtype): string {
  return OBJECT_CATEGORIES.find((c) => c.kind === kind && c.subtype === subtype)?.label ?? `${kind}/${subtype}`;
}

/** Demo performance limit on active (non-deleted) objects per room. */
export const MAX_ACTIVE_OBJECTS = 100;

export interface ScenarioObject {
  id: string;
  kind: ObjectKind;
  subtype: ObjectSubtype;
  x: number;
  z: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type AuditAction = 'CREATE' | 'MOVE' | 'UPDATE' | 'DELETE' | 'LOCK' | 'MODE_CHANGE' | 'STATE_CHANGE';

export interface ScenarioAuditEvent {
  id: string;
  objectId: string | null;
  action: AuditAction;
  revision: number;
  serverTime: string;
  missionSimTime: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/** The only room data a defender (or anyone with just the room code) receives. */
export interface PublicRoomSnapshot {
  roomCode: string;
  terrainId: string;
  worldChecksum: string;
  mode: ScenarioMode;
  state: ScenarioState;
  scenarioRevision: number;
}

/** Sent only to clients that proved the private attacker capability. */
export interface AttackerRoomSnapshot extends PublicRoomSnapshot {
  objects: ScenarioObject[];
  history: ScenarioAuditEvent[];
  maxActiveObjects: number;
}

export interface CreateRoomResponse {
  roomCode: string;
  /** Returned exactly once, at creation. Only a hash is stored on the server. */
  attackerToken: string;
  defenderPath: string;
  attackerPath: string;
  snapshot: AttackerRoomSnapshot;
}

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_COORDINATE'
  | 'INVALID_OBJECT_TYPE'
  | 'ROOM_NOT_FOUND'
  | 'OBJECT_NOT_FOUND'
  | 'ATTACKER_AUTH_REQUIRED'
  | 'STATE_LOCKED'
  | 'REVISION_CONFLICT'
  | 'OBJECT_LIMIT';

export interface ApiError {
  error: ErrorCode;
  message: string;
}

export const COORDINATE_ERROR = 'X and Z must be finite numbers between 0 and 200 virtual units.';

const NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/** Number or numeric string -> finite number, else null. Blank, "NaN", "Infinity" and text are rejected. */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && NUMERIC.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Contract rule: reject non-finite or out-of-bounds input BEFORE rounding, then round
 * to 0.1 and re-check. So 200.01 is rejected, never clamped to 200.0.
 */
export function normalizeCoordinate(world: WorldDefinition, rawX: unknown, rawZ: unknown): { x: number; z: number } | null {
  const x = parseNumber(rawX);
  const z = parseNumber(rawZ);
  if (x === null || z === null || !isInBounds(world, x, z)) return null;
  const rx = roundCoord(x);
  const rz = roundCoord(z);
  // roundCoord(-0.04) is -0; normalise so stored values never show "-0".
  const nx = rx === 0 ? 0 : rx;
  const nz = rz === 0 ? 0 : rz;
  return isInBounds(world, nx, nz) ? { x: nx, z: nz } : null;
}

export function isValidCategory(kind: unknown, subtype: unknown): kind is ObjectKind {
  return (kind === 'HAZARD' || kind === 'DECOY') && SUBTYPES[kind].includes(subtype as ObjectSubtype);
}

/** Server-side edit permission matrix from SCENARIO_CONTRACT section 6. */
export function canEditObjects(mode: ScenarioMode, state: ScenarioState): boolean {
  if (state === 'DRAFT') return true;
  if (mode === 'LIVE') return state === 'RUNNING' || state === 'PAUSED';
  return false;
}
