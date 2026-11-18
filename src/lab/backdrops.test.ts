// Filnamnen är påhittade: ett riktigt registernamn i ett test pekar på posten och hindrar npm run reg -- ta-bort.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backdropItems, backdropKind, dealerChoices, PLAIN, roundChoices, sameLook, startLook } from './backdrops.ts';
import type { Asset, Registry } from './registry.ts';

const asset = (file: string, group: string, more: Record<string, unknown> = {}): Asset => ({
  file,
  group,
  title: file,
  status: 'att granska',
  present: true,
  ...more,
});

const registryOf = (assets: Asset[]): Registry => ({
  statuses: { 'att granska': '', godkänd: '', utgår: '' },
  groups: { identity: '', anchors: '', backgrounds: '' },
  sources: {},
  unregistered: [],
  assets,
});

test('reglagen startar på gamla projektets visning och scenens lyft och rum, och på bilden som den är när posten saknar dem', () => {
  const room = { lift: 3, height: 1.6, radius: 8 };
  const old = asset('scene/backgrounds/prov-rum.jpg', 'backgrounds', { kind: '360', oldView: { blur: 5, exposure: 0.5, turn: -35, mirror: false } });
  const started = { turn: -35, blur: 5, exposure: 0.5, mirror: false, lift: 3, height: 1.6, radius: 8 };
  assert.deepEqual(startLook(old, room), started);
  // En platt bild fyller redan kamerans ruta och lyfts inte. Rummets mått följer med men gäller bara 360-bilder.
  assert.deepEqual(startLook(asset('scene/backgrounds/prov-platt.png', 'backgrounds', { kind: 'platt' }), room), { ...PLAIN, lift: 0, height: 1.6, radius: 8 });
  // Ett fält som inte är ett tal faller tillbaka på det enkla värdet i stället för att bli NaN i scenen.
  assert.deepEqual(startLook(asset('a.jpg', 'backgrounds', { oldView: { blur: '6', mirror: true } }), { ...room, lift: 12 }), {
    ...PLAIN,
    mirror: true,
    lift: 12,
    height: 1.6,
    radius: 8,
  });
  assert.ok(sameLook(startLook(old, room), started));
  for (const part of [{ turn: -34 }, { lift: 4 }, { height: 1.7 }, { radius: 9 }]) assert.ok(!sameLook(startLook(old, room), { ...started, ...part }));
});

test('bakgrunderna har samma nummer som i Granska: registrets ordning inom gruppen', () => {
  const registry = registryOf([
    asset('scene/backgrounds/prov-a.jpg', 'backgrounds', { kind: '360' }),
    asset('dealers/p/identity/a.png', 'identity'),
    asset('scene/backgrounds/prov-b.jpg', 'backgrounds', { kind: '360' }),
    asset('scene/backgrounds/prov-platt.png', 'backgrounds', { kind: 'platt' }),
  ]);
  const items = backdropItems(registry);
  assert.deepEqual(
    items.map((item) => [item.number, item.asset.file, backdropKind(item.asset)]),
    [
      [1, 'scene/backgrounds/prov-a.jpg', '360'],
      [2, 'scene/backgrounds/prov-b.jpg', '360'],
      [3, 'scene/backgrounds/prov-platt.png', 'platt'],
    ],
  );
  assert.deepEqual(backdropItems(registryOf([])), []);
});

test('dealerna att välja mellan är dealerns egna dealerfilmer, filmerna först, med vyn, ögat och kortets plats de är gjorda med', () => {
  const made = (file: string, group: string, more: Record<string, unknown>) => asset(file, group, { dealer: 'paulina', use: 'dealerfilm', ...more });
  const eye = { position: [0.5, 0.6, -0.2], forward: [-0.3, -0.2, -0.9], focalPx: 1829, frame: { width: 1920, height: 1080 } };
  const shoe = { at: [0.495, -1.8433], yawDeg: -74.6, length: 0.442 };
  const registry = registryOf([
    asset('dealers/paulina/anchors/prov-gammalt.png', 'anchors', { dealer: 'paulina', pose: 'vila', status: 'godkänd', title: 'VILA' }),
    made('dealers/paulina/anchors/spelaren-vila.png', 'anchors', { pose: 'vila', status: 'godkänd', title: 'VILA ur Spelaren', view: { kind: 'spelaren' } }),
    made('dealers/paulina/clips/giv-4_plats-7.mp4', 'clips', { title: 'Giv 4 ur Plats 7', view: { kind: 'plats', seat: 7, close: true }, lands: { seat: 4, index: 0, at: 3 }, eye, shoe, place: [-0.019, -1.4468] }),
    made('dealers/paulina/clips/utan-vy.mp4', 'clips', { title: 'Utan vy' }),
    made('dealers/paulina/clips/nej.mp4', 'clips', { status: 'utgår', view: { kind: 'spelaren' } }),
    made('dealers/pamela/clips/giv.mp4', 'clips', { dealer: 'pamela', title: 'Pamelas', view: { kind: 'spelaren' } }),
    asset('reference/prov-helfigur.png', 'reference', { use: 'helfigur', title: 'En helfigur' }),
  ]);
  assert.deepEqual(dealerChoices(registry, 'paulina'), [
    { dealer: { kind: 'film', file: 'dealers/paulina/clips/giv-4_plats-7.mp4', view: { kind: 'plats', seat: 7 } }, label: 'Giv 4 ur Plats 7', film: true, lands: { seat: 4, index: 0, at: 3 }, made: { eye, shoe, place: [-0.019, -1.4468] } },
    { dealer: { kind: 'film', file: 'dealers/paulina/anchors/spelaren-vila.png', view: { kind: 'spelaren' } }, label: 'VILA ur Spelaren', film: false, made: {} },
  ]);
  // Ett gammalt ankare och en helfigur är inga dealerfilmer, och ett tomt register ger inget val.
  assert.deepEqual(dealerChoices(registryOf([]), 'paulina'), []);
});

test('hela given att välja: varje vy med cykelklipp, rundan som spelkärnan delade med dess valörer, och vad som saknas', () => {
  const cycle = (file: string, seat: number, index: number, more: Record<string, unknown> = {}) =>
    asset(`dealers/paulina/clips/${file}`, 'clips', { dealer: 'paulina', use: 'dealerfilm', pose: 'redo → redo', status: 'godkänd', view: { kind: 'spelaren' }, lands: { seat, index, at: 1.9 }, seconds: 4, ...more });
  const round = {
    deal: { seed: 'prov', bets: [{ seat: 1, main: 10 }], hitBelow: 15 },
    fallback: { seconds: 1.2, turn: 0.8, move: 0.8 },
    film: { background: 'scene/backgrounds/prov-rum.jpg', fps: 24, hold: 1.5 },
    wait: { most: 4 },
    speed: { clips: 1 },
  };
  // Spelkärnans start: plats 1 får A♠, dealern 9♦ upp, plats 1 K♥, och hålkortet. Bara det rundan läser är ifyllt.
  const seatCard = (cardIndex: number, r: string, s: string, shoeDraw: number) => ({ type: 'deal', to: 'seat', seat: 1, hand: 0, cardIndex, card: { r, s }, faceDown: false, shoeDraw });
  const dealt = {
    seed: 'prov',
    bets: round.deal.bets,
    hitBelow: 15,
    steps: [
      {
        op: 'start',
        events: [
          seatCard(0, 'A', '♠', 2),
          { type: 'deal', to: 'dealer', seat: null, hand: null, cardIndex: 0, card: { r: '9', s: '♦' }, faceDown: false, shoeDraw: 3 },
          seatCard(1, 'K', '♥', 4),
          { type: 'deal', to: 'dealer', seat: null, hand: null, cardIndex: 1, card: null, faceDown: true, shoeDraw: 5 },
        ],
        view: { round: { hands: [{ seat: 1, hand: 0, cards: [{ r: 'A', s: '♠', shoeDraw: 2 }, { r: 'K', s: '♥', shoeDraw: 4 }] }] } },
      },
    ],
    result: { before: 1000, after: 1015, settle: null },
  } as unknown as Parameters<typeof roundChoices>[2];
  const registry = registryOf([
    cycle('prov-1-0.mp4', 1, 0),
    cycle('prov-1-1.mp4', 1, 1),
    cycle('prov-p7-1-0.mp4', 1, 0, { view: { kind: 'plats', seat: 7 } }),
    cycle('prov-saknas.mp4', 1, 1, { view: { kind: 'plats', seat: 7 }, present: false }),
  ]);
  const choices = roundChoices(registry, 'paulina', dealt, round, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(
    choices.map((choice) => [choice.key, choice.label]),
    [
      ['runda:spelaren', 'Hela given ur Spelaren (4 kort, 2 utan klipp)'],
      ['runda:plats-7', 'Hela given ur Plats 7 (4 kort, 3 utan klipp)'],
    ],
  );
  // Samma dealerfilm som runda.ts beställer: korten i spelkärnans ordning, dealerns utan klipp, och sista rutan kvar hold sekunder.
  assert.deepEqual(choices[0]!.dealer, {
    kind: 'film',
    view: { kind: 'spelaren' },
    clips: [
      { file: 'dealers/paulina/clips/prov-1-0.mp4', card: { seat: 1, index: 0, face: 'A♠', at: 1.9 } },
      { file: null, seconds: 1.2, card: { seat: 'D', index: 0, face: '9♦', at: 1.2 }, from: 'skon' },
      { file: 'dealers/paulina/clips/prov-1-1.mp4', card: { seat: 1, index: 1, face: 'K♥', at: 1.9 } },
      { file: null, seconds: 1.2, card: { seat: 'D', index: 1, face: null, at: 1.2 }, from: 'skon' },
    ],
    hold: 1.5,
  });
  // En post vars fil saknas spelas inte.
  assert.deepEqual(choices[1]!.plan.unusable, [{ file: 'dealers/paulina/clips/prov-saknas.mp4', why: 'filen saknas i assets/' }]);
  assert.deepEqual(roundChoices(registryOf([]), 'paulina', dealt, round, [1, 2]), []);
});
