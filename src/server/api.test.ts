import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { createApi } from './api.ts';

let root: string;
let server: Server;
let base: string;
let port: number;

const REGISTRY = {
  statuses: { 'att granska': 'väntar', godkänd: 'ja', utgår: 'nej' },
  assets: [
    { file: 'scene/bild.png', group: 'backgrounds', title: 'Bild', status: 'att granska' },
    { file: 'reference/film.mp4', group: 'reference', title: 'Film', status: 'att granska' },
  ],
};

function put(path: string, content: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'api-'));
  put('content/assets.json', JSON.stringify(REGISTRY, null, 2));
  put('hemlig.txt', 'utanför assets');
  put('utanfor.json', '{"hemligt":true}');
  put('assets/reference/film.mp4', '0123456789');
  const picture = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#336699' } })
    .png()
    .toBuffer();
  put('assets/scene/bild.png', picture);

  const api = createApi(root, () => '2026-11-18 05:30');
  server = createServer(async (request, response) => {
    if (!(await api(request, response))) response.writeHead(418).end('inte serverns');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

const post = (body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  fetch(`${base}/api/registry/status`, { method: 'POST', headers, body: JSON.stringify(body) });

/** En förfrågan med vägen exakt som den skrivs, utan att fetch först städar bort ../ ur den. */
function raw(path: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((done, fail) => {
    httpRequest({ host: '127.0.0.1', port, path, headers }, (response) => {
      response.resume();
      done(response.statusCode ?? 0);
    })
      .on('error', fail)
      .end();
  });
}

test('registret lämnas ut med uppgift om filerna finns', async () => {
  const view = await (await fetch(`${base}/api/registry`)).json();
  assert.deepEqual(
    view.assets.map((entry: { file: string; present: boolean }) => [entry.file, entry.present]),
    [
      ['scene/bild.png', true],
      ['reference/film.mp4', true],
    ],
  );
  assert.deepEqual(view.unregistered, []);
});

test('beskrivningarna i content lämnas ut som de står, och bara JSON', async () => {
  const response = await fetch(`${base}/content/assets.json`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type')!, /^application\/json/);
  assert.deepEqual((await response.json()).statuses, REGISTRY.statuses);

  assert.equal(await raw('/content/finns-inte.json'), 404);
  assert.equal(await raw('/content/..%2Futanfor.json'), 404, 'JSON utanför content');
  assert.equal(await raw('/content/..%2Fassets%2Fscene%2Fbild.png'), 404, 'annat än JSON');
});

test('en väg som inte är serverns lämnas vidare', async () => {
  assert.equal((await fetch(`${base}/lab/`)).status, 418);
});

test('en fil lämnas ut hel och i delar', async () => {
  const whole = await fetch(`${base}/media/reference/film.mp4`);
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('content-type'), 'video/mp4');
  assert.equal(whole.headers.get('accept-ranges'), 'bytes');
  assert.equal(await whole.text(), '0123456789');

  const part = await fetch(`${base}/media/reference/film.mp4`, { headers: { Range: 'bytes=2-5' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await part.text(), '2345');

  const tail = await fetch(`${base}/media/reference/film.mp4`, { headers: { Range: 'bytes=-3' } });
  assert.equal(await tail.text(), '789');

  const open = await fetch(`${base}/media/reference/film.mp4`, { headers: { Range: 'bytes=7-' } });
  assert.equal(await open.text(), '789');

  const beyond = await fetch(`${base}/media/reference/film.mp4`, { headers: { Range: 'bytes=50-60' } });
  assert.equal(beyond.status, 416);
});

test('en oförändrad fil hämtas inte om', async () => {
  const first = await fetch(`${base}/media/reference/film.mp4`);
  await first.arrayBuffer();
  const again = await fetch(`${base}/media/reference/film.mp4`, {
    headers: { 'If-Modified-Since': first.headers.get('last-modified')! },
  });
  assert.equal(again.status, 304);
});

test('bara filer under assets lämnas ut', async () => {
  for (const path of [
    '/media/../hemlig.txt',
    '/media/%2e%2e/hemlig.txt',
    '/media/..%2Fhemlig.txt',
    '/media/..%5Chemlig.txt',
    '/media/scene/..%2F..%2Fhemlig.txt',
    '/media/scene/%2e%2e%5c%2e%2e%5chemlig.txt',
    '/media/%00',
    '/media/finns-inte.png',
    '/media/scene',
    '/thumb/..%2Fhemlig.txt',
  ]) {
    const status = await raw(path);
    assert.ok(status === 404 || status === 418, `${path} gav ${status}`);
  }
});

test('servern svarar bara när den tilltalas som localhost', async () => {
  assert.equal(await raw('/api/registry', { Host: 'ond.example' }), 403);
  assert.equal(await raw('/media/reference/film.mp4', { Host: `ond.example:${port}` }), 403);
  assert.equal(await raw('/api/registry', { Host: `localhost:${port}` }), 200);
});

test('en förhandsbild görs i webp, förminskad, och återanvänds', async () => {
  const response = await fetch(`${base}/thumb/scene/bild.png?w=300`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 320);

  await (await fetch(`${base}/thumb/scene/bild.png?w=310`)).arrayBuffer();
  assert.equal(readdirSync(join(root, 'output', 'cache', 'thumbs')).length, 1);

  assert.equal((await fetch(`${base}/thumb/reference/film.mp4`)).status, 404);
});

test('ett omdöme sparas och det nya registret kommer tillbaka', async () => {
  const response = await post({ file: 'scene/bild.png', status: 'godkänd' });
  assert.equal(response.status, 200);
  const view = await response.json();
  assert.equal(view.assets[0].status, 'godkänd');
  assert.equal(view.assets[0].statusBy, 'Jakob i Labbet 2026-11-18');

  const saved = JSON.parse(readFileSync(join(root, 'content', 'assets.json'), 'utf8'));
  assert.equal(saved.assets[0].status, 'godkänd');
  assert.equal(saved.assets[0].present, undefined, 'present hör till vyn, inte till filen');
});

test('Jakobs ord om en fil sparas med tid och kommer tillbaka i registret', async () => {
  const send = (body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
    fetch(`${base}/api/registry/comment`, { method: 'POST', headers, body: JSON.stringify(body) });

  const saved = await send({ file: 'reference/film.mp4', comment: 'dubbelt så fort' });
  assert.equal(saved.status, 200);
  const entry = (await saved.json()).assets[1];
  assert.equal(entry.comment, 'dubbelt så fort');
  assert.equal(entry.commentAt, '2026-11-18 05:30');

  const cleared = await send({ file: 'reference/film.mp4', comment: '' });
  assert.equal((await cleared.json()).assets[1].comment, undefined);

  assert.equal((await send({ file: 'finns/inte.png', comment: 'x' })).status, 400);
  assert.equal((await send({ file: 'reference/film.mp4' })).status, 400);
  const foreign = await send({ file: 'reference/film.mp4', comment: 'x' }, { 'Content-Type': 'application/json', Origin: 'https://ond.example' });
  assert.equal(foreign.status, 403);
});

test('ett ogiltigt omdöme avvisas med ett skäl', async () => {
  for (const body of [{ file: 'scene/bild.png', status: 'kanske' }, { file: 'finns/inte.png', status: 'utgår' }, { file: 1 }, null]) {
    const response = await post(body);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('en ändring från en annan webbsida tas inte emot', async () => {
  const body = { file: 'reference/film.mp4', status: 'utgår' };
  const foreign = await post(body, { 'Content-Type': 'application/json', Origin: 'https://ond.example' });
  assert.equal(foreign.status, 403);
  const form = await post(body, { 'Content-Type': 'text/plain' });
  assert.equal(form.status, 403);
  const own = await post(body, { 'Content-Type': 'application/json', Origin: base });
  assert.equal(own.status, 200);
});
