import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { buildPlan, type CameraMode, type MissionPlan, type MissionPoint, type MissionSnapshot, type PlaybackSpeed, type PlanInput } from '../../../shared/mission';
import { normalizeCoordinate, type PublicRoomSnapshot } from '../../../shared/scenario';
import { DEFAULT_FOOTPRINT, DEFAULT_SENSOR_MODE, FOOTPRINT_RADIUS, type FootprintProfile, type SensorMode } from '../../../shared/sensor';
import type { Vec2 } from '../../../shared/world';
import type { FrozenMissionResult } from '../../../shared/results';
import { ApiFailure, missionApi } from '../lib/api';
import { useMissionState } from '../lib/useMissionState';
import { useRoomSocket } from '../lib/useRoomSocket';
import { Controls, Findings, GridEditor, ManualEditor, SensorConfig, Segmented, Telemetry, btnBlue, btnGhost, field, type GridDraft, type ManualDraft } from '../blue/BluePanels';
import ResultsPanel from '../blue/ResultsPanel';
import MissionLayer from '../blue/MissionLayer';
import { Card } from '../red/RedPanels';
import type { FollowTarget } from '../world/CameraRig';
import { useWorld } from '../world/useWorld';
import WorldView from '../world/WorldView';
import PortalLayout from './PortalLayout';

type PickMode = 'NONE' | 'WAYPOINT' | 'CORNERS';

const sameRoute = (a: Omit<MissionPlan, 'id' | 'planRevision' | 'createdAt'>, b: MissionPlan) =>
  a.routeKind === b.routeKind && a.sensorMode === b.sensorMode && a.footprintProfile === b.footprintProfile && JSON.stringify(a.waypoints) === JSON.stringify(b.waypoints);

export default function DefencePortal() {
  const { code } = useParams();
  const roomCode = code ? code.toUpperCase() : null;
  const navigate = useNavigate();
  const [draftCode, setDraftCode] = useState('');
  const worldState = useWorld();
  const world = worldState.status === 'ready' ? worldState.world : null;

  const { mission, telemetry, candidates, onMissionSnapshot, handlers } = useMissionState();
  // No attacker token: the server only ever sends public room + mission data to this page.
  const { join, connected } = useRoomSocket<PublicRoomSnapshot>(roomCode, undefined, handlers);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [revealedResult, setRevealedResult] = useState<FrozenMissionResult | null>(null);
  const room = join.status === 'joined' ? join.snapshot : null;
  const api = useMemo(() => (roomCode ? missionApi(roomCode) : null), [roomCode]);

  // ---- planner draft (local until confirmed by the server) ----
  const [tab, setTab] = useState<'MANUAL' | 'GRID'>('MANUAL');
  const [manual, setManual] = useState<ManualDraft[]>([]);
  const [grid, setGrid] = useState<GridDraft>({ x1: '', z1: '', x2: '', z2: '', spacing: '20', orientation: 'AUTO' });
  const [sensorMode, setSensorMode] = useState<SensorMode>(DEFAULT_SENSOR_MODE);
  const [profile, setProfile] = useState<FootprintProfile>(DEFAULT_FOOTPRINT);
  const [pickMode, setPickMode] = useState<PickMode>('NONE');
  const [nextCorner, setNextCorner] = useState<1 | 2>(1);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [camera, setCamera] = useState<CameraMode>('OVERVIEW');
  const [resetKey, setResetKey] = useState(0);
  const follow = useRef<FollowTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After a refresh the local draft is empty: load it back from the server's confirmed plan once.
  const hydrated = useRef(false);
  useEffect(() => {
    const p = mission?.plan;
    if (hydrated.current || !mission) return;
    hydrated.current = true;
    if (!p) return;
    setTab(p.routeKind);
    setSensorMode(p.sensorMode);
    setProfile(p.footprintProfile);
    if (p.routeKind === 'MANUAL') setManual(p.waypoints.map((w) => ({ x: String(w.x), z: String(w.z) })));
    else if (p.grid) {
      const g = p.grid;
      setGrid({ x1: String(g.xMin), z1: String(g.zMin), x2: String(g.xMax), z2: String(g.zMax), spacing: String(g.laneSpacing), orientation: g.orientation });
    }
  }, [mission]);

  const status = telemetry?.status;
  const flying = status === 'RUNNING' || status === 'PAUSED';
  const roomFinished = room?.state === 'FINISHED';
  const planningLocked = !room || flying || roomFinished;

  const input: PlanInput = {
    routeKind: tab,
    waypoints: manual.map((p) => ({ x: p.x, z: p.z })),
    grid: { x1: grid.x1, z1: grid.z1, x2: grid.x2, z2: grid.z2, laneSpacing: grid.spacing, orientation: grid.orientation },
    sensorMode,
    footprintProfile: profile,
  };
  // The exact same validation/generation code the server runs, for an instant preview.
  const local = world ? buildPlan(world, input) : null;
  const confirmed = mission?.plan ?? null;
  const upToDate = !!(local?.ok && confirmed && sameRoute(local.value, confirmed));

  // Partial manual preview: show whatever points are already valid.
  const draftPoints: MissionPoint[] | null = useMemo(() => {
    if (!world) return null;
    if (local?.ok) return local.value.waypoints;
    if (tab === 'MANUAL') return manual.map((p) => normalizeCoordinate(world, p.x, p.z)).filter((p): p is MissionPoint => !!p);
    return null;
  }, [world, local, tab, manual]);
  const draftCorners = useMemo(() => {
    if (!world || tab !== 'GRID') return null;
    const a = normalizeCoordinate(world, grid.x1, grid.z1);
    const b = normalizeCoordinate(world, grid.x2, grid.z2);
    return a && b ? { xMin: Math.min(a.x, b.x), xMax: Math.max(a.x, b.x), zMin: Math.min(a.z, b.z), zMax: Math.max(a.z, b.z) } : null;
  }, [world, tab, grid]);

  // What the 3D view shows: the flying/finished mission's route, the confirmed plan, or the dashed draft.
  const showMission = !!telemetry && !!mission?.mission && (flying || roomFinished);
  const routeShown = showMission ? mission!.mission!.plan : upToDate ? confirmed : null;

  const run = async (fn: () => Promise<{ snapshot: MissionSnapshot }>) => {
    setBusy(true);
    setError(null);
    try {
      onMissionSnapshot((await fn()).snapshot);
    } catch (err) {
      setError(err instanceof ApiFailure ? `${err.message} (${err.code})` : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onPick = (p: Vec2) => {
    if (planningLocked) return;
    const [x, z] = [String(p[0]), String(p[1])];
    if (pickMode === 'WAYPOINT') setManual((m) => [...m, { x, z }]);
    if (pickMode === 'CORNERS') {
      setGrid((g) => (nextCorner === 1 ? { ...g, x1: x, z1: z } : { ...g, x2: x, z2: z }));
      setNextCorner((c) => (c === 1 ? 2 : 1));
    }
  };

  if (!roomCode || join.status === 'error') {
    return (
      <PortalLayout team="blue" title="Blue Team — MineGuard Mission Control" subtitle="Defence portal">
        <Card title="JOIN A ROOM" testId="join-panel">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draftCode.trim()) navigate(`/blue/${draftCode.trim().toUpperCase()}`);
            }}
          >
            <label className="text-xs text-slate-400">
              Room code from Red Team
              <input data-testid="join-code" className={`${field} w-48 uppercase tracking-widest`} value={draftCode} maxLength={6} onChange={(e) => setDraftCode(e.target.value)} placeholder="ABC234" />
            </label>
            <button data-testid="join-room" className={btnBlue} type="submit">
              Join
            </button>
          </form>
          {join.status === 'error' && (
            <p data-testid="join-error" className="mt-3 text-sm text-rose-300">
              {join.message}
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">Mission controls unlock after joining a room.</p>
        </Card>
        <WorldView />
      </PortalLayout>
    );
  }

  return (
    <PortalLayout team="blue" title="Blue Team — MineGuard Mission Control" subtitle="Defence portal">
      <Card title="MISSION ROOM" testId="blue-room">
        {room ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-xs text-slate-400">Room </span>
              <span data-testid="blue-room-code" className="font-mono text-lg font-semibold tracking-widest text-sky-200">
                {room.roomCode}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400">Mode </span>
              <span data-testid="blue-mode">{room.mode}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400">Scenario </span>
              <span data-testid="blue-state">{room.state}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400">Revision </span>
              <span data-testid="blue-revision" className="font-mono">
                {room.scenarioRevision}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400">World </span>
              <span className="font-mono">{room.terrainId}</span>
            </div>
            <span className={`ml-auto text-xs ${connected ? 'text-emerald-400' : 'text-rose-400'}`}>{connected ? '● live' : '● reconnecting…'}</span>
            <p className="w-full text-xs text-slate-500">Hidden virtual objects are never sent to this portal. Coordinates are fictional virtual units, not GPS.</p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Joining room {roomCode}…</p>
        )}
      </Card>

      {error && (
        <div data-testid="mission-error" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <WorldView
            onPick={onPick}
            crosshair={pickMode !== 'NONE' && !planningLocked}
            cameraMode={camera}
            followTarget={follow}
            cameraResetKey={resetKey}
            renderScene={(w) => (
              <MissionLayer
                world={w}
                draft={showMission || upToDate ? null : draftPoints}
                draftGrid={showMission || upToDate ? null : draftCorners}
                route={routeShown?.waypoints ?? null}
                routeGrid={routeShown?.grid ?? null}
                telemetry={showMission ? telemetry : null}
                follow={follow}
                footprintRadius={FOOTPRINT_RADIUS[(showMission ? mission!.mission!.plan : routeShown ?? { footprintProfile: profile }).footprintProfile]}
                candidates={candidates}
                revealedTruth={revealedResult && revealedResult.missionId === telemetry?.missionId ? revealedResult.truth : []}
                selectedCandidate={selectedCandidate}
                onSelectCandidate={setSelectedCandidate}
              />
            )}
            overlay={
              <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  {camera !== 'FOLLOW' && (
                    <button data-testid="reset-view" className="rounded bg-black/60 px-2 py-1.5 text-[11px] text-slate-200 hover:bg-black/80" onClick={() => setResetKey((k) => k + 1)}>
                      Reset view
                    </button>
                  )}
                  <div className="w-72">
                    <Segmented<CameraMode>
                      testPrefix="camera"
                      value={camera}
                      onChange={setCamera}
                      options={[
                        { value: 'OVERVIEW', label: 'Overview' },
                        { value: 'FOLLOW', label: 'Follow drone' },
                        { value: 'TOP_DOWN', label: 'Top-down' },
                      ]}
                    />
                  </div>
                </div>
                {camera === 'FOLLOW' && !showMission && <span className="rounded bg-black/60 px-2 py-1 text-[11px] text-slate-300">Plan and start a mission to follow the drone</span>}
                {pickMode !== 'NONE' && !planningLocked && (
                  <span className="rounded bg-sky-600/80 px-2 py-1 text-[11px] font-semibold text-white">
                    {pickMode === 'WAYPOINT' ? 'CLICK TERRAIN TO ADD WAYPOINT' : `CLICK TERRAIN FOR CORNER ${nextCorner}`}
                  </span>
                )}
              </div>
            }
          />
          {room && roomFinished && telemetry?.status === 'FINISHED' && (
            <Card title="POST-MISSION COMPARISON" testId="post-mission-comparison">
              <ResultsPanel roomCode={room.roomCode} missionId={telemetry.missionId} onResult={setRevealedResult} />
            </Card>
          )}
          <Card title={`SIMULATED FINDINGS · ${candidates.length}`} testId="findings-panel">
            <Findings
              candidates={candidates}
              selectedId={selectedCandidate}
              onSelect={setSelectedCandidate}
              hasMission={!!mission?.mission}
              onReview={(id, review) => api && run(async () => (await api.review(id, review), { snapshot: await api.get() }))}
            />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="MISSION PLANNER" testId="planner">
            <div className="space-y-3">
              <Segmented testPrefix="tab" value={tab} onChange={(t) => (setTab(t), setPickMode('NONE'))} disabled={planningLocked} options={[{ value: 'MANUAL', label: 'Manual waypoints' }, { value: 'GRID', label: 'Grid survey' }]} />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  data-testid="pick-toggle"
                  className={pickMode !== 'NONE' ? btnBlue : btnGhost}
                  disabled={planningLocked}
                  onClick={() => {
                    setPickMode((m) => (m !== 'NONE' ? 'NONE' : tab === 'MANUAL' ? 'WAYPOINT' : 'CORNERS'));
                    setNextCorner(1);
                  }}
                >
                  {pickMode !== 'NONE' ? 'Exit planning mode' : tab === 'MANUAL' ? 'Click to add waypoints' : 'Pick corners on terrain'}
                </button>
                <span className="text-[11px] text-slate-500">Drag always rotates the view.</span>
              </div>
              {tab === 'MANUAL' ? <ManualEditor points={manual} onChange={setManual} disabled={planningLocked} /> : <GridEditor grid={grid} onChange={setGrid} disabled={planningLocked} profile={profile} />}

              <div data-testid="route-summary" className="rounded-lg bg-black/20 px-3 py-2 text-xs">
                {local?.ok ? (
                  <>
                    <div>
                      <span data-testid="route-points">{local.value.waypoints.length}</span> waypoints · length <span data-testid="route-length">{local.value.routeLength.toFixed(1)}</span> virtual units
                      {local.value.grid && (
                        <>
                          {' '}
                          · {local.value.grid.laneCount} lanes {local.value.grid.orientation === 'ALONG_X' ? 'along X' : 'along Z'}, spacing {local.value.grid.actualSpacing}
                        </>
                      )}
                    </div>
                    {local.value.potentialGaps && <div className="mt-1 text-amber-300">Potential gaps in virtual survey: spacing is wider than 2 × r for this footprint.</div>}
                  </>
                ) : (
                  <span data-testid="route-invalid" className="text-amber-300">
                    {local && !local.ok ? local.message : 'Loading world…'}
                  </span>
                )}
              </div>
            </div>
          </Card>

          <Card title="SIMULATED SENSOR">
            <SensorConfig mode={sensorMode} profile={profile} onMode={setSensorMode} onProfile={setProfile} disabled={planningLocked} />
            <p className="mt-2 text-[11px] text-slate-500">
              Virtual altitude 12 units above terrain · base speed 8 units per simulated second at 1×.
            </p>
          </Card>

          <Card title="FLIGHT" testId="flight">
            <div className="mb-3 flex items-center gap-2">
              <button
                data-testid="confirm-plan"
                className={upToDate ? btnGhost : btnBlue}
                disabled={planningLocked || busy || !local?.ok || upToDate}
                onClick={() => api && run(() => api.plan(input as Record<string, unknown>))}
              >
                {upToDate ? '✓ Plan confirmed' : 'Confirm plan'}
              </button>
              <span data-testid="plan-status" data-state={upToDate ? 'confirmed' : confirmed ? 'stale' : 'none'} className="text-xs text-slate-400">
                {flying
                  ? 'Flying the confirmed plan; route is locked until the mission stops'
                  : upToDate
                    ? `Server plan rev ${confirmed!.planRevision}`
                    : confirmed
                      ? 'Draft changed: confirm again before starting'
                      : 'Not confirmed yet'}
              </span>
            </div>
            <Controls
              telemetry={showMission || flying ? telemetry : null}
              canStart={upToDate && !mission?.startBlockedReason}
              blockedReason={!upToDate ? 'Confirm the plan to enable Start.' : mission?.startBlockedReason ?? null}
              speed={speed}
              busy={busy}
              roomFinished={roomFinished}
              onStart={() => api && confirmed && run(() => api.command({ action: 'START', planId: confirmed.id, planRevision: confirmed.planRevision, playbackSpeed: speed }))}
              onPause={() => api && telemetry && run(() => api.command({ action: 'PAUSE', missionId: telemetry.missionId }))}
              onResume={() => api && telemetry && run(() => api.command({ action: 'RESUME', missionId: telemetry.missionId }))}
              onStop={() => api && telemetry && run(() => api.command({ action: 'STOP', missionId: telemetry.missionId }))}
              onSpeed={(s) => (flying && api && telemetry ? run(() => api.command({ action: 'SET_SPEED', missionId: telemetry.missionId, playbackSpeed: s })) : setSpeed(s))}
              onNewMission={() => api && telemetry && run(() => api.command({ action: 'NEW_MISSION', missionId: telemetry.missionId }))}
            />
          </Card>

          <Card title="TELEMETRY (SIMULATED)">
            <Telemetry t={showMission ? telemetry : null} plan={showMission ? mission!.mission!.plan : confirmed} connected={connected} />
          </Card>
        </div>
      </div>
    </PortalLayout>
  );
}
