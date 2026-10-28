import { useEffect, useState, type ReactNode } from 'react';
import {
  OBJECT_CATEGORIES,
  categoryLabel,
  type AttackerRoomSnapshot,
  type ScenarioAuditEvent,
  type ScenarioObject,
} from '../../../shared/scenario';
import { copyText } from '../lib/api';
import { SUBTYPE_STYLE } from '../world/ObjectMarkers';

export function Card({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h2 className="mb-3 text-xs font-semibold tracking-widest text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

export const btn = 'rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40';
export const btnPrimary = `${btn} bg-rose-600 text-white hover:bg-rose-500`;
export const btnGhost = `${btn} border border-white/15 text-slate-200 hover:bg-white/10`;
export const input = 'w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-sm text-slate-100 focus:border-rose-400 focus:outline-none';

function CopyRow({ label, value, display, testId, warn }: { label: string; value: string; display?: string; testId: string; warn?: string }) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  return (
    <div className="space-y-1">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="flex gap-2">
        <code data-testid={testId} className="min-w-0 flex-1 truncate rounded-lg bg-black/30 px-2 py-2 text-xs text-slate-200">
          {display ?? value}
        </code>
        <button
          className={btnGhost}
          onClick={async () => {
            setCopied((await copyText(value)) ? 'ok' : 'fail');
            setTimeout(() => setCopied(null), 1800);
          }}
        >
          {copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Copy failed' : 'Copy'}
        </button>
      </div>
      {warn && <div className="text-[11px] text-amber-300/80">{warn}</div>}
    </div>
  );
}

export function RoomShare({ snapshot, token }: { snapshot: AttackerRoomSnapshot; token: string }) {
  const [reveal, setReveal] = useState(false);
  const origin = window.location.origin;
  const defender = `${origin}/blue/${snapshot.roomCode}`;
  const attacker = `${origin}/red#room=${snapshot.roomCode}&key=${token}`;
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-slate-400">Room code (give to Blue Team)</div>
        <div data-testid="room-code" className="font-mono text-3xl font-semibold tracking-[0.3em] text-rose-200">
          {snapshot.roomCode}
        </div>
      </div>
      <CopyRow label="Public defender link (safe to share)" value={defender} testId="defender-link" />
      <CopyRow
        label="Private attacker control link (Red only)"
        value={attacker}
        display={reveal ? attacker : `${origin}/red#room=${snapshot.roomCode}&key=••••••••••••`}
        testId="attacker-link"
        warn="Anyone with this link can edit the hidden scenario. Never show it to Blue or on the projector."
      />
      <button className="text-xs text-slate-400 underline hover:text-slate-200" onClick={() => setReveal((r) => !r)}>
        {reveal ? 'Hide private link' : 'Reveal private link'}
      </button>
    </div>
  );
}

export function StateBadge({ snapshot }: { snapshot: AttackerRoomSnapshot }) {
  const color = snapshot.state === 'DRAFT' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300';
  return (
    <span data-testid="state-badge" data-state={snapshot.state} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>
      {snapshot.state === 'LOCKED' ? '🔒 LOCKED' : snapshot.state}
    </span>
  );
}

export function CategoryPicker({ value, onChange, disabled }: { value: number; onChange: (i: number) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-1.5">
      {OBJECT_CATEGORIES.map((c, i) => (
        <label
          key={c.subtype}
          data-testid={`category-${c.subtype}`}
          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
            value === i ? 'border-rose-400/70 bg-rose-500/10' : 'border-white/10 hover:bg-white/5'
          } ${disabled ? 'opacity-50' : ''}`}
        >
          <input type="radio" className="sr-only" checked={value === i} onChange={() => onChange(i)} disabled={disabled} />
          <span className="h-3 w-3 rounded-full" style={{ background: SUBTYPE_STYLE[c.subtype].color }} />
          <span className="flex-1">{c.label}</span>
          <span className="text-[10px] text-slate-500">{c.kind}</span>
        </label>
      ))}
    </div>
  );
}

export function ObjectEditor({
  object,
  editable,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  object: ScenarioObject;
  editable: boolean;
  busy: boolean;
  onSave: (patch: { kind: string; subtype: string; x: string; z: string }) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const catIndex = OBJECT_CATEGORIES.findIndex((c) => c.kind === object.kind && c.subtype === object.subtype);
  const [cat, setCat] = useState(catIndex);
  const [x, setX] = useState(String(object.x));
  const [z, setZ] = useState(String(object.z));
  const [confirm, setConfirm] = useState(false);

  // Reset the draft whenever the server version of this object changes.
  useEffect(() => {
    setCat(catIndex);
    setX(String(object.x));
    setZ(String(object.z));
    setConfirm(false);
  }, [object.id, object.revision, catIndex, object.x, object.z]);

  return (
    <div data-testid="object-editor" data-id={object.id} className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{categoryLabel(object.kind, object.subtype)}</div>
          <div className="font-mono text-[11px] text-slate-500">
            ID {object.id} · rev {object.revision}
          </div>
        </div>
        <button className="text-xs text-slate-400 hover:text-slate-200" onClick={onClose}>
          Close
        </button>
      </div>
      <select
        data-testid="edit-category"
        className={input}
        value={cat}
        disabled={!editable}
        onChange={(e) => setCat(Number(e.target.value))}
      >
        {OBJECT_CATEGORIES.map((c, i) => (
          <option key={c.subtype} value={i}>
            {c.label}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-400">
          X
          <input data-testid="edit-x" className={input} value={x} disabled={!editable} onChange={(e) => setX(e.target.value)} inputMode="decimal" />
        </label>
        <label className="text-xs text-slate-400">
          Z
          <input data-testid="edit-z" className={input} value={z} disabled={!editable} onChange={(e) => setZ(e.target.value)} inputMode="decimal" />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          data-testid="save-object"
          className={btnPrimary}
          disabled={!editable || busy}
          onClick={() => onSave({ kind: OBJECT_CATEGORIES[cat].kind, subtype: OBJECT_CATEGORIES[cat].subtype, x, z })}
        >
          Save changes
        </button>
        {!confirm ? (
          <button data-testid="delete-object" className={btnGhost} disabled={!editable || busy} onClick={() => setConfirm(true)}>
            Delete
          </button>
        ) : (
          <>
            <button data-testid="confirm-delete" className={`${btn} bg-red-700 text-white hover:bg-red-600`} disabled={busy} onClick={onDelete}>
              Confirm delete
            </button>
            <button className={btnGhost} onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ObjectList({
  objects,
  selectedId,
  onSelect,
}: {
  objects: ScenarioObject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (objects.length === 0) return <p className="text-sm text-slate-500">No objects placed yet.</p>;
  return (
    <div data-testid="object-list" className="max-h-72 overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="pb-1 font-normal">Type</th>
            <th className="pb-1 font-normal">X</th>
            <th className="pb-1 font-normal">Z</th>
            <th className="pb-1 font-normal">ID</th>
            <th className="pb-1 font-normal">Rev</th>
          </tr>
        </thead>
        <tbody>
          {objects.map((o) => (
            <tr
              key={o.id}
              data-testid="object-row"
              data-id={o.id}
              data-subtype={o.subtype}
              data-x={o.x}
              data-z={o.z}
              onClick={() => onSelect(o.id)}
              className={`cursor-pointer border-t border-white/5 ${o.id === selectedId ? 'bg-yellow-400/10' : 'hover:bg-white/5'}`}
            >
              <td className="py-1.5">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: SUBTYPE_STYLE[o.subtype].color }} />
                {SUBTYPE_STYLE[o.subtype].short}
                <span className="ml-1 text-[10px] text-slate-500">{o.kind === 'DECOY' ? 'decoy' : 'hazard'}</span>
              </td>
              <td className="font-mono">{o.x.toFixed(1)}</td>
              <td className="font-mono">{o.z.toFixed(1)}</td>
              <td className="font-mono text-[11px] text-slate-500">{o.id.slice(0, 8)}</td>
              <td className="font-mono text-[11px] text-slate-500">{o.revision}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function History({ events }: { events: ScenarioAuditEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">No changes yet.</p>;
  const describe = (e: ScenarioAuditEvent) => {
    const a = e.after as Record<string, unknown> | null;
    const b = e.before as Record<string, unknown> | null;
    const pos = (v: Record<string, unknown> | null) => (v && 'x' in v ? `(${v.x}, ${v.z})` : '');
    switch (e.action) {
      case 'CREATE':
        return `Placed ${String(a?.subtype).toLowerCase()} at ${pos(a)}`;
      case 'MOVE':
        return `Moved ${pos(b)} → ${pos(a)}`;
      case 'UPDATE':
        return `Changed ${String(b?.subtype).toLowerCase()} → ${String(a?.subtype).toLowerCase()} ${pos(a)}`;
      case 'DELETE':
        return `Deleted ${String(b?.subtype).toLowerCase()} at ${pos(b)}`;
      case 'LOCK':
        return 'Scenario locked';
      case 'MODE_CHANGE':
        return `Mode → ${String(a?.mode)}`;
      case 'STATE_CHANGE':
        return `State → ${String(a?.state)}`;
    }
  };
  return (
    <ol data-testid="history" className="max-h-56 space-y-1 overflow-auto text-xs">
      {events.map((e) => (
        <li key={e.id} className="flex gap-2">
          <span className="w-9 shrink-0 font-mono text-slate-500">r{e.revision}</span>
          <span className="w-24 shrink-0 whitespace-nowrap font-mono text-slate-500">{new Date(e.serverTime).toLocaleTimeString()}</span>
          <span className="text-slate-300">{describe(e)}</span>
        </li>
      ))}
    </ol>
  );
}
