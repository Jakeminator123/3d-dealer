// Rörelsens mått: på konstruerade rörelser med kända svar, och på dockans cykler mot gränserna i content/tagning.json.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import type { Action, Seat } from '../scene/dollPose.ts';
import { cycleMove, readCycleParts } from './cykel.ts';
import { dollWrist } from './tagning.ts';
import { judge, type Limit } from './matning.ts';
import { DOLL_ROLES, abrupt, busiest, dollMotion, dollTracks, filled, longestRun, motionNumbers, motionValues, peaksIn, segments, snap, sparc, speedOf, type MotionMeasure, type Tracks } from './rorelse.ts';

const root = resolve(import.meta.dirname, '..', '..');
const tagning = JSON.parse(readFileSync(join(root, 'content', 'tagning.json'), 'utf8')) as { motion: MotionMeasure; limits: Record<string, Limit> };
const MOTION = ['stillaHelt', 'langstaStillhet', 'huvudetIVila', 'tvara', 'knyck', 'huvudFore', 'balEfterTillbaka'];

const minJerk = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 - 15 * t + 6 * t * t));
const near = (actual: number, expected: number, tolerance: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} ligger inte inom ${tolerance} från ${expected}`);
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
  // Variant D, med vändningen (väntan görs bara med E).
  ['cykel-nyp-flytande', 4, 0, 'deal'],
  ['cykel-nyp-flytande', 7, 1, 'deal'],
  ['cykel-nyp-flytande', 'D', 0, 'deal'],
  ['cykel-nyp-flytande', 'D', 1, 'flip'],
];
test('variant D vid plats 6 och 7: handleden under 85 grader och armbågen under 90 när kortet läggs alldeles intill skon', () => {
  const parts = readCycleParts('cykel-nyp-flytande');
  for (const seat of [6, 7]) {
    for (const index of [0, 1, 2]) {
      const move = cycleMove(parts, { seat, index, action: 'deal' });
      const wrist = dollWrist(parts, { seat, index, action: 'deal' });
      const elbow = Math.max(0, ...(move.tracks.leftArm?.turnDeg ?? [0]).map(Math.abs));
      assert.ok(wrist < 85, `plats ${seat}, kort ${index}: handleden ${wrist.toFixed(0)} grader`);
      assert.ok(elbow < 90, `plats ${seat}, kort ${index}: armbågen ${elbow} grader`);
    }
  }
});

test('cykelns tider ur handens fart: vid skon, ut, på kortet och tillbaka, och tillbaka mot ut', () => {
  const fps = 24;
  // Stilla 0,25 s, ut 1,0 s, en långsam knuff 0,5 s, tillbaka 0,75 s, stilla 0,5 s: 3,0 s.
  const still = (seconds: number, at: number) => Array.from({ length: Math.round(seconds * fps) }, () => [at, 0]);
  const way = (seconds: number, from: number, to: number) => Array.from({ length: Math.round(seconds * fps) }, (_, k) => [from + (to - from) * minJerk((k + 1) / Math.round(seconds * fps)), 0]);
  const hand = [...still(0.25, 0), ...way(1, 0, 0.6), ...way(0.5, 0.6, 0.62), ...way(0.75, 0.62, 0), ...still(0.5, 0)];
  const tracks: Tracks = { hand: { fps, points: hand }, head: { fps, points: hand.map(([x]) => [x! * 0.1, 0]) }, trunk: { fps, points: hand.map(([x]) => [x! * 0.05, 0]) } };
  const values = motionNumbers(motionValues(tracks, { hand: 'hand', head: 'head', trunk: 'trunk', body: ['hand', 'head', 'trunk'] }, { ...tagning.motion, scale: 0.254, smooth: 0, cyclic: true }));
  // Med slowShare 0,2 räknas den långsamma början och slutet av varje sträckning till skon och kortet: för minsta ryck
  // är farten under 0,2 av toppen de första och sista 0,16 av tiden.
  near(values.vagUt!, 1 - 2 * 0.16, 0.09, 'vägen ut');
  near(values.vagTillbaka!, 0.75 * (1 - 2 * 0.16), 0.09, 'vägen tillbaka');
  near(values.paKortet!, 0.5 + 0.16 * 1.75, 0.09, 'på kortet');
  near(values.vidSkon!, 0.75 + 0.16 * 1.75, 0.09, 'vid skon');
  near(values.tillbakaMotUt!, 0.75, 0.05, 'tillbaka mot ut');
  // Huvudet i vila: handen står still 0,75 s i sträck (kedjad), så det mäts; utan sidled i huvudet finns ingen sväng.
  assert.ok(values.huvudetIVila !== null);
  assert.equal(values.huvudSvang, null);
});

test('huvudet i vila mäts bara där handen står still minst restLeast i sträck, och en vändning i REDO är ingen vila', () => {
  const fps = 24;
  const hand = reach(fps, 1.5, 0.4, 4);
  const tracks: Tracks = { hand: { fps, points: [...hand, ...[...hand].reverse()] }, head: { fps, points: [...hand, ...[...hand].reverse()].map(([x]) => [x! * 0.1, 0]) }, trunk: { fps, points: [...hand, ...[...hand].reverse()].map(([x]) => [x! * 0.05, 0]) } };
  const roles = { hand: 'hand', head: 'head', trunk: 'trunk', body: ['hand', 'head', 'trunk'] };
  // Handen står still i vändningen ute och i REDO (kedjad). Är den längsta stillheten kortare än restLeast mäts inget.
  const measured = (restLeast: number) => motionNumbers(motionValues(tracks, roles, { ...tagning.motion, restLeast, scale: 0.254, smooth: 0, cyclic: true }));
  const longest = measured(0).handStilla!;
  assert.ok(longest > 0.2 && longest < 1, `handen står still ${longest} s`);
  assert.equal(measured(longest + 0.05).huvudetIVila, null);
  assert.ok(measured(longest - 0.05).huvudetIVila !== null);
});

// Variant E (cykel-nyp-rask): varje slag mot alla rörelsens gränser som gäller slaget, och handleden och armbågen.
const RASK: [Seat, number, Action][] = [
  ...[1, 2, 3, 4, 5, 6, 7].flatMap((seat) => [0, 1, 2].map((index): [Seat, number, Action] => [seat, index, 'deal'])),
  ['D', 0, 'deal'],
  ['D', 1, 'hole'],
  ['D', 1, 'flip'],
  ['D', 2, 'deal'],
  ['D', 3, 'deal'],
  ['D', 0, 'wait'],
];
const raskParts = readCycleParts('cykel-nyp-rask');
const motionKeys = Object.keys(tagning.limits).filter((key) => key in motionNumbers(dollMotion(raskParts, cycleMove(raskParts, { seat: 4, index: 0, action: 'deal' }), tagning.motion)));
for (const [seat, index, action] of RASK) {
  test(`variant E, ${action} till ${seat === 'D' ? 'dealern' : `plats ${seat}`}, kort ${index}: alla rörelsens gränser, handleden och armbågen`, () => {
    const card = { seat, index, action };
    const move = cycleMove(raskParts, card);
    const values = motionNumbers(dollMotion(raskParts, move, tagning.motion));
    // Ett mått som inte gäller slaget saknas: en väntan har ingen väg ut och tillbaka, en vändning inga tider för en giv.
    const limits = Object.fromEntries(motionKeys.filter((key) => values[key] !== null).map((key) => [key, tagning.limits[key]!]));
    for (const entry of judge(values, limits)) assert.equal(entry.verdict, 'inom', `${entry.key}: ${entry.value} mot ${entry.limit}`);
    assert.ok(values.redoMotSkon! >= 20 && values.huvudMotSkon! >= 15, 'huvudet aldrig mot skon');
    if (action !== 'wait') {
      const wrist = dollWrist(raskParts, card);
      assert.ok(wrist <= tagning.limits.dockansHandled!.most!, `handleden ${wrist} grader`);
      for (const key of ['vidSkon', 'vagUt', 'paKortet', 'vagTillbaka', 'tillbakaMotUt', 'huvudSvang']) if (action !== 'flip') assert.notEqual(values[key], null, `${key} mäts`);
    }
    const elbow = Math.max(0, ...(move.tracks.leftArm?.turnDeg ?? [0]).map(Math.abs));
    assert.ok(elbow <= 90, `armbågen ${elbow} grader`);
  });
}

// Kling ungefär halverar små rörelser (mätt): med stillhetens gräns dubblad gav dockans film för den första väntan med E
// 0,385 av tiden stilla och 0,92 s i sträck, och Klings klipp mätte 0,412 och 0,875 (output/work/variant-e/rattning/,
// film-matt.ts). Väntan och vändningen ska därför aldrig stå still också med gränsen dubblad, mätt på de delar en film
// spårar i bild (huvudets och axlarnas lägen och bålen, inte huvudets vridning).
for (const action of ['wait', 'flip'] as const) {
  test(`variant E, ${action === 'wait' ? 'väntan' : 'vändningen'}: aldrig stilla, också om Kling halverar rörelsen`, () => {
    const move = cycleMove(raskParts, { seat: 'D', index: action === 'wait' ? 0 : 1, action });
    const tracks = dollTracks(raskParts, move, 24);
    const roles = { ...DOLL_ROLES, body: action === 'wait' ? ['huvud', 'axel', 'andraAxeln', 'bal'] : ['grepp', 'huvud', 'axel', 'andraAxeln', 'bal'] };
    const options = { ...tagning.motion, still: 2 * tagning.motion.still, scale: 2 * raskParts.doll.body.head.radius, smooth: 0, cyclic: true, phases: false };
    const values = motionNumbers(motionValues(tracks, roles, options));
    if (action === 'wait') {
      assert.equal(values.stillaHelt, 0, `stilla ${values.stillaHelt} av tiden`);
      assert.equal(values.langstaStillhet, 0, `längst ${values.langstaStillhet} s`);
    } else {
      // Vändningen: från att handen lämnar REDO tills den är tillbaka i skon står kroppen aldrig still mer än två rutor i
      // följd, där handen släpper kortet (passagen genom REDO vid skon är densamma som i givklippen och ändras inte här).
      const hb = 2 * raskParts.doll.body.head.radius;
      const speed = (name: string, k: number): number => {
        const a = tracks[name]!.points[k - 1]!;
        const b = tracks[name]!.points[k]!;
        return (Math.hypot(...b.map((value, d) => value - a[d]!)) * 24) / hb;
      };
      const from = Math.ceil((move.back!.out![0] / move.fps) * 24) + 1;
      const to = Math.floor((move.back!.home / move.fps) * 24);
      const still = Array.from({ length: to - from + 1 }, (_, k) => !roles.body.some((name) => speed(name, from + k) > options.still));
      assert.ok(longestRun(still, 24, false) <= 2 / 24 + 1e-9, `stilla ${still.filter(Boolean).length} rutor, längst ${longestRun(still, 24, false)} s i sträck`);
    }
  });
}

for (const [name, seat, index, action] of CYCLES) {
  test(`${name}, ${action} till ${seat === 'D' ? 'dealern' : `plats ${seat}`}, kort ${index}: dockans rörelse är inom rörelsens gränser`, () => {
    const parts = readCycleParts(name);
    const values = motionNumbers(dollMotion(parts, cycleMove(parts, { seat, index, action }), tagning.motion));
    // En väntan har ingen väg ut och tillbaka: ordningen mellan huvud, bål och hand mäts inte för den.
    const limits = Object.fromEntries(MOTION.filter((key) => !(action === 'wait' && values[key] === null)).map((key) => [key, tagning.limits[key]!]));
    for (const entry of judge(values, limits)) assert.equal(entry.verdict, 'inom', `${entry.key}: ${entry.value} mot ${entry.limit}`);
  });
}
