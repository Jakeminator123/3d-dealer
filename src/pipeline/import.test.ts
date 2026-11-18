// Importen: en fil förs in i assets/ med en post som bär dess mått och sha256, och en post stryks utan att filen går förlorad.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import sharp from 'sharp';
import { ImportError, importAsset, readPosts, strike } from './import.ts';
import { readRegistry, RegistryError } from './registry.ts';

let root: string;

const REGISTRY = {
  schemaVersion: 1,
  statuses: { 'att granska': 'väntar', godkänd: 'ja', utgår: 'nej' },
  groups: { anchors: 'ankare', clips: 'klipp' },
  assets: [{ file: 'dealers/p/anchors/gammal.png', group: 'anchors', title: 'Gammal', status: 'godkänd', source: { from: 'runway', sha256: 'abc123def4567890' } }],
  leftOut: [{ what: 'x', why: 'y' }],
};

function put(path: string, content: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

const picture = (colour: string): Promise<Buffer> => sharp({ create: { width: 32, height: 18, channels: 3, background: colour } }).png().toBuffer();

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'import-'));
  put('content/assets.json', JSON.stringify(REGISTRY, null, 2));
  put('assets/dealers/p/anchors/gammal.png', await picture('#00ff00'));
  put('output/work/ny.png', await picture('#ff0000'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const post = (more: Record<string, unknown> = {}) => ({
  from: 'output/work/ny.png',
  file: 'dealers/p/anchors/spelaren-redo.png',
  group: 'anchors',
  dealer: 'p',
  title: 'REDO ur Spelaren',
  note: 'Gjord i natt.',
  pose: 'redo',
  use: 'dealerfilm',
  view: { kind: 'spelaren' },
  source: { from: 'runway', taskId: 't-1', credits: 10 },
  ...more,
});

test('en fil förs in med mått, sha256 och status att granska, och posten står sist', async () => {
  const entry = await importAsset(root, post());
  const bytes = readFileSync(join(root, 'output/work/ny.png'));
  assert.deepEqual(readFileSync(join(root, 'assets', entry.file)), bytes);
  assert.deepEqual(Object.keys(entry), ['file', 'group', 'dealer', 'title', 'status', 'note', 'width', 'height', 'bytes', 'pose', 'use', 'view', 'source']);
  assert.deepEqual([entry.status, entry.width, entry.height, entry.bytes], ['att granska', 32, 18, bytes.length]);
  assert.deepEqual(entry.source, { from: 'runway', taskId: 't-1', credits: 10, sha256: createHash('sha256').update(bytes).digest('hex') });
  const registry = readRegistry(root);
  assert.deepEqual(registry.assets.at(-1), entry);
  assert.equal(registry.assets.length, 2);
  // Samma fil en gång till har redan sin post.
  await assert.rejects(importAsset(root, post()), RegistryError);
});

test('måtten är alltid filens egna: en post med gamla tal får de mätta, och en bild får ingen längd', async () => {
  const entry = await importAsset(root, post({ width: 1920, height: 1080, bytes: 5, seconds: 4, fps: 24 }));
  const bytes = readFileSync(join(root, 'output/work/ny.png')).length;
  assert.deepEqual([entry.width, entry.height, entry.bytes], [32, 18, bytes]);
  assert.equal('seconds' in entry || 'fps' in entry, false);
  assert.deepEqual(readRegistry(root).assets.at(-1), entry);
  assert.deepEqual(Object.keys(entry), ['file', 'group', 'dealer', 'title', 'status', 'note', 'width', 'height', 'bytes', 'pose', 'use', 'view', 'source']);
});

test('en post med hål i, en okänd grupp eller en fil som pekar ut ur assets tas inte emot', async () => {
  for (const [what, broken] of [
    ['from', post({ from: undefined })],
    ['finns inte', post({ from: 'output/work/saknas.png' })],
    ['file', post({ file: '../utanfor.png' })],
    ['file', post({ file: 'Stora/Bokstaver.png' })],
    ['title', post({ title: '' })],
    ['gruppen', post({ group: 'okand' })],
    ['source', post({ source: { taskId: 't-1' } })],
  ] as const) {
    await assert.rejects(importAsset(root, broken), (error: Error) => error instanceof ImportError && error.message.includes(what), what);
  }
  assert.equal(readRegistry(root).assets.length, 1);
});

test('en fil som redan ligger där byts bara när posten säger replace, och då byts posten på sin plats', async () => {
  const over = post({ file: 'dealers/p/anchors/gammal.png', title: 'Ny på gamla platsen' });
  await assert.rejects(importAsset(root, over), /finns redan/);
  const entry = await importAsset(root, { ...over, replace: true, status: 'att granska' });
  assert.deepEqual(readFileSync(join(root, 'assets', entry.file)), readFileSync(join(root, 'output/work/ny.png')));
  const registry = readRegistry(root);
  assert.equal(registry.assets.length, 1);
  assert.equal(registry.assets[0]!.title, 'Ny på gamla platsen');
  assert.equal('replace' in registry.assets[0]!, false);
});

test('att stryka flyttar filen ur assets och antecknar under leftOut vad som ströks och varför', () => {
  const to = strike(root, 'dealers/p/anchors/gammal.png', 'Fel hand.');
  assert.equal(existsSync(join(root, 'assets/dealers/p/anchors/gammal.png')), false);
  assert.equal(to, join(root, 'output', 'work', 'struket', 'dealers/p/anchors/gammal.png'));
  assert.ok(existsSync(to));
  const registry = readRegistry(root);
  assert.equal(registry.assets.length, 0);
  assert.deepEqual((registry.leftOut as unknown[]).at(-1), {
    what: 'dealers/p/anchors/gammal.png',
    why: 'Fel hand. Filen ligger i output/work/struket/dealers/p/anchors/gammal.png (sha256 abc123def456).',
  });
  assert.throws(() => strike(root, 'dealers/p/anchors/gammal.png', 'igen'), RegistryError);
});

test('posterna läses ur en fil som en post eller en lista, och en fil som saknas eller inte är JSON sägs med sitt namn', () => {
  put('output/work/en.json', JSON.stringify(post()));
  put('output/work/flera.json', JSON.stringify([post(), post({ file: 'dealers/p/anchors/lagt.png' })]));
  put('output/work/trasig.json', '{ "file": ');
  assert.deepEqual(readPosts(join(root, 'output/work/en.json')), [post()]);
  assert.equal(readPosts(join(root, 'output/work/flera.json')).length, 2);
  assert.throws(() => readPosts(join(root, 'output/work/finns-inte.json')), (error: Error) => error instanceof ImportError && /finns-inte\.json går inte att läsa/.test(error.message));
  assert.throws(() => readPosts(join(root, 'output/work/trasig.json')), (error: Error) => error instanceof ImportError && /trasig\.json är inte giltig JSON/.test(error.message));
});
