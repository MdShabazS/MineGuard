import fs from 'node:fs';
import path from 'node:path';
import { clientDist, createMineGuardServer } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const { httpServer } = createMineGuardServer();

httpServer.listen(port, () => {
  const served = fs.existsSync(path.join(clientDist, 'index.html'));
  console.log(`MineGuard server listening on http://localhost:${port}`);
  console.log(
    served
      ? 'Serving built client from client/dist'
      : 'No client build found; run "npm run dev" for the Vite client or "npm run build" first',
  );
});
