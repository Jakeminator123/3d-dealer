// De lokala stegen för ett ankare på små konstgjorda bilder: skärmen, händerna, märkkortet, midjan, det rena, huvudet,
// bordskanten och överföringen till ett nytt öga. Ingen bild från en bildmodell och inget register.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  beyondWrist,
  boxOffset,
  cleanScreen,
  darkBox,
  fillWaist,
  flattenScreen,
  handAt,
  moveHand,
  paintShoeCard,
  pasteHead,
  pixelBetween,
  rimPoint,
  screenReport,
  silhouetteOverlap,
  tableEdge,
  toEye,
  isCard,
} from './ankarbild.ts';
import type { Picture, Rgb } from './matning.ts';

const KEY: Rgb = [2, 182, 48];
const SKIN: Rgb = [230, 160, 140];
const INK: Rgb = [70, 60, 60];
const SLEEVE: Rgb = [20, 20, 22];
const YELLOW: Rgb = [244, 210, 28];
const TABLE: Rgb = [20, 215, 60];

function picture(width: number, height: number, colour: Rgb = KEY): Picture {
  const data = Buffer.alloc(width * height * 3);
  for (let p = 0; p < width * height; p++) data.set(colour, p * 3);
  return { data, width, height };
}
const paint = (p: Picture, x0: number, y0: number, x1: number, y1: number, colour: Rgb) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) p.data.set(colour, (y * p.width + x) * 3);
};
const at = (p: Picture, x: number, y: number): number[] => [...p.data.subarray((y * p.width + x) * 3, (y * p.width + x) * 3 + 3)];
const countOf = (p: Picture, colour: Rgb): number => {
  let n = 0;
  for (let q = 0; q < p.width * p.height; q++) if (p.data[q * 3] === colour[0] && p.data[q * 3 + 1] === colour[1] && p.data[q * 3 + 2] === colour[2]) n++;
  return n;
};
const HAND = { reach: 60, seek: 10, close: 3, dark: 40 };

test('skärmen: skärm, bord, rutnät och skugga blir en grön, dealerns färger står kvar', () => {
  const p = picture(60, 40, [4, 180, 50]);
  paint(p, 0, 20, 60, 40, TABLE);
  paint(p, 0, 30, 60, 31, [0, 165, 30]);
  paint(p, 10, 25, 20, 28, [10, 60, 20]);
  paint(p, 30, 5, 40, 15, SKIN);
  paint(p, 42, 5, 50, 15, SLEEVE);
  const done = flattenScreen(p, KEY, { x0: 0, y0: 0, x1: 20, y1: 10 }, { share: 0.55, least: 70, shadow: 25, shadowLeast: 45 });
  assert.deepEqual([...done.screen], [4, 180, 50]);
  assert.equal(countOf(p, KEY), 60 * 40 - 100 - 80);
  assert.deepEqual(at(p, 35, 10), [...SKIN]);
  assert.deepEqual(at(p, 45, 10), [...SLEEVE]);
});

/** En hand: hud med en tatuering mitt i, en ärm till vänster, ett gult kort till höger. */
function handPicture(): Picture {
  const p = picture(160, 120);
  paint(p, 10, 50, 40, 70, SLEEVE);
  paint(p, 40, 40, 100, 80, SKIN);
  paint(p, 60, 55, 70, 65, INK);
  paint(p, 100, 50, 115, 75, YELLOW);
  return p;
}

test('handen: huden med tatueringen, utan ärm och kort; där fingrarna rör kortet och ärmen', () => {
  const p = handPicture();
  const hand = handAt(p, { x: 70, y: 60 }, HAND)!;
  assert.equal(hand.area, 60 * 40, 'tatueringen är med, ärmen och kortet inte');
  assert.deepEqual(hand.bounds, { x0: 40, y0: 40, x1: 100, y1: 80 });
  const card = rimPoint(p, hand, isCard)!;
  assert.ok(card.x > 100 && Math.abs(card.y - 62) < 2);
  assert.equal(handAt(p, { x: 5, y: 5 }, HAND), null, 'ingen hud nära punkten');
  // Bortom handleden vid x 50, längs underarmen åt höger.
  const beyond = beyondWrist(hand, p.width, { x: 50, y: 60 }, { x: 1, y: 0 });
  assert.equal(beyond.area, 49 * 40);
  assert.equal(beyond.width, 39);
});

test('handen krymps kring en punkt, läggs på en annan, och platsen fylls med det runt omkring', () => {
  const p = handPicture();
  const hand = handAt(p, { x: 70, y: 60 }, HAND)!;
  const moved = moveHand(p, hand, 0.5, { x: 100, y: 60 }, { x: 90, y: 64 }, true);
  const after = handAt(p, { x: 80, y: 62 }, HAND)!;
  assert.ok(Math.abs(after.area - 600) < 120, `handen har en fjärdedel av ytan: ${after.area}`);
  assert.ok(after.bounds.x1 <= 92 && after.bounds.x0 >= 58, 'och ligger kring den nya punkten');
  assert.ok(moved.removedYellow > 300, 'kortet intill handen är borttaget');
  assert.equal(countOf(p, YELLOW), 0);
  assert.deepEqual(at(p, 45, 45), [...KEY], 'där handen var är det skärm');
  assert.ok(moved.cover[64 * p.width + 80]! > 250 && moved.cover[45 * p.width + 45] === 0);
});

test('märkkortet målas där dockans kort syns i underlaget, inte under fingrarna', () => {
  const guide = picture(80, 60);
  paint(guide, 30, 20, 50, 50, YELLOW);
  const p = picture(80, 60, SLEEVE);
  const cover = new Uint8Array(80 * 60);
  for (let y = 20; y < 25; y++) for (let x = 30; x < 50; x++) cover[y * 80 + x] = 255;
  const quad = [{ x: 29.5, y: 19.5 }, { x: 49.5, y: 19.5 }, { x: 49.5, y: 49.5 }, { x: 29.5, y: 49.5 }];
  const done = paintShoeCard(p, guide, cover, quad, YELLOW);
  assert.equal(done.spared, 100);
  assert.deepEqual(at(p, 40, 35), [...YELLOW]);
  assert.deepEqual(at(p, 40, 22), [...SLEEVE], 'under fingrarna');
  assert.deepEqual(at(p, 60, 35), [...SLEEVE], 'utanför kortet');
});

test('midjan: kläderna förs ned till bordskanten där de slutar strax ovanför', () => {
  const p = picture(40, 60);
  paint(p, 10, 0, 30, 45, SLEEVE);
  paint(p, 20, 45, 30, 52, SLEEVE);
  const done = fillWaist(p, KEY, () => 50, [0, 39], { reach: 12, below: 1, sample: [3, 9] });
  assert.equal(done.cols, 10, 'bara där glipan är');
  assert.equal(done.most, 6);
  assert.deepEqual(at(p, 15, 51), [...SLEEVE]);
  assert.deepEqual(at(p, 15, 52), [...KEY]);
  assert.deepEqual(at(p, 5, 51), [...KEY], 'utanför dealern');
});

test('rent: små hål fylls och lösa fläckar tas bort, stora glipor och delar står kvar och mäts', () => {
  const p = picture(80, 60);
  paint(p, 10, 10, 60, 50, SLEEVE);
  paint(p, 20, 20, 22, 22, KEY);
  paint(p, 40, 20, 50, 40, KEY);
  paint(p, 70, 5, 72, 7, SKIN);
  const before = screenReport(p, KEY, 100);
  assert.deepEqual(before.holes.map((hole) => hole.n), [200, 4]);
  assert.deepEqual(before.spots.map((spot) => spot.n), [4]);
  const done = cleanScreen(p, KEY, 12, 9);
  assert.deepEqual([done.holesFilled, done.spotsRemoved], [4, 4]);
  const after = screenReport(p, KEY, 100);
  assert.deepEqual([after.holes.length, after.spots.length], [1, 0]);
});

test('huvudet ur en bild som flyttat resten läggs på basen, förskjutet till kragen', () => {
  const base = picture(60, 60);
  paint(base, 10, 30, 50, 60, SLEEVE);
  paint(base, 25, 10, 35, 30, SKIN);
  const head = picture(60, 60);
  paint(head, 13, 33, 53, 60, SLEEVE);
  paint(head, 28, 13, 38, 33, [200, 120, 100]);
  const done = pasteHead(base, head, KEY, { x0: 0, y0: 0, x1: 60, y1: 60 }, () => 30, 5);
  assert.deepEqual([done.dx, done.dy], [3, 3]);
  assert.deepEqual(at(base, 30, 20), [200, 120, 100]);
  assert.deepEqual(at(base, 30, 45), [...SLEEVE], 'kroppen står kvar');
});

test('skon, kortet och bordskanten mäts mot underlaget', () => {
  const guide = picture(100, 80);
  paint(guide, 0, 40, 100, 80, TABLE);
  paint(guide, 0, 55, 100, 56, [0, 165, 30]);
  paint(guide, 60, 30, 90, 50, SLEEVE);
  const p = picture(100, 80);
  paint(p, 0, 42, 100, 80, TABLE);
  paint(p, 62, 30, 90, 50, SLEEVE);
  assert.equal(tableEdge(guide, 20, [20, 70], 10), 40, 'rutnätets linje tas inte för kanten');
  assert.equal(tableEdge(p, 20, [20, 70], 10), 42);
  assert.equal(tableEdge(picture(10, 80), 5, [10, 70], 10), null, 'inget bord');
  assert.equal(boxOffset(darkBox(p, { x0: 50, y0: 0, x1: 100, y1: 80 }, 10)!, darkBox(guide, { x0: 50, y0: 0, x1: 100, y1: 80 }, 10)!), 2);
  assert.equal(silhouetteOverlap(p, guide, { x0: 50, y0: 25, x1: 100, y1: 52 }), Math.round((28 * 20 / (30 * 20)) * 1000) / 1000);
});

test('ett ankare förs över till ett öga som pekar åt ett annat håll: punkterna hamnar där ögat ser dem', () => {
  const from = { position: [0, 1, 0], forward: [0, 0, -1], focalPx: 50, frame: { width: 64, height: 48 } };
  const same = toEye(picture(64, 48, SKIN), from, from, KEY);
  assert.equal(same.outside, 0);
  const p = picture(64, 48);
  paint(p, 40, 20, 44, 24, SKIN);
  const turned = { ...from, forward: [Math.sin(0.1), 0, -Math.cos(0.1)], focalPx: 55 };
  const seen = pixelBetween(from, turned, 41.5, 21.5);
  const back = pixelBetween(turned, from, seen.x, seen.y);
  assert.ok(Math.abs(back.x - 41.5) < 1e-9 && Math.abs(back.y - 21.5) < 1e-9, 'fram och tillbaka');
  assert.ok(seen.x < 41.5, 'ögat vänt åt höger ser punkten längre till vänster');
  const moved = toEye(p, from, turned, KEY).picture;
  const [r] = at(moved, Math.round(seen.x), Math.round(seen.y));
  assert.ok(r! > 150, 'huden där ögat ser den');
  assert.throws(() => toEye(p, from, { ...turned, position: [0, 1.1, 0] }, KEY), /samma plats/);
});
