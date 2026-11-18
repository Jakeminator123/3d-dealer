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
  // En bakgrunds egen höjd, dealerns skugga och kortets skugga.
  assert.throws(() => readScene({ ...whole, room: { ...whole.room, captureHeights: { 'scene/backgrounds/monaco.jpg': 0 } } }), /room\.captureHeights/);
  assert.throws(() => readScene({ ...whole, room: { ...whole.room, dealerShadow: { offset: 0.01, blur: 0.01, strength: 2 } } }), /room\.dealerShadow/);
  assert.throws(() => readScene({ ...whole, card: { ...whole.card, shadow: undefined } }), /card\.shadow/);
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

test('kortplatserna: tre för varje spelarplats och fyra för dealern, lagda som i blackjack med det förra kortets valör synlig', () => {
  const scene = readScene(readJson('scene.json'));
  const { width, height } = scene.card;
  assert.equal(scene.places.dealer.length, 4, 'dealern: öppna kortet, hålkortet och två extrakort');
  for (const entry of scene.places.seats) assert.equal(entry.cards.length, 3, `plats ${entry.seat}: tre kort`);
  const hands = [{ who: 'dealern', cards: scene.places.dealer }, ...scene.places.seats.map((entry) => ({ who: `plats ${entry.seat}`, cards: entry.cards }))];
  for (const { who, cards } of hands) {
    for (let k = 1; k < cards.length; k++) {
      const dx = cards[k]![0] - cards[k - 1]![0];
      const dz = cards[k]![1] - cards[k - 1]![1];
      // Åt höger i bild och över det förra kortet, men så långt att det förras vänstra kant med valören (cirka 1 cm) syns.
      assert.ok(dx >= 0.025 && dx < width, `${who}, kort ${k}: ${(dx * 1000).toFixed(1)} mm åt höger om det förra`);
      assert.ok(Math.abs(dz) < height / 4, `${who}, kort ${k}: ${(dz * 1000).toFixed(1)} mm i djup`);
    }
  }
  // Plats 1–7: kort 2 ligger lika långt från kort 1 som kort 1 från kort 0.
  const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) <= 0.0001, `${what}: ${a} mot ${b}`);
  for (const entry of scene.places.seats) {
    const [a, b, c] = entry.cards as [number, number][];
    near(c[0] - b[0], b[0] - a[0], `plats ${entry.seat} i sidled`);
    near(c[1] - b[1], b[1] - a[1], `plats ${entry.seat} i djup`);
  }
  // Dealern: en rad framför henne, och extrakorten lika långt från det förra (närmare än kort 0 och 1, så att armen går fri).
  const [d0, d1, d2, d3] = scene.places.dealer as [number, number][];
  for (const place of [d1, d2, d3]) near(place[1], d0[1], 'dealerns rad');
  near(d3[0] - d2[0], d2[0] - d1[0], 'dealerns extrakort');
  assert.ok(d2[0] - d1[0] <= d1[0] - d0[0]);
});
