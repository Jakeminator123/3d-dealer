// Mätningarna av en tagning på små konstgjorda bilder och filmer, där svaret är känt.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  cadence,
  cornerError,
  difference,
  eachFrame,
  framesOf,
  gapIn,
  greenOff,
  handIn,
  headTurn,
  inQuad,
  insetQuad,
  insideShare,
  judgeOne,
  limitText,
  otherSkin,
  parts,
  probe,
  quadArea,
  whiteCorners,
  isBlue,
  type Box,
  type FrameRow,
  type Measure,
  type Picture,
  type Rgb,
} from './matning.ts';

const KEY: Rgb = [2, 182, 48];
const SKIN: Rgb = [200, 150, 120];
const BLUE: Rgb = [30, 139, 224];

function picture(width: number, height: number, colour: Rgb = KEY): Picture {
  const data = Buffer.alloc(width * height * 3);
  for (let p = 0; p < width * height; p++) data.set(colour, p * 3);
  return { data, width, height };
}
function paint(target: Picture, box: Box, colour: Rgb): Picture {
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) target.data.set(colour, (y * target.width + x) * 3);
  return target;
}
const copy = (source: Picture): Picture => ({ ...source, data: Buffer.from(source.data) });
const whole = (source: Picture): Box => ({ x0: 0, y0: 0, x1: source.width, y1: source.height });

test('en sammanhängande del: yta, tyngdpunkt, ruta och hörn som ytterpunkter', () => {
  const image = paint(picture(100, 60), { x0: 10, y0: 10, x1: 50, y1: 30 }, BLUE);
  paint(image, { x0: 70, y0: 40, x1: 72, y1: 42 }, BLUE);
  const found = parts(image, whole(image), isBlue, 10);
  assert.equal(found.length, 1, 'den lilla delen räknas inte');
  const [card] = found;
  assert.equal(card!.n, 800);
  assert.deepEqual(card!.c, { x: 29.5, y: 19.5 });
  assert.deepEqual([card!.w, card!.h], [40, 20]);
  assert.deepEqual(card!.corners, [{ x: 10, y: 10 }, { x: 49, y: 10 }, { x: 49, y: 29 }, { x: 10, y: 29 }]);
  assert.equal(cornerError(card!.corners, [{ x: 10, y: 10 }, { x: 49, y: 10 }, { x: 49, y: 29 }, { x: 13, y: 33 }]), 5);
  assert.equal(quadArea([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }]), 800);
});

test('två bilder mot varandra: medel, största kanal, PSNR, andel över 24 och skillnad med tecken', () => {
  const a = picture(10, 10, [100, 100, 100]);
  assert.deepEqual(difference(a, copy(a)), { mean: 0, meanMax: 0, psnr: 99, over24: 0, signed: [0, 0, 0] });
  const b = paint(picture(10, 10, [100, 100, 100]), { x0: 0, y0: 0, x1: 5, y1: 10 }, [130, 100, 100]);
  const seen = difference(b, a);
  assert.equal(seen.meanMax, 15, 'halva bilden skiljer 30 i en kanal');
  assert.equal(seen.mean, 5);
  assert.equal(seen.over24, 50);
  assert.deepEqual(seen.signed, [15, 0, 0]);
  assert.equal(seen.psnr, Number((10 * Math.log10((255 * 255) / ((50 * 900) / 300))).toFixed(1)));
  // Rutan utan den ändrade halvan: lika.
  assert.equal(difference(b, a, undefined, { x0: 0, y0: 0, x1: 5, y1: 10 }).meanMax, 0);
});

test('takten: vart fjärde steg dubbelt så stort syns i sitt läge, jämn takt ger 1, stillhet räknas inte', () => {
  const jerky = Array.from({ length: 40 }, (_, i) => (i % 4 === 2 ? 2 : 1));
  const seen = cadence(jerky, 4, 0.4);
  assert.equal(seen.most, 2);
  assert.equal(seen.medians.filter((value) => value === 1).length, 1, 'grannarna till det stora steget blir 2/3, de andra 1');
  assert.equal(cadence(Array(40).fill(1), 4, 0.4).most, 1);
  assert.equal(cadence(Array(40).fill(0.1), 4, 0.4).most, null);
});

test('givhanden: den hud som fanns i startbilden utom givhanden räknas inte, också när den är större', () => {
  const start = paint(picture(200, 120), { x0: 20, y0: 20, x1: 40, y1: 60 }, SKIN);
  paint(start, { x0: 120, y0: 60, x1: 180, y1: 110 }, SKIN); // den vilande handen, större
  const other = otherSkin(start, { x: 30, y: 30 }, 2, 50);
  const later = paint(picture(200, 120), { x0: 60, y0: 40, x1: 80, y1: 80 }, SKIN);
  paint(later, { x0: 120, y0: 60, x1: 180, y1: 110 }, SKIN);
  const hand = handIn(later, whole(later), other, 50);
  assert.deepEqual(hand && { n: hand.n, w: hand.w, h: hand.h, c: hand.c }, { n: 800, w: 20, h: 40, c: { x: 69.5, y: 59.5 } });
  // Utan masken är den vilande handen störst.
  assert.equal(handIn(later, whole(later), null, 50)!.n, 3000);
});

test('glipan: kolumner där dealern slutar mer än två bp ovanför bordskanten', () => {
  const image = picture(60, 80);
  paint(image, { x0: 10, y0: 0, x1: 20, y1: 40 }, [20, 20, 20]); // slutar på rad 39: 11 bp ovanför kanten på rad 50
  paint(image, { x0: 20, y0: 0, x1: 30, y1: 49 }, [20, 20, 20]); // slutar på rad 48: 2 bp, räknas inte
  paint(image, { x0: 30, y0: 0, x1: 40, y1: 80 }, [20, 20, 20]); // når förbi kanten
  assert.deepEqual(gapIn(image, KEY, [0, 59], () => 50, 40, 2), { cols: 10, most: 11 });
});

test('skärmen: avvikelser inne i det gröna räknas, kanterna mot dealern inte', () => {
  const image = picture(40, 40);
  assert.equal(greenOff(image, KEY, 3, 12), 0);
  paint(image, { x0: 0, y0: 0, x1: 10, y1: 40 }, [20, 20, 20]); // dealern: kanten mot den räknas inte
  assert.equal(greenOff(image, KEY, 3, 12), 0);
  paint(image, { x0: 20, y0: 20, x1: 22, y1: 22 }, [2, 150, 48]); // en mörkare fläck: fortfarande skärm, men avviker
  const share = greenOff(image, KEY, 3, 12);
  assert.ok(share > 0 && share < 2, `andelen är ${share} %`);
});

test('huvudets vridning: de mörka punkterna mot mitten av huvudets kontur', () => {
  const image = paint(picture(120, 40), { x0: 40, y0: 0, x1: 81, y1: 40 }, [150, 150, 150]);
  paint(image, { x0: 70, y0: 10, x1: 75, y1: 20 }, [20, 20, 20]);
  assert.equal(headTurn(image, KEY, [10, 19], [0, 120], 5, 70), 72 - 60);
  assert.equal(headTurn(picture(120, 40), KEY, [10, 19], [0, 120], 5, 70), null, 'inget huvud');
});

test('scenens vita kort: hörnen ut till kanten', () => {
  const image = paint(picture(100, 60, [60, 120, 90]), { x0: 30, y0: 20, x1: 70, y1: 45 }, [240, 240, 240]);
  assert.deepEqual(whiteCorners(image, { x0: 10, y0: 5, x1: 90, y1: 55 }), [{ x: 30, y: 20 }, { x: 69, y: 20 }, { x: 69, y: 44 }, { x: 30, y: 44 }]);
  assert.equal(whiteCorners(picture(100, 60, [60, 120, 90]), { x0: 10, y0: 5, x1: 90, y1: 55 }), null);
});

const MEASURE = { mouthReach: 40, insideShare: 0.97, coverShare: 0.5, leavesPx: 6, homePx: 2 } as Measure;
/** En ruta: kortets tyngdpunkt, hur stor del av det blå som ligger på platsen och hur stor del av platsen det täcker. */
const row = (i: number, card: [number, number, number, number] | null, hand: [number, number] | null, away = 0): FrameRow => ({
  i,
  t: i / 24,
  blue: card ? 1 : 0,
  yellow: 1,
  card: card ? { n: 4000, c: { x: card[0], y: card[1] }, corners: [], error: 0, inside: card[2], share: card[3] } : null,
  next: { n: 2700, c: { x: 0, y: 0 }, d: 1 },
  away: { blue: card ? 1 : 0, yellow: away },
  merged: false,
  hand: hand ? { n: 9000, c: { x: hand[0], y: hand[1] }, w: 110, h: 180 } : null,
});

test('tiderna: kortet lämnar skon, ligger på sin plats till slutet, handen lämnar det och är åter i REDO', () => {
  const rows = [
    row(0, null, [500, 300]),
    row(1, null, [480, 320], 1), // kortet på väg
    row(2, [100, 100, 0.6, 1.4], [300, 400]), // blått i luften: mycket utanför platsen
    row(3, [100, 100, 1, 0.3], [300, 400]), // på platsen men bara en flik syns
    row(4, [103, 100, 0.99, 0.8], [301, 400]), // fingrarna täcker ett hörn
    row(5, [103, 101, 1, 0.8], [302, 401]),
    row(6, [103, 100, 1, 0.98], [320, 380]), // handen har lämnat kortet
    row(7, [103, 100, 1, 0.98], [499, 301]),
    row(8, [103, 100, 1, 0.98], [500, 300]),
  ];
  assert.deepEqual(framesOf(rows, MEASURE), { leavesShoe: 1, lands: 4, leavesCard: 6, home: 7 });
  // Ett kort som glider av sin plats före slutet har ingen lands.at, och då ingen tid då handen lämnar det.
  const sliding = rows.map((entry) => (entry.i === 8 ? { ...entry, card: { ...entry.card!, inside: 0.9 } } : entry));
  assert.deepEqual(framesOf(sliding, MEASURE), { leavesShoe: 1, lands: null, leavesCard: null, home: 7 });
});

test('kortplatsen i bild: fyrhörningen flyttad inåt och utåt, och vad som ligger inom den', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.deepEqual(insetQuad(square, 1).map((p) => [round(p.x), round(p.y)]), [[1, 1], [9, 1], [9, 9], [1, 9]]);
  assert.deepEqual(insetQuad(square, -2).map((p) => [round(p.x), round(p.y)]), [[-2, -2], [12, -2], [12, 12], [-2, 12]]);
  assert.ok(inQuad(square, 5, 5) && !inQuad(square, 11, 5) && inQuad(square, 11, 5, 2));
  const image = paint(picture(40, 30), { x0: 10, y0: 10, x1: 20, y1: 20 }, BLUE);
  paint(image, { x0: 20, y0: 12, x1: 25, y1: 14 }, BLUE); // en flik utanför platsen
  const [card] = parts(image, whole(image), isBlue, 10);
  const place = [{ x: 10, y: 10 }, { x: 19, y: 10 }, { x: 19, y: 19 }, { x: 10, y: 19 }];
  assert.equal(insideShare(image, card!, place), Number((100 / 110).toFixed(3)));
});
const round = (value: number): number => Math.round(value * 1000) / 1000;

test('ett mått mot sin gräns: minst, högst, exakt, se efter, och saknas', () => {
  const takt = { what: 'takt', unit: 'gånger', see: 1.25, most: 1.6, source: 'granskaren' };
  assert.equal(judgeOne('takt', 1.07, takt).verdict, 'inom');
  assert.equal(judgeOne('takt', 1.49, takt).verdict, 'se efter');
  assert.equal(judgeOne('takt', 1.7, takt).verdict, 'utanför');
  assert.equal(judgeOne('takt', null, takt).verdict, 'saknas');
  assert.equal(limitText(takt), '≤ 1,6 (se efter över 1,25)');
  const band = { what: 'kortet ligger', least: -0.25, most: 0.25, source: 'granskaren' };
  assert.equal(judgeOne('k', -0.3, band).verdict, 'utanför');
  assert.equal(judgeOne('k', 0.05, band).verdict, 'inom');
  assert.equal(limitText(band), '-0,25 … 0,25');
  const sound = { what: 'ljud', is: false, source: 'granskaren' };
  assert.equal(judgeOne('ljud', false, sound).verdict, 'inom');
  assert.equal(judgeOne('ljud', true, sound).verdict, 'utanför');
  assert.equal(judgeOne('psnr', 32, { what: 'psnr', least: 33, source: 'granskaren' }).verdict, 'utanför');
});

test('en film läses ruta för ruta i RGB, och ffprobe säger takt, rutor och ljud', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'matning-'));
  try {
    const silent = join(dir, 'tyst.mp4');
    const loud = join(dir, 'ljud.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x808080:s=64x48:r=24:d=0.25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', silent]);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x808080:s=64x48:r=24:d=0.25', '-f', 'lavfi', '-i', 'sine=d=0.25', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', loud]);
    const facts = await probe(silent);
    assert.deepEqual([facts.width, facts.height, facts.fps, facts.frames, facts.audio], [64, 48, 24, 6, false]);
    assert.equal((await probe(loud)).audio, true);
    const means: number[] = [];
    const count = await eachFrame(silent, { width: 64, height: 48 }, (frame) => {
      means.push(frame.data.reduce((sum, value) => sum + value, 0) / frame.data.length);
    });
    assert.equal(count, 6);
    for (const mean of means) assert.ok(Math.abs(mean - 128) < 3, `rutans medel ${mean}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
