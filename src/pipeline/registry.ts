// Registret: content/register.db, en SQLite-databas (node:sqlite). Det här är den enda vägen till den: servern (och
// genom den Labbet) och kommandoraden går hit. Tabellerna står i SCHEMA nedan, med en rad om varje fält.
//
//   npm run reg -- hjälp
//
// Ordlistan över statusar och grupper står i registret självt. Här finns inga statusnamn utom `utgår`, som säger vad
// produktionslinjen inte använder.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import sharp from 'sharp';

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
  schemaVersion: number;
  about: string;
  statuses: Record<string, string>;
  /** De statusar som ber om en motivering och därmed ställer posten i kö till agenten. */
  asksWhy: string[];
  groups: Record<string, string>;
  sources: Record<string, Record<string, unknown>>;
  assets: RegistryEntry[];
};

/** Registret så som Labbet får det: varje post säger om filen finns, och filer utan post räknas upp. */
export type RegistryView = Registry & {
  assets: (RegistryEntry & { present: boolean })[];
  unregistered: string[];
};

/** Det ett nytt register börjar med: ordlistorna. Posterna förs in sedan. */
export type Seed = Omit<Registry, 'assets' | 'schemaVersion'>;

export class RegistryError extends Error {}

export const registerPath = (root: string): string => join(root, 'content', 'register.db');
export const assetsDir = (root: string): string => join(root, 'assets');
/** Dit `arkivera` flyttar en fil, med samma sökväg som under assets/. */
export const ARCHIVE = 'output/work/arkiv';

/** Projektmappen, eller mappen STUDIO_DATA pekar ut (med content/ och assets/), för att pröva utan att röra de riktiga. */
export const studioRoot = (): string => (process.env.STUDIO_DATA ? resolve(process.env.STUDIO_DATA) : resolve(import.meta.dirname, '..', '..'));

const SCHEMA_VERSION = 1;

// Tider skrivs "ÅÅÅÅ-MM-DD TT:MM" i lokal tid. En sökväg i en annan tabell än files är ett registernamn (räknat från
// assets/, som files.file) eller räknad från projektmappen och börjar då med output/. basis är 'mätt' eller 'antaget',
// som i content/scene.json.
const SCHEMA = `
CREATE TABLE meta (
  key TEXT PRIMARY KEY,                -- about: vad registret är
  value TEXT NOT NULL
) STRICT;

CREATE TABLE statuses (
  name TEXT PRIMARY KEY,
  meaning TEXT NOT NULL,
  asks_why INTEGER NOT NULL DEFAULT 0 CHECK (asks_why IN (0, 1)), -- 1: ber om en motivering och ställer posten i kö till agenten
  ord INTEGER NOT NULL UNIQUE
) STRICT;

CREATE TABLE groups (
  name TEXT PRIMARY KEY,
  meaning TEXT NOT NULL,
  ord INTEGER NOT NULL UNIQUE
) STRICT;

CREATE TABLE sources (
  name TEXT PRIMARY KEY,
  what TEXT NOT NULL,
  more TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(more)), -- källans övriga fält
  ord INTEGER NOT NULL UNIQUE
) STRICT;

-- En post per fil i assets/. Omdömet står i verdicts; vyn register visar posten med sitt senaste omdöme.
CREATE TABLE files (
  file TEXT PRIMARY KEY,               -- sökvägen under assets/
  ord INTEGER NOT NULL UNIQUE,         -- registrets ordning, som Labbet numrerar efter
  grp TEXT NOT NULL REFERENCES groups (name),
  dealer TEXT,
  title TEXT NOT NULL,
  note TEXT,
  width INTEGER,                       -- width, height, seconds, fps, bytes och sha256 är mätta ur filen
  height INTEGER,
  seconds REAL,
  fps REAL,
  bytes INTEGER,
  sha256 TEXT NOT NULL,
  origin TEXT NOT NULL REFERENCES sources (name), -- source.from
  pose TEXT,
  grip TEXT,
  kind TEXT,
  licence TEXT,
  use TEXT,                            -- dealerfilm: gjord i närbilden av en vy och lagd i scenen genom den
  view TEXT CHECK (view IS NULL OR json_valid(view)),    -- vyn en dealerfilm är gjord i
  lands TEXT CHECK (lands IS NULL OR json_valid(lands)), -- var och när ett klipp lägger sitt kort
  comment TEXT,                        -- Jakobs ord om filen, och när
  comment_at TEXT,
  reply TEXT,                          -- agentens svar, och när
  reply_at TEXT,
  imported_from TEXT,                  -- var filen låg när den fördes in
  more TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(more)),    -- postens övriga fält, som de stod
  source TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(source)) -- ursprungets övriga fält (source utom from, sha256 och measured)
) STRICT;

-- Omdömenas historik: varje ändring av en posts status. Raderna står kvar när en fil tas bort eller arkiveras.
CREATE TABLE verdicts (
  id INTEGER PRIMARY KEY,
  file TEXT NOT NULL,
  status TEXT NOT NULL REFERENCES statuses (name),
  who TEXT,                            -- vem som dömde och varför (statusBy)
  at TEXT                              -- när (statusAt)
) STRICT;
CREATE INDEX verdicts_by_file ON verdicts (file, id);

CREATE VIEW register AS
  SELECT f.*, v.status AS status, v.who AS status_by, v.at AS status_at
  FROM files f LEFT JOIN verdicts v ON v.id = (SELECT max(id) FROM verdicts WHERE verdicts.file = f.file);

-- Betalda beställningar, en rad per beställning.
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  at TEXT,                             -- när den lades
  model TEXT NOT NULL,
  kind TEXT CHECK (kind IS NULL OR kind IN ('bild', 'film')),
  purpose TEXT,                        -- syftet
  inputs TEXT,                         -- indata: bilder, filmer och inställningar
  prompt TEXT,                         -- texten
  task_id TEXT UNIQUE,                 -- Runways taskId
  credits INTEGER,
  balance_before INTEGER,              -- saldot direkt före och direkt efter
  balance_after INTEGER,
  basis TEXT NOT NULL CHECK (basis IN ('mätt', 'antaget')), -- mätt: kostnaden är skillnaden mellan saldona
  outcome TEXT,                        -- utfallet
  result TEXT,                         -- filen som blev resultatet
  note TEXT,
  CHECK (basis = 'antaget' OR (balance_before IS NOT NULL AND balance_after IS NOT NULL AND credits = balance_before - balance_after))
) STRICT;

-- Filer som är uppladdade till Runway och går att peka ut med sin adress.
CREATE TABLE uploads (
  id INTEGER PRIMARY KEY,
  file TEXT NOT NULL,                  -- den lokala filen
  sha256 TEXT,
  basis TEXT NOT NULL CHECK (basis IN ('mätt', 'antaget')), -- mätt: sha256 räknad när adressen fördes in; antaget: räknad efteråt
  url TEXT NOT NULL,                   -- adressen utan signatur: origin är publikt, och en signerad adress checkas inte in
  asset_id TEXT,
  at TEXT,                             -- när filen laddades upp
  expires TEXT,                        -- när den signerade adressen slutar gälla
  note TEXT
) STRICT;

-- Mätningar av en fil. Rader med post_key är postens source.measured, uppdelad per fält.
CREATE TABLE measurements (
  id INTEGER PRIMARY KEY,
  file TEXT NOT NULL,                  -- registernamnet för filen som mättes
  what TEXT NOT NULL,                  -- vad som mättes
  value TEXT NOT NULL,                 -- värdet: en text, eller JSON när is_json är 1
  is_json INTEGER NOT NULL DEFAULT 0 CHECK (is_json IN (0, 1)),
  who TEXT,
  at TEXT,
  basis TEXT NOT NULL CHECK (basis IN ('mätt', 'antaget')),
  note TEXT,
  post_key TEXT                        -- fältet i postens source.measured ('' när det är en text); NULL för en egen mätning
) STRICT;
CREATE INDEX measurements_by_file ON measurements (file, id);

-- Det som inte står i registret: lämnat utanför vid importen, arkiverat (flyttat) eller borttaget (raderat).
CREATE TABLE left_out (
  id INTEGER PRIMARY KEY,
  what TEXT NOT NULL,                  -- ett registernamn, eller en beskrivning av det som aldrig fördes in
  why TEXT NOT NULL,
  how TEXT NOT NULL CHECK (how IN ('utelämnad', 'arkiverad', 'borttagen')),
  at TEXT,
  sha256 TEXT,                         -- filens sha256 när den lämnade assets/
  place TEXT,                          -- var en arkiverad fil ligger nu
  post TEXT CHECK (post IS NULL OR json_valid(post)) -- posten som den stod när den lämnade registret
) STRICT;
`;

type Row = Record<string, unknown>;
const plain = (row: unknown): Row => ({ ...(row as Row) });

function connect(root: string, readOnly = false): DatabaseSync {
  const path = registerPath(root);
  if (!existsSync(path)) {
    throw new RegistryError(`Registret finns inte: ${path}. Kör från projektmappen, eller sätt STUDIO_DATA till en mapp med content/register.db.`);
  }
  const db = new DatabaseSync(path, { readOnly, timeout: 5000 });
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function reading<T>(root: string, work: (db: DatabaseSync) => T): T {
  const db = connect(root);
  try {
    return work(db);
  } finally {
    db.close();
  }
}

/** Gör `work` i en transaktion: allt skrivs, eller ingenting. Andra som skriver samtidigt får vänta. */
function writing<T>(root: string, work: (db: DatabaseSync) => T): T {
  const db = connect(root);
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work(db);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.close();
  }
}

/** Gör ett nytt, tomt register med ordlistorna i `seed`. Ett register som redan finns skrivs inte över. */
export function createRegister(root: string, seed: Seed): void {
  const path = registerPath(root);
  if (existsSync(path)) throw new RegistryError(`${path} finns redan. Ta bort den först om den ska göras om.`);
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    // Med journalen i DELETE-läge ligger inga sidofiler kvar mellan körningarna: databasen är en fil.
    db.exec('PRAGMA journal_mode = DELETE');
    db.exec(SCHEMA);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('BEGIN');
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('about', seed.about);
    Object.entries(seed.statuses).forEach(([name, meaning], ord) => {
      db.prepare('INSERT INTO statuses (name, meaning, asks_why, ord) VALUES (?, ?, ?, ?)').run(name, meaning, seed.asksWhy.includes(name) ? 1 : 0, ord);
    });
    Object.entries(seed.groups).forEach(([name, meaning], ord) => {
      db.prepare('INSERT INTO groups (name, meaning, ord) VALUES (?, ?, ?)').run(name, meaning, ord);
    });
    Object.entries(seed.sources).forEach(([name, { what, ...more }], ord) => {
      db.prepare('INSERT INTO sources (name, what, more, ord) VALUES (?, ?, ?, ?)').run(name, String(what ?? ''), JSON.stringify(more), ord);
    });
    db.exec('COMMIT');
  } finally {
    db.close();
  }
}

// En post och dess rad. Fälten med egen kolumn, och vilken sort värdet ska vara för att få stå där; ett värde av annan
// sort stannar i `more`, så att ingenting tappas.
type Sort = 'text' | 'integer' | 'real' | 'json';
const COLUMNS: [field: string, column: string, sort: Sort][] = [
  ['dealer', 'dealer', 'text'],
  ['note', 'note', 'text'],
  ['width', 'width', 'integer'],
  ['height', 'height', 'integer'],
  ['seconds', 'seconds', 'real'],
  ['fps', 'fps', 'real'],
  ['bytes', 'bytes', 'integer'],
  ['pose', 'pose', 'text'],
  ['grip', 'grip', 'text'],
  ['kind', 'kind', 'text'],
  ['licence', 'licence', 'text'],
  ['use', 'use', 'text'],
  ['view', 'view', 'json'],
  ['lands', 'lands', 'json'],
  ['comment', 'comment', 'text'],
  ['commentAt', 'comment_at', 'text'],
  ['reply', 'reply', 'text'],
  ['replyAt', 'reply_at', 'text'],
];
// Fälten som står någon annanstans än i COLUMNS och `more`.
const OWN = new Set(['file', 'group', 'title', 'status', 'statusBy', 'statusAt', 'source']);

const fits = (value: unknown, sort: Sort): boolean =>
  sort === 'text'
    ? typeof value === 'string'
    : sort === 'integer'
      ? Number.isInteger(value)
      : sort === 'real'
        ? typeof value === 'number' && Number.isFinite(value)
        : value !== null && typeof value === 'object';

type Measured = { post_key: string; what: string; value: string; is_json: number };

/** Postens source.measured som rader: en per fält, eller en enda när fältet är en text. */
function measuredRows(measured: unknown): Measured[] {
  if (measured === undefined) return [];
  const one = (key: string, value: unknown): Measured =>
    typeof value === 'string' ? { post_key: key, what: key || 'mått', value, is_json: 0 } : { post_key: key, what: key || 'mått', value: JSON.stringify(value), is_json: 1 };
  if (measured !== null && typeof measured === 'object' && !Array.isArray(measured) && Object.keys(measured).length > 0) {
    return Object.entries(measured).map(([key, value]) => one(key, value));
  }
  return [one('', measured)];
}

function measuredOf(rows: Row[]): unknown {
  const value = (row: Row): unknown => (row.is_json === 1 ? JSON.parse(String(row.value)) : row.value);
  if (rows.length === 1 && rows[0]!.post_key === '') return value(rows[0]!);
  return Object.fromEntries(rows.map((row) => [row.post_key, value(row)]));
}

function entryOfRow(row: Row, measured: Row[]): RegistryEntry {
  const entry: RegistryEntry = { file: String(row.file), group: row.grp, title: row.title, status: String(row.status) } as RegistryEntry;
  const put = (field: string, value: unknown, sort: Sort) => {
    if (value !== null && value !== undefined) entry[field] = sort === 'json' ? JSON.parse(String(value)) : value;
  };
  for (const [field, column, sort] of COLUMNS) if (!field.startsWith('comment') && !field.startsWith('reply')) put(field, row[column], sort);
  Object.assign(entry, JSON.parse(String(row.more)));
  entry.source = {
    from: row.origin,
    ...JSON.parse(String(row.source)),
    ...(measured.length > 0 ? { measured: measuredOf(measured) } : {}),
    sha256: row.sha256,
  };
  put('statusBy', row.status_by, 'text');
  put('statusAt', row.status_at, 'text');
  for (const [field, column, sort] of COLUMNS) if (field.startsWith('comment') || field.startsWith('reply')) put(field, row[column], sort);
  return entry;
}

function readEntries(db: DatabaseSync, file?: string): RegistryEntry[] {
  const rows = (file === undefined ? db.prepare('SELECT * FROM register ORDER BY ord').all() : db.prepare('SELECT * FROM register WHERE file = ?').all(file)).map(plain);
  const measured = (file === undefined
    ? db.prepare('SELECT * FROM measurements WHERE post_key IS NOT NULL ORDER BY id').all()
    : db.prepare('SELECT * FROM measurements WHERE post_key IS NOT NULL AND file = ? ORDER BY id').all(file)
  ).map(plain);
  const byFile = new Map<string, Row[]>();
  for (const row of measured) byFile.set(String(row.file), [...(byFile.get(String(row.file)) ?? []), row]);
  return rows.map((row) => entryOfRow(row, byFile.get(String(row.file)) ?? []));
}

function entryIn(db: DatabaseSync, file: string): RegistryEntry {
  const entry = readEntries(db, file)[0];
  if (!entry) throw new RegistryError(`Ingen post i registret för ${file}. Se npm run reg -- list.`);
  return entry;
}

const known = (db: DatabaseSync, table: 'statuses' | 'groups' | 'sources', name: unknown): boolean =>
  typeof name === 'string' && db.prepare(`SELECT 1 FROM ${table} WHERE name = ?`).get(name) !== undefined;

const names = (db: DatabaseSync, table: 'statuses' | 'groups' | 'sources'): string =>
  db.prepare(`SELECT name FROM ${table} ORDER BY ord`).all().map((row) => (row as Row).name).join(', ');

export function readRegistry(root: string): Registry {
  return reading(root, (db) => {
    const statuses = db.prepare('SELECT * FROM statuses ORDER BY ord').all().map(plain);
    return {
      schemaVersion: Number((db.prepare('PRAGMA user_version').get() as Row).user_version),
      about: String((db.prepare("SELECT value FROM meta WHERE key = 'about'").get() as Row | undefined)?.value ?? ''),
      statuses: Object.fromEntries(statuses.map((row) => [row.name, row.meaning])) as Record<string, string>,
      asksWhy: statuses.filter((row) => row.asks_why === 1).map((row) => String(row.name)),
      groups: Object.fromEntries(db.prepare('SELECT name, meaning FROM groups ORDER BY ord').all().map((row) => [(row as Row).name, (row as Row).meaning])),
      sources: Object.fromEntries(
        db
          .prepare('SELECT name, what, more FROM sources ORDER BY ord')
          .all()
          .map((row) => [(row as Row).name, { what: (row as Row).what, ...JSON.parse(String((row as Row).more)) }]),
      ),
      assets: readEntries(db),
    };
  });
}

/** En post, eller undefined när filen inte har någon. */
export function getEntry(root: string, file: string): RegistryEntry | undefined {
  return reading(root, (db) => readEntries(db, file)[0]);
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

/** Postens rad i files, och det som hör till den på andra ställen. Fel i posten sägs med fältets namn. */
function rowOf(db: DatabaseSync, entry: RegistryEntry) {
  const need = (ok: boolean, what: string): void => {
    if (!ok) throw new RegistryError(`Posten för ${entry.file ?? '?'} går inte att föra in: ${what}`);
  };
  need(typeof entry.file === 'string' && entry.file !== '', 'file saknas');
  need(typeof entry.title === 'string', 'title saknas');
  need(known(db, 'groups', entry.group), `gruppen ${String(entry.group)} finns inte (${names(db, 'groups')})`);
  need(known(db, 'statuses', entry.status), `okänd status: ${String(entry.status)} (${names(db, 'statuses')})`);
  const source = entry.source as Record<string, unknown> | undefined;
  need(source !== null && typeof source === 'object' && !Array.isArray(source), 'source saknas');
  const { from, sha256, measured, ...rest } = source!;
  need(known(db, 'sources', from), `source.from ${String(from)} finns inte (${names(db, 'sources')})`);
  need(typeof sha256 === 'string' && /^[0-9a-f]{64}$/.test(sha256), 'source.sha256 saknas');
  const columns: Record<string, unknown> = {};
  const more: Record<string, unknown> = {};
  const placed = new Map(COLUMNS.map(([field, column, sort]) => [field, { column, sort }]));
  for (const [field, value] of Object.entries(entry)) {
    if (OWN.has(field)) continue;
    const place = placed.get(field);
    if (place && fits(value, place.sort)) columns[place.column] = place.sort === 'json' ? JSON.stringify(value) : value;
    else more[field] = value;
  }
  const by = entry.statusBy;
  const at = entry.statusAt;
  need(by === undefined || typeof by === 'string', 'statusBy ska vara en text');
  need(at === undefined || typeof at === 'string', 'statusAt ska vara en text');
  return {
    row: { file: entry.file, grp: entry.group, title: entry.title, sha256, origin: from, ...columns, more: JSON.stringify(more), source: JSON.stringify(rest) } as Record<string, string | number | null>,
    verdict: { status: entry.status, who: by ?? null, at: at ?? null },
    measured: measuredRows(measured),
  };
}

const FILE_COLUMNS = ['file', 'ord', 'grp', 'title', 'sha256', 'origin', ...COLUMNS.map(([, column]) => column), 'imported_from', 'more', 'source'];

/**
 * Lägger en post sist i registret. En fil som redan har en post tas inte emot, om inte `replace` säger att posten
 * ska bytas: då står den nya där den gamla stod, och den nya postens status blir ett nytt omdöme i historiken.
 * `importedFrom` är var filen låg; `at` är tiden för ett omdöme som posten inte själv säger när det sattes.
 */
export function addEntry(root: string, entry: RegistryEntry, replace = false, how: { importedFrom?: string; at?: string | null } = {}): RegistryEntry {
  return writing(root, (db) => {
    const { row, verdict, measured } = rowOf(db, entry);
    const old = db.prepare('SELECT ord FROM files WHERE file = ?').get(entry.file) as Row | undefined;
    if (old && !replace) throw new RegistryError(`${entry.file} har redan en post i registret. Säg replace i posten för att byta den.`);
    const ord = old ? Number(old.ord) : Number((db.prepare('SELECT coalesce(max(ord), -1) + 1 AS next FROM files').get() as Row).next);
    if (old) {
      db.prepare('DELETE FROM files WHERE file = ?').run(entry.file);
      db.prepare('DELETE FROM measurements WHERE file = ? AND post_key IS NOT NULL').run(entry.file);
    }
    const values = { ...row, ord, imported_from: how.importedFrom ?? null };
    const columns = FILE_COLUMNS.filter((column) => column in values);
    db.prepare(`INSERT INTO files (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...columns.map((column) => values[column as keyof typeof values] ?? null));
    db.prepare('INSERT INTO verdicts (file, status, who, at) VALUES (?, ?, ?, ?)').run(entry.file, verdict.status, verdict.who, verdict.at ?? how.at ?? null);
    for (const part of measured) {
      db.prepare('INSERT INTO measurements (file, what, value, is_json, at, basis, note, post_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        entry.file, part.what, part.value, part.is_json, how.at ?? null, 'mätt', 'ur postens source.measured', part.post_key,
      );
    }
    return entryIn(db, entry.file);
  });
}

/**
 * Sätter en posts status, vem som satte den och när (`at`, "ÅÅÅÅ-MM-DD TT:MM"), som ett nytt omdöme i historiken.
 * En status som posten redan har lämnas orörd, så att en tidigare motivering står kvar.
 */
export function setStatus(root: string, file: string, status: string, by: string, at: string): RegistryEntry {
  return writing(root, (db) => {
    if (!known(db, 'statuses', status)) throw new RegistryError(`Okänd status: ${status}. Statusarna är ${names(db, 'statuses')}.`);
    const entry = entryIn(db, file);
    if (entry.status === status) return entry;
    db.prepare('INSERT INTO verdicts (file, status, who, at) VALUES (?, ?, ?, ?)').run(file, status, by, at);
    return entryIn(db, file);
  });
}

/** Skriver Jakobs ord om en fil (`comment`) eller agentens svar (`reply`), med tiden. Tom text tar bort dem. */
export function setWords(root: string, file: string, kind: 'comment' | 'reply', text: string, at: string): RegistryEntry {
  return writing(root, (db) => {
    const entry = entryIn(db, file);
    const words = text.trim();
    if (words === (entry[kind] ?? '')) return entry;
    db.prepare(`UPDATE files SET ${kind} = ?, ${kind}_at = ? WHERE file = ?`).run(words || null, words ? at : null, file);
    return entryIn(db, file);
  });
}

/**
 * Kön till agenten: poster vars status ber om en motivering (`asksWhy`) och som inte har fått ett svar
 * som är nyare än både Jakobs ord och statusen.
 */
export function queue(root: string): RegistryEntry[] {
  const registry = readRegistry(root);
  const asks = new Set(registry.asksWhy);
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

// ---------------------------------------------------------------------------------------------------------------
// Import: en fil förs in i assets/ med en post som bär dess mått och sha256.

const run = promisify(execFile);
const FILE = /^[a-z0-9][a-z0-9_.-]*(\/[a-z0-9][a-z0-9_.-]*)+$/;
const isFilm = (file: string): boolean => /\.(mp4|webm)$/i.test(file);
const isPicture = (file: string): boolean => /\.(png|jpe?g|webp)$/i.test(file);
// Fälten som mäts ur filen själv (factsOf). En post kan inte sätta dem.
const MEASURED = ['width', 'height', 'bytes', 'seconds', 'fps'];

export const sha256Of = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Det som går att läsa ur filen själv: storlek, och för bilder och filmer mått, längd och takt. */
export async function factsOf(path: string): Promise<Record<string, number>> {
  const bytes = statSync(path).size;
  if (isPicture(path)) {
    const { width, height } = await sharp(path).metadata();
    return { width: width!, height: height!, bytes };
  }
  if (isFilm(path)) {
    const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', path]);
    const read = JSON.parse(probe.stdout) as { streams: { width: number; height: number; r_frame_rate: string }[]; format: { duration: string } };
    const stream = read.streams[0];
    if (!stream) throw new RegistryError(`${path}: filmen har inget bildspår`);
    const [over, under] = stream.r_frame_rate.split('/').map(Number);
    return { width: stream.width, height: stream.height, seconds: Number(Number(read.format.duration).toFixed(2)), fps: Number((over! / (under || 1)).toFixed(3)), bytes };
  }
  return { bytes };
}

/** Om filmen har ett ljudspår. Dealerns filmer ska inte ha något: ljud och lipsync väntar. */
export async function hasSound(path: string): Promise<boolean> {
  const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', path]);
  return probe.stdout.trim() !== '';
}

export type Post = RegistryEntry & { from: string; replace?: boolean };

/**
 * För in en fil: kopierar den till assets/ under postens `file` och lägger posten i registret. En fil som redan ligger
 * där med annat innehåll skrivs bara över när posten säger `replace`, och då byts också posten. Måtten och sha256 är
 * alltid de som mäts ur filen: tal som posten bär för dem följer inte med.
 */
export async function importAsset(root: string, post: Partial<Post>): Promise<RegistryEntry> {
  const { from, replace, ...fields } = post;
  const need = (ok: boolean, what: string): void => {
    if (!ok) throw new RegistryError(`Posten går inte att föra in: ${what}`);
  };
  need(typeof from === 'string' && from !== '', 'from saknas (var filen ligger nu, räknat från projektmappen)');
  need(typeof fields.file === 'string' && FILE.test(fields.file), `file ska vara en sökväg under assets/ med små bokstäver: ${fields.file}`);
  need(typeof fields.title === 'string' && fields.title !== '', 'title saknas');
  need(reading(root, (db) => known(db, 'groups', fields.group)), `gruppen finns inte i registret: ${fields.group}`);
  const source = resolve(root, from!);
  need(existsSync(source), `${from} finns inte`);
  need(typeof fields.source === 'object' && fields.source !== null && typeof (fields.source as { from?: unknown }).from === 'string', 'source.from saknas');
  if (isFilm(source)) need(!(await hasSound(source)), `${from} har ljud: ta bort ljudspåret först (ffmpeg -an -c:v copy)`);

  const target = join(assetsDir(root), fields.file!);
  const sha256 = sha256Of(source);
  if (existsSync(target) && sha256Of(target) !== sha256 && !replace) {
    throw new RegistryError(`${fields.file} finns redan i assets/ med annat innehåll. Säg replace i posten för att byta den.`);
  }
  const facts = await factsOf(source);
  const { file, group, dealer, title, status, note, source: origin, ...rest } = fields;
  const told = Object.fromEntries(Object.entries(rest).filter(([field]) => !MEASURED.includes(field)));
  const entry: RegistryEntry = {
    file: file!,
    group,
    ...(dealer === undefined ? {} : { dealer }),
    title,
    status: typeof status === 'string' ? status : 'att granska',
    ...(note === undefined ? {} : { note }),
    ...facts,
    ...told,
    source: { ...(origin as object), sha256 },
  };
  // Posten prövas innan filen kopieras, så att en post som inte går att föra in inte lämnar en fil utan post.
  reading(root, (db) => rowOf(db, entry));
  if (!replace && getEntry(root, entry.file)) throw new RegistryError(`${entry.file} har redan en post i registret. Säg replace i posten för att byta den.`);
  mkdirSync(dirname(target), { recursive: true });
  if (!existsSync(target) || sha256Of(target) !== sha256) copyFileSync(source, target);
  return addEntry(root, entry, replace === true, { importedFrom: from!.replaceAll('\\', '/'), at: stamp() });
}

/** Posterna i en fil: en post eller en lista av dem. En fil som saknas eller inte är JSON sägs med sitt namn. */
export function readPosts(path: string): Partial<Post>[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new RegistryError(`${path} går inte att läsa: finns filen?`);
  }
  let read: unknown;
  try {
    read = JSON.parse(text);
  } catch (error) {
    throw new RegistryError(`${path} är inte giltig JSON: ${(error as Error).message}`);
  }
  return (Array.isArray(read) ? read : [read]) as Partial<Post>[];
}

// ---------------------------------------------------------------------------------------------------------------
// Vad som pekar på en fil, och det som produktionslinjen inte använder.

export type Pointer = { where: string; blocks: boolean };

function filesUnder(dir: string, ending: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile() && ending.test(item.name))
    .map((item) => join(item.parentPath, item.name));
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Om texten nämner filen: med hela registernamnet (också efter assets/ eller en annan mapp), med en del av det
 * (för a/b/c.png: b/c.png) eller med filnamnet ensamt (c.png). Ett filnamn i en annan mapp (x/c.png) eller som en del
 * av ett längre namn (d-c.png) är inte filen.
 */
export function mentions(text: string, file: string): boolean {
  const name = basename(file);
  for (const match of text.matchAll(new RegExp(`(?<![\\w.-])${escape(name)}(?![\\w-]|\\.\\w)`, 'g'))) {
    let start = match.index;
    while (start > 0 && /[\w./-]/.test(text[start - 1]!)) start -= 1;
    const said = text.slice(start, match.index + name.length);
    if (said === file || file.endsWith(`/${said}`) || said === name || said.endsWith(`/${file}`)) return true;
  }
  return false;
}

/** Det som kan peka på en fil, läst en gång: kod, data, dokument, posterna, beställningarna och uppladdningarna. */
type Corpus = {
  registry: Registry;
  code: { where: string; text: string }[];
  data: { where: string; text: string }[];
  docs: { where: string; text: string }[];
  posts: Map<string, string>;
  orders: Row[];
  uploads: Row[];
};

function corpusOf(root: string): Corpus {
  const rel = (path: string) => relative(root, path).replaceAll('\\', '/');
  const registry = readRegistry(root);
  const code = filesUnder(join(root, 'src'), /\.tsx?$/).flatMap((path) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .map((text, index) => ({ where: `${rel(path)}:${index + 1}`, text })),
  );
  const data = filesUnder(join(root, 'content'), /\.json$/).map((path) => ({ where: rel(path), text: readFileSync(path, 'utf8') }));
  const docs = [...filesUnder(join(root, 'docs'), /\.md$/), join(root, 'README.md'), join(root, 'AGENTS.md')]
    .filter((path) => existsSync(path))
    .map((path) => ({ where: rel(path), text: readFileSync(path, 'utf8') }));
  const posts = new Map(registry.assets.map((entry) => [entry.file, JSON.stringify(entry)]));
  const { orders, uploads } = reading(root, (db) => ({
    orders: db.prepare('SELECT id, task_id, result, inputs, prompt FROM orders').all().map(plain),
    uploads: db.prepare('SELECT id, file FROM uploads').all().map(plain),
  }));
  return { registry, code, data, docs, posts, orders, uploads };
}

const orderName = (order: Row): string => `beställningen ${order.task_id ?? `rad ${order.id}`}`;
const usesAsInput = (order: Row, file: string): boolean => mentions(String(order.inputs ?? ''), file) || mentions(String(order.prompt ?? ''), file);

/**
 * Det som pekar på en fil. Kod och tester under src/, data under content/ och andra poster hindrar att filen tas bort
 * eller arkiveras (`blocks`). Dokument, beställningar och uppladdningar nämner den bara: de är historik eller text att rätta.
 */
export function pointersTo(root: string, file: string, corpus = corpusOf(root)): Pointer[] {
  const found: Pointer[] = [];
  for (const line of corpus.code) if (mentions(line.text, file)) found.push({ where: line.where, blocks: true });
  for (const item of corpus.data) if (mentions(item.text, file)) found.push({ where: item.where, blocks: true });
  for (const [other, text] of corpus.posts) if (other !== file && mentions(text, file)) found.push({ where: `posten ${other}`, blocks: true });
  for (const item of corpus.docs) if (mentions(item.text, file)) found.push({ where: item.where, blocks: false });
  for (const order of corpus.orders) {
    if (order.result === file) found.push({ where: `${orderName(order)} (resultat)`, blocks: false });
    else if (usesAsInput(order, file)) found.push({ where: `${orderName(order)} (indata)`, blocks: false });
  }
  for (const upload of corpus.uploads) if (upload.file === file) found.push({ where: `uppladdningen rad ${upload.id}`, blocks: false });
  return found;
}

export type Unused = { file: string; status: string; group: string; why: string; then: 'arkivera' | 'ta-bort'; notes: string[] };

const viewName = (view: unknown): string | null => {
  const seen = view as { kind?: unknown; seat?: unknown } | undefined;
  if (seen?.kind === 'spelaren') return 'Spelaren';
  if (seen?.kind === 'plats' && Number.isInteger(seen.seat)) return `Plats ${seen.seat}`;
  return null;
};

/**
 * Posterna som produktionslinjen (docka → ankare på grönt → Kling 4 → nycklad i scenen) inte använder, och varför.
 * Det linjen använder är dealerfilmerna med sin vy, bakgrunderna i scenen, identitetsbilderna, det som content/ pekar
 * på, och sedan det som något använt är gjort av: det dess post pekar på och indata till beställningarna som gav det.
 * Allt annat, och allt med status `utgår`, är oanvänt. En tagning (grupp clips) arkiveras, så att felet går att se på i
 * efterhand; annat oanvänt tas bort.
 */
export function unused(root: string): Unused[] {
  const corpus = corpusOf(root);
  const { registry } = corpus;
  const live = registry.assets.filter((entry) => entry.status !== 'utgår');
  const used = new Map<string, string>();
  const reached: string[] = [];
  const use = (file: string, why: string) => {
    if (used.has(file)) return;
    used.set(file, why);
    reached.push(file);
  };
  for (const entry of live) {
    const view = entry.use === 'dealerfilm' ? viewName(entry.view) : null;
    if (view) use(entry.file, `dealerfilm ur ${view}`);
    else if (entry.group === 'backgrounds') use(entry.file, 'bakgrund att välja i scenen');
    else if (entry.group === 'identity') use(entry.file, 'identitetsbild');
    else {
      const named = corpus.data.find((item) => mentions(item.text, entry.file));
      if (named) use(entry.file, `${named.where} pekar på den`);
    }
  }
  while (reached.length > 0) {
    const file = reached.shift()!;
    const text = corpus.posts.get(file) ?? '';
    const orders = corpus.orders.filter((order) => order.result === file);
    for (const entry of live) {
      if (entry.file === file || used.has(entry.file)) continue;
      if (mentions(text, entry.file)) use(entry.file, `posten ${file} pekar på den`);
      else {
        const order = orders.find((candidate) => usesAsInput(candidate, entry.file));
        if (order) use(entry.file, `indata till ${orderName(order)}`);
      }
    }
  }
  return registry.assets
    .filter((entry) => !used.has(entry.file))
    .map((entry) => {
      const group = String(entry.group);
      const what = group === 'anchors' ? 'ankare' : group === 'clips' ? 'tagning' : (registry.groups[group]?.split(':')[0] ?? group);
      const why =
        entry.status === 'utgår'
          ? 'status utgår'
          : `${what}: ingen dealerfilm, vy, content/ eller använd post pekar på den${group === 'anchors' || group === 'clips' ? ' (den bär inte use: "dealerfilm" med en vy)' : ''}`;
      const notes = pointersTo(root, entry.file, corpus)
        .filter((pointer) => pointer.blocks)
        .map((pointer) => `${pointer.where} pekar på den: ${group === 'clips' ? 'arkivera' : 'ta-bort'} vägrar tills pekaren är borta`);
      return { file: entry.file, status: entry.status, group, why, then: group === 'clips' ? 'arkivera' : 'ta-bort', notes };
    });
}

// ---------------------------------------------------------------------------------------------------------------
// Arkivera (flytta) och ta bort (radera).

export type LeftOut = { what: string; why: string; how: 'utelämnad' | 'arkiverad' | 'borttagen'; at?: string | null; sha256?: string | null; place?: string | null; post?: unknown };

/** Antecknar något som inte står i registret. Arkivera och ta bort gör det själva; flytten in i registret gör det för det gamla. */
export function addLeftOut(root: string, item: LeftOut): void {
  writing(root, (db) => noteLeftOut(db, item));
}

function noteLeftOut(db: DatabaseSync, item: LeftOut): void {
  db.prepare('INSERT INTO left_out (what, why, how, at, sha256, place, post) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    item.what, item.why, item.how, item.at ?? null, item.sha256 ?? null, item.place ?? null, item.post === undefined ? null : JSON.stringify(item.post),
  );
}

function leaving(db: DatabaseSync, file: string): void {
  db.prepare('DELETE FROM measurements WHERE file = ? AND post_key IS NOT NULL').run(file);
  db.prepare('DELETE FROM files WHERE file = ?').run(file);
}

function refuseIfPointedAt(root: string, file: string, doing: string): void {
  const blockers = pointersTo(root, file).filter((pointer) => pointer.blocks);
  if (blockers.length > 0) {
    throw new RegistryError(`${file} ${doing}: ${blockers.map((pointer) => pointer.where).join(', ')} pekar på den. Ta bort pekarna först, eller låt filen vara.`);
  }
}

/**
 * Arkiverar en fil: flyttar den ur assets/ till output/work/arkiv/ med samma sökväg, tar posten ur registret och
 * antecknar i left_out vad den var (hela posten med sitt omdöme), varför och var den ligger. Omdömenas historik står kvar.
 */
export function archive(root: string, file: string, why: string, at: string): string {
  const entry = getEntry(root, file);
  if (!entry) throw new RegistryError(`Ingen post i registret för ${file}. Se npm run reg -- list.`);
  refuseIfPointedAt(root, file, 'arkiveras inte');
  const from = join(assetsDir(root), file);
  const place = `${ARCHIVE}/${file}`;
  const to = join(root, place);
  if (!existsSync(from)) throw new RegistryError(`${file} finns inte i assets/, så det finns inget att flytta. Ta bort posten med ta-bort i stället.`);
  if (existsSync(to)) throw new RegistryError(`${place} finns redan. Flytta undan den först.`);
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
  try {
    writing(root, (db) => {
      leaving(db, file);
      noteLeftOut(db, { what: file, why, how: 'arkiverad', at, sha256: String((entry.source as Row).sha256), place, post: entry });
    });
  } catch (error) {
    renameSync(to, from);
    throw error;
  }
  return place;
}

/**
 * Tar bort en fil: raderar den ur assets/ och tar posten ur registret, och antecknar i left_out vad som togs bort
 * (hela posten) och varför. Omdömenas historik står kvar. Filen finns inte kvar någonstans efteråt.
 */
export function remove(root: string, file: string, why: string, at: string): { hadFile: boolean } {
  const entry = getEntry(root, file);
  if (!entry) throw new RegistryError(`Ingen post i registret för ${file}. Se npm run reg -- list.`);
  refuseIfPointedAt(root, file, 'tas inte bort');
  const path = join(assetsDir(root), file);
  const hadFile = existsSync(path);
  writing(root, (db) => {
    leaving(db, file);
    noteLeftOut(db, { what: file, why, how: 'borttagen', at, sha256: String((entry.source as Row).sha256), post: entry });
    if (hadFile) rmSync(path);
  });
  return { hadFile };
}

// ---------------------------------------------------------------------------------------------------------------
// Beställningar, uppladdningar och mätningar.

export type Order = {
  at?: string | null;
  model: string;
  kind?: 'bild' | 'film' | null;
  purpose?: string | null;
  inputs?: string | null;
  prompt?: string | null;
  taskId?: string | null;
  credits?: number | null;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  basis: 'mätt' | 'antaget';
  outcome?: string | null;
  result?: string | null;
  note?: string | null;
};

const BASES = ['mätt', 'antaget'];
const isCount = (value: unknown): value is number => Number.isInteger(value);
const text = (value: unknown): string | null => (value === undefined || value === null ? null : typeof value === 'string' ? value : JSON.stringify(value));

/** En sökväg som tabellerna bär den: ett registernamn (assets/ bortskuret) eller räknad från projektmappen under output/. */
export function pathOf(given: string): string {
  const path = given.replaceAll('\\', '/').replace(/^\.\//, '');
  if (path.startsWith('assets/')) return path.slice('assets/'.length);
  return path;
}

const onDisk = (root: string, path: string): string => (path.startsWith('output/') ? join(root, path) : join(assetsDir(root), path));

/**
 * För in en betald beställning. Mätt kostnad är skillnaden mellan saldot direkt före och direkt efter; saknas något
 * av dem är kostnaden antagen. Krediterna räknas ur saldona när de inte är givna.
 */
export function addOrder(root: string, order: Order): number {
  const need = (ok: boolean, what: string): void => {
    if (!ok) throw new RegistryError(`Beställningen går inte att föra in: ${what}`);
  };
  need(typeof order.model === 'string' && order.model !== '', 'model saknas');
  need(BASES.includes(order.basis), 'basis ska vara "mätt" eller "antaget"');
  need(order.kind === undefined || order.kind === null || order.kind === 'bild' || order.kind === 'film', 'kind ska vara "bild" eller "film"');
  for (const field of ['credits', 'balanceBefore', 'balanceAfter'] as const) {
    need(order[field] === undefined || order[field] === null || isCount(order[field]), `${field} ska vara ett heltal`);
  }
  const before = order.balanceBefore ?? null;
  const after = order.balanceAfter ?? null;
  const credits = order.credits ?? (before !== null && after !== null ? before - after : null);
  if (order.basis === 'mätt') {
    need(before !== null && after !== null, 'mätt kostnad kräver saldot före och efter (balanceBefore, balanceAfter); annars är den antagen');
    need(credits === before! - after!, `krediterna (${credits}) är inte skillnaden mellan saldona (${before} − ${after}); är kostnaden antagen?`);
  }
  return writing(root, (db) => {
    if (order.taskId) {
      const old = db.prepare('SELECT id FROM orders WHERE task_id = ?').get(order.taskId) as Row | undefined;
      if (old) throw new RegistryError(`Beställningen ${order.taskId} står redan i registret (rad ${old.id}).`);
    }
    const kind = order.kind !== undefined ? order.kind : /kling|veo|video/i.test(order.model) ? 'film' : 'bild';
    const done = db
      .prepare('INSERT INTO orders (at, model, kind, purpose, inputs, prompt, task_id, credits, balance_before, balance_after, basis, outcome, result, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        order.at === undefined ? stamp() : order.at, order.model, kind, text(order.purpose), text(order.inputs), text(order.prompt), order.taskId ?? null,
        credits, before, after, order.basis, text(order.outcome), order.result ? pathOf(order.result) : null, text(order.note),
      );
    return Number(done.lastInsertRowid);
  });
}

export type Upload = { file: string; url: string; assetId?: string | null; at?: string | null; note?: string | null; sha256?: string | null; basis?: 'mätt' | 'antaget' };

/** När en signerad adress slutar gälla, ur dess _jwt (fältet exp). Null när adressen inte bär någon. */
export function expiryOf(url: string): string | null {
  try {
    const token = new URL(url).searchParams.get('_jwt');
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const exp = (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? stamp(new Date(exp * 1000)) : null;
  } catch {
    return null;
  }
}

/** Adressen utan signatur och andra frågeord: den går att peka ut, men ger ingen åtkomst. */
export const unsigned = (url: string): string => {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
};

/**
 * För in en uppladdad fils adress. Den lokala filen ska finnas: dess sha256 räknas nu (mätt). Signaturen sparas inte,
 * eftersom registret checkas in och origin är publikt; när den slutar gälla sparas.
 */
export function addUpload(root: string, upload: Upload): number {
  const file = pathOf(upload.file);
  let url: string;
  try {
    url = unsigned(upload.url);
  } catch {
    throw new RegistryError(`${upload.url} är ingen adress.`);
  }
  let sha256 = upload.sha256 ?? null;
  let basis = upload.basis ?? 'mätt';
  if (upload.sha256 === undefined) {
    const path = onDisk(root, file);
    if (!existsSync(path)) throw new RegistryError(`${upload.file} finns inte. Ange filen under assets/ eller output/, som den laddades upp.`);
    sha256 = sha256Of(path);
    basis = 'mätt';
  }
  if (!BASES.includes(basis)) throw new RegistryError('basis ska vara "mätt" eller "antaget"');
  return writing(root, (db) => {
    const done = db
      .prepare('INSERT INTO uploads (file, sha256, basis, url, asset_id, at, expires, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(file, sha256, basis, url, upload.assetId ?? null, upload.at === undefined ? stamp() : upload.at, expiryOf(upload.url), upload.note ?? null);
    return Number(done.lastInsertRowid);
  });
}

export type Measurement = { file: string; what: string; value: unknown; who?: string | null; at?: string | null; basis: 'mätt' | 'antaget'; note?: string | null };

/** För in en mätning av en fil som har en post. */
export function addMeasurement(root: string, measurement: Measurement): number {
  const file = pathOf(measurement.file);
  if (!measurement.what) throw new RegistryError('Mätningen går inte att föra in: vad som mättes saknas');
  if (!BASES.includes(measurement.basis)) throw new RegistryError('Mätningen går inte att föra in: basis ska vara "mätt" eller "antaget"');
  return writing(root, (db) => {
    entryIn(db, file);
    const json = typeof measurement.value !== 'string';
    const done = db
      .prepare('INSERT INTO measurements (file, what, value, is_json, who, at, basis, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(file, measurement.what, json ? JSON.stringify(measurement.value) : (measurement.value as string), json ? 1 : 0, measurement.who ?? null, measurement.at === undefined ? stamp() : measurement.at, measurement.basis, measurement.note ?? null);
    return Number(done.lastInsertRowid);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Att fråga registret.

/** Kör en fråga som bara läser: databasen öppnas skrivskyddad, så en ändring går inte igenom. */
export function query(root: string, sql: string): { columns: string[]; rows: Row[] } {
  const db = connect(root, true);
  try {
    const statement = db.prepare(sql);
    return { columns: statement.columns().map((column) => column.name), rows: statement.all().map(plain) };
  } catch (error) {
    throw new RegistryError(`Frågan gick inte: ${(error as Error).message}. Tabellerna: npm run reg -- sql`);
  } finally {
    db.close();
  }
}

/** Tabellerna och vyn, så som de står i databasen, med en rad om varje fält. */
export function schemaText(root: string): string {
  return reading(root, (db) =>
    db
      .prepare("SELECT sql FROM sqlite_master WHERE type IN ('table', 'view') AND sql IS NOT NULL ORDER BY rowid")
      .all()
      .map((row) => `${(row as Row).sql};`)
      .join('\n\n'),
  );
}

export type Problem = { file?: string; what: string; fix: string };

/** Jämför registret med assets/: varje fil har en post med rätt sha256, varje post har en fil, och arkiverat ligger där det sägs. */
export function check(root: string): Problem[] {
  const problems: Problem[] = [];
  const registry = readRegistry(root);
  const files = new Set(listAssetFiles(root));
  for (const entry of registry.assets) {
    const path = join(assetsDir(root), entry.file);
    if (!files.has(entry.file)) {
      problems.push({ file: entry.file, what: 'posten har ingen fil i assets/', fix: `lägg tillbaka filen, eller: npm run reg -- ta-bort ${entry.file} "<varför>"` });
      continue;
    }
    const told = (entry.source as Row).sha256;
    const sha256 = sha256Of(path);
    if (sha256 !== told) {
      problems.push({ file: entry.file, what: `fel sha256: posten säger ${String(told).slice(0, 12)}, filen är ${sha256.slice(0, 12)}`, fix: 'har filen bytts? För in den igen med import och replace' });
    } else if (entry.bytes !== undefined && entry.bytes !== statSync(path).size) {
      problems.push({ file: entry.file, what: `fel storlek: posten säger ${entry.bytes} byte, filen har ${statSync(path).size}`, fix: 'för in filen igen med import och replace' });
    }
  }
  const registered = new Set(registry.assets.map((entry) => entry.file));
  for (const file of files) {
    if (!registered.has(file)) problems.push({ file, what: 'filen i assets/ har ingen post', fix: 'för in den med npm run reg -- import <post.json>, eller flytta den ur assets/' });
  }
  reading(root, (db) => {
    for (const row of db.prepare("SELECT what, place FROM left_out WHERE how = 'arkiverad'").all().map(plain)) {
      if (!row.place || !existsSync(join(root, String(row.place)))) {
        problems.push({ file: String(row.what), what: `arkiverad, men filen ligger inte i ${row.place ?? '(ingen plats)'}`, fix: 'leta upp filen och lägg den där left_out.place säger' });
      }
    }
    const broken = db.prepare('PRAGMA foreign_key_check').all().length;
    if (broken > 0) problems.push({ what: `${broken} rader pekar på en status, grupp eller källa som inte finns`, fix: 'kör PRAGMA foreign_key_check med npm run reg -- sql' });
    const health = String((db.prepare('PRAGMA quick_check').get() as Row).quick_check);
    if (health !== 'ok') problems.push({ what: `databasen är skadad: ${health}`, fix: 'hämta content/register.db ur Git' });
    for (const row of db.prepare('SELECT f.file FROM files f LEFT JOIN verdicts v ON v.file = f.file WHERE v.id IS NULL').all().map(plain)) {
      problems.push({ file: String(row.file), what: 'posten har inget omdöme', fix: `npm run reg -- status ${row.file} "att granska" "<vem och varför>"` });
    }
  });
  return problems;
}

/** Antal poster per grupp och status, och vad de andra tabellerna bär. */
export function summary(root: string): { statuses: string[]; groups: { group: string; counts: Record<string, number>; total: number }[]; totals: Row } {
  const registry = readRegistry(root);
  const statuses = Object.keys(registry.statuses);
  const groups = [...new Set([...Object.keys(registry.groups), ...registry.assets.map((entry) => String(entry.group))])].map((group) => {
    const members = registry.assets.filter((entry) => entry.group === group);
    return { group, counts: Object.fromEntries(statuses.map((status) => [status, members.filter((entry) => entry.status === status).length])), total: members.length };
  });
  const totals = reading(root, (db) =>
    plain(
      db
        .prepare(
          `SELECT (SELECT count(*) FROM files) AS posts,
                  (SELECT count(*) FROM orders) AS orders,
                  (SELECT coalesce(sum(credits), 0) FROM orders WHERE basis = 'mätt') AS measured_credits,
                  (SELECT coalesce(sum(credits), 0) FROM orders WHERE basis = 'antaget') AS assumed_credits,
                  (SELECT count(*) FROM uploads) AS uploads,
                  (SELECT count(*) FROM measurements) AS measurements,
                  (SELECT count(*) FROM verdicts) AS verdicts,
                  (SELECT count(*) FROM left_out WHERE how = 'utelämnad') AS left_out,
                  (SELECT count(*) FROM left_out WHERE how = 'arkiverad') AS archived,
                  (SELECT count(*) FROM left_out WHERE how = 'borttagen') AS removed`,
        )
        .get(),
    ),
  );
  return { statuses, groups, totals: { ...totals, files: listAssetFiles(root).length } };
}

/** Allt registret vet om en fil: posten, omdömena, beställningarna, uppladdningarna, mätningarna och vad som pekar på den. */
export function about(root: string, file: string): { entry?: RegistryEntry; verdicts: Row[]; orders: Row[]; uploads: Row[]; measurements: Row[]; leftOut: Row[]; pointers: Pointer[] } {
  const name = pathOf(file);
  const entry = getEntry(root, name);
  return reading(root, (db) => ({
    entry,
    verdicts: db.prepare('SELECT status, who, at FROM verdicts WHERE file = ? ORDER BY id').all(name).map(plain),
    orders: db.prepare('SELECT id, at, model, task_id, credits, basis, purpose, outcome FROM orders WHERE result = ? ORDER BY coalesce(at, \'\'), id').all(name).map(plain),
    uploads: db.prepare('SELECT at, url, asset_id, expires, sha256, basis FROM uploads WHERE file = ? ORDER BY id').all(name).map(plain),
    measurements: db.prepare('SELECT what, value, who, at, basis, note FROM measurements WHERE file = ? AND post_key IS NULL ORDER BY id').all(name).map(plain),
    leftOut: db.prepare('SELECT how, why, at, sha256, place, post FROM left_out WHERE what = ? ORDER BY id').all(name).map(plain),
    pointers: entry ? pointersTo(root, name) : [],
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// Kommandoraden: npm run reg -- <ord>

const HELP = `Använd: npm run reg -- <ord>
  queue                                   det som väntar på agenten (granska igen utan svar)
  status <fil> <status> "<vem och varför>"  sätt ett omdöme
  reply <fil> "<svar>"                    svara på Jakobs ord (tom text tar bort svaret)
  import <post.json>                      för in en fil (posten bär from, file, group, title, source)
  arkivera <fil> "<varför>"               flytta filen till ${ARCHIVE}/ och ta posten ur registret
  ta-bort <fil> "<varför>"                radera filen och posten; vad och varför antecknas
  show <fil>                              allt om en fil, också om den är borttagen eller arkiverad
  list [grupp] [status]                   posterna, en per rad
  summary                                 antal per grupp och status, och de andra tabellerna
  sql ["<select ...>"]                    fråga vad som helst (bara läsning); utan fråga: tabellerna
  check                                   assets/ mot registret: poster, filer och sha256
  unused                                  det produktionslinjen inte använder, och varför
  order <beställning.json>                för in en betald beställning (en eller en lista)
  upload <lokal fil> <adress> [assetId]   för in en uppladdad fils adress
  measure <fil> "<vad>" "<värde>" [mätt|antaget] ["<vem>"]  för in en mätning
<fil> är sökvägen under assets/, till exempel dealers/<dealer>/anchors/<namn>.png.`;

const short = (value: unknown, room = 160): string => {
  const said = typeof value === 'string' ? value : JSON.stringify(value);
  return said.length > room ? `${said.slice(0, room - 1)}…` : said;
};

function readJsonFile(path: string): unknown[] {
  let read: unknown;
  try {
    read = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new RegistryError(`${path} går inte att läsa som JSON: ${(error as Error).message}`);
  }
  return Array.isArray(read) ? read : [read];
}

async function command(root: string, words: string[]): Promise<number> {
  const [word, ...rest] = words;
  const say = (line = '') => console.log(line);
  if (word === 'queue' && rest.length === 0) {
    const waiting = queue(root);
    say(`${waiting.length} i kö`);
    for (const entry of waiting) say(`- ${entry.file} [${entry.status}]${entry.comment ? ` Jakob: ${entry.comment}` : ' (ingen motivering)'}`);
  } else if (word === 'status' && rest.length === 3) {
    const entry = setStatus(root, rest[0]!, rest[1]!, rest[2]!, stamp());
    say(`${entry.file}: ${entry.status} (${entry.statusBy ?? 'ingen motivering'})`);
  } else if (word === 'reply' && rest.length === 2) {
    const entry = setWords(root, rest[0]!, 'reply', rest[1]!, stamp());
    say(`${entry.file}: svar ${entry.reply ? 'sparat' : 'borttaget'}`);
  } else if (word === 'import' && rest.length === 1) {
    for (const post of readPosts(rest[0]!)) {
      const entry = await importAsset(root, post);
      say(`${entry.file}: ${entry.status}, ${entry.width ?? '?'} × ${entry.height ?? '?'}${entry.seconds ? `, ${entry.seconds} s i ${entry.fps} rutor/s` : ''}, ${entry.bytes} byte`);
    }
  } else if (word === 'arkivera' && rest.length === 2) {
    say(`${rest[0]}: arkiverad, filen ligger i ${archive(root, pathOf(rest[0]!), rest[1]!, stamp())}`);
  } else if (word === 'ta-bort' && rest.length === 2) {
    const done = remove(root, pathOf(rest[0]!), rest[1]!, stamp());
    say(`${rest[0]}: borttagen${done.hadFile ? '' : ' (filen fanns redan inte i assets/)'}; posten står i left_out`);
  } else if (word === 'show' && rest.length === 1) {
    const found = about(root, rest[0]!);
    if (!found.entry && found.leftOut.length === 0) throw new RegistryError(`Ingen post för ${rest[0]}, och inget i left_out. Sök med npm run reg -- list eller sql.`);
    if (found.entry) for (const [field, value] of Object.entries(found.entry)) say(`${field}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    for (const row of found.leftOut) {
      say(`${row.how} ${row.at ?? '(tid okänd)'}: ${row.why}${row.place ? ` Ligger i ${row.place}.` : ''}`);
      if (row.post) for (const [field, value] of Object.entries(JSON.parse(String(row.post)) as Row)) say(`  ${field}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    }
    if (found.verdicts.length > 0) say(`Omdömen: ${found.verdicts.map((row) => `${row.at ?? '?'} ${row.status}${row.who ? ` (${short(row.who, 80)})` : ''}`).join('; ')}`);
    for (const row of found.orders) say(`Beställning ${row.task_id ?? `rad ${row.id}`}: ${row.at ?? '(tid okänd)'}, ${row.model}, ${row.credits ?? '?'} krediter (${row.basis}): ${short(row.outcome ?? row.purpose ?? '', 100)}`);
    for (const row of found.uploads) say(`Uppladdad ${row.at ?? '(tid okänd)'}: ${row.url}${row.expires ? `, gäller till ${row.expires}` : ''}`);
    for (const row of found.measurements) say(`Mätt (${row.basis}) ${row.what}: ${short(row.value)}`);
    if (found.entry) say(found.pointers.length > 0 ? `Pekar på den: ${found.pointers.map((pointer) => pointer.where).join(', ')}` : 'Ingenting pekar på den.');
  } else if (word === 'list' && rest.length <= 2) {
    const registry = readRegistry(root);
    const group = rest.find((value) => Object.hasOwn(registry.groups, value));
    const status = rest.find((value) => Object.hasOwn(registry.statuses, value));
    const unknown = rest.filter((value) => value !== group && value !== status);
    if (unknown.length > 0) throw new RegistryError(`${unknown.join(', ')} är varken en grupp (${Object.keys(registry.groups).join(', ')}) eller en status (${Object.keys(registry.statuses).join(', ')}).`);
    const shown = registry.assets.filter((entry) => (!group || entry.group === group) && (!status || entry.status === status));
    for (const entry of shown) say(`${entry.file} [${entry.status}] ${entry.title}`);
    say(`${shown.length} poster`);
  } else if (word === 'summary' && rest.length === 0) {
    const { statuses, groups, totals } = summary(root);
    const width = Math.max(...groups.map((row) => row.group.length), 5);
    say([''.padEnd(width), ...statuses, 'alla'].join('  '));
    for (const row of groups) say([row.group.padEnd(width), ...statuses.map((status) => String(row.counts[status]).padStart(status.length)), String(row.total).padStart(4)].join('  '));
    say(`${totals.posts} poster, ${totals.files} filer i assets/. ${totals.verdicts} omdömen i historiken.`);
    say(`Beställningar: ${totals.orders} (${totals.measured_credits} krediter mätta, ${totals.assumed_credits} antagna). Uppladdningar: ${totals.uploads}. Mätningar: ${totals.measurements}.`);
    say(`Utanför registret: ${totals.left_out} utelämnade, ${totals.archived} arkiverade, ${totals.removed} borttagna.`);
  } else if (word === 'sql' && rest.length <= 1) {
    if (rest.length === 0) {
      say(schemaText(root));
      return 0;
    }
    const { columns, rows } = query(root, rest[0]!);
    say(columns.join(' | '));
    for (const row of rows) say(columns.map((column) => (row[column] === null ? '' : String(row[column]))).join(' | '));
    say(`(${rows.length} rader)`);
  } else if (word === 'check' && rest.length === 0) {
    const problems = check(root);
    for (const problem of problems) say(`- ${problem.file ? `${problem.file}: ` : ''}${problem.what}. Gör så: ${problem.fix}.`);
    say(problems.length === 0 ? `Registret stämmer med assets/: ${listAssetFiles(root).length} filer, alla med post och rätt sha256.` : `${problems.length} fel.`);
    return problems.length === 0 ? 0 : 1;
  } else if (word === 'unused' && rest.length === 0) {
    const found = unused(root);
    for (const item of found) {
      say(`- ${item.file} [${item.status}]: ${item.why}. Förslag: ${item.then}.`);
      for (const note of item.notes) say(`    obs: ${note}`);
    }
    say(`${found.length} poster används inte av produktionslinjen. En underkänd tagning arkiveras (arkivera), så att felet går att se på; annat oanvänt tas bort (ta-bort).`);
  } else if (word === 'order' && rest.length === 1) {
    for (const order of readJsonFile(rest[0]!)) {
      const id = addOrder(root, order as Order);
      const saved = query(root, `SELECT task_id, model, credits, basis FROM orders WHERE id = ${id}`).rows[0]!;
      say(`beställning ${saved.task_id ?? `rad ${id}`}: ${saved.model}, ${saved.credits ?? '?'} krediter (${saved.basis})`);
    }
  } else if (word === 'upload' && (rest.length === 2 || rest.length === 3)) {
    const id = addUpload(root, { file: rest[0]!, url: rest[1]!, assetId: rest[2] ?? null });
    const saved = query(root, `SELECT file, url, expires FROM uploads WHERE id = ${id}`).rows[0]!;
    say(`${saved.file}: uppladdad som ${saved.url}${saved.expires ? `, gäller till ${saved.expires}` : ''} (signaturen sparas inte)`);
  } else if (word === 'measure' && rest.length >= 3 && rest.length <= 5) {
    const basis = (rest[3] ?? 'mätt') as 'mätt' | 'antaget';
    addMeasurement(root, { file: rest[0]!, what: rest[1]!, value: rest[2]!, basis, who: rest[4] ?? null });
    say(`${pathOf(rest[0]!)}: ${rest[1]} = ${short(rest[2])} (${basis})`);
  } else {
    console.error(word === 'hjälp' || word === undefined ? HELP : `Okänt ord eller fel antal argument: ${words.join(' ')}\n${HELP}`);
    return word === 'hjälp' ? 0 : 2;
  }
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await command(studioRoot(), process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof RegistryError)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  }
}
