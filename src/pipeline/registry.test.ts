import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  listAssetFiles,
  queue,
  readRegistry,
  RegistryError,
  registryPath,
  setStatus,
  setWords,
  stamp,
  viewRegistry,
} from './registry.ts';

let root: string;

const REGISTRY = {
  schemaVersion: 1,
  statuses: { 'att granska': 'väntar', godkänd: 'ja', utgår: 'nej' },
  assets: [
    { file: 'scene/a.png', group: 'backgrounds', title: 'A', status: 'att granska', bytes: 3 },
    { file: 'scene/b.png', group: 'backgrounds', title: 'B', status: 'godkänd', statusBy: 'Jakob: den här' },
    { file: 'scene/borta.png', group: 'backgrounds', title: 'Borta', status: 'att granska' },
  ],
  leftOut: [{ what: 'x', why: 'y' }],
};

function put(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'registry-'));
  put('content/assets.json', JSON.stringify(REGISTRY, null, 2));
  put('assets/scene/a.png', 'aaa');
  put('assets/scene/b.png', 'bbb');
  put('assets/scene/extra/utan-post.png', 'ccc');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

test('filerna under assets räknas upp med snedstreck, från assets räknat', () => {
  assert.deepEqual(listAssetFiles(root), ['scene/a.png', 'scene/b.png', 'scene/extra/utan-post.png']);
});

test('vyn säger vilka poster som saknar fil och vilka filer som saknar post', () => {
  const view = viewRegistry(root);
  assert.deepEqual(
    view.assets.map((entry) => [entry.file, entry.present]),
    [
      ['scene/a.png', true],
      ['scene/b.png', true],
      ['scene/borta.png', false],
    ],
  );
  assert.deepEqual(view.unregistered, ['scene/extra/utan-post.png']);
});

test('ett omdöme skrivs till filen med vem som satte det, och allt annat står kvar', () => {
  setStatus(root, 'scene/a.png', 'utgår', 'Jakob i Labbet 2026-11-18', '2026-11-18 05:30');

  const saved = readRegistry(root);
  assert.deepEqual(saved.assets[0], {
    file: 'scene/a.png',
    group: 'backgrounds',
    title: 'A',
    status: 'utgår',
    bytes: 3,
    statusBy: 'Jakob i Labbet 2026-11-18',
    statusAt: '2026-11-18 05:30',
  });
  assert.deepEqual(saved.assets.slice(1), REGISTRY.assets.slice(1));
  assert.deepEqual(saved.leftOut, REGISTRY.leftOut);

  const text = readFileSync(registryPath(root), 'utf8');
  assert.equal(text, `${JSON.stringify(saved, null, 2)}\n`);
});

test('samma status igen ändrar ingenting, så en tidigare motivering står kvar', () => {
  const before = readFileSync(registryPath(root), 'utf8');
  const entry = setStatus(root, 'scene/b.png', 'godkänd', 'Jakob i Labbet 2026-11-18', '2026-11-18 05:30');
  assert.equal(entry.statusBy, 'Jakob: den här');
  assert.equal(readFileSync(registryPath(root), 'utf8'), before);
});

test('en status utanför registrets ordlista och en fil utan post avvisas utan att filen skrivs', () => {
  const before = readFileSync(registryPath(root), 'utf8');
  assert.throws(() => setStatus(root, 'scene/a.png', 'kanske', 'Jakob', '2026-11-18 05:30'), RegistryError);
  assert.throws(() => setStatus(root, 'scene/a.png', 'toString', 'Jakob', '2026-11-18 05:30'), RegistryError);
  assert.throws(() => setStatus(root, 'scene/finns-inte.png', 'godkänd', 'Jakob', '2026-11-18 05:30'), RegistryError);
  assert.equal(readFileSync(registryPath(root), 'utf8'), before);
});

test('Jakobs ord och agentens svar sparas med tid, och tom text tar bort dem', () => {
  setWords(root, 'scene/a.png', 'comment', '  för mörk  ', '2026-11-18 05:30');
  setWords(root, 'scene/a.png', 'reply', 'ljusare variant gjord', '2026-11-18 05:40');
  let entry = readRegistry(root).assets[0]!;
  assert.equal(entry.comment, 'för mörk');
  assert.equal(entry.commentAt, '2026-11-18 05:30');
  assert.equal(entry.reply, 'ljusare variant gjord');
  assert.equal(entry.replyAt, '2026-11-18 05:40');

  const before = readFileSync(registryPath(root), 'utf8');
  setWords(root, 'scene/a.png', 'comment', 'för mörk', '2026-11-18 06:00');
  assert.equal(readFileSync(registryPath(root), 'utf8'), before, 'samma ord igen skriver ingenting');

  setWords(root, 'scene/a.png', 'comment', ' ', '2026-11-18 06:00');
  entry = readRegistry(root).assets[0]!;
  assert.equal('comment' in entry, false);
  assert.equal('commentAt' in entry, false);
  assert.equal(entry.reply, 'ljusare variant gjord');

  assert.throws(() => setWords(root, 'scene/finns-inte.png', 'comment', 'x', '2026-11-18 06:00'), RegistryError);
});

test('kön bär det som ber om en motivering och inte har fått svar på det senaste', () => {
  const files = () => queue(root).map((entry) => entry.file);
  assert.deepEqual(files(), [], 'utan asksWhy står ingenting i kö');

  put('content/assets.json', JSON.stringify({ ...REGISTRY, statuses: { ...REGISTRY.statuses, 'granska igen': 'se igen' }, asksWhy: ['granska igen'] }, null, 2));
  assert.deepEqual(files(), []);

  setStatus(root, 'scene/a.png', 'granska igen', 'Jakob i Labbet 2026-11-18', '2026-11-18 05:30');
  assert.deepEqual(files(), ['scene/a.png'], 'i kö även utan motivering');

  setWords(root, 'scene/a.png', 'reply', 'vad är det som stör?', '2026-11-18 05:35');
  assert.deepEqual(files(), [], 'besvarad');

  setWords(root, 'scene/a.png', 'comment', 'för mörk', '2026-11-18 05:50');
  assert.deepEqual(files(), ['scene/a.png'], 'nya ord efter svaret ställer den i kö igen');

  setWords(root, 'scene/a.png', 'reply', 'ljusare nu', '2026-11-18 05:50');
  assert.deepEqual(files(), [], 'svar i samma minut räknas som svar');

  setStatus(root, 'scene/a.png', 'godkänd', 'Jakob i Labbet 2026-11-18', '2026-11-18 06:00');
  setStatus(root, 'scene/a.png', 'granska igen', 'Jakob i Labbet 2026-11-18', '2026-11-18 06:10');
  assert.deepEqual(files(), ['scene/a.png'], 'satt på nytt efter svaret');
});

test('tiden skrivs som datum och klockslag i lokal tid', () => {
  assert.equal(stamp(new Date(2026, 10, 8, 5, 3)), '2026-11-08 05:03');
});
