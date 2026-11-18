// Kortplanen sparas i content/scene.json: bara bågens, radens och kortens storleks tal, och resten av filen står kvar
// tecken för tecken. Provet skriver i en kopia av filen i en tillfällig mapp.

import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { readScene } from '../scene/description.ts';
import { planOf, type CardPlan } from '../scene/plan.ts';
import { PlanError, savePlan, valueSpan } from './kortplan.ts';

const project = resolve(import.meta.dirname, '..', '..');
let root: string;
const file = () => join(root, 'content', 'scene.json');
const text = () => readFileSync(file(), 'utf8');
const roundFile = () => join(root, 'content', 'runda.json');
const roundText = () => readFileSync(roundFile(), 'utf8');

before(() => {
  root = mkdtempSync(join(tmpdir(), 'kortplan-'));
  mkdirSync(join(root, 'content'));
  copyFileSync(join(project, 'content', 'scene.json'), file());
  copyFileSync(join(project, 'content', 'runda.json'), roundFile());
});
after(() => rmSync(root, { recursive: true, force: true }));

test('ett värde hittas på sin nivå i texten, inte ett med samma namn på en annan', () => {
  const json = '{ "a": { "step": [1, 2], "b": { "step": "inre" } }, "step": 3, "c": "{\\"step\\": 4}" }';
  const at = (path: string[]) => {
    const span = valueSpan(json, path);
    return span && json.slice(span[0], span[1]);
  };
  assert.equal(at(['step']), '3');
  assert.equal(at(['a', 'step']), '[1, 2]');
  assert.equal(at(['a', 'b', 'step']), '"inre"');
  assert.equal(at(['a', 'saknas']), null);
});

test('kortplanen sparas: bara de tillåtna talen ändras, med tiden, och allt annat i filen står kvar', () => {
  const before = text();
  const scene = readScene(JSON.parse(before));
  const plan = planOf(scene)!;
  const next: CardPlan = { arc: { ...plan.arc, bend: 0, depth: plan.arc.depth + 0.04, step: [0.04, 0] }, row: { first: [0.02, plan.row.first[1]], step: [0.05, 0] }, scale: 1.25 };
  assert.deepEqual(savePlan(root, next, '2026-11-18 17:05'), next);
  const after = text();
  // Raderna som ändrades: bågen, raden och storleken, och tiden på två egna rader. Ingen annan rad.
  const old = before.split('\n');
  const now = after.split('\n');
  assert.equal(now.length, old.length + 2);
  const added = now.filter((line) => !old.includes(line));
  assert.deepEqual(added.map((line) => line.trim().split(':')[0]).sort(), ['"arc"', '"row"', '"scale"', '"setInLab"', '"setInLab"']);
  assert.equal(old.filter((line) => !now.includes(line)).length, 3, 'bågen, raden och storleken');
  // Talen står där de ska, och antalet platser och kort står kvar.
  const written = JSON.parse(after);
  assert.deepEqual(written.places.arc, { ...JSON.parse(before).places.arc, ...next.arc });
  assert.deepEqual(written.places.row, { ...JSON.parse(before).places.row, ...next.row });
  assert.equal(written.card.onTable.scale, 1.25);
  assert.equal(written.places.setInLab, 'Jakob i Labbet 2026-11-18 17:05');
  assert.equal(written.card.onTable.setInLab, 'Jakob i Labbet 2026-11-18 17:05');
  // Scenen går att läsa, med kortplatserna ur den nya bågen.
  const read = readScene(written);
  assert.ok(read.places.seats.every((seat) => Math.abs(seat.cards[0]![1] - next.arc.depth) < 1e-4), 'en rak linje');
  // En gång till: tiden byts, ingen rad till.
  savePlan(root, plan, '2026-11-18 17:10');
  const again = text();
  assert.equal(again.split('\n').length, old.length + 2);
  assert.equal(JSON.parse(again).places.setInLab, 'Jakob i Labbet 2026-11-18 17:10');
  assert.equal(again.replaceAll(/\n\s*"setInLab": "[^"]*",/g, ''), before, 'med den gamla planen är filen som förut, så när som på tiden');
});

test('en kortplan utanför gränserna eller med andra fält skrivs inte', () => {
  const before = text();
  const plan = planOf(readScene(JSON.parse(before)))!;
  for (const wrong of [{ ...plan, scale: 3 }, { ...plan, arc: { ...plan.arc, seats: 6 } }, { ...plan, shoe: { at: [0, 0] } }, { ...plan, arc: { ...plan.arc, width: 'bred' } }, null]) {
    assert.throws(() => savePlan(root, wrong, '2026-11-18 17:20'), PlanError);
  }
  assert.equal(text(), before);
});

test('klippens fart sparas i content/runda.json inom 1–2, och en fil vars tal inte ändras skrivs inte', () => {
  const scene = text();
  const round = roundText();
  const plan = planOf(readScene(JSON.parse(scene)))!;
  // Bara farten ändras: scenen står kvar tecken för tecken, och i rundan byts talet och tiden läggs till.
  assert.deepEqual(savePlan(root, { ...plan, speed: 1.5 }, '2026-11-18 18:00'), { ...plan, speed: 1.5 });
  assert.equal(text(), scene);
  const written = JSON.parse(roundText());
  assert.deepEqual(written.speed, { ...JSON.parse(round).speed, clips: 1.5, setInLab: 'Jakob i Labbet 2026-11-18 18:00' });
  const old = round.split('\n');
  const now = roundText().split('\n');
  assert.equal(now.length, old.length + 1);
  assert.deepEqual(now.filter((line) => !old.includes(line)).map((line) => line.trim()), ['"clips": 1.5,', '"setInLab": "Jakob i Labbet 2026-11-18 18:00",']);
  // Samma fart en gång till: ingenting skrivs, inte ens tiden.
  const once = roundText();
  savePlan(root, { ...plan, speed: 1.5 }, '2026-11-18 18:05');
  assert.equal(roundText(), once);
  // Utanför gränserna, eller inget tal: ingen av filerna rörs.
  for (const speed of [0.9, 2.5, '1,5', null]) assert.throws(() => savePlan(root, { ...plan, scale: 1.3, speed }, '2026-11-18 18:10'), /speed 1 … 2/);
  assert.equal(text(), scene);
  assert.equal(roundText(), once);
  // Gränserna själva går, och tillbaka i 1 är rundan som förut, så när som på tiden.
  savePlan(root, { ...plan, speed: 2 }, '2026-11-18 18:15');
  assert.equal(JSON.parse(roundText()).speed.clips, 2);
  savePlan(root, { ...plan, speed: 1 }, '2026-11-18 18:20');
  assert.equal(roundText().replace(/\n\s*"setInLab": "[^"]*",/, ''), round);
  assert.equal(text(), scene);
});
