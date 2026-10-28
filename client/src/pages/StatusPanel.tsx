import { useServerStatus } from '../lib/useServerStatus';

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 py-2 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`text-sm font-medium ${ok === undefined ? '' : ok ? 'text-emerald-400' : 'text-rose-400'}`}>
        {value}
      </span>
    </div>
  );
}

export default function StatusPanel() {
  const { health, healthError, socketConnected, socketId, pingMs } = useServerStatus();

  return (
    <section data-testid="status-panel" className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h2 className="mb-2 text-xs font-semibold tracking-widest text-slate-400">SERVER CONNECTION</h2>
      <Row
        label="Health endpoint"
        value={health ? `OK · v${health.version}` : healthError ? `Error: ${healthError}` : 'Checking…'}
        ok={health ? true : healthError ? false : undefined}
      />
      <Row label="Realtime socket" value={socketConnected ? 'Connected' : 'Disconnected'} ok={socketConnected} />
      <Row label="Socket ID" value={socketId ?? '—'} />
      <Row label="Round trip" value={pingMs === null ? '—' : `${pingMs} ms`} />
    </section>
  );
}
