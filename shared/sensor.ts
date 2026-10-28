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
