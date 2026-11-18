// Scenens beskrivning i content/scene.json: att den går att läsa och att varje tal är märkt. Att bord och sko finns i
// registret prövas i src/pipeline/registry.test.ts, eftersom scenen inte läser registret.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { readScene } from './description.ts';

const root = resolve(import.meta.dirname, '..', '..');
const readJson = (name: string): unknown => JSON.parse(readFileSync(join(root, 'content', name), 'utf8'));

test('content/scene.json går att läsa som scen', () => {
  const scene = readScene(readJson('scene.json'));
  assert.equal(scene.schemaVersion, 1);
  assert.deepEqual(scene.camera.frame, { width: 1764, height: 1174 });
});

test('varje tal i beskrivningen står i en grupp som är märkt mätt eller antaget, med källa', () => {
  const unmarked: string[] = [];
  const walk = (value: unknown, path: string, marked: boolean) => {
    if (typeof value === 'number') {
      if (!marked) unmarked.push(path);
    } else if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`, marked));
    } else if (value && typeof value === 'object') {
      const group = value as { basis?: unknown; source?: unknown };
      const here = (group.basis === 'mätt' || group.basis === 'antaget') && typeof group.source === 'string' && group.source.length > 20;
      for (const [key, inner] of Object.entries(value)) walk(inner, path ? `${path}.${key}` : key, marked || here);
    }
  };
  const { schemaVersion: _version, ...groups } = readJson('scene.json') as Record<string, unknown>;
  walk(groups, '', false);
  assert.deepEqual(unmarked, []);
});

test('en beskrivning med hål i tas inte emot', () => {
  const whole = readJson('scene.json') as Record<string, Record<string, unknown>>;
  assert.throws(() => readScene(null), /går inte att använda/);
  assert.throws(() => readScene({ ...whole, camera: { ...whole.camera, focalPx: '2334' } }), /camera\.focalPx/);
  assert.throws(() => readScene({ ...whole, dealerEdge: { z: -1.8 } }), /dealerEdge: basis och source/);
  assert.throws(() => readScene({ ...whole, places: { ...whole.places, seats: [] } }), /places\.seats/);
  assert.throws(() => readScene({ ...whole, shoe: { ...whole.shoe, basis: 'gissat' } }), /shoe: basis och source/);
  assert.throws(() => readScene({ ...whole, background: undefined }), /background\.liftDeg/);
  assert.throws(() => readScene({ ...whole, player: { ...whole.player, fovDeg: 0 } }), /player\.pitchDeg och player\.fovDeg/);
  assert.throws(() => readScene({ ...whole, table: { ...whole.table, tilt: undefined } }), /table\.tilt\.deg/);
  // Rummet och förlagan: golvets höjd räknas ur bordets låda.
  assert.throws(() => readScene({ ...whole, table: { ...whole.table, model: { ...(whole.table!.model as object), box: { min: [0, 0], max: [1, 1, 1] } } } }), /table\.model\.box/);
  assert.throws(() => readScene({ ...whole, room: { ...whole.room, radius: 0 } }), /room\.captureHeight och room\.radius/);
  assert.throws(() => readScene({ ...whole, room: undefined }), /room: basis och source/);
  assert.throws(() => readScene({ ...whole, forlaga: { ...whole.forlaga, fps: 0 } }), /forlaga\.frame och forlaga\.fps/);
  assert.throws(() => readScene({ ...whole, film: { ...whole.film, margin: 0.5 } }), /film\.margin/);
  assert.throws(() => readScene({ ...whole, studio: { ...whole.studio, colours: { screen: [2, 182, 480], table: [0, 0, 0], grid: [0, 0, 0] } } }), /studio\.colours/);
  assert.throws(() => readScene({ ...whole, studio: { ...whole.studio, grid: { step: 0 } } }), /studio\.grid/);
  // Scenens kort ligger under dealerfilmens liggande del, så att handen ritas över det.
  assert.throws(() => readScene({ ...whole, card: { ...whole.card, lift: 0.002 } }), /card\.lift, under film\.lift/);
});

test('rummet och förlagan bär de tal som är avgjorda', () => {
  const scene = readScene(readJson('scene.json'));
  // Förlagan och dealerfilmen har samma ruta, så att en ruta i dockans film svarar mot en ruta i dealerfilmen.
  assert.deepEqual(scene.forlaga.frame, scene.film.frame);
  assert.deepEqual(scene.forlaga, { ...scene.forlaga, frame: { width: 1920, height: 1080 }, fps: 30 });
  assert.equal(scene.background.liftDeg, 0);
  assert.ok(scene.room.captureHeight > 1 && scene.room.captureHeight < 2.5 && scene.room.radius > 3);
  assert.ok(scene.room.shadowStrength > 0 && scene.room.shadowStrength < 1);
  // Lådan är hela modellen: filten och dealerns kant ligger inom den.
  const { box, feltY, dealerEdgeZ } = scene.table.model;
  assert.ok(box.min[1] <= 0 && feltY < box.max[1] && dealerEdgeZ > box.min[2] && dealerEdgeZ < box.max[2]);
});
