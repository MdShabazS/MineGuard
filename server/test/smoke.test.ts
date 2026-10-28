import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, HealthResponse, ServerHello, ServerToClientEvents } from '../../shared/protocol.js';
import { clientDist, createMineGuardServer } from '../src/app.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const { httpServer, io } = createMineGuardServer({ dbPath: ':memory:' });
let baseUrl = '';

before(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

after(async () => {
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
});

function openClient(): Promise<{ socket: ClientSocket; hello: ServerHello }> {
  return new Promise((resolve, reject) => {
    const socket: ClientSocket = connect(baseUrl, { transports: ['websocket'], reconnection: false });
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 5000);
    socket.once('server:hello', (hello) => {
      clearTimeout(timer);
      resolve({ socket, hello });
    });
    socket.once('connect_error', reject);
  });
}

test('GET /api/health returns ok status', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as HealthResponse;
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'mineguard-server');
  assert.equal(body.version, '0.1.0');
  assert.ok(!Number.isNaN(Date.parse(body.serverTime)));
});

test('unknown /api route returns JSON 404', async () => {
  const res = await fetch(`${baseUrl}/api/does-not-exist`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not found' });
});

test('socket receives server:hello and system:ping is acknowledged', async () => {
  const { socket, hello } = await openClient();
  try {
    assert.equal(hello.socketId, socket.id);
    const reply = await socket.timeout(5000).emitWithAck('system:ping', 'smoke');
    assert.equal(reply.pong, true);
    assert.equal(reply.echo, 'smoke');
  } finally {
    socket.disconnect();
  }
});

test('two clients (Red + Blue tabs) connect at once and are counted', async () => {
  const red = await openClient();
  const blue = await openClient();
  try {
    assert.notEqual(red.hello.socketId, blue.hello.socketId);
    const body = (await (await fetch(`${baseUrl}/api/health`)).json()) as HealthResponse;
    assert.ok(body.socketClients >= 2, `expected >= 2 clients, got ${body.socketClients}`);
  } finally {
    red.socket.disconnect();
    blue.socket.disconnect();
  }
});

const built = fs.existsSync(path.join(clientDist, 'index.html'));

test('built client is served on one origin for /, /red and /blue', { skip: !built && 'run "npm run build" first' }, async () => {
  for (const route of ['/', '/red', '/blue']) {
    const res = await fetch(`${baseUrl}${route}`);
    assert.equal(res.status, 200, route);
    const html = await res.text();
    assert.match(html, /<div id="root"><\/div>/, route);
    const asset = html.match(/src="(\/assets\/[^"]+\.js)"/);
    assert.ok(asset, `no JS bundle referenced for ${route}`);
    const js = await fetch(`${baseUrl}${asset[1]}`);
    assert.equal(js.status, 200, `bundle for ${route}`);
  }
});
