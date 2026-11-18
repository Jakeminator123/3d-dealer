// Bildregistret, content/assets.json: läsa det, jämföra det med assets/, skriva ett omdöme och lägga till eller stryka en post.
// Ordlistan över statusar står i registret självt. Här finns inga statusnamn.

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type RegistryEntry = {
  file: string;
  status: string;
  statusBy?: string;
  /** När statusen sattes, "ÅÅÅÅ-MM-DD TT:MM". */
  statusAt?: string;
  /** Jakobs egna ord om filen, och när han skrev dem. */
  comment?: string;
  commentAt?: string;
  /** Agentens svar på Jakobs ord, och när det skrevs. */
  reply?: string;
  replyAt?: string;
  [field: string]: unknown;
};

export type Registry = {
  statuses: Record<string, string>;
  /** De statusar som ber om en motivering och därmed ställer posten i kö till agenten. */
  asksWhy?: string[];
  assets: RegistryEntry[];
  [field: string]: unknown;
};

/** Registret så som Labbet får det: varje post säger om filen finns, och filer utan post räknas upp. */
export type RegistryView = Registry & {
  assets: (RegistryEntry & { present: boolean })[];
  unregistered: string[];
};

export class RegistryError extends Error {}

export const registryPath = (root: string): string => join(root, 'content', 'assets.json');
export const assetsDir = (root: string): string => join(root, 'assets');

export function readRegistry(root: string): Registry {
  return JSON.parse(readFileSync(registryPath(root), 'utf8')) as Registry;
}

function writeRegistry(root: string, registry: Registry): void {
  const path = registryPath(root);
  const draft = `${path}.tmp`;
  writeFileSync(draft, `${JSON.stringify(registry, null, 2)}\n`);
  renameSync(draft, path);
}

/** Alla filer under assets/, som sökvägar med snedstreck räknade från assets/. */
export function listAssetFiles(root: string): string[] {
  const base = assetsDir(root);
  if (!existsSync(base)) return [];
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile())
    .map((item) => join(item.parentPath, item.name).slice(base.length + 1).replaceAll('\\', '/'))
    .sort();
}

export function viewRegistry(root: string): RegistryView {
  const registry = readRegistry(root);
  const onDisk = new Set(listAssetFiles(root));
  const registered = new Set(registry.assets.map((entry) => entry.file));
  return {
    ...registry,
    assets: registry.assets.map((entry) => ({ ...entry, present: onDisk.has(entry.file) })),
    unregistered: [...onDisk].filter((file) => !registered.has(file)),
  };
}

function entryOf(registry: Registry, file: string): RegistryEntry {
  const entry = registry.assets.find((candidate) => candidate.file === file);
  if (!entry) throw new RegistryError(`Ingen post i registret för ${file}`);
  return entry;
}

/**
 * Lägger en ny post sist i registret. En fil som redan har en post tas inte emot, om inte `replace` säger att posten
 * ska bytas: då står den nya där den gamla stod.
 */
export function addEntry(root: string, entry: RegistryEntry, replace = false): RegistryEntry {
  const registry = readRegistry(root);
  if (!Object.hasOwn(registry.statuses, entry.status)) throw new RegistryError(`Okänd status: ${entry.status}`);
  const at = registry.assets.findIndex((candidate) => candidate.file === entry.file);
  if (at >= 0 && !replace) throw new RegistryError(`${entry.file} har redan en post i registret`);
  if (at >= 0) registry.assets[at] = entry;
  else registry.assets.push(entry);
  writeRegistry(root, registry);
  return entry;
}

/** Stryker en post och antecknar sist under `leftOut` vad som ströks och varför. */
export function dropEntry(root: string, file: string, why: string): void {
  const registry = readRegistry(root);
  entryOf(registry, file);
  registry.assets = registry.assets.filter((candidate) => candidate.file !== file);
  const leftOut = Array.isArray(registry.leftOut) ? (registry.leftOut as { what: string; why: string }[]) : [];
  registry.leftOut = [...leftOut, { what: file, why }];
  writeRegistry(root, registry);
}

/**
 * Sätter en posts status, vem som satte den och när (`at`, "ÅÅÅÅ-MM-DD TT:MM").
 * En status som posten redan har lämnas orörd, så att en tidigare motivering står kvar.
 */
export function setStatus(root: string, file: string, status: string, by: string, at: string): RegistryEntry {
  const registry = readRegistry(root);
  if (!Object.hasOwn(registry.statuses, status)) throw new RegistryError(`Okänd status: ${status}`);
  const entry = entryOf(registry, file);
  if (entry.status === status) return entry;
  entry.status = status;
  delete entry.statusBy;
  delete entry.statusAt;
  entry.statusBy = by;
  entry.statusAt = at;
  writeRegistry(root, registry);
  return entry;
}

/** Skriver Jakobs ord om en fil (`comment`) eller agentens svar (`reply`), med tiden. Tom text tar bort dem. */
export function setWords(root: string, file: string, kind: 'comment' | 'reply', text: string, at: string): RegistryEntry {
  const registry = readRegistry(root);
  const entry = entryOf(registry, file);
  const words = text.trim();
  if (words === (entry[kind] ?? '')) return entry;
  delete entry[kind];
  delete entry[`${kind}At`];
  if (words) {
    entry[kind] = words;
    entry[`${kind}At`] = at;
  }
  writeRegistry(root, registry);
  return entry;
}

/**
 * Kön till agenten: poster vars status ber om en motivering (`asksWhy`) och som inte har fått ett svar
 * som är nyare än både Jakobs ord och statusen.
 */
export function queue(root: string): RegistryEntry[] {
  const registry = readRegistry(root);
  const asks = new Set(registry.asksWhy ?? []);
  return registry.assets.filter((entry) => {
    if (!asks.has(entry.status)) return false;
    const asked = [entry.commentAt ?? '', entry.statusAt ?? ''].sort().at(-1)!;
    return entry.reply === undefined || (entry.replyAt ?? '') < asked;
  });
}

/** Tiden nu som den skrivs i registret: "ÅÅÅÅ-MM-DD TT:MM", lokal tid. */
export function stamp(now = new Date()): string {
  const two = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}:${two(now.getMinutes())}`;
}
