// Förlagan: namnet, platsen under output/forlagor/, beställningen, och att rutorna blir en stillbild eller ett klipp.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { ForlagaError, forlagaName, forlagaPaths, forlagorDir, framePath, readOrder, saveFrame, startForlaga, type ForlagaOrder } from './forlaga.ts';

let root: string;
before(() => {
  root = mkdtempSync(join(tmpdir(), 'forlaga-'));
});
after(() => {
  rmSync(root, { recursive: true, force: true });
});

const FRAME = { width: 64, height: 36 };
const order = (more: Partial<ForlagaOrder> = {}): ForlagaOrder => ({
  still: false,
  frames: 3,
  fps: 30,
  frame: FRAME,
  view: { kind: 'spelaren' },
  eye: { position: [0, 0.6, 0.5562], forward: [0, -0.2756, -0.9613], focalPx: 43.5 },
  dealer: { kind: 'film', file: 'dealers/paulina/clips/giv-4-t1.mp4', view: { kind: 'spelaren' } },
  background: { file: 'scene/backgrounds/balsal.jpg', kind: '360', turn: 0, lift: 0, blur: 6, exposure: 0.42, mirror: false, height: 1.6, radius: 8 },
  studio: null,
  shoe: true,
  ...more,
});
const picture = (colour: string, size = FRAME): Promise<Buffer> =>
  sharp({ create: { ...size, channels: 3, background: colour } })
    .png()
    .toBuffer();
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('förlagans namn byggs av dealerns filnamn, vyn och bakgrunden', () => {
  assert.equal(forlagaName(order()), 'giv-4-t1_spelaren_balsal');
  assert.equal(forlagaName(order({ view: { kind: 'plats', seat: 7 }, still: true })), 'giv-4-t1_plats-7_balsal_bild');
  assert.equal(forlagaName(order({ view: { kind: 'plats', seat: 2 }, dealer: null, background: null })), 'utan-dealer_plats-2_utan-rum');
  // Namnet städas: bara små bokstäver, siffror, bindestreck och understrecken mellan delarna, vad filerna än heter.
  const odd = forlagaName(
    order({
      dealer: { kind: 'film', file: '../../Hemlig Mapp/VILA (ny) åäö.PNG', view: { kind: 'spelaren' } },
      background: { ...order().background!, file: 'scene\\backgrounds\\..\\..\\rum.v2.jpg' },
    }),
  );
  assert.equal(odd, 'vila-ny-aao_spelaren_rum-v2');
  assert.equal(forlagaName(order({ dealer: { kind: 'film', file: '.../', view: { kind: 'spelaren' } } })), 'utan-dealer_spelaren_balsal');
  assert.ok(forlagaName(order({ dealer: { kind: 'film', file: `${'x'.repeat(300)}.mp4`, view: { kind: 'spelaren' } } })).length <= 120);
});

test('dockan, närbilden, ateljén och ett eget ord syns i förlagans namn', () => {
  const doll = order({
    dealer: { kind: 'docka', move: 'giv-nyp-plats-4', pose: 'giv' },
    view: { kind: 'spelaren', close: true },
    background: null,
    studio: { screen: [2, 182, 48], table: [2, 182, 48] },
  });
  assert.equal(forlagaName(doll), 'docka-giv-nyp-plats-4_spelaren-nara_atelje');
  assert.equal(forlagaName({ ...doll, still: true, label: 'LAGT 4' }), 'docka-giv-nyp-plats-4_spelaren-nara_atelje_bild_lagt-4');
  assert.equal(forlagaName({ ...doll, dealer: { kind: 'docka', move: 'giv-nyp-plats-4', pose: 'vila' }, view: { kind: 'plats', seat: 7, close: true } }), 'docka-vila_plats-7-nara_atelje');
  const film = order({ dealer: { kind: 'film', file: 'dealers/paulina/clips/giv-4_spelaren.mp4', view: { kind: 'spelaren' } } });
  assert.equal(forlagaName(film), 'giv-4-spelaren_spelaren_balsal');
  // Beställningen läses med de nya delarna, och det som inte hör dit följer inte med.
  assert.deepEqual(readOrder({ ...doll, label: 'redo' }), { ...doll, label: 'redo' });
  assert.deepEqual(readOrder(film).dealer, film.dealer);
  assert.deepEqual(readOrder({ ...order(), studio: undefined }).studio, null);
  // Rutnätet, kortplatserna och scenens kort följer med när de är sagda, och bara då.
  const laid = { ...film, places: true, card: { seat: 4, index: 0, face: 'A♠', from: 3, annat: 1 }, studio: { screen: [2, 182, 48], table: [20, 215, 60], grid: [0, 165, 30] } };
  assert.deepEqual(readOrder(laid).card, { seat: 4, index: 0, face: 'A♠', from: 3 });
  assert.deepEqual(readOrder(laid).studio, { screen: [2, 182, 48], table: [20, 215, 60], grid: [0, 165, 30] });
  assert.equal(readOrder(laid).places, true);
  assert.equal('card' in readOrder(film) || 'places' in readOrder(film), false);
  assert.equal(forlagaName({ ...doll, dealer: { kind: 'docka', move: 'giv-nyp-plats-4', pose: 'giv', seat: 7 } }), 'docka-giv-nyp-plats-4-till-7_spelaren-nara_atelje');
  // En cykel till en annan kortplats: kortplatsen följer med i beställningen och syns i namnet.
  const cycle = { ...doll, dealer: { kind: 'docka', move: 'cykel-nyp', pose: 'giv', seat: 7, index: 1 } } as const;
  assert.equal(forlagaName(cycle), 'docka-cykel-nyp-till-7-kort-1_spelaren-nara_atelje');
  assert.deepEqual(readOrder(cycle).dealer, cycle.dealer);
  for (const [what, broken] of [
    ['dealer', { ...doll, dealer: { kind: 'docka', move: 'cykel-nyp', pose: 'giv', seat: 7, index: -1 } }],
    ['dealer', { ...doll, dealer: { kind: 'docka', move: '../hemligt', pose: 'giv' } }],
    ['dealer', { ...doll, dealer: { kind: 'docka', move: 'giv-nyp-plats-4' } }],
    ['dealer', { ...film, dealer: { kind: 'film', file: 'a.mp4', view: { kind: 'filmkameran' } } }],
    ['dealer', { ...film, dealer: { kind: 'helfigur', file: 'a.mp4' } }],
    ['view', { ...film, view: { kind: 'filmkameran' } }],
    ['studio', { ...doll, studio: { screen: [2, 182, 480], table: null } }],
    ['view', { ...doll, view: { kind: 'spelaren', close: 'ja' } }],
    ['card', { ...film, card: { seat: 4, index: 0, face: 'A♠' } }],
    ['card', { ...film, card: { seat: 0, index: 0, face: 'A♠', from: 3 } }],
    ['dealer', { ...doll, dealer: { kind: 'docka', move: 'giv-nyp-plats-4', pose: 'giv', seat: 0 } }],
    ['studio', { ...doll, studio: { screen: [2, 182, 48], table: null, grid: 'grön' } }],
  ] as const) {
    assert.throws(() => readOrder(broken), new RegExp(`går inte att använda: .*${what}`), what);
  }
});

test('en förlaga ligger under output/forlagor, och ett namn som pekar någon annanstans tas inte emot', () => {
  const paths = forlagaPaths(root, 'liv-vila-redo_spelaren_balsal');
  const base = forlagorDir(root);
  assert.equal(base, join(root, 'output', 'forlagor'));
  assert.equal(paths.dir, join(base, 'liv-vila-redo_spelaren_balsal'));
  assert.equal(paths.film, join(base, 'liv-vila-redo_spelaren_balsal.mp4'));
  assert.equal(paths.picture, join(base, 'liv-vila-redo_spelaren_balsal.png'));
  assert.equal(paths.json, join(base, 'liv-vila-redo_spelaren_balsal.json'));
  assert.equal(framePath(root, 'a_b', 0), join(base, 'a_b', 'ruta-0001.png'));
  assert.equal(framePath(root, 'a_b', 119), join(base, 'a_b', 'ruta-0120.png'));
  for (const name of ['', '..', '../x', 'a/b', 'a\\b', 'A', '.dold', 'a b', 'a.mp4', 'x'.repeat(121)]) {
    assert.throws(() => forlagaPaths(root, name), ForlagaError, `namnet ”${name}”`);
  }
  for (const index of [-1, 1.5, Number.NaN, 3600]) assert.throws(() => framePath(root, 'a', index), ForlagaError, `ruta ${index}`);
});

test('en beställning med hål i tas inte emot, och bara förlagans egna fält följer med', () => {
  assert.deepEqual(readOrder({ ...order(), annat: 'följer inte med', eye: { ...order().eye, frame: FRAME } }), order());
  assert.deepEqual(readOrder(order({ view: { kind: 'plats', seat: 2 }, dealer: null, background: null })).view, { kind: 'plats', seat: 2 });
  assert.equal(readOrder(order({ still: true, frames: 1, dealer: { ...order().dealer!, time: 1.25 } })).dealer?.time, 1.25);
  for (const [what, broken] of [
    ['frames', order({ frames: 0 })],
    ['frames', order({ frames: 100000 })],
    ['en stillbild är en ruta', order({ still: true })],
    ['fps', order({ fps: 0 })],
    ['frame', order({ frame: { width: 1920.5, height: 1080 } })],
    ['view', { ...order(), view: { kind: 'fri' } }],
    ['view', { ...order(), view: { kind: 'plats' } }],
    ['eye', { ...order(), eye: { position: [0, 0], forward: [0, 0, -1], focalPx: 1 } }],
    ['dealer', { ...order(), dealer: { kind: 'docka', file: 'x.mp4' } }],
    ['dealer', { ...order(), dealer: undefined }],
    ['background', { ...order(), background: { file: 'rum.jpg' } }],
    ['shoe', { ...order(), shoe: 'ja' }],
  ] as const) {
    assert.throws(() => readOrder(broken), new RegExp(`går inte att använda: .*${what}`), what);
  }
  assert.throws(() => readOrder(null), ForlagaError);
});

test('en stillbild sparas som en bild med beskrivningen bredvid', async () => {
  const started = startForlaga(root, order({ still: true, frames: 1, view: { kind: 'plats', seat: 7 }, dealer: { ...order().dealer!, time: 1.25 } }));
  assert.deepEqual(started, { name: 'giv-4-t1_plats-7_balsal_bild', frames: 1 });
  const saved = await saveFrame(root, started.name, 0, await picture('#225577'), '2026-11-18 07:00');
  assert.deepEqual(saved, {
    name: started.name,
    file: `output/forlagor/${started.name}.png`,
    json: `output/forlagor/${started.name}.json`,
    frames: 1,
    seconds: 0,
  });
  const meta = await sharp(join(root, saved!.file)).metadata();
  assert.deepEqual([meta.width, meta.height], [64, 36]);
  const record = JSON.parse(readFileSync(join(root, saved!.json), 'utf8'));
  assert.equal(record.savedAt, '2026-11-18 07:00');
  assert.deepEqual(record.view, { kind: 'plats', seat: 7 });
  assert.deepEqual(record.eye, order().eye);
  assert.deepEqual(record.dealer, { ...order().dealer, time: 1.25 });
  assert.deepEqual(record.background, order().background);
  assert.deepEqual([record.frame, record.frames, record.seconds, record.file], [FRAME, 1, 0, saved!.file]);
  // Mappen med den enda rutan behövs inte efteråt.
  assert.ok(!existsSync(forlagaPaths(root, started.name).dir));
});

test('en ruta som inte hör till förlagan tas inte emot', async () => {
  const { name } = startForlaga(root, order({ dealer: { kind: 'film', file: 'fel.mp4', view: { kind: 'spelaren' } } }));
  const good = await picture('#113355');
  await assert.rejects(saveFrame(root, 'inte-borjad', 0, good, ''), /inte påbörjad/);
  await assert.rejects(saveFrame(root, '../x', 0, good, ''), /Ogiltigt namn/);
  await assert.rejects(saveFrame(root, name, 3, good, ''), /har 3 rutor/);
  await assert.rejects(saveFrame(root, name, -1, good, ''), /Ogiltigt nummer/);
  await assert.rejects(saveFrame(root, name, 0, Buffer.from('inte en bild, bara text som är lång nog'), ''), /inte en PNG/);
  await assert.rejects(saveFrame(root, name, 0, await picture('#113355', { width: 32, height: 36 }), ''), /32 × 36; förlagan är 64 × 36/);
  // Den sista rutan gör inte förlagan klar när andra saknas.
  await assert.rejects(saveFrame(root, name, 2, good, ''), /saknar 2 av 3 rutor, först ruta 1/);
  assert.deepEqual(readdirSync(forlagaPaths(root, name).dir).sort(), ['bestallning.json', 'ruta-0003.png']);
  // En ny sparning med samma namn börjar om från en tom mapp.
  startForlaga(root, order({ dealer: { kind: 'film', file: 'fel.mp4', view: { kind: 'spelaren' } } }));
  assert.deepEqual(readdirSync(forlagaPaths(root, name).dir), ['bestallning.json']);
});

test('ett klipp sätts ihop av rutorna när den sista är inne', { skip: hasFfmpeg ? false : 'ffmpeg finns inte på den här datorn' }, async () => {
  const { name } = startForlaga(root, order());
  assert.equal(name, 'giv-4-t1_spelaren_balsal');
  assert.equal(await saveFrame(root, name, 0, await picture('#102030'), '2026-11-18 07:10'), null);
  assert.equal(await saveFrame(root, name, 1, await picture('#405060'), '2026-11-18 07:10'), null);
  const saved = await saveFrame(root, name, 2, await picture('#708090'), '2026-11-18 07:10');
  assert.deepEqual(saved, { name, file: `output/forlagor/${name}.mp4`, json: `output/forlagor/${name}.json`, frames: 3, seconds: 0.1 });
  assert.ok(statSync(join(root, saved!.file)).size > 0);
  // Klippet har rutornas mått, takt och antal, i det färgformat som webbläsare läser.
  const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=width,height,pix_fmt,r_frame_rate,nb_read_frames', '-of', 'csv=p=0', join(root, saved!.file)]);
  assert.equal(probe.stdout.toString().trim(), '64,36,yuv420p,30/1,3');
  const record = JSON.parse(readFileSync(join(root, saved!.json), 'utf8'));
  assert.deepEqual([record.name, record.still, record.frames, record.fps, record.seconds], [name, false, 3, 30, 0.1]);
  // Mappen med rutorna behövs inte efteråt: klippet och beskrivningen står kvar.
  assert.ok(!existsSync(forlagaPaths(root, name).dir));
});
