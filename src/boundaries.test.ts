// Gränserna mellan mapparna under src/, så som de står i AGENTS.md och docs/architecture.md.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';

const src = import.meta.dirname;

/**
 * Vad varje mapp får läsa av de andra. `typer` betyder bara med `import type`: webbläsarens kod (lab, casino) läser
 * kärnan bara så, eftersom kärnan körs i servern. Spelsessionen (game) är kärnan som session: servern kör den, och
 * det statiska Casinot (statisk) kör den i webbläsaren, där sidan inte har någon server; Casinot läser bara dess typer
 * och når den genom sitt gränssnitt (casino/link.ts). Det statiska bygget (statisk/bygg.ts) läser registret genom
 * pipeline. En ny mapp under src/ måste stå här innan den får kod.
 */
const MAY_READ: Record<string, Record<string, 'allt' | 'typer'>> = {
  engine: {},
  scene: { engine: 'typer' },
  game: { engine: 'allt', scene: 'typer' },
  lab: { scene: 'allt', engine: 'typer' },
  casino: { scene: 'allt', engine: 'typer', game: 'typer' },
  statisk: { casino: 'allt', scene: 'allt', game: 'allt', pipeline: 'allt', engine: 'typer' },
  pipeline: { scene: 'allt' },
  server: { engine: 'allt', pipeline: 'allt', game: 'allt' },
};

type Found = { specifier: string; typeOnly: boolean; line: string };

const IMPORT_FROM = /^[ \t]*import\s+(type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm;
const EXPORT_FROM = /^[ \t]*export\s+(type\s+)?[*{][^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm;
const BARE = /^[ \t]*import\s*['"]([^'"]+)['"]/gm;
const DYNAMIC = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function importsOf(text: string): Found[] {
  const found: Found[] = [];
  for (const pattern of [IMPORT_FROM, EXPORT_FROM]) {
    for (const match of text.matchAll(pattern)) {
      found.push({ specifier: match[2]!, typeOnly: Boolean(match[1]), line: match[0].trim() });
    }
  }
  for (const pattern of [BARE, DYNAMIC]) {
    for (const match of text.matchAll(pattern)) {
      found.push({ specifier: match[1]!, typeOnly: false, line: match[0].trim() });
    }
  }
  return found;
}

const folderOf = (path: string): string => relative(src, path).split(/[\\/]/)[0]!;

test('importer hittas i alla sina former', () => {
  const text = [
    "import a from './a.ts';",
    "import type { B } from '../engine/b.ts';",
    'import {',
    '  c,',
    "} from '../scene/c.ts';",
    'export function inte() {}',
    "export { d } from './d.ts';",
    "import './e.css';",
    "const f = lazy(() => import('./F.tsx'));",
    "// import g from './g.ts' i en kommentar räknas inte",
  ].join('\n');
  assert.deepEqual(
    importsOf(text).map((entry) => [entry.specifier, entry.typeOnly]),
    [
      ['./a.ts', false],
      ['../engine/b.ts', true],
      ['../scene/c.ts', false],
      ['./d.ts', false],
      ['./e.css', false],
      ['./F.tsx', false],
    ],
  );
});

/** Det filen på `path` (under src/) läser utan att få: en rad per brott. */
function breaches(path: string, text: string): string[] {
  const from = folderOf(path);
  const name = relative(src, path).replaceAll('\\', '/');
  const rules = MAY_READ[from];
  if (!rules) return [`${name} ligger i src/${from}, som inte har några gränser i provet`];
  const broken: string[] = [];
  for (const entry of importsOf(text)) {
    if (!entry.specifier.startsWith('.')) continue;
    const to = folderOf(resolve(dirname(path), entry.specifier));
    if (to === from) continue;
    const allowed = rules[to];
    if (allowed === undefined || (allowed === 'typer' && !entry.typeOnly)) broken.push(`${name} läser ${to}: ${entry.line}`);
  }
  return broken;
}

test('ett brott mot en gräns hittas: fel mapp, kärnan utan import type, en mapp utan gränser', () => {
  const lab = join(src, 'lab', 'Prov.tsx');
  const text = ["import type { Signal } from '../engine/seats.ts';", "import { readScene } from '../scene/description.ts';", "import { core } from '../engine/core.ts';", "import { viewRegistry } from '../pipeline/registry.ts';"].join('\n');
  assert.deepEqual(breaches(lab, text), [
    "lab/Prov.tsx läser engine: import { core } from '../engine/core.ts'",
    "lab/Prov.tsx läser pipeline: import { viewRegistry } from '../pipeline/registry.ts'",
  ]);
  assert.deepEqual(breaches(join(src, 'engine', 'x.ts'), "import { a } from '../scene/a.ts';"), ["engine/x.ts läser scene: import { a } from '../scene/a.ts'"]);
  assert.deepEqual(breaches(join(src, 'ny', 'x.ts'), ''), ['ny/x.ts ligger i src/ny, som inte har några gränser i provet']);
});

test('ingen mapp under src läser en mapp den inte får läsa', () => {
  const files = readdirSync(src, { recursive: true, withFileTypes: true }).filter(
    // Filer direkt under src/, som det här provet, hör inte till någon mapp.
    (item) => item.isFile() && /\.tsx?$/.test(item.name) && item.parentPath !== src,
  );
  const broken = files.flatMap((item) => {
    const path = join(item.parentPath, item.name);
    return breaches(path, readFileSync(path, 'utf8'));
  });
  assert.deepEqual(broken, []);
});
