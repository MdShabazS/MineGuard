// Types shared by client and server. Later tasks extend this with room,
// scenario, mission and observation messages (see docs/API_CONTRACT.md).

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

export interface ServerToClientEvents {
  'server:hello': (hello: ServerHello) => void;
}

export interface ClientToServerEvents {
  'system:ping': (echo: string, ack: (reply: PingAck) => void) => void;
}
