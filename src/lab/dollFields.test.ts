// Reglagen i steget Dockan (dollFields.ts): vilka värden som visas för vilken handling, att enheterna räknas rätt, och
// att en ändrad cykel går igenom samma läsare som resten (readCycle) och går att spela (moveFor). Cyklerna är de i
// content/moves/.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { readScene } from '../scene/description.ts';
import { moveFor, readCycle, readDoll, readMove, type Action, type DollCycle, type Seat } from '../scene/dollPose.ts';
import { fieldsFor, fromShown, getAt, rangeOf, said, setAt, toShown, withValue, type FieldContext } from './dollFields.ts';

const root = resolve(import.meta.dirname, '..', '..');
const read = (file: string): unknown => JSON.parse(readFileSync(join(root, 'content', file), 'utf8'));
const one = readCycle(read('moves/cykel-nyp-rask.json'));
const two = readCycle(read('moves/cykel-tva-hander.json'));
const give = readMove(read(`moves/${one.give}.json`));
const context = (cycle: DollCycle, action: Action, seat: Seat = action === 'deal' ? 4 : 'D'): FieldContext => ({ cycle, action, seat, give });
const ids = (shown: FieldContext): string[] => fieldsFor(shown).map((entry) => entry.field.id);

test('reglagen är de värden som gäller det som spelas', () => {
  const deal = ids(context(one, 'deal'));
  assert.ok(['parts.deal', 'back.lift', 'push.reach', 'life.nod', 'trunkLag', 'side.from', 'breath.head'].every((id) => deal.includes(id)));
  assert.ok(!deal.some((id) => id.startsWith('flip.') || id.startsWith('wait.') || id.startsWith('hands.') || id === 'hole'), 'inget som gäller vändning, väntan eller två händer');
  assert.equal(deal.includes('back.look'), false, 'blicken går till platsen (look place): back.look gäller inte');

  const flip = ids(context(one, 'flip'));
  assert.ok(['flip.reach', 'flip.pickUp', 'flip.from', 'flip.follow'].every((id) => flip.includes(id)));
  assert.deepEqual(ids(context(one, 'hole')).filter((id) => id === 'hole' || id.startsWith('flip.')), ['hole']);

  const wait = ids(context(one, 'wait'));
  assert.ok(['wait.seconds', 'wait.look', 'wait.across', 'wait.head.0', 'wait.trunk.1', 'life.headShare'].every((id) => wait.includes(id)));
  assert.ok(!wait.some((id) => id.startsWith('parts.') || id === 'life.touch' || id === 'trunkLag'), 'väntan har ingen giv');
  // Väntans andning är väntans egen.
  assert.deepEqual(fieldsFor(context(one, 'wait')).find((entry) => entry.field.id === 'breath.rise')!.path, ['wait', 'breath', 'rise']);

  const hands = fieldsFor(context(two, 'deal'));
  const handIds = hands.map((entry) => entry.field.id);
  assert.ok(handIds.includes('hands.parts.slide') && !handIds.includes('parts.deal'), 'tvåhandsgiven har sin egen takt');
  assert.deepEqual(hands.find((entry) => entry.field.id === 'trunkLag')!.path, ['hands', 'trunkLag']);
  assert.deepEqual(hands.find((entry) => entry.field.id === 'side.home')!.path, ['hands', 'side', 'home']);
  assert.deepEqual(hands.find((entry) => entry.field.id === 'hands.handoff.from')!.path, ['hands', 'handoff', 'from', '4']);
  assert.ok(!handIds.includes('back.lift') && !handIds.includes('back.release'), 'höger hand har sina egna bågar');
  // Hålkortet med samma cykel spelas med en hand och cykelns egen takt.
  assert.ok(ids(context(two, 'hole')).includes('parts.deal'));
});

test('enheterna: meter som centimeter, radianer som grader, och takten i hela rutor', () => {
  assert.equal(toShown('cm', 0.05), 5);
  assert.equal(fromShown('cm', 4.2), 0.042);
  assert.equal(Math.round(toShown('rad', 0.03) * 100) / 100, 1.72);
  assert.equal(fromShown('rad', 1.72), 0.03);
  assert.equal(fromShown('rutor', 0.12, 30), 0.1333, 'närmaste hela ruta');
  const deal = fieldsFor(context(one, 'deal')).find((entry) => entry.field.id === 'parts.deal')!;
  assert.equal(said(deal.field, 1.6), '1,60 s · 48 rutor');
  assert.equal(said(fieldsFor(context(one, 'deal')).find((entry) => entry.field.id === 'back.lift')!.field, 0.05), '5,0 cm');
  // Ett värde utanför reglagets gränser vidgar dem i stället för att flyttas.
  assert.deepEqual(rangeOf(deal.field, context(one, 'deal'), 5), [0.3, 5]);
});

test('en ändrad takt håller cykelns längd, också med två takter, och går igenom läsaren och dockan', () => {
  const faster = withValue(one, ['parts', 'deal'], 1.4);
  assert.equal(faster.seconds, 2.8);
  assert.doesNotThrow(() => readCycle(faster));

  const slid = withValue(two, ['hands', 'parts', 'slide'], 0.8);
  assert.equal(slid.seconds, 3.1);
  assert.equal(slid.parts.still, 0.2, 'hålkortets takt tar skillnaden i stilla i slutet');
  assert.doesNotThrow(() => readCycle(slid));
  const back = withValue(two, ['parts', 'onCard'], 0.5);
  assert.equal(back.hands!.parts.still, 0.2);
  assert.doesNotThrow(() => readCycle(back));

  const scene = readScene(read('scene.json'));
  const doll = readDoll(read('doll.json'));
  const nodded = withValue(faster, ['life', 'nod'], 8);
  const move = moveFor(scene, doll, give, 4, { cycle: readCycle(nodded) });
  assert.equal(move.seconds, faster.seconds);
});

test('en väg läses och skrivs utan att ursprunget ändras', () => {
  const changed = setAt(one, ['wait', 'head', '0'], 0.05);
  assert.equal(getAt(changed, ['wait', 'head', '0']), 0.05);
  assert.ok(Array.isArray(changed.wait!.head));
  assert.equal(one.wait!.head[0], 0.03, 'ursprunget står kvar');
  assert.equal(changed.life, one.life, 'det som inte ändrats är samma värde');
});
