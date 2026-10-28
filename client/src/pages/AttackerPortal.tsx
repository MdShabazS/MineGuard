import { useCallback, useEffect, useMemo, useState } from 'react';
import { OBJECT_CATEGORIES, canEditObjects, type AttackerRoomSnapshot } from '../../../shared/scenario';
import type { Vec2 } from '../../../shared/world';
import { ApiFailure, attackerApi, createRoom, type MutationReply } from '../lib/api';
import { useRoomSocket } from '../lib/useRoomSocket';
import { Card, CategoryPicker, History, ObjectEditor, ObjectList, RoomShare, StateBadge, btnGhost, btnPrimary, input } from '../red/RedPanels';
import ObjectMarkers from '../world/ObjectMarkers';
import WorldView from '../world/WorldView';
import PortalLayout from './PortalLayout';

interface Creds {
  room: string;
  key: string;
}

// The private capability travels in the URL fragment (#room=..&key=..), which the
// browser never sends to the server, so it survives refresh without being logged.
function readHash(): Creds | null {
  const p = new URLSearchParams(window.location.hash.slice(1));
  const room = p.get('room');
  const key = p.get('key');
  return room && key ? { room: room.toUpperCase(), key } : null;
}

export default function AttackerPortal() {
  const [creds, setCreds] = useState<Creds | null>(readHash);
  const { join, connected, apply } = useRoomSocket<AttackerRoomSnapshot>(creds?.room ?? null, creds?.key);
  const api = useMemo(() => (creds ? attackerApi(creds.room, creds.key) : null), [creds]);

  const [category, setCategory] = useState(0);
  const [placeMode, setPlaceMode] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Vec2 | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [x, setX] = useState('');
  const [z, setZ] = useState('');

  useEffect(() => {
    const onHash = () => setCreds(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const snapshot = join.status === 'joined' ? join.snapshot : null;
  const editable = !!snapshot && canEditObjects(snapshot.mode, snapshot.state);
  const selected = snapshot?.objects.find((o) => o.id === selectedId) ?? null;

  // Drop the selection if the object disappears (deleted here or in another Red tab).
  useEffect(() => {
    if (selectedId && snapshot && !selected) setSelectedId(null);
  }, [selectedId, snapshot, selected]);

  /** Runs a server mutation; the UI only changes from the server-confirmed snapshot. */
  const run = useCallback(
    async <T,>(fn: () => Promise<MutationReply<T>>): Promise<MutationReply<T> | null> => {
      setBusy(true);
      setError(null);
      try {
        const reply = await fn();
        apply(reply.snapshot);
        return reply;
      } catch (err) {
        setError(err instanceof ApiFailure ? `${err.message} (${err.code})` : String(err));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  const placeAt = async (px: unknown, pz: unknown, ghost: Vec2 | null) => {
    if (!api) return;
    const c = OBJECT_CATEGORIES[category];
    setPending(ghost);
    const reply = await run(() => api.createObject({ kind: c.kind, subtype: c.subtype, x: px, z: pz }));
    setPending(null);
    if (reply?.result) setSelectedId(reply.result.id);
  };

  const onPick = (p: Vec2) => {
    setX(String(p[0]));
    setZ(String(p[1]));
    if (placeMode && editable && !busy) placeAt(p[0], p[1], p);
  };

  const startRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await createRoom();
      window.location.hash = `room=${r.roomCode}&key=${r.attackerToken}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const banner = error && (
    <div data-testid="error-banner" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
      {error}
    </div>
  );

  if (!creds) {
    return (
      <PortalLayout team="red" title="Red Team — Scenario Builder" subtitle="Attacker portal">
        <Card title="START">
          <p className="mb-4 text-sm text-slate-300">
            Create a room to build a fictional scenario. You will get a room code for Blue and a private link that lets only you edit hidden
            objects. Already have a private attacker link? Open it to resume.
          </p>
          <button data-testid="create-room" className={btnPrimary} onClick={startRoom} disabled={busy}>
            Create Room
          </button>
          <div className="mt-3">{banner}</div>
        </Card>
        <WorldView />
      </PortalLayout>
    );
  }

  return (
    <PortalLayout team="red" title="Red Team — Scenario Builder" subtitle="Attacker portal">
      {join.status === 'error' && (
        <Card title="CANNOT OPEN ROOM">
          <p className="mb-3 text-sm text-rose-200" data-testid="join-error">
            {join.message} ({join.error})
          </p>
          <button
            className={btnGhost}
            onClick={() => {
              window.location.hash = '';
            }}
          >
            Start over
          </button>
        </Card>
      )}
      {banner}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <WorldView
            onPick={onPick}
            crosshair={placeMode && editable}
            renderScene={(world) =>
              snapshot && (
                <ObjectMarkers world={world} objects={snapshot.objects} selectedId={selectedId} onSelect={setSelectedId} pending={pending} />
              )
            }
            overlay={
              <div className="pointer-events-none absolute right-3 top-3 flex gap-2">
                <span className="rounded bg-black/60 px-2 py-1 text-[11px] font-semibold tracking-widest text-rose-200">RED VIEW · HIDDEN FROM BLUE</span>
                {snapshot && placeMode && editable && (
                  <span className="rounded bg-rose-600/80 px-2 py-1 text-[11px] font-semibold text-white">
                    CLICK TO PLACE: {OBJECT_CATEGORIES[category].subtype}
                  </span>
                )}
                {pending && <span className="rounded bg-white/20 px-2 py-1 text-[11px] text-white">Saving…</span>}
              </div>
            }
          />
          <Card title={`SCENARIO OBJECTS${snapshot ? ` · ${snapshot.objects.length}/${snapshot.maxActiveObjects}` : ''}`}>
            {snapshot ? <ObjectList objects={snapshot.objects} selectedId={selectedId} onSelect={setSelectedId} /> : <p className="text-sm text-slate-500">Loading…</p>}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="ROOM" testId="room-panel">
            {snapshot ? (
              <div className="space-y-4">
                <RoomShare snapshot={snapshot} token={creds.key} />
                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                  <StateBadge snapshot={snapshot} />
                  <span data-testid="scenario-mode" className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold">
                    {snapshot.mode}
                  </span>
                  <span data-testid="scenario-revision" className="font-mono text-xs text-slate-400">
                    rev {snapshot.scenarioRevision}
                  </span>
                  <span className={`ml-auto text-xs ${connected ? 'text-emerald-400' : 'text-rose-400'}`}>{connected ? '● live' : '● offline'}</span>
                </div>
                <div className="flex gap-2">
                  {(['CHALLENGE', 'LIVE'] as const).map((m) => (
                    <button
                      key={m}
                      data-testid={`mode-${m}`}
                      className={snapshot.mode === m ? btnPrimary : btnGhost}
                      disabled={busy || snapshot.state !== 'DRAFT' || snapshot.mode === m}
                      onClick={() => api && run(() => api.setMode(m))}
                    >
                      {m === 'CHALLENGE' ? 'Challenge' : 'Live'}
                    </button>
                  ))}
                  <button
                    data-testid="lock-scenario"
                    className={`${btnGhost} ml-auto`}
                    disabled={busy || snapshot.mode !== 'CHALLENGE' || snapshot.state !== 'DRAFT'}
                    onClick={() => api && run(() => api.lock())}
                  >
                    🔒 Lock Scenario
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  {snapshot.mode === 'CHALLENGE'
                    ? 'Challenge: place everything, then lock before the defence flight. Locked scenarios cannot be edited.'
                    : 'Live: objects stay editable during the mission; every change is time-stamped in the private history.'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">{join.status === 'error' ? 'Unavailable.' : 'Connecting to room…'}</p>
            )}
          </Card>

          {snapshot && (
            <>
              <Card title="PLACE OBJECTS">
                <CategoryPicker value={category} onChange={setCategory} disabled={!editable} />
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input data-testid="place-toggle" type="checkbox" checked={placeMode} onChange={(e) => setPlaceMode(e.target.checked)} />
                  Click terrain to place (drag still rotates the view)
                </label>
                <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <label className="text-xs text-slate-400">
                    X (0–200)
                    <input data-testid="coord-x" className={input} value={x} onChange={(e) => setX(e.target.value)} inputMode="decimal" />
                  </label>
                  <label className="text-xs text-slate-400">
                    Z (0–200)
                    <input data-testid="coord-z" className={input} value={z} onChange={(e) => setZ(e.target.value)} inputMode="decimal" />
                  </label>
                  <button data-testid="add-object" className={btnPrimary} disabled={!editable || busy} onClick={() => placeAt(x, z, null)}>
                    Add
                  </button>
                </div>
                {!editable && <p className="mt-2 text-xs text-amber-300">Scenario is {snapshot.state}: objects can no longer be changed.</p>}
              </Card>

              <Card title="SELECTED OBJECT">
                {selected ? (
                  <ObjectEditor
                    object={selected}
                    editable={editable}
                    busy={busy}
                    onClose={() => setSelectedId(null)}
                    onSave={(p) => api && run(() => api.updateObject(selected.id, { baseRevision: selected.revision, ...p }))}
                    onDelete={async () => {
                      if (api && (await run(() => api.deleteObject(selected.id, selected.revision)))) setSelectedId(null);
                    }}
                  />
                ) : (
                  <p className="text-sm text-slate-500">Click a marker or a list row to select it.</p>
                )}
              </Card>

              <Card title="PRIVATE HISTORY">
                <History events={snapshot.history} />
              </Card>
            </>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
