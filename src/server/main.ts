// Startar den lokala studion: serverns egna vägar och sidorna under src/ i samma process.
// Körs med `npm run dev`.

import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { createServer as createVite } from 'vite';
import { createApi } from './api.ts';
import { sendText } from './files.ts';

const root = resolve(import.meta.dirname, '..', '..');
const host = '127.0.0.1';
const port = Number(process.env.PORT) || 5310;

// STUDIO_DATA pekar ut en annan mapp med content/ och assets/, för att pröva studion utan att röra de riktiga registren.
const data = process.env.STUDIO_DATA ? resolve(process.env.STUDIO_DATA) : root;
const api = createApi(data);

const server = createServer(async (request, response) => {
  try {
    const path = (request.url ?? '/').split('?')[0];
    if (path === '/' || path === '/lab') {
      response.writeHead(302, { Location: '/lab/' }).end();
      return;
    }
    if (await api(request, response)) return;
    vite.middlewares(request, response, () => sendText(response, 404, 'Sidan finns inte'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendText(response, 500, 'Serverfel, se terminalen');
    else response.destroy();
  }
});

const vite = await createVite({
  configFile: false,
  root: join(root, 'src'),
  cacheDir: join(root, 'node_modules', '.vite'),
  appType: 'mpa',
  plugins: [react()],
  server: { middlewareMode: true, hmr: { server } },
  clearScreen: false,
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} är upptagen. Studion kör kanske redan: http://localhost:${port}/lab/`);
    console.error('Välj annars en annan port: $env:PORT=5311; npm run dev');
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Labbet: http://localhost:${port}/lab/`);
  if (data !== root) console.log(`Data läses ur ${data}`);
});
