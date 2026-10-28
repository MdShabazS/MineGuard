// Mission planning and flight geometry shared by server and client
// (MISSION_ACCEPTANCE.md). Routes are fictional virtual X/Z paths, not GPS.

import { normalizeCoordinate, parseNumber } from './scenario.js';
import { isFootprintProfile, isSensorMode, maxGapFreeSpacing, type CoverageEstimate, type FootprintProfile, type PublicCandidate, type SensorMode } from './sensor.js';
import { roundCoord, type WorldDefinition } from './world.js';

export type RouteKind = 'MANUAL' | 'GRID';
export type GridOrientation = 'ALONG_X' | 'ALONG_Z';
export type PlaybackSpeed = 1 | 2 | 4;
export type MissionStatus = 'READY' | 'RUNNING' | 'PAUSED' | 'FINISHED';
export type EndReason = 'ROUTE_COMPLETED' | 'STOPPED_EARLY';
export type CameraMode = 'OVERVIEW' | 'FOLLOW' | 'TOP_DOWN';

export interface MissionPoint {
  x: number;
  z: number;
}

export interface GridSpec {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  /** Requested maximum lane spacing (virtual units). */
  laneSpacing: number;
  /** Actual spacing used so both outer edges are flown (<= requested). */
  actualSpacing: number;
  laneCount: number;
  orientation: GridOrientation;
}

/** Simulation constants, shown in the UI. Fictional units; not a real aircraft. */
export const ALTITUDE_ABOVE_GROUND = 12;
export const BASE_SPEED = 8; // virtual units per simulation second at 1x
export const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = [1, 2, 4];
export const MAX_MANUAL_WAYPOINTS = 50;
export const MAX_GRID_LANES = 60;
export const MIN_LANE_SPACING = 2;

export interface MissionPlan {
  id: string;
  planRevision: number;
  routeKind: RouteKind;
  waypoints: MissionPoint[];
  grid: GridSpec | null;
  sensorMode: SensorMode;
  footprintProfile: FootprintProfile;
  altitudeAboveGround: number;
  baseSpeed: number;
  routeLength: number;
  /** True when grid lane spacing exceeds the gap-free spacing for the chosen footprint. */
  potentialGaps: boolean;
  createdAt: string;
}

export interface MissionTelemetry {
  missionId: string;
  planId: string;
  status: MissionStatus;
  endReason: EndReason | null;
  simTimeSeconds: number;
  routeDistanceCompleted: number;
  routeLength: number;
  completedLegs: number;
  currentLegIndex: number;
  x: number;
  z: number;
  altitudeAboveGround: number;
  headingRadians: number;
  playbackSpeed: PlaybackSpeed;
  /** Monotonic per mission; clients drop anything older than what they have. */
  sequence: number;
  serverTime: string;
  /** True if the server restarted mid-flight and paused the mission instead of catching up. */
  pausedByRestart: boolean;
  /** Estimated virtual coverage of the actually flown path (MG-008). */
  coverage: CoverageEstimate | null;
}

/** Everything a joined participant may see about the mission. No scenario objects, ever. */
export interface MissionSnapshot {
  roomCode: string;
  plan: MissionPlan | null;
  /** The live or most recent mission; null before the first Start. */
  mission: (MissionTelemetry & { plan: MissionPlan }) | null;
  /** Why START is not allowed right now, or null if it is. */
  startBlockedReason: string | null;
  /** Simulated candidates emitted so far by the latest mission (public fields only). */
  candidates: PublicCandidate[];
}

export type MissionCommand =
  | { action: 'START'; planId: string; planRevision: number; playbackSpeed?: PlaybackSpeed }
  | { action: 'PAUSE'; missionId: string }
  | { action: 'RESUME'; missionId: string }
  | { action: 'STOP'; missionId: string }
  | { action: 'SET_SPEED'; missionId: string; playbackSpeed: PlaybackSpeed }
  | { action: 'NEW_MISSION'; missionId: string };

export type MissionErrorCode =
  | 'INVALID_ROUTE'
  | 'INVALID_MISSION_STATE'
  | 'MISSION_NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'DUPLICATE_START'
  | 'ROOM_NOT_FOUND'
  | 'INVALID_REQUEST';

export interface PlanInput {
  routeKind?: unknown;
  waypoints?: unknown;
  grid?: unknown;
  sensorMode?: unknown;
  footprintProfile?: unknown;
}

export type PlanResult =
  | { ok: true; value: Omit<MissionPlan, 'id' | 'planRevision' | 'createdAt'> }
  | { ok: false; error: MissionErrorCode; message: string };

const routeError = (message: string): PlanResult => ({ ok: false, error: 'INVALID_ROUTE', message });

export function routeLength(points: MissionPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return total;
}

export function validateManual(world: WorldDefinition, raw: unknown): { ok: true; points: MissionPoint[] } | { ok: false; message: string } {
  if (!Array.isArray(raw)) return { ok: false, message: 'waypoints must be a list of {x, z} points.' };
  if (raw.length > MAX_MANUAL_WAYPOINTS) return { ok: false, message: `A manual route can have at most ${MAX_MANUAL_WAYPOINTS} waypoints.` };
  const points: MissionPoint[] = [];
  for (const [i, p] of raw.entries()) {
    const pos = p && typeof p === 'object' ? normalizeCoordinate(world, (p as MissionPoint).x, (p as MissionPoint).z) : null;
    if (!pos) return { ok: false, message: `Waypoint ${i + 1}: X and Z must be finite numbers between 0 and 200 virtual units.` };
    const prev = points[points.length - 1];
    if (prev && prev.x === pos.x && prev.z === pos.z) {
      return { ok: false, message: `Waypoint ${i + 1} is the same point as waypoint ${i} (zero-length leg). Remove or move it.` };
    }
    points.push(pos);
  }
  if (points.length < 2) return { ok: false, message: 'A manual route needs at least two different waypoints.' };
  return { ok: true, points };
}

/**
 * Serpentine (lawnmower) survey of a rectangle. Lanes run along the chosen axis,
 * alternating direction, and the first and last lanes sit exactly on the
 * rectangle edges. Spacing is reduced (never increased) so lanes divide the
 * cross dimension evenly. Deterministic for identical input.
 */
export function generateGrid(
  world: WorldDefinition,
  raw: unknown,
  profile: FootprintProfile,
): { ok: true; points: MissionPoint[]; grid: GridSpec; potentialGaps: boolean } | { ok: false; message: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'grid must be {x1, z1, x2, z2, laneSpacing, orientation}.' };
  const g = raw as Record<string, unknown>;
  const a = normalizeCoordinate(world, g.x1, g.z1);
  const b = normalizeCoordinate(world, g.x2, g.z2);
  if (!a || !b) return { ok: false, message: 'Grid corners: X and Z must be finite numbers between 0 and 200 virtual units.' };
  const xMin = Math.min(a.x, b.x);
  const xMax = Math.max(a.x, b.x);
  const zMin = Math.min(a.z, b.z);
  const zMax = Math.max(a.z, b.z);
  if (xMax - xMin <= 0 || zMax - zMin <= 0) return { ok: false, message: 'The survey rectangle must have positive width and height.' };

  let orientation: GridOrientation;
  if (g.orientation === 'ALONG_X' || g.orientation === 'ALONG_Z') orientation = g.orientation;
  else if (g.orientation === undefined || g.orientation === 'AUTO') orientation = xMax - xMin >= zMax - zMin ? 'ALONG_X' : 'ALONG_Z';
  else return { ok: false, message: 'orientation must be ALONG_X, ALONG_Z or AUTO.' };

  const cross = orientation === 'ALONG_X' ? zMax - zMin : xMax - xMin;
  const spacing = parseNumber(g.laneSpacing);
  if (spacing === null || spacing < MIN_LANE_SPACING) return { ok: false, message: `Lane spacing must be a number of at least ${MIN_LANE_SPACING} virtual units.` };
  if (spacing > cross) return { ok: false, message: `Lane spacing (${spacing}) cannot exceed the rectangle's cross-lane size (${roundCoord(cross)}).` };
  const laneCount = Math.ceil(cross / spacing - 1e-9) + 1;
  if (laneCount > MAX_GRID_LANES) return { ok: false, message: `That spacing needs ${laneCount} lanes; the limit is ${MAX_GRID_LANES}. Use wider spacing or a smaller rectangle.` };
  const actualSpacing = cross / (laneCount - 1);

  const points: MissionPoint[] = [];
  for (let i = 0; i < laneCount; i++) {
    // Exact edges for the first and last lane; rounded interior lanes.
    const c = i === laneCount - 1 ? (orientation === 'ALONG_X' ? zMax : xMax) : roundCoord((orientation === 'ALONG_X' ? zMin : xMin) + i * actualSpacing);
    const [s, e] = orientation === 'ALONG_X' ? [xMin, xMax] : [zMin, zMax];
    const [from, to] = i % 2 === 0 ? [s, e] : [e, s];
    if (orientation === 'ALONG_X') points.push({ x: from, z: c }, { x: to, z: c });
    else points.push({ x: c, z: from }, { x: c, z: to });
  }
  const grid: GridSpec = { xMin, xMax, zMin, zMax, laneSpacing: spacing, actualSpacing: roundCoord(actualSpacing * 100) / 100, laneCount, orientation };
  return { ok: true, points, grid, potentialGaps: actualSpacing > maxGapFreeSpacing(profile) + 1e-9 };
}

export function buildPlan(world: WorldDefinition, input: PlanInput): PlanResult {
  const sensorMode = input.sensorMode ?? 'BASIC';
  const footprintProfile = input.footprintProfile ?? 'STANDARD';
  if (!isSensorMode(sensorMode)) return { ok: false, error: 'INVALID_REQUEST', message: 'sensorMode must be BASIC or ADVANCED.' };
  if (!isFootprintProfile(footprintProfile)) return { ok: false, error: 'INVALID_REQUEST', message: 'footprintProfile must be NARROW, STANDARD or WIDE.' };

  let waypoints: MissionPoint[];
  let grid: GridSpec | null = null;
  let potentialGaps = false;
  if (input.routeKind === 'MANUAL') {
    const r = validateManual(world, input.waypoints);
    if (!r.ok) return routeError(r.message);
    waypoints = r.points;
  } else if (input.routeKind === 'GRID') {
    const r = generateGrid(world, input.grid, footprintProfile);
    if (!r.ok) return routeError(r.message);
    waypoints = r.points;
    grid = r.grid;
    potentialGaps = r.potentialGaps;
  } else {
    return routeError('routeKind must be MANUAL or GRID.');
  }
  return {
    ok: true,
    value: {
      routeKind: input.routeKind,
      waypoints,
      grid,
      sensorMode,
      footprintProfile,
      altitudeAboveGround: ALTITUDE_ABOVE_GROUND,
      baseSpeed: BASE_SPEED,
      routeLength: routeLength(waypoints),
      potentialGaps,
    },
  };
}

/** Cumulative distance at each waypoint. */
export function cumulative(points: MissionPoint[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  return out;
}

export interface RoutePose {
  x: number;
  z: number;
  /** Index of the leg being flown (0-based; leg i goes waypoint i -> i+1). */
  legIndex: number;
  /** Heading in radians, atan2(dx, dz): 0 = +Z, PI/2 = +X. */
  heading: number;
}

export function poseAt(points: MissionPoint[], cum: number[], distance: number): RoutePose {
  const total = cum[cum.length - 1];
  const d = Math.max(0, Math.min(total, distance));
  let leg = 0;
  while (leg < points.length - 2 && cum[leg + 1] <= d) leg++;
  const a = points[leg];
  const b = points[leg + 1];
  const len = cum[leg + 1] - cum[leg];
  const t = len > 0 ? (d - cum[leg]) / len : 0;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, legIndex: leg, heading: Math.atan2(b.x - a.x, b.z - a.z) };
}

/** A straight piece of actually-flown path within one leg. MG-008 sweeps the sensor along these. */
export interface FlownSubsegment {
  legIndex: number;
  from: MissionPoint;
  to: MissionPoint;
  distanceStart: number;
  distanceEnd: number;
  simTimeStart: number;
  simTimeEnd: number;
}

/**
 * Splits the travel from distance d0 to d1 (sim times t0..t1) at every waypoint
 * crossed, in order, so a 4x tick that passes several turns never shortcuts a corner.
 */
export function flownSubsegments(points: MissionPoint[], cum: number[], d0: number, d1: number, t0: number, t1: number): FlownSubsegment[] {
  const out: FlownSubsegment[] = [];
  if (d1 <= d0) return out;
  const timeAt = (d: number) => t0 + ((t1 - t0) * (d - d0)) / (d1 - d0);
  let start = d0;
  for (let leg = 0; leg < points.length - 1 && start < d1; leg++) {
    if (cum[leg + 1] <= start) continue;
    const end = Math.min(d1, cum[leg + 1]);
    const a = poseAt(points, cum, start);
    const b = poseAt(points, cum, end);
    out.push({ legIndex: leg, from: { x: a.x, z: a.z }, to: { x: b.x, z: b.z }, distanceStart: start, distanceEnd: end, simTimeStart: timeAt(start), simTimeEnd: timeAt(end) });
    start = end;
  }
  return out;
}
