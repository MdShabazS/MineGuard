import type { ReactNode } from 'react';
import { MAX_MANUAL_WAYPOINTS, type MissionPlan, type MissionTelemetry, type PlaybackSpeed } from '../../../shared/mission';
import { FOOTPRINT_PROFILES, FOOTPRINT_RADIUS, maxGapFreeSpacing, type FootprintProfile, type PublicCandidate, type SensorMode } from '../../../shared/sensor';

export const btn = 'rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40';
export const btnBlue = `${btn} bg-sky-600 text-white hover:bg-sky-500`;
export const btnGhost = `${btn} border border-white/15 text-slate-200 hover:bg-white/10`;
export const field = 'w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 font-mono text-sm text-slate-100 focus:border-sky-400 focus:outline-none disabled:opacity-50';

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  testPrefix,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  testPrefix: string;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-white/15">
      {options.map((o) => (
        <button
          key={String(o.value)}
          data-testid={`${testPrefix}-${o.value}`}
          data-active={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`flex-1 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 ${o.value === value ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface ManualDraft {
  x: string;
  z: string;
}

export function ManualEditor({
  points,
  onChange,
  disabled,
}: {
  points: ManualDraft[];
  onChange: (p: ManualDraft[]) => void;
  disabled: boolean;
}) {
  const set = (i: number, key: 'x' | 'z', v: string) => onChange(points.map((p, j) => (j === i ? { ...p, [key]: v } : p)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...points];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {points.length === 0 && <p className="text-sm text-slate-500">No waypoints yet. Click the terrain (with "Click to add" on) or type X/Z below.</p>}
      <ol data-testid="waypoint-list" className="max-h-64 space-y-1 overflow-auto">
        {points.map((p, i) => (
          <li key={i} data-testid="waypoint-row" className="grid grid-cols-[1.6rem_1fr_1fr_auto] items-center gap-1.5">
            <span className="text-center font-mono text-xs text-slate-400">{i + 1}</span>
            <input data-testid={`wp-x-${i}`} aria-label={`Waypoint ${i + 1} X`} className={field} value={p.x} disabled={disabled} onChange={(e) => set(i, 'x', e.target.value)} inputMode="decimal" />
            <input data-testid={`wp-z-${i}`} aria-label={`Waypoint ${i + 1} Z`} className={field} value={p.z} disabled={disabled} onChange={(e) => set(i, 'z', e.target.value)} inputMode="decimal" />
            <span className="flex gap-0.5">
              <button data-testid={`wp-up-${i}`} className="px-1 text-slate-400 hover:text-white disabled:opacity-30" disabled={disabled || i === 0} onClick={() => move(i, -1)} title="Move up">
                ↑
              </button>
              <button data-testid={`wp-down-${i}`} className="px-1 text-slate-400 hover:text-white disabled:opacity-30" disabled={disabled || i === points.length - 1} onClick={() => move(i, 1)} title="Move down">
                ↓
              </button>
              <button data-testid={`wp-remove-${i}`} className="px-1 text-rose-300 hover:text-rose-100 disabled:opacity-30" disabled={disabled} onClick={() => onChange(points.filter((_, j) => j !== i))} title="Remove">
                ✕
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <button data-testid="add-waypoint" className={btnGhost} disabled={disabled || points.length >= MAX_MANUAL_WAYPOINTS} onClick={() => onChange([...points, { x: '', z: '' }])}>
          + Add waypoint
        </button>
        <button data-testid="clear-waypoints" className={btnGhost} disabled={disabled || points.length === 0} onClick={() => onChange([])}>
          Clear
        </button>
      </div>
    </div>
  );
}

export interface GridDraft {
  x1: string;
  z1: string;
  x2: string;
  z2: string;
  spacing: string;
  orientation: 'AUTO' | 'ALONG_X' | 'ALONG_Z';
}

export function GridEditor({ grid, onChange, disabled, profile }: { grid: GridDraft; onChange: (g: GridDraft) => void; disabled: boolean; profile: FootprintProfile }) {
  const set = (k: keyof GridDraft, v: string) => onChange({ ...grid, [k]: v });
  const input = (k: keyof GridDraft, label: string) => (
    <label className="text-[11px] text-slate-400">
      {label}
      <input data-testid={`grid-${k}`} className={field} value={grid[k]} disabled={disabled} onChange={(e) => set(k, e.target.value)} inputMode="decimal" />
    </label>
  );
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1.5">
        {input('x1', 'Corner 1 X')}
        {input('z1', 'Corner 1 Z')}
        {input('x2', 'Corner 2 X')}
        {input('z2', 'Corner 2 Z')}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {input('spacing', 'Max lane spacing')}
        <label className="text-[11px] text-slate-400">
          Lanes run
          <select data-testid="grid-orientation" className={field} value={grid.orientation} disabled={disabled} onChange={(e) => set('orientation', e.target.value)}>
            <option value="AUTO">Auto (longer side)</option>
            <option value="ALONG_X">Along X</option>
            <option value="ALONG_Z">Along Z</option>
          </select>
        </label>
      </div>
      <p className="text-[11px] text-slate-500">
        Gap-free spacing for the {profile.toLowerCase()} virtual footprint: ≤ {maxGapFreeSpacing(profile)} units (2 × r). The planned rectangle is not proof of coverage.
      </p>
    </div>
  );
}

export function SensorConfig({
  mode,
  profile,
  onMode,
  onProfile,
  disabled,
}: {
  mode: SensorMode;
  profile: FootprintProfile;
  onMode: (m: SensorMode) => void;
  onProfile: (p: FootprintProfile) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-slate-400">Simulated sensor mode</div>
      <Segmented testPrefix="sensor" value={mode} onChange={onMode} disabled={disabled} options={[{ value: 'BASIC', label: 'Basic' }, { value: 'ADVANCED', label: 'Advanced' }]} />
      <div className="text-[11px] text-slate-400">Virtual footprint (radius r)</div>
      <Segmented
        testPrefix="profile"
        value={profile}
        onChange={onProfile}
        disabled={disabled}
        options={FOOTPRINT_PROFILES.map((p) => ({ value: p, label: `${p[0]}${p.slice(1).toLowerCase()} · ${FOOTPRINT_RADIUS[p]}` }))}
      />
      <p className="text-[11px] text-slate-500">
        {mode === 'BASIC' ? 'Basic: every virtual hazard inside the swept footprint is mapped once.' : 'Advanced: seeded synthetic misses and decoy false alarms.'} Fictional simulator settings, not real
        sensor capability.
      </p>
    </div>
  );
}

const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};

export function Telemetry({ t, plan, connected }: { t: MissionTelemetry | null; plan: MissionPlan | null; connected: boolean }) {
  const legs = plan ? plan.waypoints.length - 1 : 0;
  const pct = t ? (t.routeDistanceCompleted >= t.routeLength ? 100 : Math.floor((1000 * t.routeDistanceCompleted) / t.routeLength) / 10) : 0;
  const heading = t ? ((((t.headingRadians * 180) / Math.PI) % 360) + 360) % 360 : 0;
  const row = (label: string, value: ReactNode, testId: string) => (
    <div className="flex justify-between gap-2 border-b border-white/5 py-1 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span data-testid={testId} className="font-mono text-sm">
        {value}
      </span>
    </div>
  );
  return (
    <div data-testid="telemetry" data-mission-id={t?.missionId ?? ''} data-sequence={t?.sequence ?? -1} data-distance={t?.routeDistanceCompleted ?? 0} data-status={t?.status ?? 'NONE'}>
      {row(
        'Status',
        t ? (
          <span className={t.status === 'RUNNING' ? 'text-emerald-300' : t.status === 'PAUSED' ? 'text-amber-300' : 'text-slate-200'}>
            {t.status}
            {t.endReason === 'ROUTE_COMPLETED' && ' · Route completed'}
            {t.endReason === 'STOPPED_EARLY' && ' · Stopped early'}
          </span>
        ) : (
          'No mission yet'
        ),
        'tel-status',
      )}
      {row('Virtual X / Z', t ? `${t.x.toFixed(1)} / ${t.z.toFixed(1)}` : '—', 'tel-xz')}
      {row('Altitude above ground', `${plan?.altitudeAboveGround ?? 12} units`, 'tel-alt')}
      {row('Heading (0° = +Z)', t ? `${heading.toFixed(0)}°` : '—', 'tel-heading')}
      {row('Leg', t ? `${Math.min(t.currentLegIndex + 1, legs)} / ${legs}` : '—', 'tel-leg')}
      {row('Progress', t ? `${pct.toFixed(1)}%  (${t.routeDistanceCompleted.toFixed(1)} / ${t.routeLength.toFixed(1)})` : '—', 'tel-progress')}
      {row('Simulation time', t ? fmtTime(t.simTimeSeconds) : '—', 'tel-time')}
      {row('Playback', t ? `${t.playbackSpeed}×` : '—', 'tel-speed')}
      {row(
        'Estimated virtual coverage',
        t?.coverage ? `${t.coverage.sweptArea.toLocaleString()} u²${t.coverage.gridCoveragePercent !== null ? ` · ${t.coverage.gridCoveragePercent.toFixed(1)}% of grid` : ''}` : '—',
        'tel-coverage',
      )}
      {row('Connection', <span className={connected ? 'text-emerald-300' : 'text-rose-300'}>{connected ? 'live' : 'reconnecting…'}</span>, 'tel-conn')}
      {t?.pausedByRestart && <p className="mt-1 text-xs text-amber-300">The server restarted during flight; the mission was paused at its last saved position. Resume to continue.</p>}
    </div>
  );
}

export function Findings({
  candidates,
  selectedId,
  onSelect,
  onReview,
  hasMission,
}: {
  candidates: PublicCandidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReview: (id: string, review: 'NEW' | 'REVIEWED') => void;
  hasMission: boolean;
}) {
  return (
    <div className="space-y-2">
      {candidates.length === 0 ? (
        <p data-testid="no-candidates" className="text-sm text-slate-400">
          {hasMission ? 'No candidates yet.' : 'Start a mission: simulated candidates appear here when the virtual footprint scans them.'}
        </p>
      ) : (
        <table data-testid="candidate-list" className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="pb-1 font-normal">#</th>
              <th className="pb-1 font-normal">X / Z</th>
              <th className="pb-1 font-normal">Sim time</th>
              <th className="pb-1 font-normal">Sensor</th>
              <th className="pb-1 font-normal">Review</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr
                key={c.candidateId}
                data-testid="candidate-row"
                data-id={c.candidateId}
                data-x={c.x}
                data-z={c.z}
                onClick={() => onSelect(c.candidateId)}
                className={`cursor-pointer border-t border-white/5 ${c.candidateId === selectedId ? 'bg-yellow-400/10' : 'hover:bg-white/5'}`}
              >
                <td className="py-1.5 font-semibold text-rose-300">C{c.number}</td>
                <td className="font-mono">
                  {c.x.toFixed(1)} / {c.z.toFixed(1)}
                </td>
                <td className="font-mono">{c.simTimeSeconds.toFixed(1)} s</td>
                <td className="text-xs text-slate-400">
                  {c.sensorMode.toLowerCase()} · {c.footprintProfile.toLowerCase()}
                </td>
                <td>
                  <button
                    data-testid={`review-${c.number}`}
                    className={`rounded px-1.5 py-0.5 text-[11px] ${c.review === 'REVIEWED' ? 'bg-emerald-600/30 text-emerald-200' : 'bg-white/10 text-slate-300'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onReview(c.candidateId, c.review === 'REVIEWED' ? 'NEW' : 'REVIEWED');
                    }}
                  >
                    {c.review === 'REVIEWED' ? 'Reviewed' : 'Mark reviewed'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {selectedId && candidates.some((c) => c.candidateId === selectedId) && (
        <p data-testid="candidate-detail" className="rounded bg-black/20 px-2 py-1.5 text-xs text-slate-300">
          Simulated candidate detected at the location shown. It is a virtual observation from the simulated sensor, not a confirmed mine, and its type is not known until the post-mission
          reveal.
        </p>
      )}
      <p className="text-[11px] text-slate-500">
        Candidates are synthetic. Some may come from fictional &quot;buried&quot; objects (a game rule, not subsurface sensing) or, in Advanced mode, from harmless decoys. The swept area is
        where the fictional sensor was applied, not cleared or safe ground.
      </p>
    </div>
  );
}

export function Controls({
  telemetry,
  canStart,
  blockedReason,
  speed,
  busy,
  onStart,
  onPause,
  onResume,
  onStop,
  onSpeed,
  onNewMission,
  roomFinished,
}: {
  telemetry: MissionTelemetry | null;
  canStart: boolean;
  blockedReason: string | null;
  speed: PlaybackSpeed;
  busy: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSpeed: (s: PlaybackSpeed) => void;
  onNewMission: () => void;
  roomFinished: boolean;
}) {
  const status = telemetry?.status;
  const flying = status === 'RUNNING' || status === 'PAUSED';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!flying && !roomFinished && (
          <button data-testid="start-mission" className={btnBlue} disabled={!canStart || busy} onClick={onStart}>
            ▶ Start mission
          </button>
        )}
        {status === 'RUNNING' && (
          <button data-testid="pause-mission" className={btnGhost} disabled={busy} onClick={onPause}>
            ❚❚ Pause
          </button>
        )}
        {status === 'PAUSED' && (
          <button data-testid="resume-mission" className={btnBlue} disabled={busy} onClick={onResume}>
            ▶ Resume
          </button>
        )}
        {flying && (
          <button data-testid="stop-mission" className={`${btn} bg-rose-700 text-white hover:bg-rose-600`} disabled={busy} onClick={onStop}>
            ■ Stop
          </button>
        )}
        {roomFinished && status === 'FINISHED' && (
          <button data-testid="new-mission" className={btnGhost} disabled={busy} onClick={onNewMission}>
            ↺ New mission
          </button>
        )}
      </div>
      <div>
        <div className="mb-1 text-[11px] text-slate-400">Simulation speed</div>
        <Segmented<PlaybackSpeed> testPrefix="speed" value={flying ? telemetry!.playbackSpeed : speed} onChange={onSpeed} disabled={busy || status === 'FINISHED'} options={[1, 2, 4].map((s) => ({ value: s as PlaybackSpeed, label: `${s}×` }))} />
      </div>
      {!flying && blockedReason && (
        <p data-testid="start-blocked" className="text-xs text-amber-300">
          {blockedReason}
        </p>
      )}
    </div>
  );
}
