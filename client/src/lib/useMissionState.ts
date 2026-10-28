import { useCallback, useState } from 'react';
import type { MissionSnapshot, MissionTelemetry } from '../../../shared/mission';
import type { PublicCandidate } from '../../../shared/sensor';
import type { MissionHandlers } from './useRoomSocket';

/** Keep the newest telemetry: a different mission replaces it, the same mission only moves forward. */
function newer(prev: MissionTelemetry | null, next: MissionTelemetry | null): MissionTelemetry | null {
  if (!next) return prev;
  if (!prev || prev.missionId !== next.missionId) return next;
  return next.sequence >= prev.sequence ? next : prev;
}

/**
 * Mission state from socket pushes and HTTP replies. Candidates are keyed by
 * candidateId, so a snapshot plus the same live event never shows a duplicate pin.
 */
export function useMissionState() {
  const [mission, setMission] = useState<MissionSnapshot | null>(null);
  const [telemetry, setTelemetry] = useState<MissionTelemetry | null>(null);
  const [candidates, setCandidates] = useState<PublicCandidate[]>([]);

  const onMissionSnapshot = useCallback((s: MissionSnapshot) => {
    setMission(s);
    setTelemetry((prev) => newer(prev, s.mission));
    setCandidates(s.candidates);
  }, []);

  const handlers: MissionHandlers = {
    onMissionSnapshot,
    onTelemetry: (t) => setTelemetry((prev) => newer(prev, t)),
    onCandidate: (c) =>
      setCandidates((prev) => {
        if (prev.some((p) => p.candidateId === c.candidateId)) return prev;
        // A candidate for another mission means our list is stale; the next snapshot will replace it.
        const keep = prev.length && prev[0].missionId !== c.missionId ? [] : prev;
        return [...keep, c].sort((a, b) => a.number - b.number);
      }),
  };

  return { mission, telemetry, candidates, onMissionSnapshot, handlers };
}
