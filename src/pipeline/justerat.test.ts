// Justerade gränser: att en justering bara gäller sin cykel, att originalet står kvar, och att tvåhandsgivens justering
// är den som behövs (dockan faller mot originalet och håller mot justeringen).

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { cycleMove, readCycleParts } from './cykel.ts';
import { limitsFor, readAdjusted, readAdjustedFrom, type Adjusted } from './justerat.ts';
import { judgeOne, type Limit } from './matning.ts';
import { dollMotion, motionNumbers } from './rorelse.ts';
import { readTagning } from './tagning.ts';

const root = resolve(import.meta.dirname, '..', '..');

const limits: Record<string, Limit> = {
  vinkel: { what: 'en vinkel', unit: 'grader', least: 20, source: 'mätt på förebilden' },
  langd: { what: 'en längd', unit: 'cm', most: 5, see: 4, doll: 1, source: 'provet' },
};
const adjusted: Adjusted = { 'cykel-prov': { vinkel: { least: 0, source: 'sagt av någon' } } };

test('en justering läggs i originalets ställe bara för sin cykel, och originalet står kvar i källan', () => {
  const own = limitsFor(limits, adjusted, 'cykel-prov');
  assert.equal(own.vinkel!.least, 0);
  assert.equal(own.vinkel!.what, 'en vinkel');
  assert.equal(own.vinkel!.unit, 'grader');
  assert.match(own.vinkel!.source, /sagt av någon/);
  assert.match(own.vinkel!.source, /Originalet ≥ 20: mätt på förebilden/);
  assert.deepEqual(own.langd, limits.langd, 'det som inte är justerat är originalet');
  assert.equal(limits.vinkel!.least, 20, 'originalet ändras inte');
  assert.equal(limitsFor(limits, adjusted, 'cykel-annan'), limits, 'en annan cykel får originalen som de är');
});

test('en justering byter hela gränsen: en övre gräns i stället för en undre lämnar ingen undre kvar', () => {
  const own = limitsFor(limits, { 'cykel-prov': { vinkel: { most: 10, source: 'sagt' }, langd: { most: 8, source: 'sagt' } } }, 'cykel-prov');
  assert.equal(own.vinkel!.least, undefined);
  assert.equal(own.vinkel!.most, 10);
  assert.equal(own.langd!.see, undefined);
  assert.equal(own.langd!.doll, undefined);
  assert.equal(judgeOne('vinkel', 5, own.vinkel!).verdict, 'inom');
  assert.equal(judgeOne('vinkel', 5, limits.vinkel!).verdict, 'utanför');
});

test('en justering utan original, utan gräns eller utan källa tas inte emot', () => {
  assert.throws(() => limitsFor(limits, { 'cykel-prov': { saknas: { least: 0, source: 'sagt' } } }, 'cykel-prov'), /inte finns i content\/tagning\.json/);
  assert.throws(() => readAdjustedFrom({ cycles: { 'cykel-prov': { vinkel: { source: 'sagt' } } } }), /saknar gräns/);
  assert.throws(() => readAdjustedFrom({ cycles: { 'cykel-prov': { vinkel: { least: 0 } } } }), /saknar källa/);
  assert.throws(() => readAdjustedFrom({ cycles: { 'cykel-prov': { vinkel: { least: 0, source: 'sagt', what: 'annat' } } } }), /annat än en gräns/);
  assert.throws(() => readAdjustedFrom({ cycles: { 'Fel Namn': {} } }), /ogiltigt id/);
  assert.throws(() => readAdjustedFrom({}), /cycles/);
});

test('varje justering i content/ gäller en cykel som finns och en gräns som har ett original', () => {
  const content = readTagning(root);
  for (const [cycle, own] of Object.entries(readAdjusted(root))) {
    assert.equal(readCycleParts(cycle, root).cycle.id, cycle);
    for (const key of Object.keys(own)) assert.ok(content.limits[key], `${cycle}.${key} har inget original`);
    assert.doesNotThrow(() => limitsFor(content.limits, readAdjusted(root), cycle));
  }
});

test('tvåhandsgiven ur sin REDO faller mot originalet om blicken mot skon och håller mot sin justering; enhandsgiven prövas mot originalet', () => {
  const content = readTagning(root);
  const all = readAdjusted(root);
  const parts = readCycleParts('cykel-tva-hander', root);
  const values = motionNumbers(dollMotion(parts, cycleMove(parts, { seat: 4, index: 0, action: 'deal' }), content.motion, content.reference.fps));
  const own = limitsFor(content.limits, all, parts.cycle.id);
  for (const key of ['redoMotSkon', 'huvudMotSkon']) {
    assert.equal(judgeOne(key, values[key], content.limits[key]!).verdict, 'utanför', `${key} ${values[key]} mot originalet`);
    assert.equal(judgeOne(key, values[key], own[key]!).verdict, 'inom', `${key} ${values[key]} mot justeringen`);
  }
  assert.equal(limitsFor(content.limits, all, 'cykel-nyp-rask'), content.limits);
});
