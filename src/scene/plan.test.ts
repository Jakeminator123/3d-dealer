// Kortplanen som Labbet ställer: bara bågens, radens och kortens storleks tal tas emot, var och en inom sina gränser, och
// scenen med en ny plan har kortplatserna ur den.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { placesOf, readScene } from './description.ts';
import { PlanError, planOf, readPlan, samePlan, withPlan, type CardPlan } from './plan.ts';

const root = resolve(import.meta.dirname, '..', '..');
const scene = readScene(JSON.parse(readFileSync(join(root, 'content', 'scene.json'), 'utf8')));
const plan = planOf(scene)!;

test('dagens kortplan läses ur scenen och tas emot som den är', () => {
  assert.deepEqual(plan, { arc: { centreX: scene.places.arc!.centreX, depth: scene.places.arc!.depth, width: scene.places.arc!.width, bend: scene.places.arc!.bend, round: scene.places.arc!.round, step: scene.places.arc!.step }, row: { first: scene.places.row!.first, step: scene.places.row!.step }, scale: scene.card.onTable.scale });
  assert.deepEqual(readPlan(JSON.parse(JSON.stringify(plan)), scene), plan);
  assert.ok(samePlan(planOf(withPlan(scene, plan))!, plan));
});

test('en ny kortplan ger kortplatserna ur den, med scenens antal platser och kort', () => {
  const straight: CardPlan = { ...plan, arc: { ...plan.arc, bend: 0, depth: plan.arc.depth + 0.05 }, scale: 1.3 };
  const next = withPlan(scene, straight);
  assert.deepEqual({ dealer: next.places.dealer, seats: next.places.seats }, placesOf(next.places.arc!, next.places.row!));
  assert.equal(next.places.seats.length, scene.places.seats.length);
  assert.equal(next.places.arc!.cards, scene.places.arc!.cards);
  // Utan böjning ligger alla spelares första kort på samma djup: en rak linje.
  assert.ok(next.places.seats.every((seat) => Math.abs(seat.cards[0]![1] - next.places.seats[0]!.cards[0]![1]) < 1e-9));
  assert.equal(next.card.onTable.scale, 1.3);
  // Allt annat i scenen är som förut.
  assert.deepEqual({ ...next, places: scene.places, card: scene.card }, scene);
  assert.deepEqual({ ...next.card, onTable: scene.card.onTable }, scene.card);
});

test('ett tal utanför sin gräns, ett tal som fattas och ett fält som inte hör dit tas inte emot, och felet säger vilket', () => {
  const wrong = (change: (copy: Record<string, any>) => void, pattern: RegExp) => {
    const copy = JSON.parse(JSON.stringify(plan));
    change(copy);
    assert.throws(() => readPlan(copy, scene), (error: unknown) => error instanceof PlanError && pattern.test(error.message), String(pattern));
  };
  wrong((copy) => (copy.scale = 2.5), /scale 0,5 … 2/);
  wrong((copy) => (copy.scale = '1.2'), /scale/);
  wrong((copy) => (copy.arc.depth = scene.dealerEdge.z + 0.05), /arc\.depth .*från dealerns bordskant/);
  wrong((copy) => (copy.arc.width = 3), /arc\.width/);
  wrong((copy) => (copy.arc.round = 0), /arc\.round/);
  wrong((copy) => (copy.arc.step = [0.01, 0]), /arc\.step/);
  wrong((copy) => (copy.row.first = [0, scene.dealerEdge.z - 0.1]), /row\.first/);
  wrong((copy) => (copy.row.step = [0.2, 0]), /row\.step/);
  wrong((copy) => delete copy.arc.bend, /arc\.bend/);
  // Antalet platser och kort, och allt annat i scenen, ställs inte här.
  wrong((copy) => (copy.arc.seats = 5), /arc får inte bära seats/);
  wrong((copy) => (copy.row.cards = 2), /row får inte bära cards/);
  wrong((copy) => (copy.shoe = { at: [0, 0] }), /kortplanen får inte bära shoe/);
  assert.throws(() => readPlan(null, scene), /kortplanen saknas/);
  // Gränserna gäller bägge hållen: precis på gränsen tas emot.
  assert.equal(readPlan({ ...plan, scale: 2 }, scene).scale, 2);
});
