// MG-011: true non-loopback IPv4 bind test on the CI host network interface.
// Two separate Socket.IO client instances make independent TCP connections.
// This does NOT substitute for a second physical phone or internet tunnel QA.
import assert from 'node:assert/strict';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol.js';
import { createMineGuardServer } from '../src/app.js';

const ipv4 = Object.values(os.networkInterfaces()).flatMap((x) => x ?? [])
  .find((item) => item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.'))?.address;

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

async function socketAt(base: string): Promise<ClientSocket> {
  const socket: ClientSocket = connect(base, { transports: ['websocket'], reconnection: false, timeout: 5000, forceNew: true });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Non-loopback socket connect timed out')), 7000);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.once('connect_error', (err) => { clearTimeout(timer); reject(err); });
    });
    return socket;
  } catch (e) {
    socket.disconnect();
    throw e;
  }
}

test('MG-011 CI: one all-interface server accepts two independent TCP clients via real non-loopback host IP', {
  skip: !ipv4 && 'No non-loopback IPv4 interface is available on this CI machine',
}, async () => {
  const instance = createMineGuardServer({ dbPath: ':memory:' });
  let red: ClientSocket | undefined;
  let blue: ClientSocket | undefined;
  let secondBlue: ClientSocket | undefined;
  try {
    await new Promise<void>((resolve) => instance.httpServer.listen(0, '0.0.0.0', resolve));
    const port = (instance.httpServer.address() as AddressInfo).port;
    const origin = 'http://' + ipv4 + ':' + port;
    const res = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(6000) });
    assert.equal(res.status, 200);
    const health = await res.json() as { status: string; service: string };
    assert.equal(health.status, 'ok');
    assert.equal(health.service, 'mineguard-server');

    const roomRes = await fetch(origin + '/api/rooms', { method: 'POST' });
    assert.equal(roomRes.status, 201);
    const room = await roomRes.json() as { roomCode: string; attackerToken: string };
    assert.ok(room.attackerToken.length > 35);

    [red, blue] = await Promise.all([socketAt(origin), socketAt(origin)]);
    assert.notEqual(red.id, blue.id);
    const [redJoin, blueJoin] = await Promise.all([
      red.timeout(5000).emitWithAck('room:join', { roomCode: room.roomCode, attackerToken: room.attackerToken }),
      blue.timeout(5000).emitWithAck('room:join', { roomCode: room.roomCode }),
    ]);
    assert.equal(redJoin.ok, true);
    assert.equal(blueJoin.ok, true);
    if (!redJoin.ok || !blueJoin.ok) throw Error('Unexpected rejected room join');
    assert.equal(redJoin.role, 'attacker');
    assert.equal(blueJoin.role, 'defender');
    assert.ok(!JSON.stringify(blueJoin).includes(room.attackerToken));
    assert.ok(!('objects' in blueJoin.snapshot));

    const publicPush = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Blue public Socket.IO update not received via LAN')), 6000);
      blue!.once('room:public-snapshot', (snapshot) => {
        clearTimeout(timer);
        resolve(JSON.stringify(snapshot));
      });
    });
    const privatePush = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Red private Socket.IO update not received via LAN')), 6000);
      red!.once('room:attacker-snapshot', (snapshot) => {
        clearTimeout(timer);
        resolve(JSON.stringify(snapshot));
      });
    });
    const object = await fetch(origin + '/api/rooms/' + room.roomCode + '/attacker/objects', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + room.attackerToken, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'HAZARD', subtype: 'SURFACE', x: 71.3, z: 82.4 }),
    });
    assert.equal(object.status, 201);
    const body = await object.json() as { result: { id: string } };
    const [pub, priv] = await Promise.all([publicPush, privatePush]);
    assert.ok(priv.includes(body.result.id));
    assert.ok(!pub.includes(body.result.id));
    assert.ok(!pub.includes('71.3') && !pub.includes('82.4'));
    assert.ok(!pub.includes(room.attackerToken));

    const noToken = await fetch(origin + '/api/rooms/' + room.roomCode + '/attacker/snapshot');
    assert.equal(noToken.status, 401);

    // Simulate a client returning after network loss, without changing room state.
    blue.disconnect();
    secondBlue = await socketAt(origin);
    const rejoined = await secondBlue.timeout(5000).emitWithAck('room:join', { roomCode: room.roomCode });
    assert.equal(rejoined.ok, true);
    if (!rejoined.ok) throw Error(rejoined.message);
    assert.equal(rejoined.snapshot.scenarioRevision, 1);
    assert.ok(!JSON.stringify(rejoined.snapshot).includes(body.result.id));
    const active = await (await fetch(origin + '/api/health')).json() as { socketClients: number };
    assert.ok(active.socketClients >= 2);
  } finally {
    red?.disconnect();
    blue?.disconnect();
    secondBlue?.disconnect();
    instance.io.close();
    if (instance.httpServer.listening) {
      await new Promise<void>((resolve, reject) => instance.httpServer.close((err) => err ? reject(err) : resolve()));
    }
  }
});
