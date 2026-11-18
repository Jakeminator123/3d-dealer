// Rundan som film: att beställningen av en runda som spelkärnan har delat, med klipp och fallback, går genom samma väg
// som varje förlaga (readOrder i forlaga.ts), och arkets rutor. Valet av klipp prövas i src/scene/round.test.ts, och
// med spelkärnans egna händelser i src/server/game.test.ts.
// Filnamnen är påhittade: ett riktigt registernamn i ett test pekar på posten och hindrar npm run reg -- ta-bort.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { readScene } from '../scene/description.ts';
import { forlagaName, readOrder } from './forlaga.ts';
import { backgroundOf, clipEnds, planRound, roundOrder, sheetTimes, viewOfWord, type Deal, type Round, type RoundEntry } from './runda.ts';

const project = resolve(import.meta.dirname, '..', '..');
const readJson = (file: string): unknown => JSON.parse(readFileSync(join(project, 'content', file), 'utf8'));

const round: Round = {
  deal: { seed: 'prov', bets: [{ seat: 1, main: 10 }], hitBelow: 15 },
  fallback: { seconds: 1.2, turn: 0.8, move: 0.8 },
  film: { background: 'scene/backgrounds/prov-rum.jpg', fps: 24, hold: 1.5 },
};
const deals: Deal[] = [
  { seat: 1, hand: 0, index: 0, face: 'A♠', action: 'deal' },
  { seat: 'D', hand: 0, index: 0, face: '9♦', action: 'deal' },
  { seat: 1, hand: 0, index: 1, face: 'K♥', action: 'deal' },
  { seat: 'D', hand: 0, index: 1, face: null, action: 'hole' },
  { seat: 'D', hand: 0, index: 1, face: '7♣', action: 'flip' },
];
const cycle = (file: string, seat: number, index: number, seconds = 4.04): RoundEntry => ({
  file: `dealers/paulina/clips/${file}`,
  status: 'godkänd',
  dealer: 'paulina',
  use: 'dealerfilm',
  pose: 'redo → redo',
  view: { kind: 'spelaren' },
  seat,
  index,
  lands: { seat, index, at: 1.9 },
  seconds,
});
const eye = { position: [0, 1, 0], forward: [0, 0, -1], focalPx: 1000 };

test('rundans beställning, med klipp och kort som går självt, går genom samma väg som varje förlaga', () => {
  const scene = readScene(readJson('scene.json'));
  const plan = planRound(deals, [cycle('prov-1-0.mp4', 1, 0), cycle('prov-1-1.mp4', 1, 1, 3)], 'paulina', { kind: 'spelaren' }, round.fallback);
  const background = backgroundOf({ file: 'scene/backgrounds/prov-rum.jpg', status: 'godkänd', kind: '360', oldView: { blur: 6, exposure: 0.42, turn: 0, mirror: false } }, scene);
  assert.deepEqual(background, { file: 'scene/backgrounds/prov-rum.jpg', kind: '360', turn: 0, blur: 6, exposure: 0.42, mirror: false, lift: scene.background.liftDeg, height: scene.room.captureHeight, radius: scene.room.radius });
  const order = roundOrder(plan, round, { kind: 'spelaren' }, background, 'runda-paulina-prov', true);
  assert.deepEqual(order.view, { kind: 'spelaren', close: true });
  // Servern tar emot beställningen som den tar emot varje förlaga, med fallbackens delar som de står.
  const read = readOrder({ ...order, frames: 24, frame: scene.forlaga.frame, eye });
  assert.deepEqual(read.dealer, { kind: 'film', view: { kind: 'spelaren' }, clips: plan.clips, hold: 1.5 });
  assert.equal(forlagaName(read), 'prov-1-0-och-4-till_spelaren-nara_prov-rum_runda-paulina-prov');
  // En del utan fil måste säga hur länge den är och varifrån kortet kommer.
  const broken = (part: Record<string, unknown>) => readOrder({ ...order, dealer: { kind: 'film', view: { kind: 'spelaren' }, clips: [part] }, frames: 24, frame: scene.forlaga.frame, eye });
  assert.throws(() => broken({ file: null, card: { seat: 'D', index: 1, face: null, at: 1 }, from: 'skon' }), /dealer/);
  assert.throws(() => broken({ file: null, seconds: 1, card: { seat: 'D', index: 1, face: null, at: 1 }, from: 'bordet' }), /dealer/);
  assert.throws(() => broken({ file: null, seconds: 1, card: { seat: 'X', index: 1, face: '7♣', at: 1 }, from: 'skon' }), /dealer/);
  assert.throws(() => readOrder({ ...order, card: { seat: 1, index: 0, face: 'A♠', from: 1 }, frames: 24, frame: scene.forlaga.frame, eye }), /card hör till ett ensamt klipp/);
  assert.throws(() => roundOrder({ clips: [], dealt: [], missing: [], unusable: [], anchor: null, anchors: [] }, round, { kind: 'spelaren' }, background, 'x'), /inga kort/);
});

test('arket visar första rutan och sista rutan i varje del, klipp eller fallback, med kortet den lade', () => {
  const plan = planRound(deals, [cycle('prov-1-0.mp4', 1, 0), cycle('prov-1-1.mp4', 1, 1, 3)], 'paulina', { kind: 'spelaren' }, round.fallback);
  assert.deepEqual(plan.dealt.map((deal) => deal.seconds), [4.04, 1.2, 3, 1.2, 0.8]);
  const ends = clipEnds(plan, 1.5);
  assert.deepEqual(ends.map((end) => Math.round(end * 1000) / 1000), [4.04, 5.24, 8.24, 9.44, 10.24]);
  const times = sheetTimes(plan, round);
  assert.equal(times.length, 6);
  assert.ok(Math.abs(times[5]!.time - (10.24 - 0.5 / 24)) < 1e-9);
  assert.match(times[2]!.text, /^2: 9♦ dealern, kort 0 \(deal\), utan klipp/);
  assert.match(times[4]!.text, /^4: baksidan dealern, kort 1 med baksidan upp/);
  assert.deepEqual(viewOfWord('spelaren'), { kind: 'spelaren' });
  assert.deepEqual(viewOfWord('plats-7'), { kind: 'plats', seat: 7 });
  assert.throws(() => viewOfWord('filmkameran'), /Okänd vy/);
});
