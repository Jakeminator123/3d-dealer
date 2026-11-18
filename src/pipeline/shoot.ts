// Sparar förlagor ur scenen från kommandoraden: en huvudlös webbläsare öppnar Labbets sida /lab/forlaga.html med
// beställningen i adressen, scenen ritar rutorna, och servern lägger dem under output/forlagor/ (forlaga.ts).
//
//   node src/pipeline/shoot.ts <beställning.json>
//
// Filen bär en beställning eller en lista av dem (formen står i src/lab/shoot.ts): vy, dealer, bakgrund eller ateljé,
// sko, stillbild eller klipp. Svaret skrivs ut som JSON: en rad per beställning med det som sparades eller felet.
// En egen server startas på en ledig port, så att Jakobs studio på 5310 inte rörs; SHOOT_SERVER pekar ut en som redan
// går. SHOOT_BROWSER pekar ut webbläsaren om den inte står på sitt vanliga ställe.
//
// Webbläsaren styrs med DevTools-protokollet över en websocket, utan extra paket, som gamla Dealers tools/shoot.ts.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export class ShootError extends Error {}

const root = resolve(import.meta.dirname, '..', '..');
const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
// Hur länge en server, en webbläsare och en förlaga väntas in, i millisekunder.
const START_PATIENCE = 30_000;
const SHOT_PATIENCE = 15 * 60_000;
const POLL = 250;

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

async function until<T>(what: string, patience: number, attempt: () => T | null | undefined | Promise<T | null | undefined>): Promise<T> {
  const end = Date.now() + patience;
  for (;;) {
    const found = await attempt();
    if (found !== null && found !== undefined) return found;
    if (Date.now() > end) throw new ShootError(`${what} kom inte inom ${Math.round(patience / 1000)} s`);
    await sleep(POLL);
  }
}

const freePort = (): Promise<number> =>
  new Promise((done, fail) => {
    const probe = createServer();
    probe.on('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => done(port));
    });
  });

/** Startar studions server på en egen port och väntar tills den svarar. `data` är en egen mapp med content/ och assets/. */
export async function startServer(data?: string): Promise<{ url: string; stop(): void }> {
  const port = await freePort();
  // STUDIO_STILL: sidan laddas inte om när någon ändrar koden medan förlagan sparas (main.ts).
  const env = { ...process.env, PORT: String(port), STUDIO_STILL: '1', ...(data ? { STUDIO_DATA: data } : {}) };
  const child = spawn(process.execPath, ['src/server/main.ts'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let said = '';
  child.stdout!.on('data', (chunk: Buffer) => (said += chunk.toString()));
  child.stderr!.on('data', (chunk: Buffer) => (said += chunk.toString()));
  let gone = false;
  child.on('exit', () => (gone = true));
  await until('Servern', START_PATIENCE, () => {
    if (gone) throw new ShootError(`Servern startade inte: ${said.trim().split('\n').at(-1) ?? ''}`);
    return said.includes('Labbet:') ? true : null;
  });
  return { url: `http://127.0.0.1:${port}`, stop: () => void child.kill() };
}

/** Startar en huvudlös webbläsare med DevTools-protokollet på en ledig port. */
async function startBrowser(): Promise<{ port: number; stop(): void }> {
  const program = [process.env.SHOOT_BROWSER, ...BROWSERS].find((path) => path && existsSync(path));
  if (!program) throw new ShootError('Hittar ingen Chrome eller Edge. Peka ut den med SHOOT_BROWSER.');
  const profile = mkdtempSync(join(tmpdir(), 'forlaga-webblasare-'));
  const child: ChildProcess = spawn(
    program,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      '--force-device-scale-factor=1',
      '--window-size=1920,1080',
      // Scenen ritas med grafikkortet om det finns, annars i programvara. En flik som inte syns ska inte bromsas.
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const stop = (): void => {
    child.kill();
    // Webbläsaren släpper sin mapp en stund efter att den har stängts.
    setTimeout(() => rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }), 500).unref();
  };
  try {
    const port = await until('Webbläsaren', START_PATIENCE, () => {
      const file = join(profile, 'DevToolsActivePort');
      return existsSync(file) ? Number(readFileSync(file, 'utf8').split('\n')[0]) || null : null;
    });
    return { port, stop };
  } catch (error) {
    stop();
    throw error;
  }
}

/** En flik som går att fråga: uttrycket räknas på sidan och värdet kommer tillbaka. Fel på sidan samlas i `errors`. */
async function openTab(port: number, url: string): Promise<{ evaluate(expression: string): Promise<unknown>; errors: string[]; close(): Promise<void> }> {
  const opened = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!opened.ok) throw new ShootError(`Webbläsaren öppnade ingen flik (${opened.status})`);
  const target = (await opened.json()) as { id: string; webSocketDebuggerUrl: string };
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((done, fail) => {
    socket.addEventListener('open', () => done(), { once: true });
    socket.addEventListener('error', () => fail(new ShootError('Fliken svarade inte')), { once: true });
  });
  const errors: string[] = [];
  const waiting = new Map<number, (message: { result?: unknown; error?: { message: string } }) => void>();
  let next = 1;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message: string } };
    if (message.id !== undefined) {
      waiting.get(message.id)?.(message);
      waiting.delete(message.id);
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params?.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined;
      errors.push(details?.exception?.description ?? details?.text ?? 'okänt fel på sidan');
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      const args = (message.params.args as { value?: unknown; description?: string }[]) ?? [];
      errors.push(args.map((arg) => String(arg.value ?? arg.description ?? '')).join(' '));
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}): Promise<unknown> =>
    new Promise((done, fail) => {
      const id = next++;
      waiting.set(id, (message) => (message.error ? fail(new ShootError(`${method}: ${message.error.message}`)) : done(message.result)));
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send('Runtime.enable');
  return {
    errors,
    async evaluate(expression) {
      const answer = (await send('Runtime.evaluate', { expression, returnByValue: true })) as { result?: { value?: unknown } };
      return answer.result?.value;
    },
    async close() {
      socket.close();
      await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {});
    },
  };
}

export type Shot = Record<string, unknown>;
export type ShotResult = { ok: true; saved: { name: string; file: string; json: string; frames: number; seconds: number }; problems: string[] } | { ok: false; error: string; problems: string[] };

/**
 * Sparar förlagorna i tur och ordning, i samma webbläsare. `said` får veta hur långt en förlaga har kommit. Med `data`
 * läser servern content/ och assets/ ur den mappen och lägger förlagorna i dess output/forlagor/ (STUDIO_DATA), så att
 * en fil som inte är registrerad kan ses i scenen utan att assets/ rörs. Med `server` används en server som redan går
 * (adressen), och den lämnas igång.
 */
export async function shootAll(shots: Shot[], said: (text: string) => void = () => {}, options: { data?: string; server?: string } = {}): Promise<ShotResult[]> {
  if ((process.env.SHOOT_SERVER || options.server) && options.data) throw new ShootError('En server som redan går kan inte läsa en egen datamapp');
  const given = options.server ?? process.env.SHOOT_SERVER;
  const server = given ? { url: given.replace(/\/$/, ''), stop: () => {} } : await startServer(options.data);
  let browser: Awaited<ReturnType<typeof startBrowser>> | null = null;
  try {
    browser = await startBrowser();
    const results: ShotResult[] = [];
    for (const [index, shot] of shots.entries()) {
      const tab = await openTab(browser.port, `${server.url}/lab/forlaga.html?order=${encodeURIComponent(JSON.stringify(shot))}`);
      try {
        let told = '';
        const answer = await until(`Förlaga ${index + 1}`, SHOT_PATIENCE, async () => {
          const state = JSON.parse(String((await tab.evaluate('JSON.stringify({ shot: window.shot ?? null, progress: window.progress ?? null })')) ?? '{}')) as {
            shot?: ShotResult | null;
            progress?: { done: number; of: number } | null;
          };
          const progress = state.progress ? `${state.progress.done}/${state.progress.of}` : '';
          if (progress && progress !== told && state.progress!.done % 30 === 0) said(`förlaga ${index + 1}: ruta ${(told = progress)}`);
          return state.shot ?? null;
        });
        results.push(answer.ok ? answer : { ...answer, problems: [...answer.problems, ...tab.errors] });
      } catch (error) {
        results.push({ ok: false, error: (error as Error).message, problems: tab.errors });
      } finally {
        await tab.close();
      }
    }
    return results;
  } finally {
    browser?.stop();
    server.stop();
  }
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.error('Ange en fil med en beställning eller en lista av dem. Formen står i src/lab/shoot.ts.');
    process.exit(1);
  }
  const read = JSON.parse(readFileSync(file, 'utf8')) as Shot | Shot[];
  const results = await shootAll(Array.isArray(read) ? read : [read], (text) => console.error(text));
  for (const result of results) console.log(JSON.stringify(result));
  process.exit(results.every((result) => result.ok) ? 0 : 1);
}
