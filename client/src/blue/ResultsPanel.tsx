import { useEffect, useMemo, useState } from 'react';
import type { FrozenMissionResult } from '../../../shared/results';
import { ApiFailure, missionApi } from '../lib/api';
import { btnBlue, btnGhost } from './BluePanels';

// Only mounted for a FINISHED mission. The server enforces every permission;
// no unrevealed truth is fetched or hidden in browser props.
export default function ResultsPanel({
  roomCode, missionId, onResult,
}: {
  roomCode: string;
  missionId: string;
  onResult: (value: FrozenMissionResult | null) => void;
}) {
  const api = useMemo(() => missionApi(roomCode), [roomCode]);
  const [value, setValue] = useState<FrozenMissionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const receive = (result: FrozenMissionResult) => {
    setValue(result);
    onResult(result);
  };

  useEffect(() => {
    let cancelled = false;
    setValue(null);
    setError(null);
    setReady(false);
    onResult(null);
    // Read safe reveal metadata first. An unrevealed mission must not produce
    // an expected 409 request/console error merely because this panel mounted.
    api.resultState(missionId).then((state) => {
      if (cancelled) return;
      if (!state.revealed) { setReady(true); return; }
      return api.results(missionId).then((r) => {
        if (!cancelled) {
          setValue(r.result);
          onResult(r.result);
          setReady(true);
        }
      });
    }).catch((err: unknown) => {
      if (cancelled) return;
      if (!(err instanceof ApiFailure && err.code === 'REPORT_NOT_READY')) {
        setError(err instanceof Error ? err.message : String(err));
      }
      setReady(true);
    });
    return () => { cancelled = true; };
    // Deliberately keyed by room/mission; onResult is a notification, not a dependency.
  }, [api, missionId]);

  const reveal = async () => {
    if (!window.confirm('Reveal this finished fictional scenario to participants who have the room code? This cannot be undone for this mission.')) return;
    setBusy(true);
    setError(null);
    try {
      receive((await api.reveal(missionId)).result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const percent = (n: number | null) => n === null ? 'N/A' : (100 * n).toFixed(1) + '%';
  const card = (label: string, n: string | number) => (
    <div className="rounded-lg border border-white/15 bg-black/20 px-3 py-2">
      <div className="text-2xl font-semibold text-slate-100">{n}</div>
      <div className="text-[11px] text-slate-400">{label}</div>
    </div>
  );

  return (
    <div data-testid="results-panel" className="space-y-3">
      {!ready && <p className="text-sm text-slate-400">Checking this mission's report status…</p>}
      {error && <p data-testid="results-error" className="rounded border border-rose-600/40 p-2 text-sm text-rose-200">{error}</p>}
      {ready && !value && (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">Mission finished. The simulated candidates are visible; private fictional truth is not revealed yet.</p>
          <p className="text-xs text-amber-200">Revealing will share this finished mission's fictional objects and evaluation with people who possess this room code. It will not grant attacker editing access.</p>
          <button data-testid="reveal-results" className={btnBlue} disabled={busy} onClick={reveal}>
            {busy ? 'Preparing comparison…' : 'Reveal & Compare'}
          </button>
        </div>
      )}
      {value && (
        <div data-testid="revealed-results" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-emerald-300">Fictional ground truth revealed · frozen report</p>
            <a data-testid="print-report" className={btnGhost} href={api.printUrl(missionId)} target="_blank" rel="noopener noreferrer">
              Print / Save as PDF
            </a>
          </div>
          {value.endReason === 'STOPPED_EARLY' && (
            <p className="rounded border border-amber-500/40 p-2 text-xs text-amber-200">Stopped early: only part of the planned virtual route was surveyed.</p>
          )}
          <div data-testid="report-metrics" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {card('True observations (TP)', value.metrics.tp)}
            {card('False alarms (FP)', value.metrics.fp)}
            {card('Eligible misses (FN)', value.metrics.fn)}
            {card('Never scanned', value.metrics.unscanned)}
            {card('Synthetic precision', percent(value.metrics.precision))}
            {card('Synthetic recall (eligible only)', percent(value.metrics.recall))}
          </div>
          <p className="text-xs text-slate-400">Flown {value.actualFlownDistance.toFixed(1)} / {value.plan.routeLength.toFixed(1)} virtual units. Estimated scanned area {value.coverage.sweptArea.toFixed(0)} units². {value.coverage.gridCoveragePercent === null ? 'Grid coverage: N/A (manual route).' : 'Grid coverage: ' + value.coverage.gridCoveragePercent.toFixed(1) + '%.'}</p>
          <div className="overflow-x-auto">
            <table data-testid="report-truth" className="w-full text-left text-xs">
              <thead><tr className="text-slate-400"><th className="p-1">ID</th><th className="p-1">Synthetic type</th><th className="p-1">X / Z</th><th className="p-1">Outcome</th></tr></thead>
              <tbody>
                {value.truth.map((o) => (
                  <tr key={o.reportObjectLabel} className="border-t border-white/10">
                    <td className="p-1 font-semibold">{o.reportObjectLabel}</td>
                    <td className="p-1">{o.kind} / {o.subtype}</td>
                    <td className="p-1 font-mono">{o.x.toFixed(1)} / {o.z.toFixed(1)}</td>
                    <td className="p-1">{o.disposition.replaceAll('_', ' ')}</td>
                  </tr>
                ))}
                {!value.truth.length && <tr><td className="p-1" colSpan={4}>No fictional objects were active during this mission.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">Report ID: {value.reportId}. Candidates and historical truth are compared using server-owned events. Unscanned hazards are not false negatives. This is not a real detector and no virtual coverage means safe or cleared ground.</p>
        </div>
      )}
    </div>
  );
}
