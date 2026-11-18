// Filnamnen är påhittade: ett riktigt registernamn i ett test pekar på posten och hindrar npm run reg -- ta-bort.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backdropItems, backdropKind, dealerChoices, PLAIN, sameLook, startLook } from './backdrops.ts';
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

test('dealerna att välja mellan är dealerns egna dealerfilmer, filmerna först, med vyn de är gjorda i', () => {
  const made = (file: string, group: string, more: Record<string, unknown>) => asset(file, group, { dealer: 'paulina', use: 'dealerfilm', ...more });
  const registry = registryOf([
    asset('dealers/paulina/anchors/prov-gammalt.png', 'anchors', { dealer: 'paulina', pose: 'vila', status: 'godkänd', title: 'VILA' }),
    made('dealers/paulina/anchors/spelaren-vila.png', 'anchors', { pose: 'vila', status: 'godkänd', title: 'VILA ur Spelaren', view: { kind: 'spelaren' } }),
    made('dealers/paulina/clips/giv-4_plats-7.mp4', 'clips', { title: 'Giv 4 ur Plats 7', view: { kind: 'plats', seat: 7, close: true }, lands: { seat: 4, index: 0, at: 3 } }),
    made('dealers/paulina/clips/utan-vy.mp4', 'clips', { title: 'Utan vy' }),
    made('dealers/paulina/clips/nej.mp4', 'clips', { status: 'utgår', view: { kind: 'spelaren' } }),
    made('dealers/pamela/clips/giv.mp4', 'clips', { dealer: 'pamela', title: 'Pamelas', view: { kind: 'spelaren' } }),
    asset('reference/prov-helfigur.png', 'reference', { use: 'helfigur', title: 'En helfigur' }),
  ]);
  assert.deepEqual(dealerChoices(registry, 'paulina'), [
    { dealer: { kind: 'film', file: 'dealers/paulina/clips/giv-4_plats-7.mp4', view: { kind: 'plats', seat: 7 } }, label: 'Giv 4 ur Plats 7', film: true, lands: { seat: 4, index: 0, at: 3 } },
    { dealer: { kind: 'film', file: 'dealers/paulina/anchors/spelaren-vila.png', view: { kind: 'spelaren' } }, label: 'VILA ur Spelaren', film: false },
  ]);
  // Ett gammalt ankare och en helfigur är inga dealerfilmer, och ett tomt register ger inget val.
  assert.deepEqual(dealerChoices(registryOf([]), 'paulina'), []);
});
