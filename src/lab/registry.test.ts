import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBytes, kindOf, mediaUrl, sectionsOf, thumbUrl, type Asset, type Registry } from './registry.ts';

const asset = (file: string, group: string): Asset => ({ file, group, title: file, status: 'att granska', present: true });

const registry: Registry = {
  statuses: { 'att granska': '' },
  groups: { identity: '', backgrounds: '', reference: '' },
  sources: {},
  unregistered: [],
  assets: [
    asset('dealers/p/identity/a.png', 'identity'),
    asset('reference/ett.png', 'reference'),
    asset('reference/films/giv.mp4', 'reference'),
    asset('dealers/p/identity/b.png', 'identity'),
    asset('reference/två.jpg', 'reference'),
    asset('reference/films/giv-2.mp4', 'reference'),
    asset('models/sko.glb', 'models'),
  ],
};

test('avdelningarna följer registrets gruppordning och numrerar i registrets ordning', () => {
  const sections = sectionsOf(registry);
  assert.deepEqual(
    sections.map((section) => [section.key, section.label, section.items.map((item) => `${item.number} ${item.asset.file}`)]),
    [
      ['identity', 'Identitet', ['1 dealers/p/identity/a.png', '2 dealers/p/identity/b.png']],
      ['reference', 'Referens, bilder', ['1 reference/ett.png', '2 reference/två.jpg']],
      ['reference-filmer', 'Referens, filmer', ['1 reference/films/giv.mp4', '2 reference/films/giv-2.mp4']],
      ['models', 'Modeller', ['1 models/sko.glb']],
    ],
  );
  assert.ok(sections.every((section) => section.items.every((item) => item.section === section.key)));
});

test('en grupp utan post syns inte, och en grupp med bara filmer delas inte', () => {
  const films: Registry = { ...registry, groups: { tom: '', klipp: '' }, assets: [asset('klipp/x.mp4', 'klipp')] };
  assert.deepEqual(
    sectionsOf(films).map((section) => [section.key, section.label]),
    [['klipp', 'klipp']],
  );
});

test('filens slag avgörs av ändelsen', () => {
  assert.equal(kindOf('a/b.PNG'), 'bild');
  assert.equal(kindOf('a/b.mp4'), 'film');
  assert.equal(kindOf('a/b.glb'), 'modell');
});

test('adresser till filer tål mellanslag och svenska tecken', () => {
  assert.equal(mediaUrl('scene/två bilder/å.png'), '/media/scene/tv%C3%A5%20bilder/%C3%A5.png');
  assert.equal(thumbUrl('scene/a#b.png', 640), '/thumb/scene/a%23b.png?w=640');
});

test('storlekar skrivs med svenskt decimaltecken', () => {
  assert.equal(formatBytes(1469059), '1,4 MB');
  assert.equal(formatBytes(2048), '2 kB');
  assert.equal(formatBytes(10), '1 kB');
});
