import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backdropItems, backdropKind, PLAIN, sameLook, standIn, startLook } from './backdrops.ts';
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

test('reglagen startar på gamla projektets visning och scenens lyft, och på bilden som den är när posten saknar dem', () => {
  const old = asset('scene/backgrounds/entre.jpg', 'backgrounds', { kind: '360', oldView: { blur: 5, exposure: 0.5, turn: -35, mirror: false } });
  assert.deepEqual(startLook(old, 20), { turn: -35, blur: 5, exposure: 0.5, mirror: false, lift: 20 });
  // En platt bild fyller redan kamerans ruta och lyfts inte.
  assert.deepEqual(startLook(asset('scene/backgrounds/v6-rum.png', 'backgrounds', { kind: 'platt' }), 20), PLAIN);
  // Ett fält som inte är ett tal faller tillbaka på det enkla värdet i stället för att bli NaN i scenen.
  assert.deepEqual(startLook(asset('a.jpg', 'backgrounds', { oldView: { blur: '6', mirror: true } }), 12), { ...PLAIN, mirror: true, lift: 12 });
  assert.ok(sameLook(startLook(old, 20), { turn: -35, blur: 5, exposure: 0.5, mirror: false, lift: 20 }));
  assert.ok(!sameLook(startLook(old, 20), { turn: -34, blur: 5, exposure: 0.5, mirror: false, lift: 20 }));
  assert.ok(!sameLook(startLook(old, 20), { turn: -35, blur: 5, exposure: 0.5, mirror: false, lift: 21 }));
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
});
