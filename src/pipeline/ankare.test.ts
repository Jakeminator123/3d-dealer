// Ankarets väg i en tillfällig mapp: förbered med ett konstgjort underlag (dockans händer, kort, sko och bord där
// dockan och scenen säger), ta-emot på konstgjorda "bildmodellbilder" med för stora händer, registreringen och använd.
// Ingen webbläsare och ingen beställning.

import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { anchorName, anvand, dollPoints, forbered, modelFor, nextNumber, readAnkare, stepText, taEmot } from './ankare.ts';
import { savePicture } from './ankarbild.ts';
import { forlagaEye, readCycleParts } from './cykel.ts';
import { readDealer, readMall, wordsOf, type Dealer } from './dealer.ts';
import { edgeRow, inQuad, type Picture } from './matning.ts';
import { about, createRegister, getEntry, importAsset, setStatus } from './registry.ts';

const root = resolve(import.meta.dirname, '..', '..');
const quiet = () => {};
const content = readAnkare(root);
let dir = '';

const dealer: Dealer = {
  id: 'prov',
  name: 'Prov',
  looks: { pronoun: 'she', hair: 'short dark hair', basis: 'antaget', source: 'prov' },
  identity: { images: [{ file: 'dealers/prov/identity/ansikte.png', shows: 'ansikte' }, { file: 'dealers/prov/identity/helkropp.png', shows: 'helkropp' }, { file: 'dealers/prov/identity/hander.png', shows: 'händer' }], basis: 'antaget', source: 'prov' },
  anchors: { redo: {}, basis: 'antaget', source: 'prov' },
};

test('texterna: dealerns ord, rutnätet och blicken; modellen från sidan', () => {
  const mall = readMall(root);
  const paulina = wordsOf(readDealer(root, 'paulina', mall), mall);
  const [pose, likeness] = content.steps;
  const text = stepText(content, pose!, paulina, 0.1);
  assert.ok(text.includes('a 10 cm grid') && text.includes('rose in a mandala') && text.includes('not at the card shoe'));
  assert.ok(!/[{}]/.test(text) && !/[{}]/.test(stepText(content, likeness!, wordsOf(dealer, mall), 0.1)));
  assert.equal(modelFor(pose!, { kind: 'spelaren' }), 'nano-banana-pro');
  assert.equal(modelFor(pose!, { kind: 'plats', seat: 7 }), 'nano-banana-2.1');
  assert.equal(anchorName('spelaren', 1), 'spelaren-redo.png');
  assert.equal(anchorName('plats-7', 3), 'plats-7-redo-3.png');
});

/** En bild 1920 × 1080: skärm ovanför dealerns bordskant, bord under, sko, kort i mynningen, och dealerns delar. */
function scene(doll: ReturnType<typeof dollPoints>, hands: number, body: [number, number, number]): Picture {
  const width = 1920;
  const height = 1080;
  const data = Buffer.alloc(width * height * 3);
  const put = (x: number, y: number, c: readonly number[]) => data.set(c, (y * width + x) * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) put(x, y, y > edgeRow(doll, x) ? [20, 215, 60] : [2, 182, 48]);
  const shoe = { x0: doll.shoe.x0 + 60, y0: Math.round(doll.mouth.y - 60), x1: doll.shoe.x1 - 40, y1: Math.round(doll.mouth.y + 70) };
  for (let y = shoe.y0; y < shoe.y1; y++) for (let x = shoe.x0; x < shoe.x1; x++) put(x, y, [30, 30, 32]);
  for (let y = Math.floor(doll.head.y - 400); y < doll.dealer.y1; y++) for (let x = doll.dealer.x0 + 80; x < Math.min(doll.give.wrist.x - 60, shoe.x0 - 30); x++) if (y < edgeRow(doll, x) && y > doll.head.y + doll.head.radius) put(x, y, body);
  for (let y = 0; y < height; y++) for (let x = 1100; x < 1500; x++) if (inQuad(doll.card, x, y)) put(x, y, [244, 210, 28]);
  for (const [centre, radius] of [[doll.grip, 26 * hands], [doll.rest.hand, 32 * hands]] as const) {
    for (let y = Math.floor(centre.y - radius); y <= centre.y + radius; y++) for (let x = Math.floor(centre.x - radius); x <= centre.x + radius; x++) if (Math.hypot(x - centre.x, y - centre.y) <= radius) put(x, y, hands === 1 ? [255, 238, 210] : [230, 160, 140]);
  }
  return { data, width, height };
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ankare-'));
  mkdirSync(join(dir, 'content', 'moves'), { recursive: true });
  mkdirSync(join(dir, 'content', 'dealers'), { recursive: true });
  for (const file of ['scene.json', 'doll.json', 'tagning.json', 'dealer.json', 'ankare.json']) copyFileSync(join(root, 'content', file), join(dir, 'content', file));
  for (const file of readdirSync(join(root, 'content', 'moves'))) copyFileSync(join(root, 'content', 'moves', file), join(dir, 'content', 'moves', file));
  writeFileSync(join(dir, 'content', 'dealers', 'prov.json'), JSON.stringify(dealer));
  createRegister(dir, { about: 'prov', statuses: { 'att granska': 'inte dömd', godkänd: 'godkänd' }, asksWhy: [], groups: { identity: 'identitet', anchors: 'ankare' }, sources: { runway: { what: 'Runway' } } });
  for (const image of dealer.identity.images) {
    const from = join(dir, 'id.png');
    await sharp({ create: { width: 3000, height: 1500, channels: 3, background: '#c89a80' } }).png().toFile(from);
    await importAsset(dir, { from, file: image.file, group: 'identity', dealer: 'prov', title: image.shows, status: 'godkänd', source: { from: 'runway' } });
  }
});
after(() => rmSync(dir, { recursive: true, force: true }));

test('förbered och ta-emot: paketet, de lokala stegen, måtten och posten i registret', async () => {
  // Underlaget genom dagens närbild, som scenen skulle spara det.
  const parts = readCycleParts(content.underlag.move, dir);
  const eye = forlagaEye(parts.scene, { kind: 'spelaren', close: true });
  const doll = dollPoints({ ...parts, eye }, { kind: 'spelaren' }, content, dir);
  const guide = join(dir, 'underlag.png');
  await savePicture(scene(doll, 1, [255, 255, 255]), guide);
  writeFileSync(join(dir, 'underlag.json'), JSON.stringify({ eye: { position: eye.position, forward: eye.forward, focalPx: eye.focalPx }, frame: eye.frame, savedAt: '2026-11-18 20:00' }));
  assert.equal(nextNumber(dir, 'prov', 'spelaren'), 1);

  const made = await forbered('prov', 'spelaren', { root: dir, underlag: guide, say: quiet });
  assert.equal(made.id, 'prov_spelaren_redo-1');
  for (const file of ['underlag.png', 'underlag.json', 'text-stallning.txt', 'text-likhet.txt', 'ref/ansikte.jpg', 'ref/helkropp.jpg', 'ref/hander.jpg', 'bestallning.json']) assert.ok(existsSync(join(made.dir, file)), file);
  const order = JSON.parse(readFileSync(join(made.dir, 'bestallning.json'), 'utf8'));
  assert.equal(order.anchor, 'dealers/prov/anchors/spelaren-redo.png');
  assert.deepEqual(order.steps.map((step: { referenceImages: { tag: string }[] }) => step.referenceImages.map((ref) => ref.tag)), [['pose', 'face', 'outfit', 'hands'], ['base', 'face']]);
  assert.equal(order.steps[1].referenceImages[0].from, 'ställning');
  assert.ok(order.steps[0].promptText.includes('short dark hair') && order.steps[0].promptText.includes('without tattoos') && !order.steps[0].promptText.includes('carry'));
  const ref = await sharp(join(made.dir, 'ref', 'ansikte.jpg')).metadata();
  assert.equal(ref.width, content.order.reference, 'förminskad');

  // Bildmodellens bilder: dealern med händerna 1,4 gånger dockans, ställningen och likheten lika.
  const big = scene(doll, 1.4, [20, 20, 22]);
  await savePicture(big, join(dir, 'stallning.png'));
  await savePicture(big, join(dir, 'likhet.png'));
  writeFileSync(join(made.dir, 'kvitto.json'), JSON.stringify([
    { step: 'ställning', file: join(dir, 'stallning.png'), taskId: 'task-s', credits: 20, before: 100, after: 80, at: '2026-11-18 20:01' },
    { step: 'likhet', file: join(dir, 'likhet.png'), taskId: 'task-l', credits: 9, before: 80, after: 71, at: '2026-11-18 20:02' },
  ]));
  const received = await taEmot(made.id, {}, { root: dir, say: quiet });
  const values = received.made.values;
  assert.equal(values.skon, 0, 'skon som underlagets');
  assert.ok(values.kortet !== null && values.kortet <= 2, `kortet där dockans står: ${values.kortet}`);
  assert.equal(values.bordskant, 0);
  assert.equal(values.glipa, 0);
  const hands = received.made.shown.händer as Record<string, { skala: number }>;
  assert.ok(hands.give!.skala < 0.85 && hands.rest!.skala < 0.85, 'händerna krympta');
  for (const key of ['givhanden', 'vilandeHanden']) assert.ok(values[key]! > 0.8 && values[key]! < 1.5, `${key} ${values[key]}`);
  assert.ok(existsSync(join(made.dir, 'ankare.png')) && existsSync(join(made.dir, 'ark.jpg')) && existsSync(join(made.dir, 'mottaget.json')));

  const entry = getEntry(dir, 'dealers/prov/anchors/spelaren-redo.png')!;
  assert.deepEqual([entry.status, entry.use, entry.pose, entry.dealer], ['att granska', 'dealerfilm', 'redo', 'prov']);
  assert.deepEqual(entry.eye, order.eye, 'ögat är underlagets');
  assert.deepEqual(entry.shoe, order.shoe);
  const known = about(dir, 'dealers/prov/anchors/spelaren-redo.png');
  assert.deepEqual(known.orders.map((row) => [row.task_id, row.credits, row.basis]), [['task-s', 20, 'mätt'], ['task-l', 9, 'mätt']]);
  assert.equal(known.measurements.length, received.made.judged.length);
  assert.equal(nextNumber(dir, 'prov', 'spelaren'), 2);

  // Använd: bara ett godkänt ankare pekas ut i dealerns fil.
  assert.throws(() => anvand('prov', 'spelaren', 'dealers/prov/anchors/spelaren-redo.png', dir), /inte godkänd/);
  setStatus(dir, 'dealers/prov/anchors/spelaren-redo.png', 'godkänd', 'prov', '2026-11-18 20:05');
  anvand('prov', 'spelaren', 'dealers/prov/anchors/spelaren-redo.png', dir);
  assert.equal(readDealer(dir, 'prov').anchors.redo.spelaren, 'dealers/prov/anchors/spelaren-redo.png');
});
