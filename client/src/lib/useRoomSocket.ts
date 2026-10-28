import { useEffect, useRef, useState } from 'react';
import type { MissionSnapshot, MissionTelemetry } from '../../../shared/mission';
import type { RoomJoinReply } from '../../../shared/protocol';
import type { PublicCandidate } from '../../../shared/sensor';
import type { AttackerRoomSnapshot, PublicRoomSnapshot } from '../../../shared/scenario';
import { connectSocket } from './socket';

export type Join<S> =
  | { status: 'idle' }
  | { status: 'joining' }
  | { status: 'joined'; snapshot: S }
  | { status: 'error'; error: string; message: string };

export interface MissionHandlers {
  onMissionSnapshot?: (s: MissionSnapshot) => void;
  onTelemetry?: (t: MissionTelemetry) => void;
  onCandidate?: (c: PublicCandidate) => void;
}

/**
 * Joins a room over Socket.IO and keeps its snapshot current. Re-joins
 * automatically after every reconnect, so refreshes and Wi-Fi drops recover.
 * With an attackerToken the server returns the private snapshot; without one,
 * public metadata only.
 */
export function useRoomSocket<S extends PublicRoomSnapshot>(roomCode: string | null, attackerToken?: string, handlers?: MissionHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const [join, setJoin] = useState<Join<S>>({ status: 'idle' });
  const [connected, setConnected] = useState(false);
  const latest = useRef<number>(-1);

  /** Apply a snapshot unless an equal-or-newer one is already shown (HTTP replies and socket pushes can race). */
  const apply = (snapshot: S) => {
    if (snapshot.scenarioRevision < latest.current) return;
    latest.current = snapshot.scenarioRevision;
    setJoin({ status: 'joined', snapshot });
  };

  useEffect(() => {
    if (!roomCode) {
      setJoin({ status: 'idle' });
      return;
    }
    latest.current = -1;
    setJoin({ status: 'joining' });
    const socket = connectSocket();
    const event = attackerToken ? 'room:attacker-snapshot' : 'room:public-snapshot';

    socket.on('connect', () => {
      setConnected(true);
      const req = attackerToken ? { roomCode, attackerToken } : { roomCode };
      socket.emit('room:join', req, (reply: RoomJoinReply) => {
        if (!reply.ok) setJoin({ status: 'error', error: reply.error, message: reply.message });
        else apply(reply.snapshot as S);
      });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on(event, (s: AttackerRoomSnapshot | PublicRoomSnapshot) => apply(s as S));
    // Registered before joining, so the snapshot the server pushes right after the join is not missed.
    socket.on('mission:snapshot', (m) => handlersRef.current?.onMissionSnapshot?.(m));
    socket.on('mission:telemetry', (t) => handlersRef.current?.onTelemetry?.(t));
    socket.on('observation:created', (c) => handlersRef.current?.onCandidate?.(c));

    return () => {
      socket.disconnect();
    };
  }, [roomCode, attackerToken]);

  return { join, connected, apply };
}
