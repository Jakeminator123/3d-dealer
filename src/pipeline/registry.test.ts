// Registret i content/register.db: poster, omdömen, import, arkivering och borttagning, frågor och kontroller.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { readScene } from '../scene/description.ts';
import {
  about,
  addEntry,
  addMeasurement,
  addOrder,
  addUpload,
  archive,
  check,
  createRegister,
  dropMeasurements,
  expiryOf,
  getEntry,
  importAsset,
  listAssetFiles,
  mentions,
  pointersTo,
  query,
  queue,
  readPosts,
  readRegistry,
  RegistryError,
  registerPath,
  remove,
  setStatus,
  setWords,
  stamp,
  summary,
  unused,
  viewRegistry,
  type RegistryEntry,
  type Seed,
} from './registry.ts';

let root: string;

const SEED: Seed = {
  about: 'Ett register att pröva med.',
  statuses: { 'att granska': 'väntar', godkänd: 'ja', 'granska igen': 'se igen', utgår: 'nej' },
  asksWhy: ['granska igen'],
  groups: { identity: 'identitet', anchors: 'ankare', clips: 'klipp', backgrounds: 'bakgrunder', reference: 'referens' },
  sources: { runway: { what: 'Runway' }, dealer: { what: 'Gamla projektet', head: 'abc123', importedAt: '2026-11-18' } },
};

const sha = (content: string | Buffer): string => createHash('sha256').update(content).digest('hex');

function put(path: string, content: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** En post för en fil som läggs i assets/ med ett eget innehåll. */
function entry(file: string, more: Record<string, unknown> = {}): RegistryEntry {
  const content = `innehållet i ${file}`;
  put(`assets/${file}`, content);
  const { source, ...rest } = more;
  return { file, group: 'backgrounds', title: file, status: 'att granska', bytes: Buffer.byteLength(content), source: { from: 'dealer', sha256: sha(content), ...(source as object) }, ...rest };
}

const rows = (sql: string) => query(root, sql).rows;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'register-'));
  createRegister(root, SEED);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

test('ett nytt register bär ordlistorna i sin ordning och är en enda fil', () => {
  const registry = readRegistry(root);
  assert.deepEqual(
    { ...registry, assets: undefined },
    { schemaVersion: 1, about: SEED.about, statuses: SEED.statuses, asksWhy: SEED.asksWhy, groups: SEED.groups, sources: SEED.sources, assets: undefined },
  );
  assert.deepEqual(Object.keys(registry.statuses), Object.keys(SEED.statuses));
  assert.deepEqual(readdirSync(join(root, 'content')), ['register.db'], 'inga sidofiler efter journalen');
  assert.throws(() => createRegister(root, SEED), RegistryError, 'ett register som finns skrivs inte över');
});

test('en post kommer ut med alla sina fält, också de utan egen kolumn och postens mätningar', () => {
  const full = entry('dealers/p/anchors/redo.png', {
    group: 'anchors',
    dealer: 'p',
    note: 'Gjord i natt.',
    width: 1920,
    height: 1080,
    pose: 'redo',
    grip: 'nyp',
    use: 'dealerfilm',
    view: { kind: 'plats', seat: 7 },
    lands: { seat: 4, index: 0, at: 3.29 },
    oldView: { blur: 6, mirror: true },
    take: 1,
    kind: 42, // fel sort för sin kolumn: står kvar som den är
    licence: 'Ingen',
    statusBy: 'Granskaren: bra',
    statusAt: '2026-11-18 09:49',
    comment: 'för mörk',
    commentAt: '2026-11-18 09:50',
    source: { from: 'runway', taskId: 't-1', credits: 29, steps: [{ step: 'ställning', taskId: 't-0' }], measured: { how: 'mat-ankare.ts', hands: [124, 88], cardAt: 3 } },
  });
  const film = entry('dealers/p/clips/giv.mp4', { group: 'clips', seconds: 4.04, fps: 24, source: { from: 'runway', measured: 'Kortet ligger stilla från 3,29 s.' } });
  addEntry(root, full);
  addEntry(root, film);

  const [first, second] = readRegistry(root).assets;
  assert.deepEqual(first, full);
  assert.deepEqual(second, film);
  assert.deepEqual(
    rows('SELECT what, value, is_json, post_key FROM measurements ORDER BY id'),
    [
      { what: 'how', value: 'mat-ankare.ts', is_json: 0, post_key: 'how' },
      { what: 'hands', value: '[124,88]', is_json: 1, post_key: 'hands' },
      { what: 'cardAt', value: '3', is_json: 1, post_key: 'cardAt' },
      { what: 'mått', value: 'Kortet ligger stilla från 3,29 s.', is_json: 0, post_key: '' },
    ],
  );
  assert.deepEqual(rows("SELECT file, use, view ->> '$.seat' AS seat FROM register WHERE use = 'dealerfilm'"), [{ file: full.file, use: 'dealerfilm', seat: 7 }]);
  assert.throws(() => addEntry(root, full), /har redan en post/);
});

test('en post med hål i, eller med en grupp, status eller källa som inte finns, tas inte emot', () => {
  for (const [what, broken] of [
    ['gruppen', entry('scene/a.png', { group: 'okand' })],
    ['okänd status', entry('scene/a.png', { status: 'kanske' })],
    ['source.from', entry('scene/a.png', { source: { from: 'någonstans' } })],
    ['sha256', { ...entry('scene/a.png'), source: { from: 'dealer' } }],
    ['title', { ...entry('scene/a.png'), title: undefined }],
  ] as const) {
    assert.throws(() => addEntry(root, broken as RegistryEntry), (error: Error) => error instanceof RegistryError && error.message.includes(what), what);
  }
  assert.equal(readRegistry(root).assets.length, 0);
});

test('vyn säger vilka poster som saknar fil och vilka filer som saknar post', () => {
  addEntry(root, entry('scene/a.png'));
  addEntry(root, entry('scene/borta.png'));
  rmSync(join(root, 'assets/scene/borta.png'));
  put('assets/scene/extra/utan-post.png', 'x');
  assert.deepEqual(listAssetFiles(root), ['scene/a.png', 'scene/extra/utan-post.png']);
  const view = viewRegistry(root);
  assert.deepEqual(view.assets.map((item) => [item.file, item.present]), [['scene/a.png', true], ['scene/borta.png', false]]);
  assert.deepEqual(view.unregistered, ['scene/extra/utan-post.png']);
});

test('ett omdöme läggs till i historiken med vem och när, och samma status igen ändrar ingenting', () => {
  addEntry(root, entry('scene/a.png'), false, { at: '2026-11-18 05:00' });
  const set = setStatus(root, 'scene/a.png', 'utgår', 'Jakob i Labbet 2026-11-18', '2026-11-18 05:30');
  assert.deepEqual([set.status, set.statusBy, set.statusAt], ['utgår', 'Jakob i Labbet 2026-11-18', '2026-11-18 05:30']);
  const again = setStatus(root, 'scene/a.png', 'utgår', 'Någon annan', '2026-11-18 06:00');
  assert.equal(again.statusBy, 'Jakob i Labbet 2026-11-18', 'en tidigare motivering står kvar');
  assert.deepEqual(rows('SELECT status, who, at FROM verdicts ORDER BY id'), [
    { status: 'att granska', who: null, at: '2026-11-18 05:00' },
    { status: 'utgår', who: 'Jakob i Labbet 2026-11-18', at: '2026-11-18 05:30' },
  ]);
  const { statusBy: _by, statusAt: _at, ...rest } = readRegistry(root).assets[0]!;
  assert.equal(rest.title, 'scene/a.png', 'allt annat står kvar');
});

test('en status utanför ordlistan och en fil utan post avvisas utan att något skrivs', () => {
  addEntry(root, entry('scene/a.png'));
  const before = rows('SELECT * FROM verdicts');
  assert.throws(() => setStatus(root, 'scene/a.png', 'kanske', 'Jakob', '2026-11-18 05:30'), /Okänd status: kanske\. Statusarna är att granska, godkänd/);
  assert.throws(() => setStatus(root, 'scene/a.png', 'toString', 'Jakob', '2026-11-18 05:30'), RegistryError);
  assert.throws(() => setStatus(root, 'scene/finns-inte.png', 'godkänd', 'Jakob', '2026-11-18 05:30'), /Ingen post i registret för scene\/finns-inte\.png/);
  assert.deepEqual(rows('SELECT * FROM verdicts'), before);
});

test('Jakobs ord och agentens svar sparas med tid, och tom text tar bort dem', () => {
  addEntry(root, entry('scene/a.png'));
  setWords(root, 'scene/a.png', 'comment', '  för mörk  ', '2026-11-18 05:30');
  setWords(root, 'scene/a.png', 'reply', 'ljusare variant gjord', '2026-11-18 05:40');
  let saved = getEntry(root, 'scene/a.png')!;
  assert.deepEqual([saved.comment, saved.commentAt, saved.reply, saved.replyAt], ['för mörk', '2026-11-18 05:30', 'ljusare variant gjord', '2026-11-18 05:40']);
  setWords(root, 'scene/a.png', 'comment', 'för mörk', '2026-11-18 06:00');
  assert.equal(getEntry(root, 'scene/a.png')!.commentAt, '2026-11-18 05:30', 'samma ord igen skriver ingenting');
  setWords(root, 'scene/a.png', 'comment', ' ', '2026-11-18 06:00');
  saved = getEntry(root, 'scene/a.png')!;
  assert.equal('comment' in saved || 'commentAt' in saved, false);
  assert.equal(saved.reply, 'ljusare variant gjord');
  assert.throws(() => setWords(root, 'scene/finns-inte.png', 'comment', 'x', '2026-11-18 06:00'), RegistryError);
});

test('kön bär det som ber om en motivering och inte har fått svar på det senaste', () => {
  addEntry(root, entry('scene/a.png'));
  const files = () => queue(root).map((item) => item.file);
  assert.deepEqual(files(), []);
  setStatus(root, 'scene/a.png', 'granska igen', 'Jakob i Labbet 2026-11-18', '2026-11-18 05:30');
  assert.deepEqual(files(), ['scene/a.png'], 'i kö även utan motivering');
  setWords(root, 'scene/a.png', 'reply', 'vad är det som stör?', '2026-11-18 05:35');
  assert.deepEqual(files(), [], 'besvarad');
  setWords(root, 'scene/a.png', 'comment', 'för mörk', '2026-11-18 05:50');
  assert.deepEqual(files(), ['scene/a.png'], 'nya ord efter svaret ställer den i kö igen');
  setWords(root, 'scene/a.png', 'reply', 'ljusare nu', '2026-11-18 05:50');
  assert.deepEqual(files(), [], 'svar i samma minut räknas som svar');
  setStatus(root, 'scene/a.png', 'godkänd', 'Jakob i Labbet 2026-11-18', '2026-11-18 06:00');
  setStatus(root, 'scene/a.png', 'granska igen', 'Jakob i Labbet 2026-11-18', '2026-11-18 06:10');
  assert.deepEqual(files(), ['scene/a.png'], 'satt på nytt efter svaret');
});

test('tiden skrivs som datum och klockslag i lokal tid', () => {
  assert.equal(stamp(new Date(2026, 10, 8, 5, 3)), '2026-11-08 05:03');
});

const picture = (colour: string): Promise<Buffer> => sharp({ create: { width: 32, height: 18, channels: 3, background: colour } }).png().toBuffer();

const post = (more: Record<string, unknown> = {}) => ({
  from: 'output/work/ny.png',
  file: 'dealers/p/anchors/spelaren-redo.png',
  group: 'anchors',
  dealer: 'p',
  title: 'REDO ur Spelaren',
  note: 'Gjord i natt.',
  pose: 'redo',
  use: 'dealerfilm',
  view: { kind: 'spelaren' },
  source: { from: 'runway', taskId: 't-1', credits: 10 },
  ...more,
});

test('importen för in en fil med mätta mått och sha256, status att granska och var den låg', async () => {
  put('output/work/ny.png', await picture('#ff0000'));
  const bytes = readFileSync(join(root, 'output/work/ny.png'));
  const saved = await importAsset(root, post({ width: 1920, height: 1080, bytes: 5, seconds: 4, fps: 24 }));
  assert.deepEqual(readFileSync(join(root, 'assets', saved.file)), bytes);
  assert.deepEqual([saved.status, saved.width, saved.height, saved.bytes], ['att granska', 32, 18, bytes.length], 'det mätta vinner över posten');
  assert.equal('seconds' in saved || 'fps' in saved, false, 'en bild får ingen längd');
  assert.deepEqual(saved.source, { from: 'runway', taskId: 't-1', credits: 10, sha256: sha(bytes) });
  assert.deepEqual(readRegistry(root).assets.at(-1), saved);
  assert.deepEqual(rows('SELECT imported_from FROM files'), [{ imported_from: 'output/work/ny.png' }]);
  await assert.rejects(importAsset(root, post()), /har redan en post/);
});

test('importen tar inte emot en post med hål i, och lämnar då ingen fil efter sig', async () => {
  put('output/work/ny.png', await picture('#ff0000'));
  for (const [what, broken] of [
    ['from saknas', post({ from: undefined })],
    ['finns inte', post({ from: 'output/work/saknas.png' })],
    ['file', post({ file: '../utanfor.png' })],
    ['file', post({ file: 'Stora/Bokstaver.png' })],
    ['title', post({ title: '' })],
    ['gruppen', post({ group: 'okand' })],
    ['source', post({ source: { taskId: 't-1' } })],
    ['okänd status', post({ status: 'kanske' })],
  ] as const) {
    await assert.rejects(importAsset(root, broken), (error: Error) => error instanceof RegistryError && error.message.includes(what), what);
  }
  assert.equal(readRegistry(root).assets.length, 0);
  assert.equal(existsSync(join(root, 'assets')), false);
});

test('en fil som redan ligger där byts bara när posten säger replace, och då byts posten på sin plats', async () => {
  addEntry(root, entry('dealers/p/anchors/gammal.png', { group: 'anchors', status: 'godkänd', statusBy: 'Jakob' }));
  addEntry(root, entry('dealers/p/anchors/annan.png', { group: 'anchors' }));
  put('output/work/ny.png', await picture('#ff0000'));
  const over = post({ file: 'dealers/p/anchors/gammal.png', title: 'Ny på gamla platsen' });
  await assert.rejects(importAsset(root, over), /finns redan i assets/);
  const saved = await importAsset(root, { ...over, replace: true });
  assert.deepEqual(readFileSync(join(root, 'assets', saved.file)), readFileSync(join(root, 'output/work/ny.png')));
  const registry = readRegistry(root);
  assert.deepEqual(registry.assets.map((item) => item.file), ['dealers/p/anchors/gammal.png', 'dealers/p/anchors/annan.png']);
  assert.equal(registry.assets[0]!.title, 'Ny på gamla platsen');
  assert.equal(registry.assets[0]!.status, 'att granska', 'den nya filen har inte fått något omdöme');
  assert.equal('replace' in registry.assets[0]!, false);
  assert.deepEqual(rows("SELECT status FROM verdicts WHERE file = 'dealers/p/anchors/gammal.png' ORDER BY id").map((row) => row.status), ['godkänd', 'att granska']);
});

test('posterna läses ur en fil som en post eller en lista, och en fil som saknas eller inte är JSON sägs med sitt namn', () => {
  put('output/work/en.json', JSON.stringify(post()));
  put('output/work/flera.json', JSON.stringify([post(), post({ file: 'dealers/p/anchors/lagt.png' })]));
  put('output/work/trasig.json', '{ "file": ');
  assert.deepEqual(readPosts(join(root, 'output/work/en.json')), [post()]);
  assert.equal(readPosts(join(root, 'output/work/flera.json')).length, 2);
  assert.throws(() => readPosts(join(root, 'output/work/finns-inte.json')), /finns-inte\.json går inte att läsa/);
  assert.throws(() => readPosts(join(root, 'output/work/trasig.json')), /trasig\.json är inte giltig JSON/);
});

test('att arkivera flyttar filen till output/work/arkiv och antecknar posten med sitt omdöme och var den ligger', () => {
  const take = entry('dealers/p/clips/t1.mp4', { group: 'clips' });
  addEntry(root, take);
  setStatus(root, take.file, 'utgår', 'Granskaren: handen svävar', '2026-11-18 10:30');
  const content = readFileSync(join(root, 'assets', take.file));
  const place = archive(root, take.file, 'Underkänd tagning.', '2026-11-18 10:40');
  assert.equal(place, 'output/work/arkiv/dealers/p/clips/t1.mp4');
  assert.equal(existsSync(join(root, 'assets', take.file)), false);
  assert.deepEqual(readFileSync(join(root, place)), content, 'filen finns kvar, flyttad');
  assert.equal(getEntry(root, take.file), undefined);
  const [record] = rows('SELECT * FROM left_out');
  assert.deepEqual({ ...record, post: undefined }, { id: 1, what: take.file, why: 'Underkänd tagning.', how: 'arkiverad', at: '2026-11-18 10:40', sha256: sha(content), place, post: undefined });
  const kept = JSON.parse(String(record!.post));
  assert.deepEqual([kept.status, kept.statusBy], ['utgår', 'Granskaren: handen svävar'], 'vad den var och omdömet står kvar');
  assert.equal(rows('SELECT count(*) AS n FROM verdicts')[0]!.n, 2, 'historiken står kvar');
  assert.deepEqual(check(root), []);
  assert.throws(() => archive(root, take.file, 'igen', '2026-11-18 10:41'), /Ingen post/);
});

test('att ta bort raderar filen och posten och antecknar vad som togs bort och varför', () => {
  const old = entry('dealers/p/anchors/vila-helfigur.png', { group: 'anchors', source: { measured: 'mätt' } });
  addEntry(root, old);
  const done = remove(root, old.file, 'Används inte av produktionslinjen.', '2026-11-18 10:50');
  assert.deepEqual(done, { hadFile: true });
  assert.equal(existsSync(join(root, 'assets', old.file)), false);
  assert.equal(readdirSync(join(root, 'assets/dealers/p/anchors')).length, 0, 'filen finns inte kvar någonstans');
  assert.equal(readRegistry(root).assets.length, 0);
  assert.deepEqual(rows('SELECT what, why, how, place FROM left_out'), [{ what: old.file, why: 'Används inte av produktionslinjen.', how: 'borttagen', place: null }]);
  assert.deepEqual(rows('SELECT count(*) AS n FROM measurements'), [{ n: 0 }], 'postens mätningar följer med posten till left_out');
  const shown = about(root, old.file);
  assert.equal(shown.entry, undefined);
  assert.deepEqual(JSON.parse(String(shown.leftOut[0]!.post)), old);
});

test('en fil nämns med sitt namn, en del av sökvägen eller filnamnet, men inte genom en annan fil med samma namn', () => {
  // Påhittade namn: provet ska inte självt peka på en riktig fil i registret.
  const file = 'dealers/x/anchors/prov.png';
  for (const said of [file, `assets/${file}`, 'output/work/arkiv/dealers/x/anchors/prov.png', 'anchors/prov.png', 'ankaret `prov.png`, sett', '"prov.png".']) {
    assert.equal(mentions(said, file), true, said);
  }
  for (const said of ['scene/prov.png', 'dealers/y/anchors/prov.png', 'gammal-prov.png', 'prov.png.bak', 'prov.pngx', 'prov-hel.png']) {
    assert.equal(mentions(said, file), false, said);
  }
});

test('det som pekar på en fil hindrar att den tas bort eller arkiveras; dokument och beställningar gör det inte', () => {
  const base = entry('dealers/p/anchors/bas.png', { group: 'anchors' });
  const made = entry('dealers/p/anchors/gjord.png', { group: 'anchors', source: { references: [{ what: 'utsnitt ur dealers/p/anchors/bas.png' }] } });
  const named = entry('scene/backgrounds/rum.jpg');
  const coded = entry('reference/kod.png', { group: 'reference' });
  for (const item of [base, made, named, coded]) addEntry(root, item);
  put('content/scene.json', JSON.stringify({ room: { file: named.file } }));
  put('src/lab/prov.test.ts', "const fil = 'kod.png';");
  put('docs/production.md', 'Receptet står i `dealers/p/anchors/gjord.png`.');
  addOrder(root, { model: 'nano-banana-pro', basis: 'antaget', result: made.file, inputs: 'dealers/p/anchors/bas.png' });

  assert.deepEqual(pointersTo(root, base.file).map((pointer) => [pointer.where, pointer.blocks]), [['posten dealers/p/anchors/gjord.png', true], ['beställningen rad 1 (indata)', false]]);
  assert.throws(() => remove(root, base.file, 'x', stamp()), /pekar på den/);
  assert.throws(() => remove(root, named.file, 'x', stamp()), /content\/scene\.json/);
  assert.throws(() => archive(root, coded.file, 'x', stamp()), /src\/lab\/prov\.test\.ts:1/);
  assert.equal(readRegistry(root).assets.length, 4, 'ingenting togs bort');
  assert.ok(existsSync(join(root, 'assets', base.file)));

  remove(root, made.file, 'Docs och beställningar hindrar inte.', stamp());
  remove(root, base.file, 'Nu pekar ingen post på den.', stamp());
  assert.deepEqual(readRegistry(root).assets.map((item) => item.file), [named.file, coded.file]);
});

test('det oanvända räknas upp med skäl: utgår, och det som ingenting använt pekar på; en tagning arkiveras', () => {
  const items = [
    entry('dealers/p/identity/ansikte.png', { group: 'identity' }),
    entry('dealers/p/anchors/redo.png', { group: 'anchors', use: 'dealerfilm', view: { kind: 'spelaren' } }),
    entry('dealers/p/clips/giv.mp4', { group: 'clips', use: 'dealerfilm', view: { kind: 'spelaren' }, source: { references: [{ what: 'dealers/p/anchors/lagt.png' }] } }),
    entry('dealers/p/anchors/lagt.png', { group: 'anchors' }),
    entry('dealers/p/anchors/gammal.png', { group: 'anchors' }),
    entry('dealers/p/clips/fel.mp4', { group: 'clips', use: 'dealerfilm', view: { kind: 'plats', seat: 7 }, status: 'utgår' }),
    entry('scene/backgrounds/rum.jpg'),
    entry('reference/rorelse.mp4', { group: 'reference' }),
    entry('reference/gammal-film.mp4', { group: 'reference', source: { references: [{ what: 'dealers/p/anchors/gammal.png' }] } }),
    entry('reference/indata.png', { group: 'reference' }),
  ];
  for (const item of items) addEntry(root, item);
  put('content/moves/giv.json', JSON.stringify({ source: 'läst ur reference/rorelse.mp4' }));
  addOrder(root, { model: 'nano-banana-pro', basis: 'antaget', result: 'dealers/p/anchors/redo.png', inputs: 'underlag reference/indata.png' });

  const found = unused(root);
  assert.deepEqual(
    found.map((item) => [item.file, item.then]),
    [
      ['dealers/p/anchors/gammal.png', 'ta-bort'],
      ['dealers/p/clips/fel.mp4', 'arkivera'],
      ['reference/gammal-film.mp4', 'ta-bort'],
    ],
  );
  assert.equal(found[1]!.why, 'status utgår');
  assert.match(found[0]!.why, /^ankare: ingen dealerfilm, vy, content\/ eller använd post pekar på den/);
  assert.deepEqual(found[0]!.notes, ['posten reference/gammal-film.mp4 pekar på den: ta-bort vägrar tills pekaren är borta']);
});

test('kontrollen finner fil utan post, post utan fil och fel sha256, och säger vad man ska göra', () => {
  addEntry(root, entry('scene/a.png'));
  addEntry(root, entry('scene/b.png'));
  addEntry(root, entry('scene/c.png'));
  assert.deepEqual(check(root), []);
  rmSync(join(root, 'assets/scene/b.png'));
  put('assets/scene/c.png', 'bytt innehåll');
  put('assets/scene/ny.png', 'utan post');
  const problems = check(root);
  assert.deepEqual(problems.map((problem) => [problem.file, problem.what.split(':')[0]]), [
    ['scene/b.png', 'posten har ingen fil i assets/'],
    ['scene/c.png', 'fel sha256'],
    ['scene/ny.png', 'filen i assets/ har ingen post'],
  ]);
  assert.ok(problems.every((problem) => problem.fix.length > 10));
});

test('en fråga får läsa vad som helst men inte skriva', () => {
  addEntry(root, entry('scene/a.png'));
  assert.deepEqual(query(root, 'SELECT file, status FROM register'), { columns: ['file', 'status'], rows: [{ file: 'scene/a.png', status: 'att granska' }] });
  for (const sql of ["UPDATE files SET title = 'x'", 'DELETE FROM files', 'DROP TABLE files', "INSERT INTO verdicts (file, status) VALUES ('scene/a.png', 'utgår')"]) {
    assert.throws(() => query(root, sql), /Frågan gick inte/, sql);
  }
  assert.throws(() => query(root, 'SELECT * FROM finns_inte'), /no such table/);
  assert.equal(getEntry(root, 'scene/a.png')!.title, 'scene/a.png');
});

test('en beställning: mätt kostnad kräver saldot före och efter, krediterna räknas ur dem, och ett taskId står en gång', () => {
  const id = addOrder(root, { at: '2026-11-18 09:44', model: 'kling-4', taskId: 't-9', balanceBefore: 4413, balanceAfter: 4328, basis: 'mätt', result: 'assets/dealers/p/clips/giv.mp4' });
  assert.deepEqual(rows(`SELECT kind, credits, basis, result FROM orders WHERE id = ${id}`), [{ kind: 'film', credits: 85, basis: 'mätt', result: 'dealers/p/clips/giv.mp4' }]);
  assert.throws(() => addOrder(root, { model: 'kling-4', credits: 85, basis: 'mätt' }), /kräver saldot före och efter/);
  assert.throws(() => addOrder(root, { model: 'kling-4', credits: 80, balanceBefore: 100, balanceAfter: 10, basis: 'mätt' }), /inte skillnaden/);
  assert.throws(() => addOrder(root, { model: 'kling-4', basis: 'gissat' as 'mätt' }), /basis/);
  assert.throws(() => addOrder(root, { model: 'kling-4', taskId: 't-9', basis: 'antaget' }), /står redan i registret \(rad 1\)/);
  addOrder(root, { model: 'nano-banana-pro', credits: 20, basis: 'antaget', kind: null });
  assert.deepEqual(rows('SELECT kind, credits, basis FROM orders WHERE id = 2'), [{ kind: null, credits: 20, basis: 'antaget' }]);
});

test('en uppladdning sparas utan signatur, med filens sha256 och när adressen slutar gälla', () => {
  put('output/work/ref.png', 'bilden');
  const token = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(new Date(2026, 10, 19, 21, 30).getTime() / 1000) })).toString('base64url')}.sig`;
  const url = `https://cdn.example/datasets/abc.png?_jwt=${token}`;
  assert.equal(expiryOf(url), '2026-11-19 21:30');
  addUpload(root, { file: 'output/work/ref.png', url, assetId: 'a-1', at: '2026-11-18 09:43' });
  assert.deepEqual(rows('SELECT file, sha256, basis, url, asset_id, at, expires FROM uploads'), [
    { file: 'output/work/ref.png', sha256: sha('bilden'), basis: 'mätt', url: 'https://cdn.example/datasets/abc.png', asset_id: 'a-1', at: '2026-11-18 09:43', expires: '2026-11-19 21:30' },
  ]);
  assert.equal(readFileSync(registerPath(root)).includes(Buffer.from('_jwt')), false, 'signaturen finns inte i databasen');
  assert.throws(() => addUpload(root, { file: 'output/work/saknas.png', url }), /finns inte/);
});

test('en mätning förs in för en fil som har en post, och syns när filen visas', () => {
  addEntry(root, entry('dealers/p/clips/giv.mp4', { group: 'clips' }));
  addMeasurement(root, { file: 'dealers/p/clips/giv.mp4', what: 'kortet stilla från', value: '3,29 s', basis: 'mätt', who: 'granskaren', at: '2026-11-18 10:00' });
  addMeasurement(root, { file: 'dealers/p/clips/giv.mp4', what: 'kort per ruta', value: [{ frame: 79 }], basis: 'mätt' });
  assert.deepEqual(about(root, 'dealers/p/clips/giv.mp4').measurements.map((row) => [row.what, row.value]), [['kortet stilla från', '3,29 s'], ['kort per ruta', '[{"frame":79}]']]);
  assert.throws(() => addMeasurement(root, { file: 'scene/finns-inte.png', what: 'x', value: '1', basis: 'mätt' }), /Ingen post/);
  assert.equal(getEntry(root, 'dealers/p/clips/giv.mp4')!.source && 'measured' in (getEntry(root, 'dealers/p/clips/giv.mp4')!.source as object), false, 'en egen mätning är inte postens');
});

test('en mätares egna mätningar av en fil kan tas bort för att mätas om; andras och postens står kvar', () => {
  addEntry(root, entry('dealers/p/clips/giv.mp4', { group: 'clips', source: { measured: { lands: 1.92 } } }));
  addMeasurement(root, { file: 'dealers/p/clips/giv.mp4', what: 'takt', value: '1,49', basis: 'mätt', who: 'src/pipeline/tagning.ts' });
  addMeasurement(root, { file: 'dealers/p/clips/giv.mp4', what: 'skon', value: '1,44', basis: 'mätt', who: 'src/pipeline/tagning.ts' });
  addMeasurement(root, { file: 'dealers/p/clips/giv.mp4', what: 'takt', value: '1,49', basis: 'mätt', who: 'granskaren' });
  assert.equal(dropMeasurements(root, 'assets/dealers/p/clips/giv.mp4', 'src/pipeline/tagning.ts'), 2);
  assert.deepEqual(about(root, 'dealers/p/clips/giv.mp4').measurements.map((row) => row.who), ['granskaren']);
  assert.deepEqual((getEntry(root, 'dealers/p/clips/giv.mp4')!.source as { measured: unknown }).measured, { lands: 1.92 });
  assert.equal(dropMeasurements(root, 'dealers/p/clips/giv.mp4', 'src/pipeline/tagning.ts'), 0);
  assert.throws(() => dropMeasurements(root, 'dealers/p/clips/giv.mp4', ''), RegistryError);
});

test('summeringen räknar poster per grupp och status, och de andra tabellerna', () => {
  addEntry(root, entry('scene/a.png'));
  addEntry(root, entry('scene/b.png', { status: 'godkänd' }));
  addEntry(root, entry('dealers/p/anchors/a.png', { group: 'anchors', status: 'utgår' }));
  addOrder(root, { model: 'kling-4', balanceBefore: 100, balanceAfter: 15, basis: 'mätt' });
  addOrder(root, { model: 'nano-banana-pro', credits: 20, basis: 'antaget' });
  remove(root, 'dealers/p/anchors/a.png', 'utgår', stamp());
  const { statuses, groups, totals } = summary(root);
  assert.deepEqual(statuses, Object.keys(SEED.statuses));
  assert.deepEqual(groups.find((row) => row.group === 'backgrounds'), { group: 'backgrounds', counts: { 'att granska': 1, godkänd: 1, 'granska igen': 0, utgår: 0 }, total: 2 });
  assert.deepEqual({ ...totals }, { posts: 2, orders: 2, measured_credits: 85, assumed_credits: 20, uploads: 0, measurements: 0, verdicts: 3, left_out: 0, archived: 0, removed: 1, files: 2 });
});

const run = promisify(execFile);
const reg = (...words: string[]) =>
  run(process.execPath, [join(import.meta.dirname, 'registry.ts'), ...words], { env: { ...process.env, STUDIO_DATA: root } }).then(
    (done) => ({ code: 0, out: done.stdout, err: done.stderr }),
    (failed: { code: number; stdout: string; stderr: string }) => ({ code: failed.code, out: failed.stdout, err: failed.stderr }),
  );

test('kommandoraden: kö, omdöme, svar, fråga och kontroll, med korta svar och felkoder', async () => {
  addEntry(root, entry('scene/a.png'));
  setStatus(root, 'scene/a.png', 'granska igen', 'Jakob i Labbet 2026-11-18', '2026-11-18 05:30');
  assert.deepEqual(await reg('queue'), { code: 0, out: '1 i kö\n- scene/a.png [granska igen] (ingen motivering)\n', err: '' });
  assert.deepEqual(await reg('status', 'scene/a.png', 'godkänd', 'Granskaren: rätt ljus'), { code: 0, out: 'scene/a.png: godkänd (Granskaren: rätt ljus)\n', err: '' });
  assert.deepEqual(await reg('reply', 'scene/a.png', 'Ljuset är rättat.'), { code: 0, out: 'scene/a.png: svar sparat\n', err: '' });
  assert.equal(getEntry(root, 'scene/a.png')!.reply, 'Ljuset är rättat.');
  assert.equal((await reg('sql', 'SELECT status FROM register')).out, 'status\ngodkänd\n(1 rader)\n');
  assert.match((await reg('check')).out, /^Registret stämmer med assets\/: 1 filer/);
  assert.match((await reg('show', 'assets/scene/a.png')).out, /^file: scene\/a\.png\n/m);
  const wrong = await reg('status', 'scene/a.png', 'kanske', 'x');
  assert.deepEqual([wrong.code, wrong.err], [1, 'Okänd status: kanske. Statusarna är att granska, godkänd, granska igen, utgår.\n']);
  const unknown = await reg('stryk', 'scene/a.png');
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /^Okänt ord eller fel antal argument: stryk scene\/a\.png\nAnvänd: npm run reg -- <ord>/);
  rmSync(registerPath(root));
  const missing = await reg('queue');
  assert.deepEqual([missing.code, missing.err.startsWith('Registret finns inte:')], [1, true]);
});

test('i det riktiga registret är scenens bord och sko modeller', () => {
  const project = join(import.meta.dirname, '..', '..');
  const scene = readScene(JSON.parse(readFileSync(join(project, 'content', 'scene.json'), 'utf8')));
  const registry = readRegistry(project);
  for (const file of [scene.table.file, scene.shoe.file]) {
    assert.equal(registry.assets.find((asset) => asset.file === file)?.group, 'models', `${file} ska vara en modell i registret`);
  }
});
