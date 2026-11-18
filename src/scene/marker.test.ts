// Kortet i skons mynning som nyckeln ser det: hörnens ordning och avståndet innanför konturen, som skuggaren räknar dem.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { readScene } from './description.ts';
import { pickUpCard, readDoll } from './dollPose.ts';
import { see, viewEye } from './geometry.ts';
import { captureHeightOf } from './backdrop.ts';
import { cardCorners } from './geometry.ts';
import { convexHull, faceAt, filmToFace, findFace, MARKER_GLSL, orientFace, quadDistance, quadOf, shoeCardUniforms, sideOf, turning, type Quad } from './marker.ts';

const project = resolve(import.meta.dirname, '..', '..');
const read = (file: string): unknown => JSON.parse(readFileSync(join(project, 'content', file), 'utf8'));

/** Hur långt innanför kortet punkten ligger, som skuggarens inShoeCard: minsta avståndet till en kant, negativt utanför. */
const inside = (corners: { x: number; y: number }[], p: { x: number; y: number }): number =>
  Math.min(...corners.map((a, k) => sideOf(p, a, corners[(k + 1) % 4]!)));

test('hörnen ställs så att kortets inre ligger innanför alla fyra kanterna, hur de än är givna', () => {
  const square = [
    { x: 10, y: 10 },
    { x: 30, y: 10 },
    { x: 30, y: 30 },
    { x: 10, y: 30 },
  ];
  for (const corners of [square, [...square].reverse()]) {
    const { shoeCard, shoeCardOn, filmSize } = shoeCardUniforms(corners, { width: 1920, height: 1080 });
    const ordered = shoeCard.value.map((v) => ({ x: v.x, y: v.y }));
    assert.equal(shoeCardOn.value, 1);
    assert.deepEqual([filmSize.value.x, filmSize.value.y], [1920, 1080]);
    assert.equal(inside(ordered, { x: 20, y: 20 }), 10, 'mitten ligger 10 bp innanför');
    assert.equal(inside(ordered, { x: 12, y: 20 }), 2);
    assert.ok(inside(ordered, { x: 5, y: 20 }) < 0, 'utanför är negativt');
  }
  assert.equal(shoeCardUniforms(null, { width: 1920, height: 1080 }).shoeCardOn.value, 0);
});

test('hämtstället sett genom Spelarens närbild ligger i bilden, där skon står', () => {
  const scene = readScene(read('scene.json'));
  const eye = viewEye(scene, { kind: 'spelaren', close: true });
  const corners = pickUpCard(scene, readDoll(read('doll.json'))).corners.map((corner) => see(eye, corner)!);
  for (const corner of corners) assert.ok(corner.x > 0 && corner.x < eye.frame.width && corner.y > 0 && corner.y < eye.frame.height);
  // Kortet är minst så stort i bilden att en kant om några bildpunkter ryms innanför det (mätt: 30–50 bp brett).
  const { shoeCard } = shoeCardUniforms(corners, eye.frame);
  const ordered = shoeCard.value.map((v) => ({ x: v.x, y: v.y }));
  const centre = { x: ordered.reduce((s, p) => s + p.x, 0) / 4, y: ordered.reduce((s, p) => s + p.y, 0) / 4 };
  assert.ok(inside(ordered, centre) > 10);
});

test('skuggarens gränser är flyttal: GLSL tar inte ett heltal där ett flyttal väntas', () => {
  for (const name of ['OWN_EDGE', 'NEAR_CARD', 'DEEPER']) {
    const line = MARKER_GLSL.split('\n').find((row) => row.startsWith(`const vec2 ${name}`));
    assert.ok(line, name);
    assert.match(line, /vec2\(\d+\.\d+, \d+\.\d+\)/);
  }
});

// En bild av märkkortets blå på grön skärm: punkterna innanför fyrhörningen `quad` är blå, utom de som `hidden` täcker.
function picture(width: number, height: number, quad: { x: number; y: number }[], hidden: (x: number, y: number) => boolean = () => false): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = quad.every((a, k) => sideOf({ x, y }, a, quad[(k + 1) % 4]!) >= 0) && !hidden(x, y);
      data.set(inside ? [30, 130, 230, 255] : [2, 182, 48, 255], (y * width + x) * 4);
    }
  }
  return data;
}

test('det blå kortet blir en fyrhörning med kortets hörn, också när ett finger täcker ett hörn', () => {
  // Ett snett kort, medurs i bild, som filmens kort på plats 2.
  const card = [
    { x: 40, y: 20 },
    { x: 110, y: 14 },
    { x: 96, y: 70 },
    { x: 22, y: 72 },
  ];
  assert.ok(turning(card) > 0);
  const near = (found: Quad): number => Math.min(...[0, 1, 2, 3].map((k) => quadDistance([0, 1, 2, 3].map((i) => found[(i + k) % 4]!) as Quad, card as Quad)));
  const whole = findFace(picture(140, 90, card), 140, 90);
  assert.ok(whole);
  assert.ok(near(whole.quad) < 2, `hörnen ligger ${near(whole.quad).toFixed(2)} bp från kortets`);
  // Ett finger över hörnet uppe till höger: hörnet kommer tillbaka när grannkanterna förlängs.
  const finger = findFace(picture(140, 90, card, (x, y) => Math.hypot(x - 108, y - 15) < 9), 140, 90);
  assert.ok(finger);
  assert.ok(near(finger.quad) < 3, `med fingret ${near(finger.quad).toFixed(2)} bp`);
  // Ett hörn i bildens koordinater: rutan kan ligga var som helst i filmen.
  const moved = findFace(picture(140, 90, card), 140, 90, { x: 500, y: 300 });
  assert.ok(Math.abs(moved!.quad.reduce((s, p) => s + p.x, 0) / 4 - whole.quad.reduce((s, p) => s + p.x, 0) / 4 - 500) < 1e-9);
  // Inget blått, eller för lite, är inget kort.
  assert.equal(findFace(picture(60, 40, card, () => true), 60, 40), null);
  assert.equal(findFace(picture(60, 40, [{ x: 10, y: 10 }, { x: 14, y: 10 }, { x: 14, y: 14 }, { x: 10, y: 14 }]), 60, 40), null);
});

test('höljet och fyrhörningen går medurs, och en fyrhörning blir sig själv', () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }, { x: 5, y: 3 }, { x: 2, y: 1 }];
  const hull = convexHull(points);
  assert.equal(hull.length, 4);
  assert.ok(turning(hull) > 0);
  assert.equal(quadOf(hull)!.length, 4);
});

test('kortets bild läggs med valören som på scenens kort när kortet ligger på sin kortplats', () => {
  const scene = readScene(read('scene.json'));
  const eye = viewEye(scene, { kind: 'spelaren', close: true });
  const landing = cardCorners(scene, scene.places.seats[1]!.cards[0]!).map((corner) => see(eye, corner)!) as Quad;
  // Filmens kort på kortplatsen, med hörnen givna från ett annat hörn: ordningen blir kortplatsens.
  const found: Quad = [landing[2], landing[3], landing[0], landing[1]];
  const oriented = orientFace(found, { landing, previous: null, scale: 1200, card: scene.card });
  assert.ok(quadDistance(oriented, landing) < 1e-9);
  // Kortets bild: hörnet uppe till vänster är kortets (0, 0), och mitten är mitten.
  const m = filmToFace(oriented);
  const corner = faceAt(m, landing[0]);
  assert.ok(Math.abs(corner.x) < 1e-6 && Math.abs(corner.y) < 1e-6);
  const far = faceAt(m, landing[2]);
  assert.ok(Math.abs(far.x - 1) < 1e-6 && Math.abs(far.y - 1) < 1e-6);
  // Långt från kortplatsen följer ordningen rutan innan, så att bilden inte vänder sig mellan två rutor.
  const shifted = found.map((p) => ({ x: p.x - 200, y: p.y - 100 })) as Quad;
  const before = oriented.map((p) => ({ x: p.x - 202, y: p.y - 101 })) as Quad;
  const followed = orientFace(shifted, { landing, previous: before, scale: 1200, card: scene.card });
  assert.ok(quadDistance(followed, before) < 4);
});

test('en bakgrund kan bära sin egen bildhöjd: Monaco 1,0 m, de andra scenens', () => {
  const scene = readScene(read('scene.json'));
  assert.equal(captureHeightOf(scene, 'scene/backgrounds/monaco.jpg'), 1.0);
  assert.equal(captureHeightOf(scene, 'scene/backgrounds/balsal.jpg'), scene.room.captureHeight);
});
