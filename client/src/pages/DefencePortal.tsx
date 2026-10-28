import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { PublicRoomSnapshot } from '../../../shared/scenario';
import { useRoomSocket } from '../lib/useRoomSocket';
import { Card, input } from '../red/RedPanels';
import WorldView from '../world/WorldView';
import PortalLayout from './PortalLayout';

const btnBlue = 'rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40';

export default function DefencePortal() {
  const { code } = useParams();
  const roomCode = code ? code.toUpperCase() : null;
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  // No attacker token: the server only ever sends public room metadata to this page.
  const { join, connected } = useRoomSocket<PublicRoomSnapshot>(roomCode);
  const snapshot = join.status === 'joined' ? join.snapshot : null;

  return (
    <PortalLayout team="blue" title="Blue Team — MineGuard Mission Control" subtitle="Defence portal">
      {!roomCode || join.status === 'error' ? (
        <Card title="JOIN A ROOM" testId="join-panel">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) navigate(`/blue/${draft.trim().toUpperCase()}`);
            }}
          >
            <label className="text-xs text-slate-400">
              Room code from Red Team
              <input
                data-testid="join-code"
                className={`${input} w-48 uppercase tracking-widest`}
                value={draft}
                maxLength={6}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="ABC234"
              />
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
        </Card>
      ) : (
        <Card title="MISSION ROOM" testId="blue-room">
          {snapshot ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-xs text-slate-400">Room </span>
                <span data-testid="blue-room-code" className="font-mono text-lg font-semibold tracking-widest text-sky-200">
                  {snapshot.roomCode}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400">Mode </span>
                <span data-testid="blue-mode">{snapshot.mode}</span>
              </div>
              <div>
                <span className="text-xs text-slate-400">Scenario </span>
                <span data-testid="blue-state">{snapshot.state}</span>
              </div>
              <div>
                <span className="text-xs text-slate-400">Revision </span>
                <span data-testid="blue-revision" className="font-mono">
                  {snapshot.scenarioRevision}
                </span>
              </div>
              <span className={`ml-auto text-xs ${connected ? 'text-emerald-400' : 'text-rose-400'}`}>{connected ? '● live' : '● reconnecting…'}</span>
              <p className="w-full text-xs text-slate-500">
                Hidden virtual objects are never sent to this portal. Candidate findings will appear only when the simulated drone scans them (MG-007/MG-008).
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Joining room {roomCode}…</p>
          )}
        </Card>
      )}
      <WorldView />
    </PortalLayout>
  );
}
