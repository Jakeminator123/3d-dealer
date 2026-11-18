// Följden: vilket klipp och vilken tid som gäller vid en tid i följden, vilka kort som ligger och när märkkortet tas bort.
// Talen är pilotens: ett klipp på 97 rutor i 24 rutor/s (4,0417 s) där kortet ligger från 1,92 s.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClipCard } from './dealer.ts';
import { flyingAt, glideAt, laidAt, lyingAt, makeReel, markerDown, placeIn, reelEnd } from './reel.ts';

const SECONDS = 97 / 24;
const card = (seat: number, index: number, face: string, at = 1.92): ClipCard => ({ seat, index, face, at });
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

test('en följd börjar varje klipp där det förra slutar, och sista rutan står kvar i hold sekunder', () => {
  const reel = makeReel([{ seconds: SECONDS }, { seconds: 3 }, { seconds: SECONDS }], 1.5);
  assert.deepEqual(reel.starts, [0, SECONDS, SECONDS + 3]);
  close(reel.seconds, 2 * SECONDS + 3 + 1.5);
  close(reelEnd(reel), 2 * SECONDS + 3);
  assert.throws(() => makeReel([]), /minst ett klipp/);
});

test('vid en tid gäller det klipp som har börjat, med tiden räknad från dess början', () => {
  const reel = makeReel([{ seconds: SECONDS }, { seconds: SECONDS }, { seconds: SECONDS }], 1);
  assert.deepEqual(placeIn(reel, 0), { index: 0, local: 0, held: false });
  assert.deepEqual(placeIn(reel, -2), { index: 0, local: 0, held: false });
  const third = placeIn(reel, 2 * SECONDS + 1);
  assert.equal(third.index, 2);
  close(third.local, 1);
  // Skarven hör till nästa klipp: dess första ruta, inte förra klippets sista.
  assert.deepEqual(placeIn(reel, SECONDS), { index: 1, local: 0, held: false });
  const before = placeIn(reel, SECONDS - 1e-6);
  assert.equal(before.index, 0);
  // Mitt i ruta k (k + 0,5) / 24 visar varje ruta i varje klipp en gång: ruta 96 är första klippets sista, 97 nästas första.
  assert.equal(placeIn(reel, 96.5 / 24).index, 0);
  assert.equal(placeIn(reel, 97.5 / 24).index, 1);
  close(placeIn(reel, 97.5 / 24).local, 0.5 / 24);
  // Efter sista klippet står följden på dess sista ruta, också förbi följdens slut.
  for (const time of [3 * SECONDS, 3 * SECONDS + 0.5, reel.seconds + 10]) assert.deepEqual(placeIn(reel, time), { index: 2, local: SECONDS, held: true });
});

test('ett klipp utan längd hoppas över, och en ensam stillbild står på sin enda ruta', () => {
  const reel = makeReel([{ seconds: 2 }, { seconds: 0 }, { seconds: 2 }]);
  assert.equal(placeIn(reel, 2).index, 2);
  const still = makeReel([{ seconds: 0, card: card(4, 0, 'A♠', 0) }]);
  assert.deepEqual(placeIn(still, 0), { index: 0, local: 0, held: true });
  assert.deepEqual(lyingAt(still, 0), [0]);
  assert.equal(markerDown(still, 0), true);
});

test('ett kort ligger från att det landar tills följden är slut, och märkkortet tas bort bara i klippet som lade det', () => {
  const reel = makeReel(
    [
      { seconds: SECONDS, card: card(1, 0, 'A♠') },
      { seconds: SECONDS, card: card(2, 0, 'K♥', 2.1) },
      { seconds: SECONDS },
      { seconds: SECONDS, card: card(1, 1, '7♦', 1.5) },
    ],
    1.5,
  );
  assert.deepEqual(lyingAt(reel, 0), []);
  assert.equal(markerDown(reel, 1.91), false);
  assert.deepEqual(lyingAt(reel, 1.92), [0]);
  assert.equal(markerDown(reel, 1.92), true);
  // Nästa klipp börjar rent: första kortet ligger kvar, men klippets eget märkkort är i luften och ska inte tas bort.
  assert.deepEqual(lyingAt(reel, SECONDS + 0.01), [0]);
  assert.equal(markerDown(reel, SECONDS + 0.01), false);
  assert.deepEqual(lyingAt(reel, SECONDS + 2.1), [0, 1]);
  assert.equal(markerDown(reel, SECONDS + 2.1), true);
  // Ett klipp utan kort tar inte bort något och lägger inget.
  assert.deepEqual(lyingAt(reel, 2 * SECONDS + 3), [0, 1]);
  assert.equal(markerDown(reel, 2 * SECONDS + 3), false);
  // Platsens andra kort läggs till; efter sista klippet ligger alla, och sista klippets märkkort är borta.
  assert.deepEqual(lyingAt(reel, 3 * SECONDS + 1.5), [0, 1, 3]);
  assert.deepEqual(lyingAt(reel, reel.seconds), [0, 1, 3]);
  assert.equal(markerDown(reel, reel.seconds), true);
});

test('en del utan film: kortet är på väg tills det landar, märkkortet är borta, och ett kort som vänds lämnar sin plats under vändningen', () => {
  const reel = makeReel([
    { seconds: SECONDS, card: card(4, 0, 'A♠') },
    // Dealerns hålkort utan klipp: från skon, med baksidan upp.
    { seconds: 1.2, card: { seat: 'D', index: 1, face: null, at: 1.2 }, from: 'skon' },
    // Vändningen utan klipp: från samma kortplats.
    { seconds: 0.8, card: { seat: 'D', index: 1, face: 'K♥', at: 0.8 }, from: { seat: 'D', index: 1 } },
  ]);
  const slide = reel.starts[1]!;
  const turn = reel.starts[2]!;
  // Medan hålkortet glider står filmen på förra klippets sista ruta, där klippets kort är lagt: märkkortet är borta.
  assert.equal(markerDown(reel, slide + 0.3), true);
  const flying = flyingAt(reel, slide + 0.3)!;
  assert.deepEqual([flying.part, flying.left], [1, null]);
  close(flying.progress, 0.25);
  assert.deepEqual(lyingAt(reel, slide + 0.3), [0]);
  assert.deepEqual(lyingAt(reel, turn - 1e-6), [0]);
  // Vändningen: det nedvända kortet lämnar platsen när den börjar och är det som vänds; det uppvända ligger när den har landat.
  assert.deepEqual(lyingAt(reel, turn), [0]);
  const turning = flyingAt(reel, turn + 0.2)!;
  assert.deepEqual([turning.part, turning.left], [2, 1]);
  close(turning.progress, 0.25);
  assert.deepEqual(lyingAt(reel, reel.seconds), [0, 2]);
  assert.equal(flyingAt(reel, reel.seconds), null);
  // I ett klipp bär filmen kortet: inget är på väg.
  assert.equal(flyingAt(reel, 1), null);
});

test('ett senare kort på samma kortplats tar det tidigares plats', () => {
  const reel = makeReel([
    { seconds: SECONDS, card: card(4, 0, 'A♠') },
    { seconds: SECONDS, card: card(4, 0, 'K♥') },
    { seconds: SECONDS, card: card(4, 0, '7♦') },
  ]);
  assert.deepEqual(lyingAt(reel, SECONDS + 1.91), [0]);
  assert.deepEqual(lyingAt(reel, SECONDS + 1.92), [1]);
  assert.deepEqual(lyingAt(reel, reel.seconds), [2]);
});

// Glidningen som content/scene.json har den (card.onTable.glide): en sekund efter att kortet har landat, på en halv.
const GLIDE = { after: 1, seconds: 0.5 };

test('ett lagt kort börjar glida när handen har släppt det och lyft, mjukt, och kan fortsätta in i nästa klipp', () => {
  const reel = makeReel([
    { seconds: SECONDS, card: card(1, 0, 'A♠') },
    { seconds: SECONDS, card: card(2, 0, 'K♥', 3.6) },
    { seconds: SECONDS, card: card(3, 0, '7♦') },
  ]);
  // Medan kortet är i luften och medan fingrarna vilar på det står det där handen lade det.
  for (const time of [0, 1.91, 1.92, 2.5, 1.92 + GLIDE.after]) assert.equal(glideAt(reel, 0, time, GLIDE), 0, `${time} s`);
  // Sedan går det mjukt: långsamt i början och slutet, halvvägs mitt i tiden.
  const start = 1.92 + GLIDE.after;
  const early = glideAt(reel, 0, start + 0.05, GLIDE);
  assert.ok(early > 0 && early < 0.05, `${early}`);
  close(glideAt(reel, 0, start + GLIDE.seconds / 2, GLIDE), 0.5);
  assert.equal(glideAt(reel, 0, start + GLIDE.seconds, GLIDE), 1);
  // Framme ligger det kvar resten av följden, också när följden står på sista rutan.
  for (const time of [SECONDS + 1, reel.seconds, reel.seconds + 5]) assert.equal(glideAt(reel, 0, time, GLIDE), 1);
  // Ett kort som landar sent i sitt klipp glider i nästa del; tiden räknas från dess egen del.
  const late = reel.starts[1]! + 3.6 + GLIDE.after;
  assert.equal(placeIn(reel, late).index, 2);
  assert.equal(glideAt(reel, 1, late - 0.01, GLIDE), 0);
  close(glideAt(reel, 1, late + GLIDE.seconds / 2, GLIDE), 0.5);
  // En följd som börjar om lägger kortet där handen lade det igen.
  assert.equal(glideAt(reel, 0, 0, GLIDE), 0);
  // Utan tid för glidningen hoppar kortet när tiden har kommit.
  assert.deepEqual([glideAt(reel, 0, start - 1e-6, { after: 1, seconds: 0 }), glideAt(reel, 0, start, { after: 1, seconds: 0 })], [0, 1]);
});

test('ett kort utan klipp ligger direkt på planens plats, och en del utan kort glider inte', () => {
  const reel = makeReel([{ seconds: 1.2, card: { seat: 'D', index: 1, face: null, at: 1.2 }, from: 'skon' }, { seconds: SECONDS }]);
  assert.equal(glideAt(reel, 0, 0, GLIDE), 1);
  assert.equal(glideAt(reel, 1, SECONDS, GLIDE), 0);
  assert.equal(glideAt(reel, 7, 1, GLIDE), 0);
});

test('kortet går från där handen lade det till planens plats och sin storlek, och slutar precis där', () => {
  const reel = makeReel([{ seconds: SECONDS, card: card(4, 0, 'A♠') }]);
  const from: [number, number] = [-0.019, -1.4468];
  const to: [number, number] = [-0.0157, -1.3593];
  const start = 1.92 + GLIDE.after;
  // Före glidningen: där handen lade det, i filmens storlek, och stilla (kortets skugga syns).
  assert.deepEqual(laidAt(reel, 0, 2.5, GLIDE, from, to, 1.4), { place: from, scale: 1, still: true });
  // På väg: mellan de två, och mellan storlekarna, lika långt; ingen skugga.
  const halfway = laidAt(reel, 0, start + GLIDE.seconds / 2, GLIDE, from, to, 1.4);
  close(halfway.place[0], (from[0] + to[0]) / 2);
  close(halfway.place[1], (from[1] + to[1]) / 2);
  close(halfway.scale, 1.2);
  assert.equal(halfway.still, false);
  // Framme: på planens plats och i sin storlek, exakt.
  for (const time of [start + GLIDE.seconds, reel.seconds]) assert.deepEqual(laidAt(reel, 0, time, GLIDE, from, to, 1.4), { place: to, scale: 1.4, still: true });
});

test('ett kort vars plan är densamma som när filmen gjordes, i samma storlek, rör sig aldrig', () => {
  const reel = makeReel([{ seconds: SECONDS, card: card(4, 0, 'A♠') }, { seconds: SECONDS, card: card(4, 1, 'K♥') }], 1.5);
  const place: [number, number] = [-0.019, -1.4468];
  for (let time = 0; time <= reel.seconds + 1; time += 1 / 24) {
    for (const index of [0, 1]) assert.deepEqual(laidAt(reel, index, time, GLIDE, place, place, 1), { place, scale: 1, still: true }, `del ${index}, ${time.toFixed(3)} s`);
  }
});
