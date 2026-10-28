// MG-010: a frozen, post-finish comparison. Never send these types before reveal.
// Every coordinate and observation is fictional; nothing here certifies real ground.
import type { MissionPlan, EndReason } from './mission.js';
import type { PublicCandidate, CoverageEstimate } from './sensor.js';
import type { ObjectKind, ObjectSubtype, ScenarioMode } from './scenario.js';

export type TruthDisposition =
  | 'DETECTED'
  | 'MISSED_WHILE_SCANNED'
  | 'NOT_SCANNED'
  | 'DECOY_FALSE_ALARM'
  | 'DECOY_IGNORED';

export interface ResultMetrics {
  tp: number;
  fp: number;
  fn: number;
  unscanned: number;
  eligibleScannedHazards: number;
  hazardsActiveDuringMission: number;
  precision: number | null;
  recall: number | null;
}

export interface RevealedObjectRow {
  reportObjectLabel: string;
  kind: ObjectKind;
  subtype: ObjectSubtype;
  disposition: TruthDisposition;
  x: number;
  z: number;
  firstEligibleSimTime: number | null;
  candidateId: string | null;
  eventNotes: string[];
}

export interface FrozenMissionResult {
  resultVersion: 1;
  reportId: string;
  roomCode: string;
  missionId: string;
  revealedAt: string;
  terrainId: string;
  worldChecksum: string;
  scenarioMode: ScenarioMode;
  endReason: EndReason;
  plan: MissionPlan;
  actualFlownDistance: number;
  simTimeSeconds: number;
  coverage: CoverageEstimate;
  sensorAlgorithmVersion: string;
  seed: string;
  candidates: PublicCandidate[];
  truth: RevealedObjectRow[];
  metrics: ResultMetrics;
  warnings: string[];
}

export interface RevealState {
  missionId: string;
  revealed: boolean;
  reportId: string | null;
}
