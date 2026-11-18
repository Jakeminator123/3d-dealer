import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backdropItems, backdropKind, dealerChoices, PLAIN, sameLook, standIn, startLook } from './backdrops.ts';
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
  const old = asset('scene/backgrounds/entre.jpg', 'backgrounds', { kind: '360', oldView: { blur: 5, exposure: 0.5, turn: -35, mirror: false } });
  const started = { turn: -35, blur: 5, exposure: 0.5, mirror: false, lift: 3, height: 1.6, radius: 8 };
  assert.deepEqual(startLook(old, room), started);
  // En platt bild fyller redan kamerans ruta och lyfts inte. Rummets mått följer med men gäller bara 360-bilder.
  assert.deepEqual(startLook(asset('scene/backgrounds/v6-rum.png', 'backgrounds', { kind: 'platt' }), room), { ...PLAIN, lift: 0, height: 1.6, radius: 8 });
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
    asset('scene/backgrounds/la.jpg', 'backgrounds', { kind: '360' }),
    asset('dealers/p/identity/a.png', 'identity'),
    asset('scene/backgrounds/skog.jpg', 'backgrounds', { kind: '360' }),
    asset('scene/backgrounds/v6-rum.png', 'backgrounds', { kind: 'platt' }),
  ]);
  const items = backdropItems(registry);
  assert.deepEqual(
    items.map((item) => [item.number, item.asset.file, backdropKind(item.asset)]),
    [
      [1, 'scene/backgrounds/la.jpg', '360'],
      [2, 'scene/backgrounds/skog.jpg', '360'],
      [3, 'scene/backgrounds/v6-rum.png', 'platt'],
    ],
  );
  assert.deepEqual(backdropItems(registryOf([])), []);
});

test('dealerns stå-in är ankaret i vila: ett godkänt före ett som väntar, aldrig ett som utgår eller saknar fil', () => {
  const anchor = (file: string, more: Record<string, unknown>) => asset(file, 'anchors', { dealer: 'paulina', pose: 'vila', ...more });
  const waiting = anchor('vila-1.png', {});
  const approved = anchor('vila-2.png', { status: 'godkänd' });
  const others = [
    anchor('redo.png', { pose: 'redo', status: 'godkänd' }),
    anchor('annan.png', { dealer: 'pamela', status: 'godkänd' }),
    anchor('borta.png', { status: 'godkänd', present: false }),
    anchor('nej.png', { status: 'utgår' }),
  ];
  assert.equal(standIn(registryOf([...others, waiting, approved]), 'paulina')?.file, 'vila-2.png');
  assert.equal(standIn(registryOf([...others, waiting]), 'paulina')?.file, 'vila-1.png');
  assert.equal(standIn(registryOf(others), 'paulina'), null);
  // En helfigur har inget bord i bilden och hör inte hemma på den vikta ytan, också när den är ett godkänt ankare i vila.
  const figure = anchor('vila-helfigur.png', { status: 'godkänd', use: 'helfigur' });
  assert.equal(standIn(registryOf([figure, waiting]), 'paulina')?.file, 'vila-1.png');
});

test('dealerna att välja mellan är registrets helfigurer, filmerna först, och sist det gamla ankaret', () => {
  const registry = registryOf([
    asset('dealers/paulina/anchors/vila.png', 'anchors', { dealer: 'paulina', pose: 'vila', status: 'godkänd', title: 'VILA' }),
    asset('dealers/paulina/anchors/vila-helfigur.png', 'anchors', { dealer: 'paulina', pose: 'vila', use: 'helfigur', title: 'VILA i helfigur' }),
    asset('reference/liv-vila.png', 'reference', { use: 'helfigur', title: 'Liv: VILA' }),
    asset('reference/films/liv-vila-andas.mp4', 'reference', { use: 'helfigur', title: 'Liv: Andas lugnt' }),
    asset('reference/films/giv.mp4', 'reference', { title: 'En giv med bord i bilden' }),
    asset('reference/films/borta.mp4', 'reference', { use: 'helfigur', present: false }),
    asset('reference/films/nej.mp4', 'reference', { use: 'helfigur', status: 'utgår' }),
  ]);
  assert.deepEqual(dealerChoices(registry, 'paulina'), [
    { dealer: { kind: 'helfigur', file: 'reference/films/liv-vila-andas.mp4' }, label: 'Liv: Andas lugnt', film: true },
    { dealer: { kind: 'helfigur', file: 'dealers/paulina/anchors/vila-helfigur.png' }, label: 'VILA i helfigur', film: false },
    { dealer: { kind: 'helfigur', file: 'reference/liv-vila.png' }, label: 'Liv: VILA', film: false },
    { dealer: { kind: 'ankare', file: 'dealers/paulina/anchors/vila.png' }, label: 'Gamla ankaret: VILA', film: false },
  ]);
  // Utan ankare i vila för den dealern finns bara helfigurerna, och ett tomt register ger inget val.
  assert.equal(dealerChoices(registry, 'pamela').length, 3);
  assert.deepEqual(dealerChoices(registryOf([]), 'paulina'), []);
});

test('dealerns egna dealerfilmer står först bland valen, med vyn de är gjorda i', () => {
  const made = (file: string, group: string, more: Record<string, unknown>) => asset(file, group, { dealer: 'paulina', use: 'dealerfilm', ...more });
  const registry = registryOf([
    asset('dealers/paulina/anchors/vila.png', 'anchors', { dealer: 'paulina', pose: 'vila', status: 'godkänd', title: 'VILA' }),
    made('dealers/paulina/anchors/spelaren-vila.png', 'anchors', { pose: 'vila', status: 'godkänd', title: 'VILA ur Spelaren', view: { kind: 'spelaren' } }),
    made('dealers/paulina/clips/giv-4_plats-7.mp4', 'clips', { title: 'Giv 4 ur Plats 7', view: { kind: 'plats', seat: 7, close: true }, lands: { seat: 4, index: 0, at: 3 } }),
    made('dealers/paulina/clips/utan-vy.mp4', 'clips', { title: 'Utan vy' }),
    made('dealers/paulina/clips/nej.mp4', 'clips', { status: 'utgår', view: { kind: 'spelaren' } }),
    made('dealers/pamela/clips/giv.mp4', 'clips', { dealer: 'pamela', title: 'Pamelas', view: { kind: 'spelaren' } }),
    asset('reference/liv-vila.png', 'reference', { use: 'helfigur', title: 'Liv: VILA' }),
  ]);
  assert.deepEqual(dealerChoices(registry, 'paulina'), [
    { dealer: { kind: 'film', file: 'dealers/paulina/clips/giv-4_plats-7.mp4', view: { kind: 'plats', seat: 7 } }, label: 'Giv 4 ur Plats 7', film: true, lands: { seat: 4, index: 0, at: 3 } },
    { dealer: { kind: 'film', file: 'dealers/paulina/anchors/spelaren-vila.png', view: { kind: 'spelaren' } }, label: 'VILA ur Spelaren', film: false },
    { dealer: { kind: 'helfigur', file: 'reference/liv-vila.png' }, label: 'Liv: VILA', film: false },
    // Det gamla ankaret är fortfarande det i gamla rutan: en dealerfilm i vila tar inte dess plats.
    { dealer: { kind: 'ankare', file: 'dealers/paulina/anchors/vila.png' }, label: 'Gamla ankaret: VILA', film: false },
  ]);
});
