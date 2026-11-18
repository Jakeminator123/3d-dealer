// Gränserna mellan mapparna under src/, så som de står i AGENTS.md och docs/architecture.md.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';

const src = import.meta.dirname;

/** Vad varje mapp får läsa av de andra. `typer` betyder bara med `import type`. */
const MAY_READ: Record<string, Record<string, 'allt' | 'typer'>> = {
  engine: {},
  scene: { engine: 'typer' },
  lab: { scene: 'allt', engine: 'allt' },
  casino: { scene: 'allt', engine: 'allt' },
  pipeline: { scene: 'allt' },
  server: { engine: 'allt', pipeline: 'allt' },
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

test('ingen mapp under src läser en mapp den inte får läsa', () => {
  const broken: string[] = [];
  const files = readdirSync(src, { recursive: true, withFileTypes: true }).filter(
    (item) => item.isFile() && /\.tsx?$/.test(item.name),
  );
  for (const item of files) {
    const path = join(item.parentPath, item.name);
    const from = folderOf(path);
    const rules = MAY_READ[from];
    if (!rules) continue;
    for (const entry of importsOf(readFileSync(path, 'utf8'))) {
      if (!entry.specifier.startsWith('.')) continue;
      const to = folderOf(resolve(dirname(path), entry.specifier));
      if (to === from) continue;
      const allowed = rules[to];
      if (allowed === undefined || (allowed === 'typer' && !entry.typeOnly)) {
        broken.push(`${relative(src, path).replaceAll('\\', '/')} läser ${to}: ${entry.line}`);
      }
    }
  }
  assert.deepEqual(broken, []);
});
