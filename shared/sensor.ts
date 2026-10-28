// The single source of truth for simulated sensor settings (DETECTION_ACCEPTANCE.md section 3).
// Fictional plan-view radii in virtual units; not real camera/thermal/LiDAR capability.

export type SensorMode = 'BASIC' | 'ADVANCED';
export type FootprintProfile = 'NARROW' | 'STANDARD' | 'WIDE';

export const SENSOR_MODES: readonly SensorMode[] = ['BASIC', 'ADVANCED'];
export const FOOTPRINT_PROFILES: readonly FootprintProfile[] = ['NARROW', 'STANDARD', 'WIDE'];

/** Footprint radius r per profile. Server sensing, UI and 3D overlay must all read this. */
export const FOOTPRINT_RADIUS: Record<FootprintProfile, number> = {
  NARROW: 6,
  STANDARD: 10,
  WIDE: 16,
};

export const DEFAULT_SENSOR_MODE: SensorMode = 'BASIC';
export const DEFAULT_FOOTPRINT: FootprintProfile = 'STANDARD';
export const SENSOR_ALGORITHM_VERSION = 'sim-v1';

/** Lane spacing at or below 2r leaves no gap between ideal adjacent centrelines. */
export function maxGapFreeSpacing(profile: FootprintProfile): number {
  return 2 * FOOTPRINT_RADIUS[profile];
}

export const isSensorMode = (v: unknown): v is SensorMode => SENSOR_MODES.includes(v as SensorMode);
export const isFootprintProfile = (v: unknown): v is FootprintProfile => FOOTPRINT_PROFILES.includes(v as FootprintProfile);

/**
 * Advanced-mode candidate emission thresholds per subtype (DETECTION_ACCEPTANCE 3.2).
 * Project design constants for a synthetic simulator, not measured detector accuracy.
 */
export const ADVANCED_THRESHOLD = {
  SURFACE: 0.9,
  OBSCURED: 0.7,
  BURIED: 0.5,
  ROCK: 0.2,
  SCRAP: 0.2,
  CONTAINER: 0.2,
} as const;

/** Numeric tolerance for "exactly on the radius" (virtual units). Not an enlarged footprint. */
export const SENSOR_EPSILON = 1e-6;

/** Cell size (virtual units) of the fixed X/Z grid used to estimate swept coverage. */
export const COVERAGE_RESOLUTION = 1;

export type SensorOutcome = 'DETECTED' | 'MISSED' | 'FALSE_ALARM' | 'DECOY_IGNORED';

/** One simulated observation, as Blue may see it. Never carries the private object identity or type. */
export interface PublicCandidate {
  candidateId: string;
  missionId: string;
  /** 1-based order of emission within the mission (C1, C2, ...). */
  number: number;
  x: number;
  z: number;
  /** True first swept entry time. */
  simTimeSeconds: number;
  source: 'SIMULATED';
  sensorMode: SensorMode;
  footprintProfile: FootprintProfile;
  review: 'NEW' | 'REVIEWED';
}

export interface CoverageEstimate {
  /** Union of the swept footprint along the actually flown path, clipped to the world (virtual units²). */
  sweptArea: number;
  /** Grid routes only: % of the planned rectangle inside the swept region. null for manual routes. */
  gridCoveragePercent: number | null;
  resolution: number;
}

/**
 * Earliest parameter s in [sMin, sMax] at which point P is within radius r of
 * A + s·(B−A), or null if it never is. Solves |A + sD − P|² = r² exactly, so
 * the entry time is where the footprint first reaches P, not the closest point.
 */
export function firstEntry(ax: number, az: number, bx: number, bz: number, px: number, pz: number, r: number, sMin = 0, sMax = 1): number | null {
  if (sMax < sMin) return null;
  const R = r + SENSOR_EPSILON;
  const dx = bx - ax;
  const dz = bz - az;
  const fx = ax - px;
  const fz = az - pz;
  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - R * R;
  const at = (s: number) => (fx + s * dx) ** 2 + (fz + s * dz) ** 2 <= R * R;
  if (at(sMin)) return sMin;
  if (a === 0) return null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s1 = (-b - Math.sqrt(disc)) / (2 * a);
  return s1 >= sMin && s1 <= sMax ? s1 : null;
}

/**
 * Deterministic uniform draw in [0,1) for one object in one mission:
 * SHA-256("seed|missionId|objectId|sim-v1"), first 53 bits / 2^53.
 * Takes a hash function so the same code runs in Node and tests.
 */
export function drawFromDigest(digest: Uint8Array): number {
  // 53 bits = 6 full bytes (48) + top 5 bits of the 7th byte.
  let v = 0;
  for (let i = 0; i < 6; i++) v = v * 256 + digest[i];
  v = v * 32 + (digest[6] >> 3);
  return v / 2 ** 53;
}

export const drawKey = (seed: string, missionId: string, objectId: string) => `${seed}|${missionId}|${objectId}|${SENSOR_ALGORITHM_VERSION}`;

/** The sensing rule for an object's first eligible exposure. */
export function decide(mode: SensorMode, kind: 'HAZARD' | 'DECOY', subtype: keyof typeof ADVANCED_THRESHOLD, u: number): SensorOutcome {
  if (mode === 'BASIC') return kind === 'HAZARD' ? 'DETECTED' : 'DECOY_IGNORED';
  const hit = u < ADVANCED_THRESHOLD[subtype];
  if (kind === 'HAZARD') return hit ? 'DETECTED' : 'MISSED';
  return hit ? 'FALSE_ALARM' : 'DECOY_IGNORED';
}
