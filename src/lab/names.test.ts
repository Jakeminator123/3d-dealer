// Namnen Labbet visar (names.ts): korten räknas från C1, ankarna har sina koder, och registrets texter visas med C1.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anchorCode, anchorName, cardCode, cardName, cycleLabel, framesOf, laidName, shownText } from './names.ts';

test('korten räknas från C1, och inget nollindex syns', () => {
  assert.deepEqual([cardCode(0), cardCode(2), cardCode(null)], ['C1', 'C3', 'C?']);
  assert.deepEqual([cardName(4, 0, 'deal'), cardName('D', 0, 'deal'), cardName('D', 1, 'hole'), cardName('D', 1, 'flip'), cardName('D', 0, 'wait'), cardName('D', 3, 'deal')], ['P4 C1', 'D C1', 'D hålkort', 'D vändning', 'Väntan', 'D C4']);
  assert.equal(shownText('Cykel till plats 4, kort 0 (nyp) ur Spelaren, tagning 1'), 'Cykel till plats 4, C1 (nyp) ur Spelaren, tagning 1');
  assert.equal(shownText('Cykel: hålkortet (dealerns kort 1) (nyp)'), 'Cykel: hålkortet (dealerns C2) (nyp)');
  assert.equal(shownText('V6: kort på bordet'), 'V6: kort på bordet', 'ett kort utan nummer står kvar');
});

test('ankarna får sina koder: A1 VILA, A2.n REDO, A3 med kortet lagt', () => {
  assert.deepEqual([anchorCode('dealers/x/anchors/spelaren-redo-3.png'), anchorCode('dealers/x/anchors/plats-7-redo.png'), anchorCode('dealers/x/anchors/vila.png'), anchorCode(null)], ['A2.1', 'A2.1', 'A1', 'A?']);
  assert.deepEqual([anchorName('dealers/x/anchors/spelaren-redo.png'), anchorName('dealers/x/anchors/vila.png'), anchorName(null)], ['A2.1 · REDO', 'A1 · VILA', 'okänt ankare']);
  assert.deepEqual([laidName(4, 0), laidName('D', 1)], ['A3P4 · C1', 'A3D · C2']);
  const redo = 'dealers/x/anchors/spelaren-redo-3.png';
  assert.deepEqual(framesOf(redo, 4, 0, 'deal'), { first: 'A2.1 · REDO', last: 'A3P4 · C1' });
  assert.deepEqual(framesOf(redo, 'D', 1, 'flip'), { first: 'A3D · C2, baksidan upp', last: 'A3D · C2' });
  assert.deepEqual(framesOf(redo, 'D', 0, 'wait'), { first: 'A2.1 · REDO', last: 'A2.1 · REDO' });
  assert.deepEqual([cycleLabel('rorelse-snabb', 'Variant F: samma som …'), cycleLabel('rorelse', 'En cykel: …')], ['F (rorelse-snabb)', 'rorelse']);
});
