// Rundan: ordningen ur content/runda.json, vilket klipp som väljs för varje kortplats, vad som saknas, och att
// beställningen av rundan går genom samma väg som varje förlaga (readOrder i forlaga.ts).
// Filnamnen är påhittade: ett riktigt registernamn i ett test pekar på posten och hindrar npm run reg -- ta-bort.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { readScene } from '../scene/description.ts';
import { readOrder } from './forlaga.ts';
import type { RegistryEntry } from './registry.ts';
import { backgroundOf, clipEnds, planRound, readRound, roundOrder, sheetTimes, viewOfWord, type Round } from './runda.ts';

const project = resolve(import.meta.dirname, '..', '..');
const readJson = (file: string): unknown => JSON.parse(readFileSync(join(project, 'content', file), 'utf8'));

const cycle = (file: string, seat: number, index: number, more: Partial<RegistryEntry> = {}): RegistryEntry => ({
  file: `dealers/paulina/clips/${file}`,
  status: 'godkänd',
  dealer: 'paulina',
  use: 'dealerfilm',
  pose: 'redo → redo',
  view: { kind: 'spelaren' },
  lands: { seat, index, at: 1.9 },
  seconds: 4.04,
  ...more,
});

const small: Round = {
  order: [
    { seat: 1, index: 0 },
    { seat: 2, index: 0 },
    { seat: 1, index: 1 },
    { seat: 2, index: 1 },
  ],
  faces: ['A♠', 'K♥', '7♦', '10♣'],
  film: { background: 'scene/backgrounds/prov-rum.jpg', fps: 24, hold: 1.5 },
};

test('content/runda.json delar ut plats 1–7 första kortet och sedan plats 1–7 andra kortet, med en valör för varje', () => {
  const round = readRound(readJson('runda.json'));
  const seats = [1, 2, 3, 4, 5, 6, 7];
  assert.deepEqual(round.order, [...seats.map((seat) => ({ seat, index: 0 })), ...seats.map((seat) => ({ seat, index: 1 }))]);
  assert.equal(round.faces.length, 14);
  assert.equal(new Set(round.faces).size, 14, 'samma valör två gånger');
  // Varje kortplats i rundan finns i scenen.
  const scene = readScene(readJson('scene.json'));
  for (const place of round.order) assert.ok(scene.places.seats.find((entry) => entry.seat === place.seat)?.cards[place.index], `plats ${place.seat}, kort ${place.index}`);
});

test('en runda som inte går att använda sägs med fältets namn', () => {
  const whole = readJson('runda.json') as Record<string, unknown>;
  assert.throws(() => readRound({ ...whole, faces: ['A♠'] }), /faces/);
  assert.throws(() => readRound({ ...whole, order: [{ seat: 1, index: 0 }, { seat: 1, index: 0 }], faces: ['A♠', 'K♥'] }), /varje kortplats en gång/);
  assert.throws(() => readRound({ ...whole, film: { background: 'x.jpg', fps: 0, hold: 1 } }), /film\.fps/);
  assert.throws(() => readRound(null), /order/);
});

test('rundan tar klippen i rundans ordning, med rundans valörer, och säger vilka kort som saknar klipp', () => {
  const entries = [cycle('c-2-0.mp4', 2, 0, { lands: { seat: 2, index: 0, at: 2.1 } }), cycle('c-1-0.mp4', 1, 0), cycle('c-2-1.mp4', 2, 1)];
  const plan = planRound(small, entries, 'paulina', { kind: 'spelaren' });
  assert.deepEqual(
    plan.clips.map((clip) => [clip.file.split('/').at(-1), clip.card]),
    [
      ['c-1-0.mp4', { seat: 1, index: 0, face: 'A♠', at: 1.9 }],
      ['c-2-0.mp4', { seat: 2, index: 0, face: 'K♥', at: 2.1 }],
      ['c-2-1.mp4', { seat: 2, index: 1, face: '10♣', at: 1.9 }],
    ],
  );
  assert.deepEqual(plan.missing, [{ seat: 1, index: 1 }]);
  assert.deepEqual(plan.unusable, []);
});

test('bara dealerns cykelklipp ur vyn räknas, och det bästa klippet för en kortplats väljs', () => {
  const entries = [
    cycle('annan-dealer.mp4', 1, 0, { dealer: 'liv' }),
    cycle('annan-vy.mp4', 1, 0, { view: { kind: 'plats', seat: 7 } }),
    cycle('giv.mp4', 1, 0, { pose: 'redo → lagt 1' }),
    cycle('ankare.png', 1, 0, { pose: 'redo' }),
    cycle('utgar.mp4', 1, 0, { status: 'utgår' }),
    cycle('t1.mp4', 1, 0, { take: 1 }),
    cycle('t3-ogranskad.mp4', 1, 0, { take: 3, status: 'att granska' }),
    cycle('t2.mp4', 1, 0, { take: 2 }),
    cycle('utan-tid.mp4', 2, 0, { lands: { seat: 2, index: 0, at: null } }),
    cycle('plats-7.mp4', 2, 1, { view: { kind: 'plats', seat: 7 } }),
  ];
  const plan = planRound(small, entries, 'paulina', { kind: 'spelaren' });
  // Godkänt före ogranskat, och den senaste godkända tagningen.
  assert.deepEqual(plan.dealt.map((take) => take.file.split('/').at(-1)), ['t2.mp4']);
  assert.deepEqual(plan.missing, [{ seat: 2, index: 0 }, { seat: 1, index: 1 }, { seat: 2, index: 1 }]);
  assert.deepEqual(
    plan.unusable.map((item) => [item.file.split('/').at(-1), item.why]),
    [
      ['utgar.mp4', 'status utgår'],
      ['utan-tid.mp4', 'lands.at saknas: tiden då kortet ligger är inte mätt'],
    ],
  );
  // Ur Plats 7 är det plats 7:s klipp som räknas.
  const seven = planRound(small, entries, 'paulina', viewOfWord('plats-7'));
  assert.deepEqual(seven.dealt.map((take) => take.file.split('/').at(-1)), ['annan-vy.mp4', 'plats-7.mp4']);
  assert.deepEqual(viewOfWord('spelaren'), { kind: 'spelaren' });
});

test('rundans beställning går genom samma väg som varje förlaga, och arket visar varje klipps sista ruta', () => {
  const scene = readScene(readJson('scene.json'));
  const entries = [cycle('c-1-0.mp4', 1, 0), cycle('c-2-0.mp4', 2, 0, { seconds: 3 })];
  const plan = planRound(small, entries, 'paulina', { kind: 'spelaren' });
  const background = backgroundOf({ file: 'scene/backgrounds/prov-rum.jpg', status: 'godkänd', kind: '360', oldView: { blur: 6, exposure: 0.42, turn: 0, mirror: false } }, scene);
  assert.deepEqual(background, { file: 'scene/backgrounds/prov-rum.jpg', kind: '360', turn: 0, blur: 6, exposure: 0.42, mirror: false, lift: scene.background.liftDeg, height: scene.room.captureHeight, radius: scene.room.radius });
  const order = roundOrder(plan, small, { kind: 'spelaren' }, background, 'runda-paulina', true);
  assert.deepEqual(order.view, { kind: 'spelaren', close: true });
  // Servern tar emot beställningen som den tar emot varje förlaga.
  const read = readOrder({ ...order, frames: 24, frame: scene.forlaga.frame, eye: { position: [0, 1, 0], forward: [0, 0, -1], focalPx: 1000 } });
  assert.deepEqual(read.dealer, { kind: 'film', view: { kind: 'spelaren' }, clips: plan.clips, hold: 1.5 });
  // I en följd står kortet i klippet, inte bredvid.
  assert.throws(() => readOrder({ ...order, card: { seat: 1, index: 0, face: 'A♠', from: 1 }, frames: 24, frame: scene.forlaga.frame, eye: { position: [0, 1, 0], forward: [0, 0, -1], focalPx: 1000 } }), /card hör till ett ensamt klipp/);
  assert.throws(() => readOrder({ ...order, dealer: { kind: 'film', view: { kind: 'spelaren' }, clips: [] }, frames: 24, frame: scene.forlaga.frame, eye: { position: [0, 1, 0], forward: [0, 0, -1], focalPx: 1000 } }), /dealer/);
  // Arket: första rutan och sista rutan i varje klipp.
  assert.deepEqual(clipEnds(plan, 1.5), [4.04, 7.04]);
  const times = sheetTimes(plan, small);
  assert.equal(times.length, 3);
  assert.ok(Math.abs(times[2]!.time - (7.04 - 0.5 / 24)) < 1e-9);
  assert.throws(() => roundOrder({ clips: [], dealt: [], missing: [], unusable: [] }, small, { kind: 'spelaren' }, background, 'x'), /inga klipp/);
});
