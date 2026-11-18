// Den lokala studion: serverns egna vägar (api.ts) och sidorna under src/ (Vite) i samma process.
//
//   npm run dev    i terminalen; Ctrl+C stoppar
//   npm start      i bakgrunden, dold, med logg i output/; npm stop stoppar (background.ts)
//
// Båda kör filen med Nodes --watch: när en fil som servern läser ändras startas den om, och Labbets sida laddar om sig
// själv när servern svarar igen. PORT väljer port (port.ts), STUDIO_DATA en annan mapp med content/ och assets/
// (studioRoot i src/pipeline/registry.ts). `node src/pipeline/shoot.ts` startar filen direkt, på en egen port.

import { existsSync, realpathSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { registerPath, studioRoot } from '../pipeline/registry.ts';
import { askedLocally, createApi, type Api } from './api.ts';
import { sendText } from './files.ts';
import { HOST, studioPort } from './port.ts';

type Pages = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;

/** Svarar på en förfrågan: bara till localhost, / till Labbet, sedan serverns vägar, sedan sidorna. Ett fel svaras med sitt skäl. */
export function handler(api: Api, pages: Pages): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    try {
      if (!askedLocally(request)) return sendText(response, 403, 'Servern svarar bara på localhost');
      const path = (request.url ?? '/').split('?')[0];
      if (path === '/' || path === '/lab') {
        response.writeHead(302, { Location: '/lab/' }).end();
        return;
      }
      if (await api(request, response)) return;
      pages(request, response, () => sendText(response, 404, 'Sidan finns inte'));
    } catch (error) {
      console.error(error);
      if (response.headersSent) response.destroy();
      else sendText(response, 500, `Serverfel: ${(error as Error).message}`);
    }
  };
}

const clock = (): string => new Date().toTimeString().slice(0, 8);

async function serve(): Promise<void> {
  const port = studioPort();
  // Mappens namn med den stavning den har på disken: Vite räknar sin cache ur det, och c:\ mot C:\ (startad ur olika
  // skal) gör annars om beroendena vid varje start, för alla servrar som delar cachen.
  const code = realpathSync.native(resolve(import.meta.dirname, '..', '..'));
  const data = studioRoot();
  if (!existsSync(registerPath(data))) console.error(`Obs: ${registerPath(data)} finns inte. Labbet visar felet tills registret finns.`);

  // Vite läses först här, så att den som bara vill ha handler() (testerna) inte laddar den.
  const { createServer: createVite } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const server = createServer();
  // STUDIO_STILL=1 (en server som shoot.ts startar för förlagor): sidorna laddas inte om när en fil under src/ ändras,
  // så att en förlaga inte börjar om mitt i när någon skriver i koden.
  const still = process.env.STUDIO_STILL === '1';
  const vite = await createVite({
    configFile: false,
    root: join(code, 'src'),
    cacheDir: join(code, 'node_modules', '.vite'),
    appType: 'mpa',
    plugins: [react()],
    server: { middlewareMode: true, hmr: still ? false : { server }, ...(still ? { watch: null } : {}) },
    clearScreen: false,
  });
  server.on('request', handler(createApi(data), vite.middlewares));

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} är upptagen. Studion kör kanske redan: http://localhost:${port}/lab/`);
      console.error('Välj annars en annan port, till exempel: $env:PORT=5311; npm run dev');
    } else {
      console.error(error);
    }
    process.exit(1);
  });

  // Ctrl+C och en vanlig stoppsignal: sluta ta emot, stäng Vite och förbindelserna, och gå. Hänger något går den ändå efter 3 s.
  let stopping = false;
  const stop = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log(`${clock()} ${signal}: servern stänger`);
    setTimeout(() => process.exit(0), 3000).unref();
    server.close();
    server.closeAllConnections();
    await vite.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));

  server.listen(port, HOST, () => {
    console.log(`${clock()} Labbet: http://localhost:${port}/lab/ (process ${process.pid})`);
    if (!existsSync(data) || realpathSync.native(data) !== code) console.log(`Data läses ur ${data}`);
  });
}

if (import.meta.main) {
  await serve().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
