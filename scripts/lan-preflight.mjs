#!/usr/bin/env node
// MG-011 preflight from the HOST machine. This is not a substitute for
// attempting http://HOST_LAN_IP:PORT on a separate physical phone.
import os from 'node:os';
import net from 'node:net';
import process from 'node:process';
import { io } from 'socket.io-client';

const candidateAddresses = Object.values(os.networkInterfaces()).flatMap((items) => items ?? [])
  .filter((x) => !x.internal && x.family === 'IPv4' && !x.address.startsWith('169.254.'))
  .map((x) => x.address);
const target = process.argv[2] ?? process.env.MINEGUARD_LAN_IP ?? candidateAddresses[0];
const port = Number(process.argv[3] ?? process.env.PORT ?? '3000');

if (!target || !net.isIP(target)) {
  console.error('No IPv4 interface found. Supply a host LAN IPv4 address: npm run lan:check -- 192.168.1.5 3000');
  process.exit(2);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Port must be an integer in [1,65535].');
  process.exit(2);
}
const origin = 'http://' + (net.isIP(target) === 6 ? '[' + target + ']' : target) + ':' + port;
let socket;
try {
  const health = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(7000) });
  if (!health.ok) throw Error('Health HTTP ' + health.status);
  const data = await health.json();
  if (data?.status !== 'ok' || data?.service !== 'mineguard-server') throw Error('Wrong server at specified IP/port');
  console.log('PASS: health endpoint served from ' + origin + ' (host-local network probe)');

  const home = await fetch(origin + '/', { signal: AbortSignal.timeout(7000) });
  if (!home.ok || !home.headers.get('content-type')?.includes('text/html')) throw Error('Built client is not being served; run npm run build first');
  if (!(await home.text()).includes('id="root"')) throw Error('Unexpected homepage content');
  console.log('PASS: production client served from same HTTP origin');

  const world = await fetch(origin + '/api/world', { signal: AbortSignal.timeout(7000) });
  const sharedWorld = await world.json();
  if (!world.ok || !sharedWorld.terrainId || !sharedWorld.checksum || 'objects' in sharedWorld) {
    throw Error('Shared world invalid or includes private scenario fields');
  }
  console.log('PASS: public world endpoint (no private objects)');

  socket = io(origin, { transports: ['websocket'], reconnection: false, timeout: 7000 });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('WebSocket handshake timeout')), 7500);
    socket.once('server:hello', (hello) => {
      clearTimeout(timer);
      hello?.socketId ? resolve() : reject(Error('No socket identity in hello'));
    });
    socket.once('connect_error', (err) => { clearTimeout(timer); reject(err); });
  });
  const ack = await socket.timeout(7000).emitWithAck('system:ping', 'lan-preflight');
  if (!ack?.pong || ack.echo !== 'lan-preflight') throw Error('Socket.IO realtime ping/ack failed');
  console.log('PASS: same-origin Socket.IO WebSocket handshake and round trip');
  console.log('HOST-ONLY PREFLIGHT PASS. This DOES NOT verify access from a second physical device or an HTTPS tunnel.');
  console.log('Next, open ' + origin + '/blue on an actual phone on the same private Wi-Fi.');
} catch (err) {
  console.error('PREFLIGHT FAILED: ' + (err instanceof Error ? err.message : String(err)));
  console.error('Check the MineGuard server process, correct LAN IP, client build, and firewall. Never use localhost on the phone.');
  process.exitCode = 1;
} finally {
  socket?.disconnect();
}
