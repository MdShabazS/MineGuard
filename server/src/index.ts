import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clientDist, createMineGuardServer } from './app.js';

// Preserve the existing all-interface binding so a second device on the same
// Wi-Fi can reach the ONE authoritative stateful server. Set MINEGUARD_HOST to
// 127.0.0.1 to restrict access to this computer.
const port = Number(process.env.PORT ?? 3000);
const host = process.env.MINEGUARD_HOST ?? '0.0.0.0';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}
const { httpServer } = createMineGuardServer();

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  console.error('MineGuard failed to listen:', err.message);
  if (err.code === 'EADDRINUSE') console.error('Choose another PORT or stop the process already using the port.');
  process.exitCode = 1;
});

httpServer.listen(port, host, () => {
  const served = fs.existsSync(path.join(clientDist, 'index.html'));
  const actual = httpServer.address();
  const actualPort = typeof actual === 'object' && actual !== null ? actual.port : port;
  console.log('MineGuard V0.1 — educational simulation only, no real landmine sensing');
  console.log('Local: http://localhost:' + actualPort);
  console.log('Binding: ' + host + ':' + actualPort);

  if (host === '0.0.0.0' || host === '::') {
    const interfaces = os.networkInterfaces();
    let available = 0;
    for (const [label, entries] of Object.entries(interfaces)) {
      for (const nic of entries ?? []) {
        if (nic.internal || nic.family !== 'IPv4' || nic.address.startsWith('169.254.')) continue;
        available++;
        console.log('Possible LAN address (' + label + '): http://' + nic.address + ':' + actualPort);
      }
    }
    if (!available) console.log('No non-loopback IPv4 address found. Check Wi-Fi/Ethernet connection.');
    console.log('LAN addresses are suggestions, NOT proof another device can connect. Test from that device.');
    console.log('Firewall: allow TCP ' + actualPort + ' on trusted/private networks only.');
    console.log('Do not port-forward this server or expose its private Red control links publicly.');
  } else {
    console.log('Loopback/restricted binding: other devices cannot use localhost to reach this computer.');
  }
  console.log(
    served
      ? 'Serving the built app on this same origin (/, /red, /blue, /api, /socket.io).'
      : 'No client build found. Run npm run build before npm start for phone/LAN access.',
  );
});
