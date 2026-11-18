// Studions server i bakgrunden: fristående och dold, med logg. Samma körning som `npm run dev` (skriptet dev i
// package.json, med Nodes --watch), utan fönster.
//
//   npm start    startar den om ingen redan svarar på porten, och väntar tills Labbet och registret svarar
//   npm stop     stoppar den som npm start startade, och det den har startat
//
// PORT väljer port som för npm run dev. Loggen är output/server-<port>.log; processens nummer står i
// output/server-<port>.pid medan den går. Filen läser ingen annan kod i src/ än port.ts, så att stoppet fungerar även
// när serverns kod inte går att läsa.

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { HOST, studioPort } from './port.ts';

const root = resolve(import.meta.dirname, '..', '..');
const START_PATIENCE = 60_000;
const STOP_PATIENCE = 10_000;

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
const placesFor = (port: number) => ({ log: join(root, 'output', `server-${port}.log`), pid: join(root, 'output', `server-${port}.pid`) });
const shown = (path: string): string => path.slice(root.length + 1).replaceAll('\\', '/');

/** Svarets status för en väg på servern, eller null när ingen svarar. */
async function statusOf(port: number, path: string): Promise<number | null> {
  try {
    const response = await fetch(`http://${HOST}:${port}${path}`, { signal: AbortSignal.timeout(5000) });
    await response.body?.cancel();
    return response.status;
  } catch {
    return null;
  }
}

/**
 * Om processen går och är av det slag npm start startar (i Windows cmd, annars node). Ett nummer i en gammal pid-fil kan
 * ha fått en annan process sedan datorn startades om.
 */
function isOurs(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') return false;
  }
  if (process.platform !== 'win32') return true;
  const listed = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
  return listed.toLowerCase().startsWith('"cmd.exe"');
}

function readPid(path: string): number | null {
  if (!existsSync(path)) return null;
  const pid = Number(readFileSync(path, 'utf8').trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/** Kommandot i skriptet dev, utan `node` först: samma körning i bakgrunden som i terminalen. */
function devArguments(): string[] {
  const { scripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const [program, ...rest] = scripts.dev!.trim().split(/\s+/);
  if (program !== 'node') throw new Error(`Skriptet dev ska börja med node: ${scripts.dev}`);
  return rest;
}

/**
 * Startar skriptet dev fristående och dolt, med utskrifterna i `log`, och ger processens nummer.
 *
 * I Windows lägger Node sina barnprocesser i ett jobb som stängs när den själv går, och en fristående (detached)
 * process saknar konsol, så att servern under --watch skulle öppna ett eget synligt fönster. PowerShell startar därför
 * cmd i ett dolt fönster; cmd skriver loggen, och node under den ärver det dolda fönstret. Numret är cmd:s.
 */
function launch(port: number, log: string): number {
  const env = { ...process.env, PORT: String(port) };
  if (process.platform !== 'win32') {
    const out = openSync(log, 'a');
    const child = spawn(process.execPath, devArguments(), { cwd: root, env, stdio: ['ignore', out, out], detached: true });
    closeSync(out);
    child.unref();
    return child.pid ?? 0;
  }
  const quoted = (text: string): string => `'${text.replaceAll("'", "''")}'`;
  const line = `"${process.execPath}" ${devArguments().join(' ')} >> "${log}" 2>&1`;
  const script = `(Start-Process -FilePath cmd.exe -ArgumentList ${quoted(`/d /s /c "${line}"`)} -WorkingDirectory ${quoted(root)} -WindowStyle Hidden -PassThru).Id`;
  const said = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    env,
    encoding: 'utf8',
    windowsHide: true,
  });
  return Number(said.trim()) || 0;
}

async function start(port: number): Promise<number> {
  const places = placesFor(port);
  const url = `http://localhost:${port}/lab/`;
  if ((await statusOf(port, '/api/registry')) !== null) {
    console.log(`En server svarar redan på port ${port}: ${url}`);
    return 0;
  }
  const old = readPid(places.pid);
  if (old !== null && isOurs(old)) {
    console.error(`Servern från npm start (process ${old}) går men svarar inte. Se ${shown(places.log)}; den startar om när koden ändras, och npm stop stoppar den.`);
    return 1;
  }

  mkdirSync(join(root, 'output'), { recursive: true });
  appendFileSync(places.log, `\n--- npm start ${new Date().toLocaleString('sv-SE')}, port ${port} ---\n`);
  const pid = launch(port, places.log);
  if (!pid) {
    console.error(`Servern gick inte att starta. Se ${shown(places.log)}.`);
    return 1;
  }
  writeFileSync(places.pid, `${pid}\n`);

  const end = Date.now() + START_PATIENCE;
  while (Date.now() < end) {
    const [lab, registry] = [await statusOf(port, '/lab/'), await statusOf(port, '/api/registry')];
    if (lab !== null && registry !== null) {
      console.log(`Labbet: ${url} (Labbet ${lab}, registret ${registry}). Process ${pid}, logg ${shown(places.log)}. npm stop stoppar.`);
      return lab === 200 && registry === 200 ? 0 : 1;
    }
    await sleep(250);
  }
  console.error(`Servern svarar inte efter ${START_PATIENCE / 1000} s. Se ${shown(places.log)}; npm stop stoppar den.`);
  return 1;
}

async function stop(port: number): Promise<number> {
  const places = placesFor(port);
  const pid = readPid(places.pid);
  if (pid === null || !isOurs(pid)) {
    rmSync(places.pid, { force: true });
    if ((await statusOf(port, '/api/registry')) === null) {
      console.log(`Ingen server går på port ${port}.`);
      return 0;
    }
    console.error(`Servern på port ${port} är inte startad med npm start. Stoppa den där den startades (Ctrl+C i dess fönster).`);
    return 1;
  }
  // Processen bär Nodes --watch, och servern går under den: hela trädet stoppas.
  if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else process.kill(-pid, 'SIGTERM');
  const end = Date.now() + STOP_PATIENCE;
  while (Date.now() < end && (isOurs(pid) || (await statusOf(port, '/api/registry')) !== null)) await sleep(200);
  rmSync(places.pid, { force: true });
  if ((await statusOf(port, '/api/registry')) !== null) {
    console.error(`Process ${pid} är stoppad, men något svarar fortfarande på port ${port}.`);
    return 1;
  }
  console.log(`Stoppad: servern på port ${port} (process ${pid}).`);
  return 0;
}

if (import.meta.main) {
  const word = process.argv[2];
  try {
    const port = studioPort();
    if (word === 'start') process.exitCode = await start(port);
    else if (word === 'stop') process.exitCode = await stop(port);
    else {
      console.error('Använd: npm start, eller npm stop (node src/server/background.ts start|stop)');
      process.exitCode = 2;
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
