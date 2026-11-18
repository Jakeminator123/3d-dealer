// Bygger Casinot statiskt: samma sida som http://localhost:5310/casino/, i dist/statisk/, som går att lägga på vilken
// statisk webbvärd som helst, utan studions server och utan registret. Spelkärnan körs i webbläsaren (spel.ts,
// nodecrypto.ts). Labbet följer inte med än.
//
//   npm run build:statisk
//
// Det som följer med väljs i select.ts: klippen ur det REDO-ankare som rundan i content/runda.json väljer, rummet och
// modellerna (kopierade ur assets/ till media/), ett utdrag ur registret (register.json), och beskrivningarna i content/
// utan källtexter. Till sist prövas att ingen text i mappen bär en sökväg på datorn, Jakobs namn eller en väg till
// serverns /api/, och filerna skrivs ut med sin storlek. STUDIO_DATA läser en annan mapp med content/ och assets/.

import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { build } from 'vite';
import { dealRound } from '../game/game.ts';
import { assetsDir, studioRoot, viewRegistry } from '../pipeline/registry.ts';
import { readScene } from '../scene/description.ts';
import { readDoll } from '../scene/dollPose.ts';
import { readRound } from '../scene/round.ts';
import { choose, glbReferences, SelectError, withoutTexts } from './select.ts';

const code = resolve(import.meta.dirname, '..', '..');
const out = join(code, 'dist', 'statisk');
// Beskrivningarna sidan läser, och ingen annan fil ur content/.
const CONTENT = ['scene.json', 'doll.json', 'runda.json'] as const;
// Filer som är text: de prövas för sökvägar och namn.
const TEXT = new Set(['.html', '.js', '.css', '.json']);

const slash = (path: string): string => path.replaceAll('\\', '/');
const size = (bytes: number): string => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`).replace('.', ',');

function filesIn(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile())
    .map((item) => slash(join(item.parentPath, item.name).slice(folder.length + 1)))
    .sort();
}

async function main(): Promise<void> {
  const root = studioRoot();
  const raw = Object.fromEntries(CONTENT.map((file) => [file, JSON.parse(readFileSync(join(root, 'content', file), 'utf8')) as unknown])) as Record<(typeof CONTENT)[number], unknown>;
  // Läsarna fyller i det som räknas ur beskrivningen (readScene: kortplatserna); de får en egen kopia.
  const scene = readScene(structuredClone(raw['scene.json']));
  const round = readRound(structuredClone(raw['runda.json']));
  const chosen = choose(viewRegistry(root).assets, round, dealRound(round.deal), scene);

  const assets = assetsDir(root);
  for (const file of chosen.files) {
    const path = join(assets, file);
    if (!existsSync(path)) throw new SelectError(`${file} saknas i assets/`);
    if (extname(file).toLowerCase() === '.glb') {
      const others = glbReferences(readFileSync(path));
      if (others.length > 0) throw new SelectError(`Modellen ${file} läser andra filer (${others.join(', ')}), som inte följer med`);
    }
  }

  rmSync(out, { recursive: true, force: true });
  await build({
    configFile: false,
    root: join(code, 'src', 'statisk'),
    base: './',
    publicDir: false,
    cacheDir: join(code, 'node_modules', '.vite-statisk'),
    mode: 'production',
    logLevel: 'warn',
    clearScreen: false,
    plugins: [react()],
    // Spelkärnan läser node:crypto; i webbläsaren läser den nodecrypto.ts.
    resolve: { alias: [{ find: /^node:crypto$/, replacement: slash(join(code, 'src', 'statisk', 'nodecrypto.ts')) }] },
    build: { outDir: out, emptyOutDir: false, assetsDir: 'kod', sourcemap: false, reportCompressedSize: false, chunkSizeWarningLimit: 4096 },
  });

  const write = (file: string, value: unknown): void => {
    mkdirSync(dirname(join(out, file)), { recursive: true });
    writeFileSync(join(out, file), `${JSON.stringify(value, null, 1)}\n`);
  };
  for (const file of CONTENT) {
    const clean = withoutTexts(raw[file]);
    // Samma läsare som sidan: en beskrivning den inte kan läsa ska inte följa med.
    ({ 'scene.json': readScene, 'doll.json': readDoll, 'runda.json': readRound })[file](structuredClone(clean));
    write(`content/${file}`, clean);
  }
  write('register.json', { about: 'Utdrag ur studions register: bara de poster och fält som Casinots uppspelning läser.', assets: chosen.extract });
  for (const file of chosen.files) {
    const target = join(out, 'media', file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(assets, file), target);
  }

  // Ingen text i mappen får bära en sökväg på datorn, Jakobs namn eller en väg till studions server.
  const home = homedir();
  const forbidden = [code, slash(code), root, slash(root), home, slash(home), JSON.stringify(code).slice(1, -1), 'Jakob', '/api/'];
  const found = filesIn(out).flatMap((file) => {
    if (!TEXT.has(extname(file).toLowerCase())) return [];
    const text = readFileSync(join(out, file), 'utf8').toLowerCase();
    return forbidden.filter((word) => text.includes(word.toLowerCase())).map((word) => `${file}: ${word}`);
  });
  if (found.length > 0) throw new SelectError(`Bygget bär sådant det inte ska:\n  ${found.join('\n  ')}`);

  const list = filesIn(out).map((file) => ({ file, bytes: statSync(join(out, file)).size }));
  const total = list.reduce((sum, item) => sum + item.bytes, 0);
  const largest = list.reduce((most, item) => (item.bytes > most.bytes ? item : most));
  const width = Math.max(...list.map((item) => item.file.length));
  console.log(`Casinot statiskt i ${slash(out.slice(code.length + 1))}/, med klippen ur REDO-ankaret ${chosen.anchor}:`);
  for (const item of list) console.log(`  ${item.file.padEnd(width)}  ${size(item.bytes).padStart(8)}`);
  console.log(`${list.length} filer, ${size(total)} i allt; störst är ${largest.file} (${size(largest.bytes)}).`);
  for (const note of chosen.notes) console.log(`Obs: ${note}`);
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    console.error(error instanceof SelectError ? `Bygget gick inte: ${error.message}` : error);
    process.exit(1);
  });
}
