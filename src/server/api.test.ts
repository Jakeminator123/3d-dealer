import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { addEntry, createRegister, readRegistry } from '../pipeline/registry.ts';
import { createApi } from './api.ts';
import { handler } from './main.ts';

let root: string;
let server: Server;
let base: string;
let port: number;

/** Studions server för projektmappen `folder`, med en sida som svarar 418 i stället för Vite. */
async function serve(folder: string, pages: Parameters<typeof handler>[1] = (_request, response) => void response.writeHead(418).end('inte serverns')) {
  const running = createServer(handler(createApi(folder, () => '2026-11-18 05:30'), pages));
  await new Promise<void>((done) => running.listen(0, '127.0.0.1', done));
  return { running, base: `http://127.0.0.1:${(running.address() as AddressInfo).port}` };
}

const STATUSES = { 'att granska': 'väntar', godkänd: 'ja', utgår: 'nej' };
const sha = (content: string | Buffer): string => createHash('sha256').update(content).digest('hex');

function put(path: string, content: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'api-'));
  put('content/scene.json', JSON.stringify({ about: 'en scen' }));
  put('hemlig.txt', 'utanför assets');
  put('utanfor.json', '{"hemligt":true}');
  put('assets/reference/film.mp4', '0123456789');
  const picture = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#336699' } })
    .png()
    .toBuffer();
  put('assets/scene/bild.png', picture);
  createRegister(root, { about: 'prov', statuses: STATUSES, asksWhy: [], groups: { backgrounds: 'bakgrunder', reference: 'referens' }, sources: { dealer: { what: 'gamla projektet' } } });
  addEntry(root, { file: 'scene/bild.png', group: 'backgrounds', title: 'Bild', status: 'att granska', source: { from: 'dealer', sha256: sha(picture) } });
  addEntry(root, { file: 'reference/film.mp4', group: 'reference', title: 'Film', status: 'att granska', source: { from: 'dealer', sha256: sha('0123456789') } });

  ({ running: server, base } = await serve(root));
  port = (server.address() as AddressInfo).port;
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
  const response = await fetch(`${base}/content/scene.json`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type')!, /^application\/json/);
  assert.deepEqual(await response.json(), { about: 'en scen' });

  assert.equal(await raw('/content/register.db'), 404, 'registret lämnas ut genom /api/registry, inte som fil');
  assert.equal(await raw('/content/finns-inte.json'), 404);
  assert.equal(await raw('/content/..%2Futanfor.json'), 404, 'JSON utanför content');
  assert.equal(await raw('/content/..%2Fassets%2Fscene%2Fbild.png'), 404, 'annat än JSON');
});

test('en väg som inte är serverns lämnas vidare till sidorna, och roten leder till Labbet', async () => {
  assert.equal((await fetch(`${base}/lab/`)).status, 418);
  for (const path of ['/', '/lab']) {
    const response = await fetch(`${base}${path}`, { redirect: 'manual' });
    assert.deepEqual([response.status, response.headers.get('location')], [302, '/lab/'], path);
  }
});

test('ett register som saknas eller är trasigt ger ett svar med skälet, inte ett tomt serverfel', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'api-trasig-'));
  const { running, base: there } = await serve(folder);
  try {
    const missing = await fetch(`${there}/api/registry`);
    assert.equal(missing.status, 500);
    assert.match((await missing.json()).error, /^Registret finns inte: .*register\.db/);

    mkdirSync(join(folder, 'content'));
    writeFileSync(join(folder, 'content', 'register.db'), 'det här är ingen databas, men tillräckligt långt för att SQLite ska läsa det som en');
    const broken = await fetch(`${there}/api/registry`);
    assert.equal(broken.status, 500);
    assert.match((await broken.json()).error, /^Registret \(content\/register\.db\) svarade med ett fel: /);
    // En ändring mot samma register får samma slags svar, inte ett 400 som skyller på den som frågade.
    const change = await fetch(`${there}/api/registry/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"file":"a.png","status":"godkänd"}' });
    assert.equal(change.status, 500);
    assert.match((await change.json()).error, /^Registret/);
  } finally {
    running.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('ett fel på sidorna svaras med sitt skäl', async () => {
  const { running, base: there } = await serve(root, () => {
    throw new Error('sidan föll');
  });
  try {
    const response = await fetch(`${there}/lab/`);
    assert.deepEqual([response.status, await response.text()], [500, 'Serverfel: sidan föll']);
  } finally {
    running.close();
  }
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

test('servern svarar bara när den tilltalas som localhost, sidorna också', async () => {
  assert.equal(await raw('/api/registry', { Host: 'ond.example' }), 403);
  assert.equal(await raw('/media/reference/film.mp4', { Host: `ond.example:${port}` }), 403);
  assert.equal(await raw('/lab/', { Host: `127.0.0.1.nip.io:${port}` }), 403);
  assert.equal(await raw('/api/registry', { Host: `localhost:${port}` }), 200);
  assert.equal(await raw('/lab/', { Host: `[::1]:${port}` }), 418);
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

  const saved = readRegistry(root).assets[0]!;
  assert.equal(saved.status, 'godkänd');
  assert.equal(saved.statusBy, 'Jakob i Labbet 2026-11-18');
  assert.equal('present' in saved, false, 'present hör till vyn, inte till registret');
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

test('en förlaga tas emot ruta för ruta från Labbets egen sida och hamnar under output/forlagor', async () => {
  const order = {
    still: true,
    frames: 1,
    fps: 30,
    frame: { width: 48, height: 27 },
    view: { kind: 'plats', seat: 7 },
    eye: { position: [0.5, 0.6, 0.4], forward: [-0.1, -0.3, -0.9], focalPx: 33 },
    dealer: { kind: 'film', file: 'dealers/p/clips/film.mp4', view: { kind: 'plats', seat: 7 }, time: 0.5 },
    background: { file: 'scene/bild.png', kind: '360', turn: 0, lift: 0, blur: 6, exposure: 0.5, mirror: false, height: 1.6, radius: 8 },
    shoe: true,
  };
  const json = { 'Content-Type': 'application/json' };
  const png = { 'Content-Type': 'image/png' };
  const start = (body: unknown, headers: Record<string, string> = json) =>
    fetch(`${base}/api/forlaga/start`, { method: 'POST', headers, body: JSON.stringify(body) });
  const frame = (name: string, index: number | string, body: Buffer, headers: Record<string, string> = png) =>
    fetch(`${base}/api/forlaga/${name}/${index}`, { method: 'POST', headers, body: new Uint8Array(body) });
  const picture = await sharp({ create: { width: 48, height: 27, channels: 3, background: '#224466' } })
    .png()
    .toBuffer();

  const started = await start(order);
  assert.equal(started.status, 200);
  const { name } = await started.json();
  assert.equal(name, 'film_plats-7_bild_bild');

  const sent = await frame(name, 0, picture);
  assert.equal(sent.status, 200);
  assert.deepEqual(await sent.json(), {
    saved: { name, file: `output/forlagor/${name}.png`, json: `output/forlagor/${name}.json`, frames: 1, seconds: 0 },
  });
  assert.ok(readFileSync(join(root, 'output', 'forlagor', `${name}.png`)).equals(picture));
  const record = JSON.parse(readFileSync(join(root, 'output', 'forlagor', `${name}.json`), 'utf8'));
  assert.equal(record.savedAt, '2026-11-18 05:30');
  assert.deepEqual(record.view, order.view);

  // Fel i förfrågan svaras med ett skäl; inget skrivs utanför output/forlagor.
  assert.equal((await start({ ...order, frames: 0 })).status, 400);
  assert.equal(typeof (await (await start(null)).json()).error, 'string');
  assert.equal((await frame('inte-borjad', 0, picture)).status, 400);
  assert.equal((await frame('..%2F..%2Fcontent', 0, picture)).status, 400);
  assert.equal((await frame(name, 'x', picture)).status, 404);
  assert.equal((await fetch(`${base}/api/forlaga/start`)).status, 404, 'bara POST');
  assert.deepEqual(readdirSync(join(root, 'output', 'forlagor')).sort(), [`${name}.json`, `${name}.png`]);

  // En annan webbsida får varken börja en förlaga eller lämna rutor.
  assert.equal((await start(order, { ...json, Origin: 'https://ond.example' })).status, 403);
  assert.equal((await start(order, { 'Content-Type': 'text/plain' })).status, 403);
  assert.equal((await frame(name, 0, picture, { ...png, Origin: 'https://ond.example' })).status, 403);
  assert.equal((await frame(name, 0, picture, { 'Content-Type': 'multipart/form-data' })).status, 403);
});

test('kortplanen sparas från Labbets egen sida: bara de tillåtna talen, inom sina gränser, och inget annat i scenen', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'api-kortplan-'));
  mkdirSync(join(folder, 'content'));
  const original = readFileSync(join(import.meta.dirname, '..', '..', 'content', 'scene.json'), 'utf8');
  writeFileSync(join(folder, 'content', 'scene.json'), original);
  const { running, base: there } = await serve(folder);
  const send = (body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
    fetch(`${there}/api/kortplan`, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    const whole = JSON.parse(original);
    const plan = {
      arc: { centreX: whole.places.arc.centreX, depth: whole.places.arc.depth + 0.03, width: 0.9, bend: 0, round: 2, step: whole.places.arc.step },
      row: { first: whole.places.row.first, step: whole.places.row.step },
      scale: 1.4,
    };
    const saved = await send(plan);
    assert.equal(saved.status, 200);
    assert.deepEqual((await saved.json()).plan, plan);
    const written = JSON.parse(readFileSync(join(folder, 'content', 'scene.json'), 'utf8'));
    assert.deepEqual([written.places.arc.width, written.places.arc.bend, written.places.arc.seats, written.card.onTable.scale], [0.9, 0, 7, 1.4]);
    assert.equal(written.places.setInLab, 'Jakob i Labbet 2026-11-18 05:30');
    // Allt utom kortplanen är som förut; scenen läses av sidorna som den står.
    const { places: _p, card: _c, ...rest } = written;
    const { places: _q, card: _d, ...was } = whole;
    assert.deepEqual(rest, was);
    assert.deepEqual({ ...written.card, onTable: undefined }, { ...whole.card, onTable: undefined });
    assert.equal((await (await fetch(`${there}/content/scene.json`)).json()).card.onTable.scale, 1.4);

    // Utanför gränserna, med ett tal till, eller med något annat än kortplanen: 400 med skälet, och filen är orörd.
    const now = readFileSync(join(folder, 'content', 'scene.json'), 'utf8');
    for (const wrong of [{ ...plan, scale: 9 }, { ...plan, arc: { ...plan.arc, cards: 5 } }, { ...plan, camera: { focalPx: 1 } }, { arc: plan.arc }, null]) {
      const refused = await send(wrong);
      assert.equal(refused.status, 400, JSON.stringify(wrong));
      assert.match((await refused.json()).error, /^Kortplanen tas inte emot: /);
    }
    // En annan webbsida får inte spara, och inte heller ett formulär.
    assert.equal((await send(plan, { 'Content-Type': 'application/json', Origin: 'https://ond.example' })).status, 403);
    assert.equal((await send(plan, { 'Content-Type': 'text/plain' })).status, 403);
    assert.equal((await fetch(`${there}/api/kortplan`)).status, 404, 'bara POST');
    assert.equal(readFileSync(join(folder, 'content', 'scene.json'), 'utf8'), now);
  } finally {
    running.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('klippens fart sparas från Labbets egen sida med kortplanen, bara inom 1–2, i content/runda.json', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'api-fart-'));
  mkdirSync(join(folder, 'content'));
  const project = join(import.meta.dirname, '..', '..', 'content');
  const scene = readFileSync(join(project, 'scene.json'), 'utf8');
  const round = readFileSync(join(project, 'runda.json'), 'utf8');
  writeFileSync(join(folder, 'content', 'scene.json'), scene);
  writeFileSync(join(folder, 'content', 'runda.json'), round);
  const { running, base: there } = await serve(folder);
  const send = (body: unknown) => fetch(`${there}/api/kortplan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const whole = JSON.parse(scene);
    const plan = { arc: { centreX: whole.places.arc.centreX, depth: whole.places.arc.depth, width: whole.places.arc.width, bend: whole.places.arc.bend, round: whole.places.arc.round, step: whole.places.arc.step }, row: { first: whole.places.row.first, step: whole.places.row.step }, scale: whole.card.onTable.scale };
    const saved = await send({ ...plan, speed: 1.5 });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).plan.speed, 1.5);
    const written = JSON.parse(readFileSync(join(folder, 'content', 'runda.json'), 'utf8'));
    assert.deepEqual(written.speed, { ...JSON.parse(round).speed, clips: 1.5, setInLab: 'Jakob i Labbet 2026-11-18 05:30' });
    // Bara farten: resten av rundan, och scenen, är som förut. Sidorna läser den nya farten.
    assert.deepEqual({ ...written, speed: undefined }, { ...JSON.parse(round), speed: undefined });
    assert.equal(readFileSync(join(folder, 'content', 'scene.json'), 'utf8'), scene);
    assert.equal((await (await fetch(`${there}/content/runda.json`)).json()).speed.clips, 1.5);

    // Utanför gränserna eller inget tal: 400 med skälet, och ingen fil rörs.
    const now = readFileSync(join(folder, 'content', 'runda.json'), 'utf8');
    for (const speed of [0, 0.95, 2.05, 9, '1,5', null, [1.5]]) {
      const refused = await send({ ...plan, speed });
      assert.equal(refused.status, 400, JSON.stringify(speed));
      assert.match((await refused.json()).error, /^Kortplanen tas inte emot: speed 1 … 2/);
    }
    assert.equal(readFileSync(join(folder, 'content', 'runda.json'), 'utf8'), now);
    assert.equal(readFileSync(join(folder, 'content', 'scene.json'), 'utf8'), scene);
  } finally {
    running.close();
    rmSync(folder, { recursive: true, force: true });
  }
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

test('dealerna: var var och en står, ur hennes fil och registret', async () => {
  const empty = await fetch(`${base}/api/dealers`);
  assert.deepEqual(await empty.json(), [], 'utan dealermallen inga dealers');
  put('content/dealer.json', readFileSync(join(import.meta.dirname, '..', '..', 'content', 'dealer.json'), 'utf8'));
  put('content/dealers/prov.json', JSON.stringify({ id: 'prov', name: 'Prov', looks: { pronoun: 'she', basis: 'antaget', source: 'prov' }, identity: { images: [], basis: 'antaget', source: 'prov' }, anchors: { redo: {}, basis: 'antaget', source: 'prov' } }));
  try {
    const answer = await fetch(`${base}/api/dealers`);
    assert.equal(answer.status, 200);
    const [state] = (await answer.json()) as { id: string; name: string; next: { commands: string[] }[]; views: { view: string }[] }[];
    assert.deepEqual([state!.id, state!.name, state!.views[0]!.view], ['prov', 'Prov', 'spelaren']);
    assert.match(state!.next[0]!.commands[0]!, /identitet\.ts källa prov/);
  } finally {
    rmSync(join(root, 'content', 'dealer.json'));
    rmSync(join(root, 'content', 'dealers'), { recursive: true });
  }
});
