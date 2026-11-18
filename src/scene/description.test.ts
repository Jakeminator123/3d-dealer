// Scenens beskrivning i content/scene.json: att den går att läsa, att varje tal är märkt och att tillgångarna finns i registret.

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

test('scenens tillgångar är poster i registret', () => {
  const scene = readScene(readJson('scene.json'));
  const registry = readJson('assets.json') as { assets: { file: string; group: string }[] };
  for (const file of [scene.table.file, scene.shoe.file]) {
    assert.equal(registry.assets.find((asset) => asset.file === file)?.group, 'models', `${file} ska vara en modell i registret`);
  }
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
});
