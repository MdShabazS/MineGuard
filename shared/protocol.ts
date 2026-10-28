// Types shared by client and server. Later tasks extend this with room,
// scenario, mission and observation messages (see docs/API_CONTRACT.md).

import type { AttackerRoomSnapshot, ErrorCode, PublicRoomSnapshot } from './scenario.js';

export const APP_NAME = 'MineGuard V0.1';
export const APP_VERSION = '0.1.0';

export interface HealthResponse {
  status: 'ok';
  service: 'mineguard-server';
  version: string;
  uptimeSeconds: number;
  serverTime: string;
  socketClients: number;
}

export interface ServerHello {
  socketId: string;
  serverTime: string;
  version: string;
}

export interface PingAck {
  pong: true;
  serverTime: string;
  echo: string;
}

export interface RoomJoinRequest {
  roomCode: string;
  /** Present only for Red; proves the private attacker capability. */
  attackerToken?: string;
}

export type RoomJoinReply =
  | { ok: true; role: 'attacker'; snapshot: AttackerRoomSnapshot }
  | { ok: true; role: 'defender'; snapshot: PublicRoomSnapshot }
  | { ok: false; error: ErrorCode; message: string };

export interface ServerToClientEvents {
  'server:hello': (hello: ServerHello) => void;
  /** Sent to defender (public) sockets: room metadata only, never objects. */
  'room:public-snapshot': (snapshot: PublicRoomSnapshot) => void;
  /** Sent only to sockets that joined with a valid attacker token. */
  'room:attacker-snapshot': (snapshot: AttackerRoomSnapshot) => void;
}

export interface ClientToServerEvents {
  'system:ping': (echo: string, ack: (reply: PingAck) => void) => void;
  'room:join': (req: RoomJoinRequest, ack: (reply: RoomJoinReply) => void) => void;
  'room:leave': () => void;
}
