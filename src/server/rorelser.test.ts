// Vägarna för steget Dockan (rorelser.ts och forbered.ts): rörelserna med sina lås, en ändrad cykel sparad som en ny
// rörelse, dockans mått för värden som inte är sparade, och en tagning som förbereds. Allt i en tillfällig mapp med
// påhittade namn; scenen, dockan och en cykel med sin giv är kopior av dem i content/, under andra namn.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { readCycleParts } from '../pipeline/cykel.ts';
import { addEntry, archive, createRegister } from '../pipeline/registry.ts';
import type { Prepared, Spec } from '../pipeline/tagning.ts';
import { createApi } from './api.ts';
import type { Job, Preparer } from './forbered.ts';
import { handler } from './main.ts';
import type { MoveInfo } from './rorelser.ts';

const repo = resolve(import.meta.dirname, '..', '..');
let root: string;
let server: Server;
let base: string;

const sha = (content: string): string => createHash('sha256').update(content).digest('hex');
function put(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
const fromRepo = (file: string): Record<string, unknown> => JSON.parse(readFileSync(join(repo, 'content', file), 'utf8'));
const moveFile = (name: string): string => join(root, 'content', 'moves', `${name}.json`);

// Cykeln i provet: variant E ur content/moves/, med en påhittad giv och ett påhittat namn.
const CYCLE = { ...fromRepo('moves/cykel-nyp-rask.json'), id: 'cykel-prov', give: 'giv-prov' } as Record<string, any>;
const CLIP = 'dealers/prova/clips/cykel-prov-4-0_vy_t1.mp4';
const GONE = 'dealers/prova/clips/cykel-borta-4-0_vy_t1.mp4';

/** En server för mappen, med `prepare` som vägen som gör paketet. */
async function serve(prepare?: Preparer): Promise<{ running: Server; base: string }> {
  const running = createServer(handler(createApi(root, () => '2026-11-19 14:00', {}, { prepare }), (_request, response) => void response.writeHead(418).end()));
  await new Promise<void>((done) => running.listen(0, '127.0.0.1', done));
  return { running, base: `http://127.0.0.1:${(running.address() as AddressInfo).port}` };
}

const post = (at: string, path: string, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  fetch(`${at}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'rorelser-'));
  for (const file of ['scene.json', 'doll.json', 'tagning.json', 'dealer.json']) put(`content/${file}`, JSON.stringify(fromRepo(file)));
  put('content/moves/giv-prov.json', JSON.stringify({ ...fromRepo('moves/giv-nyp-plats-4.json'), id: 'giv-prov' }));
  put('content/moves/cykel-prov.json', JSON.stringify(CYCLE));
  // En cykel som en agent har gjort och ingen tagning använder, en som ett klipp som lämnat registret är gjort med, och
  // en som ett paket som väntar på beställning är gjort med.
  put('content/moves/cykel-agent.json', JSON.stringify({ ...CYCLE, id: 'cykel-agent', source: 'Valt av en agent i provet.' }));
  put('content/moves/cykel-borta.json', JSON.stringify({ ...CYCLE, id: 'cykel-borta' }));
  put('content/moves/cykel-paket.json', JSON.stringify({ ...CYCLE, id: 'cykel-paket' }));
  put('output/tagningar/prova_vy_cykel-paket_4-0_t1/bestallning.json', JSON.stringify({ id: 'prova_vy_cykel-paket_4-0_t1', cycle: 'cykel-paket', clip: 'dealers/prova/clips/cykel-paket-4-0_vy_t1.mp4' }));

  createRegister(root, { about: 'prov', statuses: { 'att granska': 'väntar', godkänd: 'ja', utgår: 'nej' }, asksWhy: [], groups: { clips: 'klipp' }, sources: { runway: { what: 'filmmodellen' } } });
  for (const [file, move] of [[CLIP, 'cykel-prov'], [GONE, 'cykel-borta']] as const) {
    put(`assets/${file}`, file);
    addEntry(root, { file, group: 'clips', title: `Prov ${move}`, status: 'att granska', dealer: 'prova', move, source: { from: 'runway', sha256: sha(file) } });
  }
  archive(root, GONE, 'underkänd i provet', '2026-11-19 13:00');

  ({ running: server, base } = await serve());
});

after(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

const moves = async (at = base): Promise<MoveInfo[]> => ((await (await fetch(`${at}/api/rorelser`)).json()) as { moves: MoveInfo[] }).moves;

test('rörelserna listas med vad de är och varför de inte får skrivas över', async () => {
  const listed = new Map((await moves()).map((move) => [move.name, move]));
  assert.deepEqual([...listed.keys()], ['cykel-agent', 'cykel-borta', 'cykel-paket', 'cykel-prov', 'giv-prov']);
  assert.deepEqual([listed.get('giv-prov')!.kind, listed.get('cykel-prov')!.kind, listed.get('cykel-prov')!.give], ['giv', 'cykel', 'giv-prov']);
  assert.deepEqual(listed.get('giv-prov')!.usedBy, ['cykel-agent', 'cykel-borta', 'cykel-paket', 'cykel-prov']);
  assert.match(listed.get('cykel-prov')!.locked!, /1 klipp i registret är gjort med den, och registrets mätningar hänvisar till det/);
  assert.match(listed.get('cykel-borta')!.locked!, /1 klipp som har lämnat registret/);
  assert.match(listed.get('cykel-paket')!.locked!, /ett paket i output\/tagningar\/ är gjort med den/);
  assert.deepEqual(listed.get('cykel-paket')!.packages, ['prova_vy_cykel-paket_4-0_t1']);
  assert.match(listed.get('cykel-agent')!.locked!, /^den är inte gjord i Labbet$/);
  assert.match(listed.get('giv-prov')!.locked!, /läst giv, inte en cykel/);
});

test('en ändrad cykel sparas som en ny rörelse, prövad med samma läsare som resten', async () => {
  const cycle = structuredClone(CYCLE);
  cycle.parts.deal = 1.4;
  cycle.seconds = 2.8;
  cycle.life.nod = 6;
  const response = await post(base, '/api/rorelser', { name: 'cykel-jakob-1', from: 'cykel-prov', cycle, note: 'nicken syns inte' });
  assert.equal(response.status, 200);
  const { saved, moves: after } = (await response.json()) as { saved: { name: string; file: string; overwrote: boolean; changes: string[] }; moves: MoveInfo[] };
  assert.deepEqual(saved, { name: 'cykel-jakob-1', file: 'content/moves/cykel-jakob-1.json', overwrote: false, changes: ['seconds 3 → 2,8', 'parts.deal 1,6 → 1,4', 'life.nod 4 → 6'] });

  const written = JSON.parse(readFileSync(moveFile('cykel-jakob-1'), 'utf8'));
  assert.equal(written.id, 'cykel-jakob-1');
  assert.equal(written.basis, 'antaget');
  assert.equal(written.about, 'Ändrad i Labbet ur cykel-prov (läs dess about): seconds 3 → 2,8; parts.deal 1,6 → 1,4; life.nod 4 → 6. Jakobs ord: nicken syns inte.');
  assert.match(written.source, /^Satt av Jakob i Labbet 2026-11-19 14:00, ur cykel-prov: /);
  assert.deepEqual(Object.keys(written), Object.keys(CYCLE), 'fälten i ursprungets ordning');
  const parts = readCycleParts('cykel-jakob-1', root);
  assert.deepEqual([parts.cycle.parts.deal, parts.cycle.life.nod, parts.base.id], [1.4, 6, 'giv-prov']);
  assert.match(readFileSync(moveFile('cykel-jakob-1'), 'utf8'), /^ {2}"parts": \{ "ready": 0\.1, "deal": 1\.4, /m, 'korta grupper på en rad, som filerna i content/moves/');

  const mine = after.find((move) => move.name === 'cykel-jakob-1')!;
  assert.deepEqual([mine.madeInLab, mine.locked], [true, null]);

  // En rörelse gjord i Labbet som ingen tagning använder går att spara om under samma namn.
  cycle.life.nod = 5;
  const again = await post(base, '/api/rorelser', { name: 'cykel-jakob-1', from: 'cykel-prov', cycle });
  assert.equal(again.status, 200);
  assert.equal(((await again.json()) as { saved: { overwrote: boolean } }).saved.overwrote, true);
  assert.equal(JSON.parse(readFileSync(moveFile('cykel-jakob-1'), 'utf8')).life.nod, 5);
});

test('en rörelse som klipp, paket eller en agent hänvisar till skrivs aldrig över, och felet säger varför', async () => {
  const cycle = structuredClone(CYCLE);
  cycle.life.nod = 7;
  const before = Object.fromEntries(['cykel-prov', 'cykel-borta', 'cykel-paket', 'cykel-agent', 'giv-prov'].map((name) => [name, readFileSync(moveFile(name), 'utf8')]));
  const refused: [string, RegExp][] = [
    ['cykel-prov', /cykel-prov finns redan och skrivs inte över: 1 klipp i registret är gjort med den, och registrets mätningar hänvisar till det; den är inte gjord i Labbet. Välj ett nytt namn./],
    ['cykel-borta', /klipp som har lämnat registret/],
    ['cykel-paket', /ett paket i output\/tagningar\/ är gjort med den/],
    ['cykel-agent', /inte gjord i Labbet/],
    ['giv-prov', /läst giv/],
  ];
  for (const [name, why] of refused) {
    const response = await post(base, '/api/rorelser', { name, from: 'cykel-prov', cycle });
    assert.equal(response.status, 400, name);
    assert.match(((await response.json()) as { error: string }).error, why, name);
  }
  for (const [name, text] of Object.entries(before)) assert.equal(readFileSync(moveFile(name), 'utf8'), text, `${name} står kvar som den stod`);
});

test('ett namn, ett ursprung eller värden som inte går ihop tas inte emot, och ingenting skrivs', async () => {
  const cycle = structuredClone(CYCLE);
  cycle.parts.deal = 1.4;
  const asked: [unknown, RegExp][] = [
    [{ name: 'Cykel Jakob', from: 'cykel-prov', cycle }, /Namnet ska vara/],
    [{ name: '../ut', from: 'cykel-prov', cycle }, /Namnet ska vara/],
    [{ name: 'cykel-ny', from: 'finns-inte', cycle }, /finns inte i content\/moves/],
    [{ name: 'cykel-ny', from: 'cykel-prov', cycle: 'inte en cykel' }, /Cykeln ska vara ett objekt/],
    // Delarna är inte längre cykelns längd: läsaren säger det.
    [{ name: 'cykel-ny', from: 'cykel-prov', cycle }, /Cykeln går inte att använda: seconds ska vara summan av parts/],
    [{ name: 'cykel-ny', from: 'cykel-prov', cycle: { ...CYCLE, give: 'giv-saknas' } }, /Given giv-saknas finns inte/],
    [{ name: 'cykel-prov', from: 'cykel-prov', cycle: CYCLE }, /skrivs inte över/],
  ];
  for (const [body, why] of asked) {
    const response = await post(base, '/api/rorelser', body);
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 60));
    assert.match(((await response.json()) as { error: string }).error, why);
  }
  assert.equal(existsSync(moveFile('cykel-ny')), false);
  const foreign = await post(base, '/api/rorelser', { name: 'cykel-ny', from: 'cykel-prov', cycle: CYCLE }, { 'Content-Type': 'application/json', Origin: 'http://annan.example' });
  assert.equal(foreign.status, 403);
  assert.equal(existsSync(moveFile('cykel-ny')), false);
});

test('dockans mått för värden som inte är sparade prövas mot gränserna, som när ett paket görs', async () => {
  const response = await post(base, '/api/rorelser/matt', { cycle: CYCLE, seat: 4, index: 0, action: 'deal' });
  assert.equal(response.status, 200);
  const { checks, values } = (await response.json()) as { checks: { key: string; verdict: string; limit: string; value: unknown }[]; values: Record<string, { value: unknown; what: string }> };
  assert.equal(checks[0]!.key, 'dockansHandled');
  assert.equal(typeof checks[0]!.value, 'number');
  assert.ok(checks.length > 3, 'handleden och rörelsens mått med gränser');
  assert.ok(checks.every((one) => ['inom', 'se efter', 'utanför', 'saknas'].includes(one.verdict) && one.limit !== ''));
  assert.equal(typeof values.stillaHelt!.what, 'string');
  assert.deepEqual(existsSync(moveFile('prov')), false, 'ingenting sparas');

  const wrong = await post(base, '/api/rorelser/matt', { cycle: CYCLE, seat: 4, index: 0, action: 'flip' });
  assert.equal(wrong.status, 400);
  assert.match(((await wrong.json()) as { error: string }).error, /flip gäller dealerns plats/);
});

test('en tagning förbereds med samma väg som tagning.ts forbered, en i taget, och Labbet följer den', async () => {
  let finish: (made: Prepared) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const asked: { spec: Spec; root: string | undefined }[] = [];
  const prepare: Preparer = (spec, options) => {
    asked.push({ spec, root: options.root });
    options.say?.('Dockans film sparas …');
    return new Promise((done, failed) => {
      finish = done;
      fail = failed;
    });
  };
  const { running, base: at } = await serve(prepare);
  const job = async (): Promise<Job | null> => ((await (await fetch(`${at}/api/forbered`)).json()) as { job: Job | null }).job;
  try {
    assert.equal(await job(), null);
    const spec = { dealer: 'prova', view: 'spelaren', seat: 'D', index: 1, action: 'hole', cycle: 'cykel-prov' };
    const started = await post(at, '/api/forbered', spec);
    assert.equal(started.status, 200);
    const first = ((await started.json()) as { job: Job }).job;
    assert.deepEqual([first.state, first.command], ['förbereds', 'node src/pipeline/tagning.ts forbered prova spelaren D 1 hole --cykel cykel-prov']);
    assert.deepEqual(asked, [{ spec, root }]);

    const second = await post(at, '/api/forbered', spec);
    assert.equal(second.status, 400);
    assert.match(((await second.json()) as { error: string }).error, /En tagning förbereds redan/);

    finish({ id: 'prova_spelaren_cykel-prov-hole_d-1_t1', dir: join(root, 'output', 'tagningar', 'prova_spelaren_cykel-prov-hole_d-1_t1'), order: { model: 'filmmodell', prompt: 'texten' }, checks: [] });
    await new Promise((done) => setTimeout(done, 10));
    const done = (await job())!;
    assert.deepEqual([done.state, done.lines, done.result?.id, done.result?.dir, done.ended], ['förberedd', ['Dockans film sparas …'], 'prova_spelaren_cykel-prov-hole_d-1_t1', 'output/tagningar/prova_spelaren_cykel-prov-hole_d-1_t1', '2026-11-19 14:00']);

    // Ett fel i tagning.ts står kvar med sitt skäl.
    assert.equal((await post(at, '/api/forbered', { ...spec, seat: 4, index: 0, action: 'deal' })).status, 200);
    fail(new Error('Plats 4 har ingen kortplats 0'));
    await new Promise((done) => setTimeout(done, 10));
    assert.deepEqual([(await job())!.state, (await job())!.error], ['gick inte', 'Plats 4 har ingen kortplats 0']);

    for (const [body, why] of [
      [{ ...spec, cycle: 'finns-inte' }, /finns inte i content\/moves\/: spara den först/],
      [{ ...spec, view: 'bakom' }, /Vyn ska vara/],
      [{ ...spec, seat: 0 }, /Platsen ska vara/],
      [{ ...spec, dealer: '' }, /Välj en dealer/],
    ] as const) {
      const response = await post(at, '/api/forbered', body);
      assert.equal(response.status, 400);
      assert.match(((await response.json()) as { error: string }).error, why);
    }
    assert.equal(asked.length, 2, 'ett fel i det Labbet skickade når aldrig tagning.ts');
  } finally {
    running.close();
  }
});
