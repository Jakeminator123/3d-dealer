// Rörelsens mått: på konstruerade rörelser med kända svar, och på dockans cykler mot gränserna i content/tagning.json.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import type { Action, Seat } from '../scene/dollPose.ts';
import { cycleMove, readCycleParts } from './cykel.ts';
import { judge, type Limit } from './matning.ts';
import { abrupt, busiest, dollMotion, filled, longestRun, motionNumbers, motionValues, peaksIn, segments, snap, sparc, speedOf, type MotionMeasure, type Tracks } from './rorelse.ts';

const root = resolve(import.meta.dirname, '..', '..');
const tagning = JSON.parse(readFileSync(join(root, 'content', 'tagning.json'), 'utf8')) as { motion: MotionMeasure; limits: Record<string, Limit> };
const MOTION = ['stillaHelt', 'langstaStillhet', 'huvudetIVila', 'tvara', 'knyck', 'huvudFore', 'balEfterTillbaka'];

const minJerk = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 - 15 * t + 6 * t * t));
/** En sträckning `metres` lång på `seconds` sekunder med minsta ryck, med stilla rutor före och efter. */
const reach = (fps: number, seconds: number, metres = 0.4, pad = 6): number[][] => {
  const n = Math.round(seconds * fps);
  return Array.from({ length: n + 1 + 2 * pad }, (_, k) => [metres * minJerk((k - pad) / n), 0]);
};

test('en sträckning med minsta ryck: en topp, knyck 1, SPARC −1,40, inga tvära stopp och halva tiden bär 80 % av vägen', () => {
  for (const [fps, seconds] of [[24, 1.5], [24, 0.8], [30, 1.5], [120, 1.5]] as const) {
    const speed = speedOf(reach(fps, seconds), fps);
    const [move, ...more] = segments(speed, fps);
    assert.ok(move && more.length === 0, 'en rörelse');
    assert.equal(peaksIn(speed, move), 1);
    assert.equal(abrupt(speed, move), 0);
    const knyck = snap(speed, fps, move);
    assert.ok(knyck > 0.9 && knyck < 1.15, `${fps}/s, ${seconds} s: knyck ${knyck.toFixed(3)}`);
    const smooth = sparc(speed.slice(move.from, move.to + 1), fps);
    assert.ok(smooth > -1.45 && smooth < -1.35, `${fps}/s, ${seconds} s: SPARC ${smooth.toFixed(3)}`);
    const share = busiest(speed.slice(6, speed.length - 6));
    assert.ok(share > 0.45 && share < 0.55, `${fps}/s: 80 % av vägen på ${share.toFixed(3)} av tiden`);
  }
});

test('en rörelse som tvärbromsar, och en som går i två stötar, syns i måtten', () => {
  const fps = 24;
  // Halva sträckningen, sedan stilla på en ruta: farten går från sin topp till noll.
  const half = reach(fps, 1.5).map(([x], k, all) => [Math.min(x!, all[Math.floor(all.length / 2)]![0]!), 0]);
  const stopped = speedOf(half, fps);
  const [cut] = segments(stopped, fps);
  assert.ok(abrupt(stopped, cut!) >= 1, 'tvärbromsen räknas');
  assert.ok(snap(stopped, fps, cut!) > 2.5, `knyck ${snap(stopped, fps, cut!).toFixed(2)}`);
  // Två sträckningar efter varandra med en kort sänkning emellan.
  const one = reach(fps, 0.8, 0.2, 0);
  const twice = [...one, ...one.map(([x]) => [0.2 + x!, 0])];
  const speed = speedOf(twice, fps);
  const [both] = segments(speed, fps, 0.05, 0.3);
  assert.equal(peaksIn(speed, both!), 2);
  const single = speedOf(reach(fps, 1.6, 0.4, 0), fps);
  assert.ok(sparc(speed, fps) < sparc(single, fps) - 0.1, 'två stötar är hackigare än en sträckning');
});

test('spår med luckor fylls, och stillheten räknas med cykeln kedjad', () => {
  assert.deepEqual(filled({ fps: 24, points: [null, [0, 0], null, [2, 4], null] }), [[0, 0], [0, 0], [1, 2], [2, 4], [2, 4]]);
  const still = [true, true, false, false, true];
  assert.equal(longestRun(still, 1, true), 3);
  assert.equal(longestRun(still, 1, false), 2);
  assert.equal(longestRun([true, true], 1, true), 2);
});

test('en kropp som fryser mellan rörelserna mäts som stilla, en som andas inte', () => {
  const fps = 24;
  const hand = reach(fps, 1.5, 0.4, 24);
  const n = hand.length;
  const frozen: Tracks = {
    hand: { fps, points: hand },
    head: { fps, points: hand.map(([x]) => [x! * 0.1, 0]) },
    trunk: { fps, points: hand.map(([x]) => [x! * 0.05, 0]) },
  };
  const breathing: Tracks = {
    ...frozen,
    head: { fps, points: hand.map(([x], k) => [x! * 0.1 + 0.01 * Math.sin((2 * Math.PI * k) / n), 0]) },
    trunk: { fps, points: hand.map(([x], k) => [x! * 0.05, 0.008 * Math.sin((4 * Math.PI * k) / n)]) },
  };
  const roles = { hand: 'hand', head: 'head', trunk: 'trunk', body: ['hand', 'head', 'trunk'] };
  const options = { ...tagning.motion, scale: 0.254, smooth: 0, cyclic: true };
  const a = motionNumbers(motionValues(frozen, roles, options));
  const b = motionNumbers(motionValues(breathing, roles, options));
  assert.ok(a.stillaHelt! > 0.3 && a.langstaStillhet! > 1.5, `den frusna: ${a.stillaHelt} av tiden, ${a.langstaStillhet} s`);
  assert.equal(a.huvudetIVila, 0);
  assert.equal(b.stillaHelt, 0);
  assert.ok(b.huvudetIVila! > 0.025, `den som andas: huvudet ${b.huvudetIVila} hb/s i vila`);
});

// Dockans cykler: varje slag mot rörelsens gränser, ur samma cykel. En gräns utanför är ett fel i dockan.
const CYCLES: [string, Seat, number, Action][] = [
  ['cykel-nyp', 1, 0, 'deal'],
  ['cykel-nyp', 4, 0, 'deal'],
  ['cykel-nyp', 7, 1, 'deal'],
  ['cykel-nyp', 3, 2, 'deal'],
  ['cykel-nyp', 'D', 0, 'deal'],
  ['cykel-nyp', 'D', 1, 'hole'],
  ['cykel-nyp', 'D', 1, 'flip'],
  ['cykel-nyp-lugn', 4, 0, 'deal'],
  ['cykel-nyp-lugn', 1, 0, 'deal'],
  // Variant D, med vändningen och väntan.
  ['cykel-nyp-flytande', 4, 0, 'deal'],
  ['cykel-nyp-flytande', 7, 1, 'deal'],
  ['cykel-nyp-flytande', 'D', 0, 'deal'],
  ['cykel-nyp-flytande', 'D', 1, 'flip'],
  ['cykel-nyp-flytande', 'D', 0, 'wait'],
];
for (const [name, seat, index, action] of CYCLES) {
  test(`${name}, ${action} till ${seat === 'D' ? 'dealern' : `plats ${seat}`}, kort ${index}: dockans rörelse är inom rörelsens gränser`, () => {
    const parts = readCycleParts(name);
    const values = motionNumbers(dollMotion(parts, cycleMove(parts, { seat, index, action }), tagning.motion));
    // En väntan har ingen väg ut och tillbaka: ordningen mellan huvud, bål och hand mäts inte för den.
    const limits = Object.fromEntries(MOTION.filter((key) => !(action === 'wait' && values[key] === null)).map((key) => [key, tagning.limits[key]!]));
    for (const entry of judge(values, limits)) assert.equal(entry.verdict, 'inom', `${entry.key}: ${entry.value} mot ${entry.limit}`);
  });
}
