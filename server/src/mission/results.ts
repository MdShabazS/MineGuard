import crypto from 'node:crypto';
import { cumulative, flownSubsegments, type MissionPlan } from '../../../shared/mission.js';
import type { ObjectKind, ObjectSubtype, ScenarioMode, ScenarioObject } from '../../../shared/scenario.js';
import { FOOTPRINT_RADIUS, SENSOR_ALGORITHM_VERSION, type SensorOutcome } from '../../../shared/sensor.js';
import type { FrozenMissionResult, RevealedObjectRow, RevealState, ResultMetrics } from '../../../shared/results.js';
import type { WorldDefinition } from '../../../shared/world.js';
import type { RoomRecord, RoomStore } from '../rooms/store.js';
import type { ActiveMission, MissionEngine } from './engine.js';
import { CoverageGrid, sweep, type ObjectInterval, type SensorEngine } from './sensor.js';

// All scoring is server-only, backed by the full private audit, not the truncated
// Red UI history or the final state of the objects table.
// Runtime results are immutable per mission. The public room code never grants
// attacker-edit capabilities; it permits explicit post-finish report sharing.

interface Baseline {
  mission_id: string;
  room_id: string;
  start_revision: number;
  end_revision: number | null;
  mode: ScenarioMode;
  objects_json: string;
}
interface MissionDb {
  id: string;
  room_id: string;
  status: string;
  end_reason: 'ROUTE_COMPLETED' | 'STOPPED_EARLY' | null;
  plan_json: string;
  distance: number;
  sim_time: number;
  seed: string;
}
interface AuditRow {
  revision: number;
  object_id: string | null;
  action: string;
  mission_sim_time: number | null;
  before_json: string | null;
  after_json: string | null;
}
interface DecisionDb {
  object_id: string;
  kind: ObjectKind;
  subtype: ObjectSubtype;
  outcome: SensorOutcome;
  candidate_id: string | null;
  first_sim_time: number;
}
interface ObjectState {
  kind: ObjectKind;
  subtype: ObjectSubtype;
  x: number;
  z: number;
}
interface History {
  id: string;
  current: ObjectState | null;
  from: number;
  intervals: ObjectInterval[];
  notes: string[];
}
interface ResultError {
  ok: false;
  status: number;
  error: string;
  message: string;
}
type ResultReply = { ok: true; value: FrozenMissionResult } | ResultError;
const deny = (status: number, error: string, message: string): ResultError => ({ ok: false, status, error, message });
const asState = (value: unknown): ObjectState | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.kind !== 'HAZARD' && v.kind !== 'DECOY') return null;
  if (typeof v.subtype !== 'string' || typeof v.x !== 'number' || typeof v.z !== 'number') return null;
  return { kind: v.kind, subtype: v.subtype as ObjectSubtype, x: v.x, z: v.z };
};

function scoreHistorical(
  plan: MissionPlan,
  distance: number,
  simTime: number,
  baseObjects: ScenarioObject[],
  changes: AuditRow[],
  decisions: DecisionDb[],
): { truth: RevealedObjectRow[]; metrics: ResultMetrics; warnings: string[] } {
  const records = new Map<string, History>();
  for (const o of baseObjects) {
    records.set(o.id, {
      id: o.id,
      current: { kind: o.kind, subtype: o.subtype, x: o.x, z: o.z },
      from: 0,
      intervals: [],
      notes: ['Present at mission start'],
    });
  }

  for (const a of changes) {
    if (!a.object_id || !['CREATE', 'MOVE', 'UPDATE', 'DELETE'].includes(a.action)) continue;
    if (a.mission_sim_time === null || !Number.isFinite(a.mission_sim_time)) {
      throw Error('Missing simulation time for an in-mission scenario edit');
    }
    const t = a.mission_sim_time;
    if (t < 0 || t > simTime + 1e-6) throw Error('Audit event outside this mission time');
    const id = a.object_id;
    const h: History = records.get(id) ?? { id, current: null, from: t, intervals: [], notes: [] };
    const before = a.before_json ? asState(JSON.parse(a.before_json)) : null;
    const after = a.after_json ? asState(JSON.parse(a.after_json)) : null;
    // A bad/missing timeline must fail closed rather than misreport UNSCANNED.
    if (a.action !== 'CREATE' && !h.current) throw Error('Incomplete historical object baseline');
    if (before && h.current && JSON.stringify(before) !== JSON.stringify(h.current)) {
      throw Error('Historical audit does not agree with the prior object state');
    }
    if (h.current) {
      h.intervals.push({ objectId: id, ...h.current, revision: null, from: h.from, until: t });
    }
    if (a.action === 'CREATE' && h.current) throw Error('Duplicate historical CREATE');
    if (a.action !== 'DELETE' && !after) throw Error('Historical object edit has no resulting state');
    h.current = a.action === 'DELETE' ? null : after;
    h.from = t;
    h.notes.push(a.action + ' at ' + t.toFixed(2) + ' simulated s, revision ' + a.revision);
    records.set(id, h);
  }

  for (const h of records.values()) {
    if (h.current) h.intervals.push({ objectId: h.id, ...h.current, revision: null, from: h.from, until: simTime });
  }

  const intervals = [...records.values()].flatMap((h) => h.intervals);
  const route = flownSubsegments(plan.waypoints, cumulative(plan.waypoints), 0, distance, 0, simTime);
  const eligible = new Map(
    sweep(route, intervals.filter((v) => v.kind === 'HAZARD'), new Set<string>(), FOOTPRINT_RADIUS[plan.footprintProfile])
      .map((e) => [e.objectId, e] as const),
  );
  const byObject = new Map(decisions.map((d) => [d.object_id, d] as const));
  if (byObject.size !== decisions.length) throw Error('Duplicate private decisions');
  const warnings = [
    'Synthetic software simulation only. This is not actual mine detection, subsurface sensing or real-world clearance.',
    'Recall uses only scanned eligible fictional hazards. Unscanned hazards are reported separately.',
    'Advanced Mode probabilities are configured game rules, not measured detector accuracy.',
    'A stable object receives at most one sensor trial per mission, even when moved or reclassified.',
    'Coverage is a 1-virtual-unit cell estimate of the actual swept path.',
  ];
  const truth: RevealedObjectRow[] = [];
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let unscanned = 0;
  let hn = 0;
  let dn = 0;
  const all = [...records.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const h of all) {
    const hazard = h.intervals.filter((iv) => iv.kind === 'HAZARD');
    const decoy = h.intervals.filter((iv) => iv.kind === 'DECOY');
    const d = byObject.get(h.id);
    const e = eligible.get(h.id);
    const isHazard = hazard.length > 0;
    let disposition: RevealedObjectRow['disposition'];
    let chosen: ObjectInterval | undefined;
    if (isHazard) {
      hn++;
      if (d?.outcome === 'DETECTED') { tp++; disposition = 'DETECTED'; }
      else if (e) { fn++; disposition = 'MISSED_WHILE_SCANNED'; }
      else { unscanned++; disposition = 'NOT_SCANNED'; }
      chosen = e?.interval ?? hazard[hazard.length - 1];
    } else {
      dn++;
      if (d?.outcome === 'FALSE_ALARM') { fp++; disposition = 'DECOY_FALSE_ALARM'; }
      else disposition = 'DECOY_IGNORED';
      chosen = decoy[decoy.length - 1];
    }
    // An object may have been a decoy first, then become a hazard in LIVE mode.
    // Such an early false alarm is still an FP, even if a later hazard interval
    // is also eligible and missed under the no-retry rule.
    if (isHazard && d?.outcome === 'FALSE_ALARM') fp++;
    if (!chosen) throw Error('Missing historical object interval');
    if (d && d.outcome === 'DETECTED' && !e) throw Error('Detected hazard has no eligible swept encounter');
    truth.push({
      reportObjectLabel: (isHazard ? 'H' + hn : 'D' + dn),
      kind: chosen.kind,
      subtype: chosen.subtype,
      disposition,
      x: d && d.outcome === 'DETECTED' ? (hazard.find((v) => v.from <= d.first_sim_time && d.first_sim_time <= v.until)?.x ?? chosen.x) : chosen.x,
      z: d && d.outcome === 'DETECTED' ? (hazard.find((v) => v.from <= d.first_sim_time && d.first_sim_time <= v.until)?.z ?? chosen.z) : chosen.z,
      firstEligibleSimTime: e?.simTime ?? null,
      candidateId: d?.candidate_id ?? null,
      eventNotes: h.notes,
    });
  }
  // A candidate must originate in a private matching decision, never a ghost.
  const candidateDecisions = decisions.filter((d) => d.candidate_id !== null);
  if (candidateDecisions.length !== tp + fp) throw Error('Candidate-to-decision integrity mismatch');
  const metrics: ResultMetrics = {
    tp, fp, fn, unscanned,
    eligibleScannedHazards: tp + fn,
    hazardsActiveDuringMission: tp + fn + unscanned,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
  };
  return { truth, metrics, warnings };
}

export class ResultsEngine {
  constructor(
    private store: RoomStore,
    private engine: MissionEngine,
    private sensor: SensorEngine,
    private world: WorldDefinition,
  ) {
    store.db.exec(
      'CREATE TABLE IF NOT EXISTS mission_truth_baseline (' +
        'mission_id TEXT PRIMARY KEY REFERENCES missions(id), room_id TEXT NOT NULL, ' +
        'start_revision INTEGER NOT NULL, end_revision INTEGER, mode TEXT NOT NULL, objects_json TEXT NOT NULL);' +
      'CREATE TABLE IF NOT EXISTS mission_results (' +
        'mission_id TEXT PRIMARY KEY REFERENCES missions(id), room_id TEXT NOT NULL, report_id TEXT NOT NULL UNIQUE, ' +
        'revealed_at TEXT NOT NULL, result_json TEXT NOT NULL);',
    );
  }

  started(room: RoomRecord, m: ActiveMission) {
    const objects = this.store.activeObjects(room);
    this.store.db.prepare(
      'INSERT INTO mission_truth_baseline (mission_id,room_id,start_revision,end_revision,mode,objects_json) VALUES (?,?,?,?,?,?)',
    ).run(m.id, room.id, room.revision, null, room.mode, JSON.stringify(objects));
  }

  finished(room: RoomRecord, m: ActiveMission) {
    this.store.db.prepare(
      'UPDATE mission_truth_baseline SET end_revision=? WHERE mission_id=? AND room_id=?',
    ).run(room.revision, m.id, room.id);
  }

  state(room: RoomRecord, missionId: string): RevealState {
    const row = this.store.db.prepare(
      'SELECT report_id FROM mission_results WHERE room_id=? AND mission_id=?',
    ).get(room.id, missionId) as { report_id: string } | undefined;
    return { missionId, revealed: !!row, reportId: row?.report_id ?? null };
  }

  private mission(room: RoomRecord, missionId: string): MissionDb | null {
    return this.store.db.prepare('SELECT * FROM missions WHERE room_id=? AND id=?')
      .get(room.id, missionId) as unknown as MissionDb | undefined ?? null;
  }

  get(room: RoomRecord, missionId: string): ResultReply {
    if (!this.mission(room, missionId)) return deny(404, 'MISSION_NOT_FOUND', 'Mission not found in this room.');
    const row = this.store.db.prepare('SELECT result_json FROM mission_results WHERE mission_id=? AND room_id=?')
      .get(missionId, room.id) as { result_json: string } | undefined;
    if (!row) return deny(409, 'REPORT_NOT_READY', 'Finish the mission and explicitly choose Reveal & Compare first.');
    return { ok: true, value: JSON.parse(row.result_json) as FrozenMissionResult };
  }

  reveal(room: RoomRecord, missionId: string): ResultReply {
    const m = this.mission(room, missionId);
    if (!m) return deny(404, 'MISSION_NOT_FOUND', 'Mission not found in this room.');
    const existing = this.get(room, missionId);
    if (existing.ok) return existing; // idempotent; never update the frozen report
    if (m.status !== 'FINISHED' || !m.end_reason) {
      return deny(409, 'MISSION_NOT_FINISHED', 'Report reveal is only allowed after this mission finishes.');
    }
    const baseline = this.store.db.prepare(
      'SELECT * FROM mission_truth_baseline WHERE mission_id=? AND room_id=?',
    ).get(missionId, room.id) as unknown as Baseline | undefined;
    if (!baseline || baseline.end_revision === null) {
      return deny(409, 'REPORT_HISTORY_UNAVAILABLE', 'This mission predates reliable result snapshots; start a new mission to report truthfully.');
    }
    try {
      const changes = this.store.db.prepare(
        'SELECT revision,object_id,action,mission_sim_time,before_json,after_json FROM audit ' +
        'WHERE room_id=? AND revision>? AND revision<=? ORDER BY revision',
      ).all(room.id, baseline.start_revision, baseline.end_revision) as unknown as AuditRow[];
      const decisions = this.store.db.prepare(
        'SELECT object_id,kind,subtype,outcome,candidate_id,first_sim_time FROM sensor_decisions WHERE mission_id=? ORDER BY first_sim_time,object_id',
      ).all(missionId) as unknown as DecisionDb[];
      const plan = JSON.parse(m.plan_json) as MissionPlan;
      const scored = scoreHistorical(plan, m.distance, m.sim_time, JSON.parse(baseline.objects_json) as ScenarioObject[], changes, decisions);
      const candidates = this.sensor.candidates(missionId);
      if (candidates.length !== scored.metrics.tp + scored.metrics.fp ||
          new Set(candidates.map((c) => c.candidateId)).size !== candidates.length ||
          !candidates.every((c) => decisions.some((d) => d.candidate_id === c.candidateId))) {
        throw Error('Public candidates do not reconcile with private decisions');
      }
      const grid = new CoverageGrid(this.world, FOOTPRINT_RADIUS[plan.footprintProfile]);
      for (const seg of flownSubsegments(plan.waypoints, cumulative(plan.waypoints), 0, m.distance, 0, m.sim_time)) grid.add(seg);
      const result: FrozenMissionResult = {
        resultVersion: 1,
        reportId: crypto.randomUUID(),
        roomCode: room.code,
        missionId,
        revealedAt: new Date().toISOString(),
        terrainId: this.world.terrainId,
        worldChecksum: this.world.checksum,
        scenarioMode: baseline.mode,
        endReason: m.end_reason,
        plan,
        actualFlownDistance: m.distance,
        simTimeSeconds: m.sim_time,
        coverage: grid.estimate(plan.grid),
        sensorAlgorithmVersion: SENSOR_ALGORITHM_VERSION,
        seed: m.seed,
        candidates,
        ...scored,
      };
      this.store.db.prepare(
        'INSERT INTO mission_results (mission_id,room_id,report_id,revealed_at,result_json) VALUES (?,?,?,?,?)',
      ).run(missionId, room.id, result.reportId, result.revealedAt, JSON.stringify(result));
      return { ok: true, value: result };
    } catch {
      // Fail closed. The pre-reveal HTTP response must never expose private
      // internal data or a partially computed result.
      return deny(409, 'REPORT_HISTORY_UNAVAILABLE', 'Historical truth could not be verified. No report has been revealed.');
    }
  }
}
