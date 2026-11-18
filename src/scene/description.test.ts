// Scenens beskrivning i content/scene.json: att den går att läsa och att varje tal är märkt. Att bord och sko finns i
// registret prövas i src/pipeline/registry.test.ts, eftersom scenen inte läser registret.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { placesOf, readScene, type PlaceArc, type PlaceRow } from './description.ts';

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
  const places = whole.places as { arc: Record<string, unknown>; row: Record<string, unknown> };
  assert.throws(() => readScene({ ...whole, places: { ...places, arc: { ...places.arc, seats: 0 } } }), /places\.arc/);
  assert.throws(() => readScene({ ...whole, places: { ...places, row: { ...places.row, first: [0] } } }), /places\.row/);
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
  // Kortet på bordet: storleken inom sina gränser, glidningen med tider som inte är negativa, och märkningen.
  const onTable = whole.card!.onTable as Record<string, unknown>;
  const withTable = (next: unknown) => ({ ...whole, card: { ...whole.card, onTable: next } });
  assert.throws(() => readScene(withTable({ ...onTable, scale: 0.3 })), /card\.onTable\.scale: 0\.5–2/);
  assert.throws(() => readScene(withTable({ ...onTable, scale: '1' })), /card\.onTable\.scale/);
  assert.throws(() => readScene(withTable({ ...onTable, glide: { after: -1, seconds: 0.5 } })), /card\.onTable\.glide/);
  assert.throws(() => readScene(withTable({ ...onTable, glide: { after: 1 } })), /card\.onTable\.glide/);
  assert.throws(() => readScene(withTable({ ...onTable, basis: undefined })), /card\.onTable: basis och source/);
  assert.throws(() => readScene(withTable(undefined)), /card\.onTable\.scale/);
});

test('kortet på bordet: storleken inom sina gränser, och glidningen börjar när handen har lyft och är klar innan klippet slutar', () => {
  const scene = readScene(readJson('scene.json'));
  const { scale, glide } = scene.card.onTable;
  assert.ok(scale >= 0.5 && scale <= 2);
  // Glidningen börjar när handen har släppt kortet och lyft, och är klar innan klippet slutar (4,04 s, lands.at 1,83–1,92 s).
  assert.ok(glide.after >= 0.9 && glide.seconds > 0 && 1.92 + glide.after + glide.seconds < 4.04, `${glide.after} + ${glide.seconds} s`);
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
  // Dealern: en rad framför henne, med korten lika långt från varandra.
  const [d0, d1, d2, d3] = scene.places.dealer as [number, number][];
  for (const place of [d1, d2, d3]) near(place[1], d0[1], 'dealerns rad');
  near(d3[0] - d2[0], d2[0] - d1[0], 'dealerns kort');
  near(d2[0] - d1[0], d1[0] - d0[0], 'dealerns kort');
});

test('spelarnas kortplatser är en båge ur några tal: med round 2 rund, mitten nästan lika djupt och ytterplatserna böjda tillbaka', () => {
  const whole = readJson('scene.json') as { places: { arc: PlaceArc; row: PlaceRow } };
  const { arc, row } = whole.places;
  const scene = readScene(readJson('scene.json'));
  assert.deepEqual(placesOf(arc, row), { dealer: scene.places.dealer, seats: scene.places.seats });
  // Bågens form prövas med fasta tal: Jakob ställer dagens i Labbet (steget Kortplan, src/scene/plan.ts).
  const shaped = { ...arc, bend: 0.16, round: 2 };
  const seats = placesOf(shaped, row).seats;
  const first = (seat: number) => seats.find((entry) => entry.seat === seat)!.cards[0]!;
  // Symmetrisk kring bågens mitt, och djupast (närmast spelarna) vid plats 4.
  for (const [a, b] of [[1, 7], [2, 6], [3, 5]] as const) assert.ok(Math.abs(first(a)[1] - first(b)[1]) < 1e-9 && Math.abs(first(a)[0] + first(b)[0] - 2 * arc.centreX) < 1e-3);
  // Rund, inte ett V: plats 3 och 5 ligger mindre än hälften så långt tillbaka som ett V skulle lägga dem (en tredjedel
  // av ytterplatsernas), och ytterplatserna ligger bend tillbaka.
  const back = (seat: number) => first(4)[1] - first(seat)[1];
  assert.ok(back(3) > 0 && back(3) < back(1) / 3 / 2, `plats 3 ligger ${(back(3) * 100).toFixed(1)} cm bakom plats 4, plats 1 ${(back(1) * 100).toFixed(1)} cm`);
  assert.ok(Math.abs(back(1) - shaped.bend) < 1e-4);
  // Med round 1 är det ett V, och utan böjning en rak linje.
  const vee = placesOf({ ...shaped, round: 1 }, row).seats.map((seat) => seat.cards[0]![1]);
  assert.ok(Math.abs(vee[3]! - vee[2]! - shaped.bend / 3) < 2e-4);
  assert.ok(placesOf({ ...shaped, bend: 0 }, row).seats.every((seat) => Math.abs(seat.cards[0]![1] - shaped.depth) < 1e-4));
  // Ett tal flyttar hela bågen: djupet.
  const moved = placesOf({ ...arc, depth: arc.depth + 0.01 }, row);
  moved.seats.forEach((entry, k) => entry.cards.forEach((card, i) => assert.ok(Math.abs(card[1] - scene.places.seats[k]!.cards[i]![1] - 0.01) < 2e-4)));
});
