// Kortet i skons mynning som nyckeln ser det: hörnens ordning och avståndet innanför konturen, som skuggaren räknar dem.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { readScene } from './description.ts';
import { pickUpCard, readDoll } from './dollPose.ts';
import { see, viewEye } from './geometry.ts';
import { MARKER_GLSL, shoeCardUniforms, sideOf } from './marker.ts';

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
