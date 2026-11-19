// Följden: när ett kort ligger kvar, i vilken ordning korten läggs, REDO med de kort som då ligger, och bitarna när
// tagningen klipps vid REDO.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { landingFrame, layingOrder, piecesOf, settledFrame, staysOf, withCards } from './foljd.ts';

test('ett kort ligger från första rutan där det är blått nog och så till slutet', () => {
  assert.equal(landingFrame([0, 0, 900, 2400, 2500, 2500], 2000), 3);
  // Täcks det en stund efter att det lagts, ligger det först från rutan efter.
  assert.equal(landingFrame([0, 2500, 2500, 1200, 2500, 2500], 2000), 4);
  assert.equal(landingFrame([0, 2500, 2500, 0], 2000), null, 'borta i sista rutan');
  assert.equal(landingFrame([], 2000), null);
});

test('kortet läggs där den sista stunden det ligger på platsen börjar; en hand som går över det bryter inte stunden', () => {
  // Ett kort som vänds på platsen (ruta 1–2), är borta länge och läggs sedan (ruta 6), med en hand över det i ruta 8.
  const inside = [0, 2500, 2500, 0, 0, 0, 2500, 2500, 100, 2500];
  assert.deepEqual(staysOf(inside, 2000, 1), [[1, 2], [6, 9]]);
  assert.equal(settledFrame(inside, 2000, 1), 6);
  assert.equal(settledFrame(inside, 2000, 3), 1, 'med längre uppehåll är det en stund');
  assert.equal(settledFrame([0, 2500, 2500, 0, 0], 2000, 1), null, 'borta i slutet');
});

test('korten i den ordning filmen lägger dem, inte den givna; ett kort som aldrig läggs står inte med', () => {
  assert.deepEqual(layingOrder([40, 12, null, 30]), [1, 3, 0]);
  assert.deepEqual(layingOrder([20, 20, 5]), [2, 0, 1], 'lika: i given ordning');
  assert.deepEqual(layingOrder([null, null]), []);
});

test('REDO med de kort som ligger: första bilden med rutorna ur sista bilden, och inget annat', () => {
  const picture = (fill: number) => ({ data: Buffer.alloc(4 * 3 * 3, fill), width: 4, height: 3 });
  const made = withCards(picture(10), picture(200), [{ x0: 1, y0: 1, x1: 3, y1: 2 }, { x0: 3, y0: 2, x1: 9, y1: 9 }]);
  const values = Array.from({ length: 12 }, (_, p) => made.data[p * 3]);
  assert.deepEqual(values, [10, 10, 10, 10, 10, 200, 200, 10, 10, 10, 10, 200], 'rutorna, beskurna till bilden');
});

test('bitarna börjar och slutar i REDO: varje bit slutar på nästa bits första ruta', () => {
  assert.deepEqual(piecesOf(97, [48]), [{ from: 0, to: 48 }, { from: 48, to: 96 }]);
  assert.deepEqual(piecesOf(100, [30, 61]), [{ from: 0, to: 30 }, { from: 30, to: 61 }, { from: 61, to: 99 }]);
});
