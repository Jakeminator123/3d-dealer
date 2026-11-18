// Tagningen: texten, gränserna i content/tagning.json, paketets innehåll, ta-emot utan film från Runway, och registreringen.
// Ingen webbläsare och ingen beställning: dockans film och den "nedladdade" filmen görs med ffmpeg.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { probe } from './matning.ts';
import { about, createRegister, getEntry } from './registry.ts';
import { cardWords, clipFile, forbered, matOm, nextTake, packageId, promptFor, readTagning, registrera, taEmot, type PostFile } from './tagning.ts';

const root = resolve(import.meta.dirname, '..', '..');
const content = readTagning(root);
const quiet = () => {};

test('texten är pilotens med granskarens två fraser och rättelsen, och samma för varje plats', () => {
  const text = promptFor(content);
  assert.ok(!/[{}]/.test(text), 'inga platshållare');
  assert.ok(text.includes('carries it low over the table to its place, where the last frame shows it'), 'granskarens första fras');
  assert.ok(text.includes('her head turns with it from the shoe to the card\'s place'), 'granskarens andra fras');
  assert.ok(text.includes('the next card stays down in the opening and is not lifted with it'), 'pilotens rättelse');
  assert.ok(!text.includes('in front of her,') && !text.includes('middle of the table'), 'inga ord om plats 4');
  assert.ok(text.startsWith('Locked camera, one continuous shot.') && text.endsWith('No sound.'));
});

test('texten för hålkortet och vändningen är givens med bara de meningar bytta som handlingen kräver', () => {
  const deal = promptFor(content);
  const hole = promptFor(content, 'hole');
  const flip = promptFor(content, 'flip');
  assert.equal(promptFor(content, 'deal'), deal);
  // Hålkortet: läggs gult, vänds inte, och slutar med två gula kort i bild.
  assert.ok(hole.includes('the card is not turned over') && hole.includes('yellow side up') && hole.includes('the yellow one face down on the table'));
  assert.ok(!hole.includes('turn over together') && !hole.includes('blue side up') && !hole.includes('the blue card lies'));
  // Vändningen: inget kort dras; hålkortet ligger på bordet från början och vänds där med samma nyckelvridning som i given.
  assert.ok(flip.includes('A yellow card already lies flat on the table') && flip.includes('without taking a card') && flip.includes('lays the card flat in the same place, blue side up'));
  assert.ok(flip.includes("turn over together about the card's long side, like turning a key"), 'samma vändning som i given');
  assert.ok(!flip.includes('draws the yellow card up out of the opening') && !flip.includes('the whole way out'));
  // Det som inte rör handlingen är ordagrant givens.
  for (const text of [hole, flip]) {
    for (const same of ['Locked camera, one continuous shot.', 'Then she lifts her hand off the card, and it travels back in a calm arc to the card shoe', 'Her other hand rests on the table and does not move.', 'No sound.']) assert.ok(text.includes(same), same);
    assert.ok(!/[{}]/.test(text));
  }
  // En mening som inte står i texten är ett fel: mallen har ändrats utan bytena.
  const changed = { ...content, prompt: { ...content.prompt, text: deal.replace('On the way her wrist rolls once', 'Her wrist rolls once') } };
  assert.throws(() => promptFor(changed, 'hole'), /står inte precis en gång/);
});

test('gränserna: granskarens alla mått, med källa, och dockans film i filmmodellens takt', () => {
  for (const key of ['format', 'ljud', 'takt', 'kortdelar', 'gulForm', 'vandningTillbaka', 'halkortetBlatt', 'vandningenVidPlatsen', 'kortetsRorelse', 'kortetsOverlapp', 'kortetsMitt', 'kortetsYta', 'nastaKortSaknas', 'nastaKortFlyttar', 'handIRedo', 'handMotDockan', 'handBreddMotDockan', 'skarvRegion', 'skarvLjus', 'skarvHand', 'forstaRutan', 'sistaRutan', 'gront', 'skon', 'glipaRutor', 'glipaHojd', 'kortetLigger', 'handenISkon', 'bevisBlatt']) {
    const limit = content.limits[key];
    assert.ok(limit, `gränsen ${key} saknas`);
    assert.ok(limit.source.length > 0, `${key}: källa`);
  }
  assert.deepEqual([content.limits.takt!.see, content.limits.takt!.most], [1.25, 1.6]);
  assert.equal(content.reference.fps, 24);
  assert.equal(content.order.model, 'kling-4');
});

test('paketets namn, klippets namn i registret och nästa tagning', () => {
  const spec = { dealer: 'paulina', view: 'spelaren', seat: 4, index: 0 };
  assert.equal(packageId(spec, 'cykel-nyp', 1), 'paulina_spelaren_cykel-nyp_4-0_t1');
  assert.equal(clipFile({ ...spec, view: 'plats-7', seat: 1, index: 1 }, 'cykel-nyp', 2), 'dealers/paulina/clips/cykel-nyp-1-1_plats-7_t2.mp4');
  // Dealern heter d i namnen, som registrets små bokstäver, och handlingen står efter cykeln när den inte är deal.
  assert.equal(packageId({ ...spec, seat: 'D', index: 0 }, 'cykel-nyp', 1), 'paulina_spelaren_cykel-nyp_d-0_t1');
  assert.equal(packageId({ ...spec, seat: 'D', index: 1, action: 'hole' }, 'cykel-nyp', 1), 'paulina_spelaren_cykel-nyp-hole_d-1_t1');
  assert.equal(packageId({ ...spec, seat: 'D', index: 1, action: 'deal' }, 'cykel-nyp', 1), 'paulina_spelaren_cykel-nyp_d-1_t1');
  assert.equal(clipFile({ ...spec, seat: 'D', index: 1, action: 'flip' }, 'cykel-nyp', 3), 'dealers/paulina/clips/cykel-nyp-flip-d-1_spelaren_t3.mp4');
  assert.equal(cardWords('D', 1, 'flip'), 'vändningen av hålkortet (dealerns kort 1)');
  assert.equal(cardWords(3, 2), 'plats 3, kort 2');
  const dir = mkdtempSync(join(tmpdir(), 'tagning-namn-'));
  try {
    assert.equal(nextTake(dir, spec, 'cykel-nyp'), 1);
    for (const name of ['paulina_spelaren_cykel-nyp_4-0_t1', 'paulina_spelaren_cykel-nyp_4-0_t3', 'paulina_spelaren_cykel-nyp_4-1_t7', 'paulina_spelaren_cykel-nyp_4-0_t2x']) mkdirSync(join(dir, name));
    assert.equal(nextTake(dir, spec, 'cykel-nyp'), 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Ett projekt i en tillfällig mapp: content/ som det är, ett konstgjort REDO-ankare, dockans film och en nedladdad film.
let project = '';
const film = (out: string, colour: string, seconds: number, sound: boolean) =>
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${colour}:s=1920x1080:r=24:d=${seconds}`, ...(sound ? ['-f', 'lavfi', '-i', `sine=d=${seconds}`, '-shortest', '-c:a', 'aac'] : []), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]);

before(async () => {
  project = mkdtempSync(join(tmpdir(), 'tagning-'));
  mkdirSync(join(project, 'content', 'moves'), { recursive: true });
  for (const file of ['scene.json', 'doll.json', 'tagning.json']) copyFileSync(join(root, 'content', file), join(project, 'content', file));
  for (const file of readdirSync(join(root, 'content', 'moves'))) copyFileSync(join(root, 'content', 'moves', file), join(project, 'content', 'moves', file));
  const anchor = join(project, 'assets', 'dealers', 'paulina', 'anchors', 'spelaren-redo.png');
  mkdirSync(join(anchor, '..'), { recursive: true });
  await sharp({ create: { width: 1920, height: 1080, channels: 3, background: { r: 2, g: 182, b: 48 } } }).png().toFile(anchor);
  film(join(project, 'docka.mp4'), '0x767c80', 0.5, false);
  film(join(project, 'nedladdad.mp4'), '0x02b630', 0.5, true);
});
after(() => rmSync(project, { recursive: true, force: true }));

const spec = { dealer: 'paulina', view: 'spelaren', seat: 4, index: 1 };

test('forbered: paketet har bilderna, dockans film, texten och allt beställningen behöver', async () => {
  const made = await forbered(spec, { root: project, reference: 'docka.mp4', say: quiet });
  assert.equal(made.id, 'paulina_spelaren_cykel-nyp_4-1_t1');
  const at = (file: string) => join(made.dir, file);
  for (const file of ['forsta.png', 'sista.png', 'referens.mp4', 'text.txt', 'docka.json', 'ark-docka.jpg', 'bestallning.json']) assert.ok(existsSync(at(file)), `${file} finns i paketet`);
  assert.equal(readFileSync(at('text.txt'), 'utf8'), promptFor(content));
  const order = JSON.parse(readFileSync(at('bestallning.json'), 'utf8'));
  assert.deepEqual([order.model, order.resolution, order.duration, order.ratio], ['kling-4', '1080p', 4, '16:9']);
  assert.deepEqual(Object.keys(order.inputs), ['startFrame', 'endFrame', 'referenceVideos']);
  assert.equal(order.inputs.startFrame.asset, 'dealers/paulina/anchors/spelaren-redo.png');
  assert.equal(order.inputs.referenceVideos[0].durationSeconds, 0.5);
  assert.equal(order.inputs.referenceVideos[0].fps, 24);
  assert.equal(order.clip, 'dealers/paulina/clips/cykel-nyp-4-1_spelaren_t1.mp4');
  assert.equal(order.checks[0].key, 'dockansHandled');
  // Sista bilden är första bilden med märkkortet: bara kortets ruta skiljer, och där är det blått.
  const first = await sharp(at('forsta.png')).raw().toBuffer();
  const last = await sharp(at('sista.png')).raw().toBuffer();
  const corners = order.inputs.endFrame.corners as number[][];
  const xs = corners.map((corner) => corner[0]!);
  const ys = corners.map((corner) => corner[1]!);
  let changed = 0;
  for (let p = 0; p < 1920 * 1080; p++) {
    if (first[p * 3] === last[p * 3] && first[p * 3 + 1] === last[p * 3 + 1] && first[p * 3 + 2] === last[p * 3 + 2]) continue;
    changed++;
    const x = p % 1920;
    const y = Math.floor(p / 1920);
    assert.ok(x >= Math.min(...xs) - 2 && x <= Math.max(...xs) + 2 && y >= Math.min(...ys) - 2 && y <= Math.max(...ys) + 2, `bildpunkten ${x}, ${y} ligger utanför kortet`);
  }
  assert.equal(changed, order.inputs.endFrame.painted);
  // Nästa paket av samma kort är tagning 2.
  const again = await forbered(spec, { root: project, reference: 'docka.mp4', say: quiet });
  assert.equal(again.id, 'paulina_spelaren_cykel-nyp_4-1_t2');
});

test('forbered säger vad som saknas: ankare för vyn, plats och kortplats', async () => {
  await assert.rejects(forbered({ ...spec, view: 'plats-3' }, { root: project, reference: 'docka.mp4', say: quiet }), /inget REDO-ankare för paulina ur plats-3/);
  await assert.rejects(forbered({ ...spec, seat: 9 }, { root: project, reference: 'docka.mp4', say: quiet }), /ingen plats 9/);
  await assert.rejects(forbered({ ...spec, index: 5 }, { root: project, reference: 'docka.mp4', say: quiet }), /ingen kortplats 5/);
  // Ett paket som inte blev klart tas bort, så att nästa försök får samma nummer.
  const out = join(project, 'output', 'tagningar');
  const before = nextTake(out, spec, 'cykel-nyp');
  await assert.rejects(forbered(spec, { root: project, reference: 'finns-inte.mp4', say: quiet }));
  assert.equal(nextTake(out, spec, 'cykel-nyp'), before);
});

let received: PostFile | null = null;
let clip = '';

test('ta-emot: ljudet tas bort, måtten prövas, och posten bär allt registret ska ha, utan signerade adresser', async () => {
  const id = 'paulina_spelaren_cykel-nyp_4-1_t1';
  const dir = join(project, 'output', 'tagningar', id);
  writeFileSync(join(dir, 'uppladdat.json'), JSON.stringify([{ role: 'endFrame', url: 'https://d2jqrm6oza8nb6.cloudfront.net/datasets/abc.png?_jwt=eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3OTUxMjEwNjJ9.x', assetId: 'a1', at: '2026-11-18 12:00' }]));
  const result = await taEmot(id, join(project, 'nedladdad.mp4'), { taskId: 'task-1', credits: 85, before: 1000, after: 915 }, { root: project, proof: false, register: false, say: quiet });
  clip = join(dir, 'cykel-nyp-4-1_spelaren_t1.mp4');
  assert.equal((await probe(clip)).audio, false, 'klippet har inget ljud');
  assert.ok(existsSync(join(dir, 'med-ljud.mp4')), 'den nedladdade filmen med ljud står kvar i paketet');
  assert.equal(result.values.ljud, false);
  assert.equal(result.judged.find((entry) => entry.key === 'ljud')?.verdict, 'inom');
  // En grön film utan dealer: kortet landar aldrig, och det syns.
  assert.equal(result.values.kortetLigger, null);
  assert.equal(result.judged.find((entry) => entry.key === 'kortetLigger')?.verdict, 'saknas');
  const written = readFileSync(join(dir, 'post.json'), 'utf8');
  assert.ok(!written.includes('_jwt'), 'post.json bär ingen signerad adress');
  const posted = JSON.parse(written) as PostFile;
  const { post, order, measurements, uploads } = posted;
  assert.equal(post.file, 'dealers/paulina/clips/cykel-nyp-4-1_spelaren_t1.mp4');
  assert.equal(post.from, 'output/tagningar/paulina_spelaren_cykel-nyp_4-1_t1/cykel-nyp-4-1_spelaren_t1.mp4');
  assert.deepEqual([post.group, post.status, post.use, post.seat, post.index, post.take], ['clips', 'att granska', 'dealerfilm', 4, 1, 1]);
  assert.deepEqual(post.view, { kind: 'spelaren' });
  assert.deepEqual(post.lands, { seat: 4, index: 1, at: null });
  assert.equal((post.source as { taskId: string }).taskId, 'task-1');
  assert.deepEqual([order.model, order.kind, order.credits, order.balanceBefore, order.balanceAfter, order.basis, order.result], ['kling-4', 'film', 85, 1000, 915, 'mätt', post.file]);
  assert.ok(order.inputs!.includes('dealers/paulina/anchors/spelaren-redo.png'), 'indata nämner ankaret');
  assert.equal(measurements.length, result.judged.length + measurements.filter((entry) => entry.note === 'utan gräns').length);
  assert.deepEqual(uploads, [{ file: 'output/tagningar/paulina_spelaren_cykel-nyp_4-1_t1/sista.png', url: 'https://d2jqrm6oza8nb6.cloudfront.net/datasets/abc.png', assetId: 'a1', at: '2026-11-18 12:00' }]);
  received = posted;
  // Krediter som inte är skillnaden mellan saldona är antagna.
  const guessed = await taEmot(id, join(project, 'nedladdad.mp4'), { taskId: 'task-1', credits: 85, before: 1000, after: 900 }, { root: project, proof: false, register: false, say: quiet });
  assert.equal(guessed.post.order.basis, 'antaget');
});

test('registreringen: klippet som post att granska, beställningen och måtten, och inget två gånger', async () => {
  assert.ok(received, 'ta-emot kördes');
  const register = join(project, 'register');
  createRegister(register, { about: 'prov', statuses: { 'att granska': 'inte dömd', godkänd: 'godkänd' }, asksWhy: [], groups: { clips: 'tagningar' }, sources: { runway: { what: 'Runway' } } });
  const uploads = received!.uploads.map((entry) => ({ ...entry, signed: `${entry.url}?_jwt=x.eyJleHAiOjE3OTUxMjEwNjJ9.y`, sha256: 'a'.repeat(64) }));
  const said = await registrera(register, received!, clip, uploads);
  assert.match(said.join('\n'), /införd, att granska/);
  const entry = getEntry(register, received!.post.file)!;
  assert.deepEqual([entry.status, entry.use, entry.seat, entry.index], ['att granska', 'dealerfilm', 4, 1]);
  assert.deepEqual(entry.lands, { seat: 4, index: 1, at: null });
  assert.ok(existsSync(join(register, 'assets', received!.post.file)), 'filmen ligger i registrets assets/');
  const known = about(register, received!.post.file);
  assert.deepEqual(known.orders.map((row) => row.task_id), ['task-1']);
  assert.equal(known.measurements.length, received!.measurements.length);
  assert.ok(known.measurements.every((row) => row.basis === 'mätt'));
  assert.equal(about(register, received!.uploads[0]!.file).uploads[0]!.url, 'https://d2jqrm6oza8nb6.cloudfront.net/datasets/abc.png');
  // En gång till: posten, beställningen och uppladdningen förs inte in igen, och måtten ersätter de förra.
  const again = await registrera(register, received!, clip, uploads);
  assert.match(again.join('\n'), /hade redan sin post/);
  assert.match(again.join('\n'), /stod redan där/);
  assert.match(again.join('\n'), new RegExp(`i stället för de ${received!.measurements.length} förra`));
  assert.equal(about(register, received!.post.file).measurements.length, received!.measurements.length);
  assert.equal(about(register, received!.uploads[0]!.file).uploads.length, 1);
});

test('mät-om: måtten tas om och ersätter de förra i post.json och registret; klippet, posten och omdömet rörs inte', async () => {
  const id = 'paulina_spelaren_cykel-nyp_4-1_t1';
  const dir = join(project, 'output', 'tagningar', id);
  const register = join(project, 'register');
  const before = JSON.parse(readFileSync(join(dir, 'post.json'), 'utf8')) as PostFile;
  const entryBefore = getEntry(register, before.post.file)!;
  const clipBefore = readFileSync(clip);
  const result = await matOm(id, { root: project, registry: register, proof: false, say: quiet });
  const after = JSON.parse(readFileSync(join(dir, 'post.json'), 'utf8')) as PostFile;
  assert.deepEqual([after.post, after.order, after.uploads], [before.post, before.order, before.uploads]);
  assert.equal(after.measurements.length, result.judged.length + after.measurements.filter((entry) => entry.note === 'utan gräns').length);
  assert.ok(result.judged.some((entry) => entry.key === 'kortetsOverlapp') && !result.judged.some((entry) => entry.key === 'kortetsHorn'), 'dagens mått');
  assert.match(result.registered.join('\n'), /i stället för de \d+ förra/);
  assert.equal(getEntry(register, before.post.file)!.status, entryBefore.status);
  assert.equal(about(register, before.post.file).measurements.length, after.measurements.length);
  assert.ok(readFileSync(clip).equals(clipBefore), 'klippet är detsamma');
  const doll = JSON.parse(readFileSync(join(dir, 'docka.json'), 'utf8'));
  assert.ok(Array.isArray(doll.next) && Array.isArray(doll.beyond) && doll.own && doll.shoe, 'docka.json har dockans värden per ruta');
  await assert.rejects(matOm('finns-inte', { root: project, registry: register, proof: false, say: quiet }), /ingen post.json/);
});
