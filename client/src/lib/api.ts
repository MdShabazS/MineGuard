import type { MissionCommand, MissionErrorCode, MissionPlan, MissionSnapshot } from '../../../shared/mission';
import type { FrozenMissionResult, RevealState } from '../../../shared/results';
import type { ApiError, AttackerRoomSnapshot, CreateRoomResponse, ScenarioObject } from '../../../shared/scenario';

export class ApiFailure extends Error {
  constructor(
    public code: ApiError['error'] | MissionErrorCode | 'NETWORK' | 'REPORT_NOT_READY' | 'MISSION_NOT_FINISHED' | 'REPORT_HISTORY_UNAVAILABLE',
    message: string,
    public current?: ScenarioObject,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiFailure('NETWORK', 'Cannot reach the MineGuard server. Check the connection.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiFailure(data?.error ?? 'NETWORK', data?.message ?? `Server error (HTTP ${res.status})`, data?.current);
  return data as T;
}

export interface MutationReply<T = unknown> {
  result?: T;
  snapshot: AttackerRoomSnapshot;
}

export const createRoom = () => request<CreateRoomResponse>('POST', '/api/rooms');

export function attackerApi(roomCode: string, token: string) {
  const base = `/api/rooms/${encodeURIComponent(roomCode)}/attacker`;
  return {
    createObject: (body: { kind: string; subtype: string; x: unknown; z: unknown }) =>
      request<MutationReply<ScenarioObject>>('POST', `${base}/objects`, body, token),
    updateObject: (id: string, body: Record<string, unknown>) =>
      request<MutationReply<ScenarioObject>>('PATCH', `${base}/objects/${encodeURIComponent(id)}`, body, token),
    deleteObject: (id: string, baseRevision: number) =>
      request<MutationReply>('DELETE', `${base}/objects/${encodeURIComponent(id)}?baseRevision=${baseRevision}`, undefined, token),
    setMode: (mode: 'CHALLENGE' | 'LIVE') => request<MutationReply>('POST', `${base}/mode`, { mode }, token),
    lock: () => request<MutationReply>('POST', `${base}/lock`, undefined, token),
  };
}

export function missionApi(roomCode: string) {
  const base = `/api/rooms/${encodeURIComponent(roomCode)}/mission`;
  return {
    get: () => request<MissionSnapshot>('GET', base),
    plan: (body: Record<string, unknown>) => request<{ plan: MissionPlan; snapshot: MissionSnapshot }>('POST', `${base}/plan`, body),
    command: (cmd: MissionCommand) => request<{ snapshot: MissionSnapshot }>('POST', `${base}/command`, cmd),
    review: (candidateId: string, review: 'NEW' | 'REVIEWED') =>
      request<{ candidate: unknown }>('PATCH', `${base}/observations/${encodeURIComponent(candidateId)}/review`, { review }),
    resultState: (missionId: string) => request<RevealState>('GET', `${base}/${encodeURIComponent(missionId)}/reveal-state`),
    results: (missionId: string) => request<{ result: FrozenMissionResult }>('GET', `${base}/${encodeURIComponent(missionId)}/results`),
    reveal: (missionId: string) => request<{ result: FrozenMissionResult }>('POST', `${base}/${encodeURIComponent(missionId)}/reveal`),
    printUrl: (missionId: string) => `${base}/${encodeURIComponent(missionId)}/report`,
  };
}

/** Copy text, with a fallback for plain-HTTP LAN addresses where navigator.clipboard is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok;
}
