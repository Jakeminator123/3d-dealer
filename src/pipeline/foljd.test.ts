// Följden: när ett kort ligger kvar, rutan närmast REDO i ett fönster, och bitarna när tagningen klipps där.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bestIn, landingFrame, piecesOf } from './foljd.ts';

test('ett kort ligger från första rutan där det är blått nog och så till slutet', () => {
  assert.equal(landingFrame([0, 0, 900, 2400, 2500, 2500], 2000), 3);
  // Täcks det en stund efter att det lagts, ligger det först från rutan efter.
  assert.equal(landingFrame([0, 2500, 2500, 1200, 2500, 2500], 2000), 4);
  assert.equal(landingFrame([0, 2500, 2500, 0], 2000), null, 'borta i sista rutan');
  assert.equal(landingFrame([], 2000), null);
});

test('rutan med störst värde i fönstret, med båda ändarna', () => {
  assert.deepEqual(bestIn([30, 31, 36, 34, 40], 1, 3), { frame: 2, score: 36 });
  assert.deepEqual(bestIn([30, 31, 36, 34, 40], 3, 9), { frame: 4, score: 40 });
  assert.equal(bestIn([30, 31], 5, 9), null);
});

test('bitarna börjar och slutar i REDO: varje bit slutar på nästa bits första ruta', () => {
  assert.deepEqual(piecesOf(97, [48]), [{ from: 0, to: 48 }, { from: 48, to: 96 }]);
  assert.deepEqual(piecesOf(100, [30, 61]), [{ from: 0, to: 30 }, { from: 30, to: 61 }, { from: 61, to: 99 }]);
});
