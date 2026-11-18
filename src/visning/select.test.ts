// Det som följer med visningen: utdraget ur registret bär bara de fält uppspelningen läser, klippen är de en runda ur
// hela givens ankare kan spela, och content/ följer med utan sina texter. Filnamnen är påhittade: ett riktigt
// registernamn i ett test pekar på posten och hindrar npm run reg -- ta-bort.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { dealRound } from '../game/game.ts';
import { registerPath, viewRegistry } from '../pipeline/registry.ts';
import { readScene } from '../scene/description.ts';
import { readDoll } from '../scene/dollPose.ts';
import { readRound, type RoundEntry } from '../scene/round.ts';
import { withoutFilm } from './missing.ts';
import { choose, clipEntry, glbReferences, NO_SOURCE, roomEntry, withoutTexts } from './select.ts';

const project = resolve(import.meta.dirname, '..', '..');
const content = (file: string): unknown => JSON.parse(readFileSync(join(project, 'content', file), 'utf8'));
const round = readRound(content('runda.json'));
const scene = readScene(content('scene.json'));

/** De fält uppspelningen läser, och inga andra: postens egna och de inuti. */
const ALLOWED: Record<string, string[] | null> = {
  file: null,
  status: null,
  dealer: null,
  use: null,
  view: ['kind', 'seat'],
  pose: null,
  seat: null,
  index: null,
  action: null,
  take: null,
  seconds: null,
  lands: ['seat', 'index', 'at'],
  eye: ['position', 'forward', 'focalPx', 'frame'],
  shoe: ['at', 'yawDeg', 'length'],
  place: null,
  source: ['references'],
  kind: null,
  oldView: ['turn', 'blur', 'exposure', 'mirror'],
};

/** Varje fält i utdragets poster som inte står i ALLOWED, som `fil: fält`. */
function stray(extract: RoundEntry[]): string[] {
  return extract.flatMap((entry) =>
    Object.entries(entry).flatMap(([field, value]) => {
      if (!(field in ALLOWED)) return [`${entry.file}: ${field}`];
      const inner = ALLOWED[field];
      if (!inner || value === null || typeof value !== 'object' || Array.isArray(value)) return [];
      const bad = Object.keys(value).filter((key) => !inner.includes(key)).map((key) => `${entry.file}: ${field}.${key}`);
      if (field === 'eye') bad.push(...Object.keys((value as { frame: object }).frame).filter((key) => !['width', 'height'].includes(key)).map((key) => `${entry.file}: eye.frame.${key}`));
      if (field === 'source') {
        for (const reference of (value as { references: Record<string, unknown>[] }).references) {
          bad.push(...Object.keys(reference).filter((key) => !['role', 'what'].includes(key)).map((key) => `${entry.file}: source.references.${key}`));
          if (reference.role !== 'startFrame') bad.push(`${entry.file}: source.references med rollen ${String(reference.role)}`);
        }
      }
      return bad;
    }),
  );
}

const EYE = { position: [0, 0.6, 0.05], forward: [0, -0.18, -0.98], focalPx: 2065, frame: { width: 1920, height: 1080, note: 'mätt i C:/Users/x/Desktop' }, why: 'hemligt' };
const SHOE = { at: [0.495, -1.8433], yawDeg: -74.6, length: 0.442, source: 'Jakob sade något' };

/** Ett cykelklipp i registret, med allt som en riktig post bär och som inte ska följa med. */
function clip(seat: number | 'D', index: number, more: Partial<RoundEntry> = {}): RoundEntry {
  return {
    file: `dealers/prov/clips/cykel-${seat}-${index}_spelaren_t1.mp4`,
    group: 'dealers',
    title: 'Ett provklipp',
    status: 'godkänd',
    statusBy: 'Jakob i Labbet 2026-11-18',
    statusAt: '2026-11-18 06:18',
    comment: 'Jakobs egna ord om klippet',
    commentAt: '2026-11-18 06:18',
    reply: 'agentens svar',
    note: 'en anteckning',
    bytes: 4000000,
    dealer: 'paulina',
    use: 'dealerfilm',
    view: { kind: 'spelaren', label: 'Spelaren' },
    pose: 'redo → redo',
    seat,
    index,
    action: 'deal',
    take: 1,
    seconds: 4.04,
    lands: { seat, index, at: 1.88, measured: 'output/work/matning/x.json' },
    eye: EYE,
    shoe: SHOE,
    place: [0.1, -1.5],
    source: {
      from: 'runway',
      sha256: 'a'.repeat(64),
      order: 'beställning 12',
      task: 'runway-task-1234-5678',
      prompt: 'en lång beställning',
      references: [
        { role: 'startFrame', what: 'dealers/prov/anchors/spelaren-redo.png', uri: 'https://api.example/runway/abc' },
        { role: 'endFrame', what: 'dealers/prov/anchors/spelaren-redo.png' },
      ],
    },
    present: true,
    ...more,
  };
}

const ROOM: RoundEntry = {
  file: round.film.background,
  group: 'backgrounds',
  title: 'Ett rum',
  status: 'godkänd',
  comment: 'Jakobs ord om rummet',
  kind: '360',
  licence: 'CC0',
  author: 'någon',
  page: 'https://example.org',
  oldView: { blur: 6, exposure: 0.42, turn: 0, mirror: false, note: 'ur gamla projektet' },
  source: { from: 'dealer', path: 'C:/Users/x/gammalt/rum.jpg', sha256: 'b'.repeat(64) },
  present: true,
};

// Klipp till platsernas två första kort ur ankaret, en äldre tagning, ett klipp som väntar på granskning ur ett annat
// ankare, ett ur en annan vy, en giv som inte är en cykel, ett vänta-klipp och rummet.
const REGISTRY: RoundEntry[] = [
  ...[1, 2, 3, 4, 5, 6, 7].flatMap((seat) => [0, 1].map((index) => clip(seat, index))),
  clip(4, 0, { file: 'dealers/prov/clips/cykel-4-0_spelaren_t2.mp4', take: 2 }),
  clip(4, 0, { file: 'dealers/prov/clips/cykel-4-0_spelaren_t3.mp4', take: 3, status: 'att granska' }),
  clip(4, 0, { file: 'dealers/prov/clips/annat-4-0_spelaren_t9.mp4', take: 9, source: { references: [{ role: 'startFrame', what: 'dealers/prov/anchors/annat.png' }] } }),
  clip(4, 0, { file: 'dealers/prov/clips/cykel-4-0_plats-7_t1.mp4', view: { kind: 'plats', seat: 7 } }),
  clip(4, 0, { file: 'dealers/prov/clips/giv-4_spelaren_t1.mp4', pose: 'redo → lagt 4' }),
  clip(4, 0, { file: 'dealers/prov/clips/vanta_spelaren_t1.mp4', action: 'wait', seat: undefined, index: undefined, lands: undefined }),
  { file: 'dealers/prov/anchors/spelaren-redo.png', status: 'godkänd', dealer: 'paulina', use: 'dealerfilm', view: { kind: 'spelaren' }, pose: 'redo', present: true },
  ROOM,
];

const dealt = dealRound(round.deal);

test('en post i utdraget bär bara de fält uppspelningen läser, och ankaret som enda rad ur beställningen', () => {
  const entry = clipEntry(clip(3, 1));
  assert.deepEqual(stray([entry, roomEntry(ROOM)]), []);
  assert.deepEqual(entry.source, { references: [{ role: 'startFrame', what: 'dealers/prov/anchors/spelaren-redo.png' }] });
  assert.deepEqual(entry.lands, { seat: 3, index: 1, at: 1.88 });
  assert.deepEqual(entry.eye, { position: EYE.position, forward: EYE.forward, focalPx: EYE.focalPx, frame: { width: 1920, height: 1080 } });
  const text = JSON.stringify([entry, roomEntry(ROOM)]);
  for (const word of ['Jakob', 'runway', 'beställning', 'sha256', 'C:/Users', 'hemligt', 'anteckning', 'output/work', 'https:']) assert.ok(!text.includes(word), word);
  assert.deepEqual(roomEntry(ROOM), { file: ROOM.file, status: 'godkänd', kind: '360', oldView: { turn: 0, blur: 6, exposure: 0.42, mirror: false } });
});

test('visningen tar klippen ur hela givens ankare, den senaste godkända tagningen per kort, vänta-klippet, rummet och modellerna', () => {
  const chosen = choose(REGISTRY, round, dealt, scene);
  assert.equal(chosen.anchor, 'dealers/prov/anchors/spelaren-redo.png');
  const clips = chosen.files.filter((file) => file.endsWith('.mp4')).sort();
  const expected = [...[1, 2, 3, 5, 6, 7].flatMap((seat) => [0, 1].map((index) => `dealers/prov/clips/cykel-${seat}-${index}_spelaren_t1.mp4`)), 'dealers/prov/clips/cykel-4-1_spelaren_t1.mp4', 'dealers/prov/clips/cykel-4-0_spelaren_t2.mp4', 'dealers/prov/clips/vanta_spelaren_t1.mp4'].sort();
  assert.deepEqual(clips, expected);
  assert.deepEqual(chosen.files.filter((file) => !file.endsWith('.mp4')), [round.film.background, scene.table.file, scene.shoe.file]);
  // Utdraget har en post för varje klipp och rummet; ankarets stillbild visas inte och följer inte med.
  assert.deepEqual(chosen.extract.map((entry) => entry.file).sort(), [...expected, round.film.background].sort());
  assert.deepEqual(stray(chosen.extract), []);
});

test('en giv utan godkänt klipp ur Spelaren, eller utan rum, byggs inte', () => {
  assert.throws(() => choose(REGISTRY.map((entry) => ({ ...entry, status: 'att granska' })), round, dealt, scene), /inget godkänt klipp/);
  assert.throws(() => choose(REGISTRY.filter((entry) => entry !== ROOM), round, dealt, scene), /Rummet/);
});

test('beskrivningarna i content/ följer med utan sina texter, och sidans läsare läser dem', () => {
  for (const [file, read] of [['scene.json', readScene], ['doll.json', readDoll], ['runda.json', readRound]] as const) {
    const clean = withoutTexts(content(file));
    const text = JSON.stringify(clean);
    assert.ok(!text.includes('Jakob'), file);
    assert.ok(text.includes(NO_SOURCE), file);
    assert.doesNotThrow(() => read(structuredClone(clean)), file);
  }
  assert.deepEqual(withoutTexts({ about: 'x', a: [{ source: 'y', basis: 'mätt', file: 'models/a.glb' }] }), { about: NO_SOURCE, a: [{ source: NO_SOURCE, basis: 'mätt', file: 'models/a.glb' }] });
});

test('utdraget ur det riktiga registret bär bara tillåtna fält', { skip: !existsSync(registerPath(project)) && 'registret finns inte' }, () => {
  const chosen = choose(viewRegistry(project).assets, round, dealt, scene);
  assert.deepEqual(stray(chosen.extract), []);
  const text = JSON.stringify(chosen.extract);
  for (const word of ['Jakob', 'comment', 'reply', 'statusBy', 'sha256', 'runway']) assert.ok(!text.toLowerCase().includes(word.toLowerCase()), word);
});

test('en GLB-modell som läser andra filer syns', () => {
  const glb = (json: object): Uint8Array => {
    const body = new TextEncoder().encode(JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length / 4) * 4, ' '));
    const bytes = new Uint8Array(20 + body.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, bytes.length, true);
    view.setUint32(12, body.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    bytes.set(body, 20);
    return bytes;
  };
  assert.deepEqual(glbReferences(glb({ buffers: [{ byteLength: 4 }], images: [{ uri: 'data:image/png;base64,AAAA' }] })), []);
  assert.deepEqual(glbReferences(glb({ buffers: [{ uri: 'table.bin' }], images: [{ uri: 'felt.jpg' }] })), ['table.bin', 'felt.jpg']);
  assert.throws(() => glbReferences(new Uint8Array(24)), /ingen GLB/);
});

test('raden om vad som saknar film säger det som läggs utan dealerns rörelse', () => {
  const chosen = choose(REGISTRY, round, dealt, scene);
  assert.equal(withoutFilm(chosen.extract, [1, 2, 3, 4, 5, 6, 7]), 'Utan film än: dealerns egna kort, spelarnas tredje kort och fler, och kort på en delad hand. De läggs utan hennes rörelse.');
  const fewer = chosen.extract.filter((entry) => !String(entry.file).includes('cykel-6-1'));
  assert.equal(withoutFilm(fewer, [1, 2, 3, 4, 5, 6, 7]), 'Utan film än: dealerns egna kort, andra kortet till plats 6, spelarnas tredje kort och fler, och kort på en delad hand. De läggs utan hennes rörelse.');
});
