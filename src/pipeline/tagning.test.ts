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
import { about, createRegister, getEntry, importAsset, sha256Of } from './registry.ts';
import { readDealer, readMall, wordsOf } from './dealer.ts';
import { cardWords, clipFile, forbered, formatFor, matOm, namedText, nextTake, packageId, promptFor, readTagning, registrera, taEmot, type PostFile } from './tagning.ts';
import { readScene } from '../scene/description.ts';
import { cardPlace, type Seat } from '../scene/dollPose.ts';
import { cardCorners, see, viewEye, type Eye } from '../scene/geometry.ts';

const root = resolve(import.meta.dirname, '..', '..');
const scene = readScene(JSON.parse(readFileSync(join(root, 'content', 'scene.json'), 'utf8')));
const content = readTagning(root);
// Vyns REDO-ankare och orden för texten står i dealerns fil; provet följer det som står där i stället för ett eget namn.
const paulina = readDealer(root, 'paulina');
const redoAnchor = paulina.anchors.redo.spelaren!;
const words = wordsOf(paulina, readMall(root));
const quiet = () => {};

test('texten är pilotens med granskarens fras, rättelsen och orden om hur hon rör sig, och samma för varje plats', () => {
  const text = promptFor(content, 'deal', words);
  assert.ok(!/[{}]/.test(text), 'inga platshållare');
  // Det som gäller dealern står i hennes fil: tatueringarna på händerna står bara för den som har dem.
  assert.ok(text.includes('the same size as in the first frame, with the same tattoos.'), 'handtatueringarna ur dealerns fil');
  assert.ok(promptFor(content).includes('the same size as in the first frame.') && !promptFor(content).includes('tattoo'), 'utan tatueringar för en dealer utan');
  assert.ok(text.includes('carries it low over the table to its place, where the last frame shows it'), 'granskarens första fras');
  // Granskarens andra fras ("her head turns with it from the shoe to the card's place") beskrev den gamla dockan och är
  // ersatt av rapportens ord om en verklig dealer (2026-11-18, kväll, output/work/verklig-dealer/rapport.md): en snabb,
  // van giv, huvudet mot spelaren och aldrig mot skon, och knuffen; de säger inte heller var platsen är.
  assert.ok(text.includes('A quick, practised deal') && text.includes('her head turns toward the player she deals to') && text.includes('never toward the shoe'), 'orden om hur hon rör sig');
  assert.ok(text.includes('nudge it into place') && !text.includes('back to the shoe just before') && !text.includes('breathes'), 'knuffen, och inget om blicken till skon eller andning');
  assert.ok(text.includes('the next card stays down in the opening and is not lifted with it'), 'pilotens rättelse');
  assert.ok(!text.includes('in front of her,') && !text.includes('middle of the table'), 'inga ord om plats 4');
  assert.ok(text.startsWith('Locked camera, one continuous shot.') && text.endsWith('No sound.'));
});

test('texten för hålkortet och vändningen är givens med bara de meningar bytta som handlingen kräver', () => {
  const deal = promptFor(content, 'deal', words);
  const hole = promptFor(content, 'hole', words);
  const flip = promptFor(content, 'flip', words);
  assert.equal(promptFor(content, 'wait', words).includes('with the same tattoos'), true);
  // Hålkortet: dras en bit upp ur skon, läggs ned plant och glider till sin plats, vänds aldrig, och slutar med två gula
  // kort i bild. Inget blått nämns: med en blå sida i texten målade Kling kortet i skon blått (första klippet, utgår).
  assert.ok(hole.includes('draws the yellow card a little way up out of the opening') && hole.includes('slides it flat along the table') && hole.includes('never turned over') && hole.includes('yellow side up'));
  assert.ok(hole.includes('stays yellow in the opening the whole time') && hole.includes('two yellow cards in view') && hole.includes('like every card in this clip'));
  assert.ok(!/blue/i.test(hole), 'inget blått i hålkortets text');
  assert.ok(!hole.includes('turn over together') && !hole.includes('carries it low over the table'));
  // Vändningen: inget kort dras; hålkortet ligger på bordet från början och vänds där med samma nyckelvridning som i given.
  assert.ok(flip.includes('A yellow card already lies flat on the table') && flip.includes('without taking a card') && flip.includes('lays the card flat in the same place, blue side up'));
  assert.ok(flip.includes("turn over together about the card's long side, like turning a key"), 'samma vändning som i given');
  assert.ok(!flip.includes('draws the yellow card up out of the opening') && !flip.includes('the whole way out'));
  // Det som inte rör handlingen är ordagrant givens.
  for (const text of [hole, flip]) {
    for (const same of ['Locked camera, one continuous shot.', 'Then her hand goes straight back to the card shoe', 'Her other hand rests on the table and does not move.', 'No sound.']) assert.ok(text.includes(same), same);
    assert.ok(!/[{}]/.test(text));
  }
  // En mening som inte står i texten är ett fel: mallen har ändrats utan bytena.
  const changed = { ...content, prompt: { ...content.prompt, text: content.prompt.text.replace('On the way her wrist rolls once', 'Her wrist rolls once') } };
  assert.throws(() => promptFor(changed, 'hole'), /står inte precis en gång/);
});

test('de namngivna texterna: för ett färdigt klipp som referens, med det som måste hålla ordagrant ur givens text', () => {
  const deal = promptFor(content, 'deal', words);
  for (const name of ['klippref', 'redigering']) {
    const text = namedText(content, name, 'deal', words);
    assert.ok(!/[{}]/.test(text) && text.includes('with the same tattoos'), `${name}: dealerns ord ifyllda`);
    assert.ok(!text.includes('mannequin in video 1') && text.includes('not like a mannequin') && text.includes('experienced blackjack dealer'), `${name}: en verklig dealers kropp, inte dockans`);
    assert.ok(text.includes('Image 1 is the first frame of the clip and image 2 is the last frame.'), `${name}: första och sista bilden`);
    for (const kept of ['solid yellow on one side and solid blue on the other', 'lies completely still exactly where she put it until the clip ends', 'Her hands stay small and slender, the same size as in the first frame, with the same tattoos.', 'The black card shoe does not move.', 'The background stays the same flat green everywhere: no table is visible, there are no shadows on the green, and nothing else appears. No sound.']) {
      assert.ok(text.includes(kept) && deal.includes(kept), `${name}: "${kept}"`);
    }
  }
  assert.ok(namedText(content, 'klippref', 'deal', words).includes('the same path, the same timing and the same place for the card as in video 1'));
  assert.ok(namedText(content, 'redigering', 'deal', words).startsWith('Edit video 1'));
  // En text gäller sin handling, och ett namn som inte finns sägs.
  assert.throws(() => namedText(content, 'klippref', 'hole'), /skriven för deal/);
  assert.throws(() => namedText(content, 'finns-inte'), /ingen text som heter finns-inte/);
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

test('formatets gräns följer beställningens längd: 5 s har 24 rutor fler än 4 s', () => {
  const limits = { format: { what: 'format', is: '1920×1080 24/s 97', source: 'prov' }, takt: { what: 'takt', most: 1.6, source: 'prov' } };
  assert.equal(formatFor(limits, 4, 4), limits);
  assert.equal(formatFor(limits, 5, 4).format!.is, '1920×1080 24/s 121');
  assert.equal(formatFor(limits, 3, 4).format!.is, '1920×1080 24/s 73');
  assert.equal(formatFor(limits, 5, 4).takt, limits.takt);
  assert.equal(limits.format.is, '1920×1080 24/s 97');
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
  // En variant står sist i slaget, efter handlingen, så att tagningen skiljs från seriens.
  assert.equal(packageId({ ...spec, variant: 'prov' }, 'cykel-nyp', 1), 'paulina_spelaren_cykel-nyp-prov_4-0_t1');
  assert.equal(clipFile({ ...spec, seat: 'D', index: 1, action: 'hole', variant: 'prov' }, 'cykel-nyp', 2), 'dealers/paulina/clips/cykel-nyp-hole-prov-d-1_spelaren_t2.mp4');
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
  mkdirSync(join(project, 'content', 'dealers'), { recursive: true });
  for (const file of ['scene.json', 'doll.json', 'tagning.json', 'dealer.json', 'dealers/paulina.json']) copyFileSync(join(root, 'content', file), join(project, 'content', file));
  for (const file of readdirSync(join(root, 'content', 'moves'))) copyFileSync(join(root, 'content', 'moves', file), join(project, 'content', 'moves', file));
  const anchor = join(project, 'assets', ...redoAnchor.split('/'));
  mkdirSync(join(anchor, '..'), { recursive: true });
  await sharp({ create: { width: 1920, height: 1080, channels: 3, background: { r: 2, g: 182, b: 48 } } }).png().toFile(anchor);
  film(join(project, 'docka.mp4'), '0x767c80', 0.5, false);
  film(join(project, 'nedladdad.mp4'), '0x02b630', 0.5, true);
});
after(() => rmSync(project, { recursive: true, force: true }));

// Varianten prov ger påhittade namn (cykel-nyp-prov-…): ett riktigt registernamn i ett test hindrar att klippet tas bort.
const spec = { dealer: 'paulina', view: 'spelaren', seat: 4, index: 1, variant: 'prov' };

test('forbered: paketet har bilderna, dockans film, texten och allt beställningen behöver', async () => {
  const made = await forbered(spec, { root: project, reference: 'docka.mp4', say: quiet });
  assert.equal(made.id, 'paulina_spelaren_cykel-nyp-prov_4-1_t1');
  const at = (file: string) => join(made.dir, file);
  for (const file of ['forsta.png', 'sista.png', 'referens.mp4', 'text.txt', 'docka.json', 'ark-docka.jpg', 'bestallning.json']) assert.ok(existsSync(at(file)), `${file} finns i paketet`);
  assert.equal(readFileSync(at('text.txt'), 'utf8'), promptFor(content, 'deal', words));
  const order = JSON.parse(readFileSync(at('bestallning.json'), 'utf8'));
  assert.deepEqual([order.model, order.resolution, order.duration, order.ratio], ['kling-4', '1080p', 4, '16:9']);
  assert.deepEqual(Object.keys(order.inputs), ['startFrame', 'endFrame', 'referenceVideos']);
  assert.equal(order.inputs.startFrame.asset, redoAnchor);
  assert.equal(order.inputs.referenceVideos[0].durationSeconds, 0.5);
  assert.equal(order.inputs.referenceVideos[0].fps, 24);
  assert.equal(order.clip, 'dealers/paulina/clips/cykel-nyp-prov-4-1_spelaren_t1.mp4');
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
  assert.equal(again.id, 'paulina_spelaren_cykel-nyp-prov_4-1_t2');
});

test('forbered säger vad som saknas: ankare för vyn, plats och kortplats', async () => {
  await assert.rejects(forbered({ ...spec, view: 'plats-3' }, { root: project, reference: 'docka.mp4', say: quiet }), /paulina.json säger inget REDO-ankare ur plats-3/);
  await assert.rejects(forbered({ ...spec, seat: 9 }, { root: project, reference: 'docka.mp4', say: quiet }), /ingen plats 9/);
  await assert.rejects(forbered({ ...spec, index: 5 }, { root: project, reference: 'docka.mp4', say: quiet }), /ingen kortplats 5/);
  // Ett paket som inte blev klart tas bort, så att nästa försök får samma nummer.
  const out = join(project, 'output', 'tagningar');
  const before = nextTake(out, spec, 'cykel-nyp');
  await assert.rejects(forbered(spec, { root: project, reference: 'finns-inte.mp4', say: quiet }));
  assert.equal(nextTake(out, spec, 'cykel-nyp'), before);
});

test('forbered gör paketet genom ankarets eget öga: samma ankare ger samma paket när bågen ändras, utom där kortplatsen flyttats', async () => {
  // Ankaret gjort genom ett annat öga än dagens närbild: samma plats, vridet en grad åt sidan och 4 % längre brännvidd.
  const today = viewEye(scene, { kind: 'spelaren', close: true });
  const tilt = (eye: typeof today, side: number, up: number) => {
    const f = eye.forward;
    const right = [-f[2], 0, f[0]].map((v) => v / Math.hypot(f[0], f[2])) as [number, number, number];
    const above = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
    const moved = f.map((v, k) => v + right[k]! * side + above[k]! * up);
    const length = Math.hypot(...moved);
    return { position: [...eye.position], forward: moved.map((v) => v / length), focalPx: eye.focalPx * 1.04, frame: { width: 1920, height: 1080 } };
  };
  const register = (name: string, eye: unknown): Promise<unknown> => {
    const at = join(project, name);
    createRegister(at, { about: 'prov', statuses: { 'att granska': 'inte dömd' }, asksWhy: [], groups: { anchors: 'ankare' }, sources: { runway: { what: 'Runway' } } });
    return importAsset(at, { file: redoAnchor, from: join(project, 'assets', ...redoAnchor.split('/')), title: 'prov', group: 'anchors', source: { from: 'runway' }, eye });
  };
  const anchorEye = tilt(today, Math.tan((1 * Math.PI) / 180), 0);
  await register('register-oga', anchorEye);
  const made = async (seat: Seat, index: number) => {
    const done = await forbered({ dealer: 'paulina', view: 'spelaren', seat, index }, { root: project, registry: join(project, 'register-oga'), reference: 'docka.mp4', say: quiet });
    return JSON.parse(readFileSync(join(done.dir, 'bestallning.json'), 'utf8'));
  };
  const dealerBefore = await made('D', 0);
  const seatBefore = await made(4, 0);
  assert.deepEqual(dealerBefore.scene.eye, anchorEye, 'paketet bär ankarets öga');
  assert.match(dealerBefore.scene.eyeFrom, /ögat ankaret är gjort genom/);
  const sceneFile = join(project, 'content', 'scene.json');
  const kept = readFileSync(sceneFile, 'utf8');
  const changed = JSON.parse(kept);
  changed.places.arc.depth -= 0.03;
  writeFileSync(sceneFile, JSON.stringify(changed));
  try {
    const dealerAfter = await made('D', 0);
    const seatAfter = await made(4, 0);
    // Dealerns kortplats ligger kvar när bågen ändras: samma öga, samma hörn och samma sista bild.
    assert.deepEqual(dealerAfter.scene.eye, anchorEye);
    assert.deepEqual(dealerAfter.inputs.endFrame.corners, dealerBefore.inputs.endFrame.corners);
    assert.equal(dealerAfter.inputs.endFrame.sha256, dealerBefore.inputs.endFrame.sha256);
    // Plats 4 har flyttats: samma öga, och kortet målat där den nya kortplatsen syns genom ankarets öga.
    assert.deepEqual(seatAfter.scene.eye, anchorEye);
    const moved = readScene(changed);
    const corners = cardCorners(moved, cardPlace(moved, 4, 0)).map((corner) => see(anchorEye as Eye, corner)!);
    const painted = seatAfter.inputs.endFrame.corners as number[][];
    const off = Math.max(...corners.map((corner) => Math.min(...painted.map((p) => Math.hypot(p[0]! - corner.x, p[1]! - corner.y)))));
    assert.ok(off < 2, `plats 4: hörnen ${off.toFixed(2)} bp från kortplatsen sedd genom ankarets öga`);
    assert.notDeepEqual(seatAfter.inputs.endFrame.corners, seatBefore.inputs.endFrame.corners, 'plats 4 har flyttats');
  } finally {
    writeFileSync(sceneFile, kept);
  }
  // Ett ankare vars ruta inte rymmer kortet: forbered vägrar och säger varför.
  await register('register-utanfor', tilt(today, 0, 0.2));
  await assert.rejects(
    forbered({ dealer: 'paulina', view: 'spelaren', seat: 4, index: 0 }, { root: project, registry: join(project, 'register-utanfor'), reference: 'docka.mp4', say: quiet }),
    /från kanten av .* ruta/,
  );
});

// Ett påhittat, godkänt klipp till plats 4, kort 1, gjort ur ankaret, i ett eget register; dess paket har dockans film.
const fromFile = 'dealers/paulina/clips/prova-klipp-4-1_spelaren_t1.mp4';

test('forbered med ett godkänt klipp som referens: klippet skickas, dockans film bakom det mäts, och tagningen har sin variant', async () => {
  const register = join(project, 'register-klipp');
  createRegister(register, { about: 'prov', statuses: { 'att granska': 'inte dömd', godkänd: 'godkänd' }, asksWhy: [], groups: { clips: 'tagningar' }, sources: { runway: { what: 'Runway' } } });
  mkdirSync(join(project, 'output', 'tagningar', 'prova-paket'), { recursive: true });
  copyFileSync(join(project, 'docka.mp4'), join(project, 'output', 'tagningar', 'prova-paket', 'referens.mp4'));
  film(join(project, 'klipp.mp4'), '0x02b631', 0.5, false);
  const post = { file: fromFile, from: join(project, 'klipp.mp4'), title: 'prov', group: 'clips', dealer: 'paulina', status: 'godkänd', seat: 4, index: 1, action: 'deal', move: 'cykel-nyp', view: { kind: 'spelaren' }, source: { from: 'runway', package: 'output/tagningar/prova-paket', references: [{ role: 'startFrame', what: redoAnchor }] } };
  await importAsset(register, post);
  await importAsset(register, { ...post, file: 'dealers/paulina/clips/prova-klipp-4-1_spelaren_t2.mp4', status: 'att granska' });
  await importAsset(register, { ...post, file: 'dealers/paulina/clips/prova-klipp-4-1_spelaren_t3.mp4', source: { ...post.source, references: [{ role: 'startFrame', what: 'dealers/paulina/anchors/prova-annat.png' }] } });
  const options = { root: project, registry: register, say: quiet };

  const made = await forbered({ ...spec, variant: 'klipp' }, { ...options, fromClip: { file: fromFile, role: 'referenceVideos' }, textName: 'klippref' });
  assert.equal(made.id, 'paulina_spelaren_cykel-nyp-klipp_4-1_t1');
  const order = JSON.parse(readFileSync(join(made.dir, 'bestallning.json'), 'utf8'));
  assert.deepEqual(Object.keys(order.inputs), ['startFrame', 'endFrame', 'referenceVideos']);
  assert.equal(order.inputs.referenceVideos.length, 1, 'bara klippet skickas');
  assert.deepEqual([order.inputs.referenceVideos[0].file, order.inputs.referenceVideos[0].asset], [`output/tagningar/${made.id}/referensklipp.mp4`, fromFile]);
  assert.equal(order.inputs.referenceVideos[0].sha256, sha256Of(join(project, 'klipp.mp4')));
  // Dockans film bakom klippet står i paketet och mäts, men skickas inte.
  assert.deepEqual([order.doll.sent, order.doll.film.source], [false, 'output/tagningar/prova-paket/referens.mp4']);
  assert.equal(sha256Of(join(made.dir, 'referens.mp4')), sha256Of(join(project, 'docka.mp4')));
  assert.deepEqual([order.variant, order.motionFrom, order.promptName], ['klipp', { file: fromFile, role: 'referenceVideos', status: 'godkänd' }, 'klippref']);
  assert.equal(order.clip, 'dealers/paulina/clips/cykel-nyp-klipp-4-1_spelaren_t1.mp4');
  assert.equal(readFileSync(join(made.dir, 'text.txt'), 'utf8'), namedText(content, 'klippref', 'deal', words));

  // Som filmen som görs om: referenceVideo i stället för referenceVideos.
  const edited = await forbered({ ...spec, variant: 'redigerad' }, { ...options, fromClip: { file: fromFile, role: 'referenceVideo' }, textName: 'redigering' });
  const editOrder = JSON.parse(readFileSync(join(edited.dir, 'bestallning.json'), 'utf8'));
  assert.deepEqual(Object.keys(editOrder.inputs), ['startFrame', 'endFrame', 'referenceVideo']);
  assert.equal(editOrder.inputs.referenceVideo.asset, fromFile);

  // Det som vägras: utan variant, ett klipp som inte är godkänt, ett annat kort, ett annat ankare, ett klipp som inte
  // finns och en text som inte finns.
  const { variant: _variant, ...plain } = spec;
  await assert.rejects(forbered(plain, { ...options, fromClip: { file: fromFile, role: 'referenceVideos' } }), /egen variant/);
  await assert.rejects(forbered({ ...spec, variant: 'klipp' }, { ...options, fromClip: { file: 'dealers/paulina/clips/prova-klipp-4-1_spelaren_t2.mp4', role: 'referenceVideos' } }), /att granska: bara ett godkänt klipp/);
  await assert.rejects(forbered({ ...spec, index: 0, variant: 'klipp' }, { ...options, fromClip: { file: fromFile, role: 'referenceVideos' } }), /inte samma som tagningen/);
  await assert.rejects(forbered({ ...spec, variant: 'klipp' }, { ...options, fromClip: { file: 'dealers/paulina/clips/prova-klipp-4-1_spelaren_t3.mp4', role: 'referenceVideos' } }), /gjort ur dealers\/paulina\/anchors\/prova-annat\.png/);
  await assert.rejects(forbered({ ...spec, variant: 'klipp' }, { ...options, fromClip: { file: 'dealers/paulina/clips/prova-saknas.mp4', role: 'referenceVideos' } }), /står inte i registret/);
  await assert.rejects(forbered({ ...spec, variant: 'klipp' }, { ...options, fromClip: { file: fromFile, role: 'referenceVideos' }, textName: 'finns-inte' }), /ingen text som heter/);
  assert.equal(nextTake(join(project, 'output', 'tagningar'), { ...spec, variant: 'klipp' }, 'cykel-nyp'), 2, 'ett paket som vägrades tas bort');
});

test('ta-emot med ett klipp som referens: posten säger vilket klipp som skickades och hur, och bär varianten', async () => {
  const id = 'paulina_spelaren_cykel-nyp-redigerad_4-1_t1';
  const dir = join(project, 'output', 'tagningar', id);
  writeFileSync(join(dir, 'uppladdat.json'), JSON.stringify([{ role: 'referenceVideo', url: 'https://d2jqrm6oza8nb6.cloudfront.net/datasets/klipp.mp4?_jwt=x.eyJleHAiOjE3OTUxMjEwNjJ9.y', assetId: 'v1', at: '2026-11-19 12:00' }]));
  const result = await taEmot(id, join(project, 'nedladdad.mp4'), { taskId: 'task-2', credits: 64, before: 1000, after: 936 }, { root: project, proof: false, register: false, say: quiet });
  const { post, order, uploads } = result.post;
  assert.equal(post.file, 'dealers/paulina/clips/cykel-nyp-redigerad-4-1_spelaren_t1.mp4');
  assert.deepEqual([post.variant, post.move, post.status], ['redigerad', 'cykel-nyp', 'att granska']);
  assert.match(String(post.title), /variant redigerad, tagning 1$/);
  assert.ok(String(post.note).includes(`${fromFile} som filmen som görs om (referenceVideo)`));
  const references = (post.source as { references: { role: string; what: string }[] }).references;
  assert.deepEqual(references.map((entry) => entry.role), ['startFrame', 'endFrame', 'referenceVideo']);
  assert.ok(references[2]!.what.startsWith(`output/tagningar/${id}/referensklipp.mp4: det godkända klippet ${fromFile}`));
  assert.match(String((post.source as { promptNote: string }).promptNote), /^content\/tagning\.json, prompt\.named\.redigering/);
  assert.deepEqual(uploads, [{ file: fromFile, url: 'https://d2jqrm6oza8nb6.cloudfront.net/datasets/klipp.mp4', assetId: 'v1', at: '2026-11-19 12:00' }]);
  assert.ok(order.inputs!.includes('"role":"referenceVideo"'));
});

let received: PostFile | null = null;
let clip = '';

test('ta-emot: ljudet tas bort, måtten prövas, och posten bär allt registret ska ha, utan signerade adresser', async () => {
  const id = 'paulina_spelaren_cykel-nyp-prov_4-1_t1';
  const dir = join(project, 'output', 'tagningar', id);
  writeFileSync(join(dir, 'uppladdat.json'), JSON.stringify([{ role: 'endFrame', url: 'https://d2jqrm6oza8nb6.cloudfront.net/datasets/abc.png?_jwt=eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3OTUxMjEwNjJ9.x', assetId: 'a1', at: '2026-11-18 12:00' }]));
  const result = await taEmot(id, join(project, 'nedladdad.mp4'), { taskId: 'task-1', credits: 85, before: 1000, after: 915 }, { root: project, proof: false, register: false, say: quiet });
  clip = join(dir, 'cykel-nyp-prov-4-1_spelaren_t1.mp4');
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
  assert.equal(post.file, 'dealers/paulina/clips/cykel-nyp-prov-4-1_spelaren_t1.mp4');
  assert.equal(post.from, 'output/tagningar/paulina_spelaren_cykel-nyp-prov_4-1_t1/cykel-nyp-prov-4-1_spelaren_t1.mp4');
  assert.deepEqual([post.group, post.status, post.use, post.seat, post.index, post.take], ['clips', 'att granska', 'dealerfilm', 4, 1, 1]);
  assert.deepEqual(post.view, { kind: 'spelaren' });
  assert.deepEqual(post.lands, { seat: 4, index: 1, at: null });
  assert.equal((post.source as { taskId: string }).taskId, 'task-1');
  assert.deepEqual([order.model, order.kind, order.credits, order.balanceBefore, order.balanceAfter, order.basis, order.result], ['kling-4', 'film', 85, 1000, 915, 'mätt', post.file]);
  assert.ok(order.inputs!.includes(redoAnchor), 'indata nämner ankaret');
  // Varje mått med gräns, de som bara visas, och skons läge som klippet är gjort och mätt med.
  assert.equal(measurements.length, result.judged.length + measurements.filter((entry) => entry.note === 'utan gräns').length + 1);
  assert.deepEqual(measurements.find((entry) => entry.what.startsWith('skonsLage:'))?.value, { at: scene.shoe.at, yawDeg: scene.shoe.yawDeg, length: scene.shoe.length });
  // Posten bär ögat filmen görs genom, skon den bär och var kortet landar: uppspelningen lägger dem efter det (round.ts).
  const close = viewEye(scene, { kind: 'spelaren', close: true });
  assert.deepEqual(post.eye, { position: close.position, forward: close.forward, focalPx: close.focalPx, frame: close.frame });
  assert.deepEqual(post.shoe, { at: scene.shoe.at, yawDeg: scene.shoe.yawDeg, length: scene.shoe.length });
  assert.deepEqual(post.place, scene.places.seats.find((entry) => entry.seat === 4)!.cards[1]);
  assert.equal(post.action, 'deal');
  assert.deepEqual(uploads, [{ file: 'output/tagningar/paulina_spelaren_cykel-nyp-prov_4-1_t1/sista.png', url: 'https://d2jqrm6oza8nb6.cloudfront.net/datasets/abc.png', assetId: 'a1', at: '2026-11-18 12:00' }]);
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
  // Måtten ur klippet är mätta; skons läge har scenens märkning (content/scene.json, shoe).
  const wrongBasis = known.measurements.filter((row) => row.basis !== (String(row.what).startsWith('skonsLage:') ? scene.shoe.basis : 'mätt'));
  assert.deepEqual(wrongBasis.map((row) => `${row.what}: ${row.basis}`), []);
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
  const id = 'paulina_spelaren_cykel-nyp-prov_4-1_t1';
  const dir = join(project, 'output', 'tagningar', id);
  const register = join(project, 'register');
  const before = JSON.parse(readFileSync(join(dir, 'post.json'), 'utf8')) as PostFile;
  const entryBefore = getEntry(register, before.post.file)!;
  const clipBefore = readFileSync(clip);
  const result = await matOm(id, { root: project, registry: register, proof: false, say: quiet });
  const after = JSON.parse(readFileSync(join(dir, 'post.json'), 'utf8')) as PostFile;
  assert.deepEqual([after.post, after.order, after.uploads], [before.post, before.order, before.uploads]);
  assert.equal(after.measurements.length, result.judged.length + after.measurements.filter((entry) => entry.note === 'utan gräns').length + 1);
  assert.ok(result.judged.some((entry) => entry.key === 'kortetsOverlapp') && !result.judged.some((entry) => entry.key === 'kortetsHorn'), 'dagens mått');
  assert.match(result.registered.join('\n'), /i stället för de \d+ förra/);
  assert.equal(getEntry(register, before.post.file)!.status, entryBefore.status);
  assert.equal(about(register, before.post.file).measurements.length, after.measurements.length);
  assert.ok(readFileSync(clip).equals(clipBefore), 'klippet är detsamma');
  const doll = JSON.parse(readFileSync(join(dir, 'docka.json'), 'utf8'));
  assert.ok(Array.isArray(doll.next) && Array.isArray(doll.beyond) && doll.own && doll.shoe, 'docka.json har dockans värden per ruta');
  await assert.rejects(matOm('finns-inte', { root: project, registry: register, proof: false, say: quiet }), /ingen post.json/);
});
