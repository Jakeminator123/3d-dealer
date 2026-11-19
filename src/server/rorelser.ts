// Dockans rörelser i content/moves/ så som Labbets steg Dockan arbetar med dem: vilka som finns och vilka som inte får
// skrivas över, en ändrad cykel sparad som en ny rörelse, och dockans rörelsemått för värden som inte är sparade.
//
//   GET  /api/rorelser        moves: varje fil i content/moves/, med vad den är, vilka klipp och paket som är gjorda
//                             med den och, när den inte får skrivas över, varför.
//   POST /api/rorelser        { name, from, cycle, note? }: cykeln `cycle`, ändrad ur `from`, sparas som
//                             content/moves/<name>.json. Prövas först med samma läsare som resten (readCycleParts i
//                             src/pipeline/cykel.ts: readCycle och readMove). En rörelse som ett klipp i registret, ett
//                             klipp som har lämnat det eller ett paket är gjort med skrivs aldrig över, och inte heller
//                             en som inte är gjord i Labbet.
//   POST /api/rorelser/matt   { cycle, seat, index, action }: dockans mått för cykeln med de värdena, prövade mot
//                             gränserna i content/tagning.json, så som tagning.ts forbered prövar dem innan något beställs.
//
// Servern läser inte src/scene: cykeln prövas och räknas genom src/pipeline, i en tillfällig mapp med scenen, dockan och
// cykelns giv, så att ingenting i content/ skrivs förrän den har gått igenom.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query, readRegistry } from '../pipeline/registry.ts';

/** Ett fel i det Labbet skickade, som den som skickade kan rätta. */
export class MoveError extends Error {}

/** Ett namn i content/moves/, utan .json: samma form som cykelns namn i src/pipeline/cykel.ts (readCycleParts). */
export const MOVE_NAME = /^[a-z0-9][a-z0-9-]{0,79}$/;
/** Hur en rörelse som är sparad i Labbet känns igen: dess source börjar så. */
export const MADE_IN_LAB = 'Satt av Jakob i Labbet';

const ACTIONS = ['deal', 'hole', 'flip', 'wait'] as const;
type Action = (typeof ACTIONS)[number];
type Seat = number | 'D';
type Json = Record<string, unknown>;

export type MoveInfo = {
  /** Filens namn i content/moves/, utan .json. */
  name: string;
  /** En cykel (REDO → kortet lagt → REDO) eller en läst giv, som cyklerna bygger på. */
  kind: 'cykel' | 'giv';
  about: string;
  seconds: number | null;
  /** Cykelns giv: rörelsen i content/moves/ den bygger på. */
  give: string | null;
  basis: string | null;
  source: string | null;
  /** Gjord i Labbet (MADE_IN_LAB). */
  madeInLab: boolean;
  /** Klipp i registret, och klipp som har lämnat det, som är gjorda med rörelsen. */
  clips: number;
  left: number;
  /** Paketen i output/tagningar/ som är gjorda med rörelsen. */
  packages: string[];
  /** Cyklerna som bygger på rörelsen (för en giv). */
  usedBy: string[];
  /** Varför rörelsen inte får skrivas över, eller null. */
  locked: string | null;
};

const movesDir = (root: string): string => join(root, 'content', 'moves');
const readJson = (path: string): Json => JSON.parse(readFileSync(path, 'utf8')) as Json;
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const shown = (value: number): string => String(value).replace('.', ',');

/** Hur många klipp i registret och utanför det som bär rörelsen i sin post (`move`), och paketen som är gjorda med den. */
function usesOf(root: string): { clips: Map<string, number>; left: Map<string, number>; packages: Map<string, string[]> } {
  const clips = new Map<string, number>();
  const left = new Map<string, number>();
  const packages = new Map<string, string[]>();
  for (const entry of readRegistry(root).assets) {
    const move = text(entry.move);
    if (move) clips.set(move, (clips.get(move) ?? 0) + 1);
  }
  for (const row of query(root, 'SELECT post FROM left_out WHERE post IS NOT NULL').rows) {
    let move: string | null = null;
    try {
      move = text((JSON.parse(String(row.post)) as Json).move);
    } catch {
      move = null;
    }
    if (move) left.set(move, (left.get(move) ?? 0) + 1);
  }
  const base = join(root, 'output', 'tagningar');
  if (existsSync(base)) {
    for (const id of readdirSync(base).sort()) {
      const order = join(base, id, 'bestallning.json');
      if (!existsSync(order)) continue;
      try {
        const cycle = text(readJson(order).cycle);
        if (cycle) packages.set(cycle, [...(packages.get(cycle) ?? []), id]);
      } catch {
        // Ett paket som håller på att skrivas läses nästa gång.
      }
    }
  }
  return { clips, left, packages };
}

/** Varför en rörelse inte får skrivas över, i ord, eller null. */
function lockOf(info: Omit<MoveInfo, 'locked'>): string | null {
  const why: string[] = [];
  const one = (count: number, single: string, many: string): string => (count === 1 ? single : many);
  if (info.clips > 0) why.push(`${info.clips} klipp i registret är ${one(info.clips, 'gjort', 'gjorda')} med den, och registrets mätningar hänvisar till ${one(info.clips, 'det', 'dem')}`);
  if (info.left > 0) why.push(`${info.left} klipp som har lämnat registret (arkiverade eller borttagna) är ${one(info.left, 'gjort', 'gjorda')} med den`);
  if (info.packages.length === 1) why.push('ett paket i output/tagningar/ är gjort med den');
  else if (info.packages.length > 1) why.push(`${info.packages.length} paket i output/tagningar/ är gjorda med den`);
  if (info.usedBy.length > 0) why.push(`${info.usedBy.join(', ')} bygger på den`);
  if (info.kind === 'giv') why.push('den är en läst giv, inte en cykel');
  else if (!info.madeInLab) why.push('den är inte gjord i Labbet');
  return why.length > 0 ? why.join('; ') : null;
}

/** Rörelserna i content/moves/, i namnordning. */
export function listMoves(root: string): MoveInfo[] {
  const dir = movesDir(root);
  if (!existsSync(dir)) return [];
  const uses = usesOf(root);
  const read = readdirSync(dir)
    .filter((file) => file.endsWith('.json') && MOVE_NAME.test(file.slice(0, -5)))
    .sort()
    .flatMap((file) => {
      try {
        return [{ name: file.slice(0, -5), json: readJson(join(dir, file)) }];
      } catch {
        return [];
      }
    });
  return read.map(({ name, json }) => {
    // En cykel pekar ut sin giv (`give`); det är så filen säger att den är en cykel (src/scene/dollPose.ts, isCycle).
    const give = text(json.give);
    const source = text(json.source);
    const info = {
      name,
      kind: give ? ('cykel' as const) : ('giv' as const),
      about: text(json.about) ?? '',
      seconds: typeof json.seconds === 'number' ? json.seconds : null,
      give,
      basis: text(json.basis),
      source,
      madeInLab: source?.startsWith(MADE_IN_LAB) ?? false,
      clips: uses.clips.get(name) ?? 0,
      left: uses.left.get(name) ?? 0,
      packages: uses.packages.get(name) ?? [],
      usedBy: read.filter((other) => other.json.give === name).map((other) => other.name),
    };
    return { ...info, locked: lockOf(info) };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Pröva en cykel som inte är sparad

/**
 * Cykeln `cycle` prövad med samma läsare som resten (src/pipeline/cykel.ts, readCycleParts: readCycle och readMove), i
 * en tillfällig mapp med scenen, dockan och cykelns giv ur `root`. `use` får delarna; mappen tas bort efteråt. Felet
 * säger vad som inte går ihop.
 */
async function withCycle<T>(root: string, cycle: unknown, use: (parts: import('../pipeline/cykel.ts').CycleParts) => T | Promise<T>): Promise<T> {
  if (!cycle || typeof cycle !== 'object' || Array.isArray(cycle)) throw new MoveError('Cykeln ska vara ett objekt med cykelns värden');
  const give = text((cycle as Json).give);
  if (!give || !MOVE_NAME.test(give)) throw new MoveError('Cykeln säger inte vilken giv den bygger på (give)');
  const giveFile = join(movesDir(root), `${give}.json`);
  if (!existsSync(giveFile)) throw new MoveError(`Given ${give} finns inte i content/moves/`);
  const { readCycleParts } = await import('../pipeline/cykel.ts');
  const dir = mkdtempSync(join(tmpdir(), 'labbet-rorelse-'));
  try {
    mkdirSync(join(dir, 'content', 'moves'), { recursive: true });
    for (const file of ['scene.json', 'doll.json']) writeFileSync(join(dir, 'content', file), readFileSync(join(root, 'content', file)));
    writeFileSync(join(dir, 'content', 'moves', `${give}.json`), readFileSync(giveFile));
    writeFileSync(join(dir, 'content', 'moves', 'prov.json'), JSON.stringify(cycle));
    let parts;
    try {
      parts = readCycleParts('prov', dir);
    } catch (error) {
      // Läsarnas fel säger på svenska vad som saknas eller inte går ihop (readCycle, readMove).
      throw new MoveError((error as Error).message);
    }
    return await use(parts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Platsen, kortplatsen och handlingen ur det Labbet skickade. */
function cardOf(body: Json): { seat: Seat; index: number; action: Action } {
  const seat = body.seat === 'D' ? 'D' : Number.isInteger(body.seat) && (body.seat as number) > 0 ? (body.seat as number) : null;
  if (seat === null) throw new MoveError('Platsen ska vara 1–7 eller D för dealern');
  const index = Number.isInteger(body.index) && (body.index as number) >= 0 ? (body.index as number) : null;
  if (index === null) throw new MoveError('Kortplatsen ska vara ett heltal från 0');
  const action = (body.action ?? 'deal') as Action;
  if (!ACTIONS.includes(action)) throw new MoveError(`Handlingen ska vara ${ACTIONS.join(', ')}`);
  if (action !== 'deal' && seat !== 'D') throw new MoveError(`${action} gäller dealerns plats: välj D`);
  return { seat, index, action };
}

export type Measured = {
  /** Måtten som har en gräns, prövade som tagning.ts forbered prövar dockan: handleden och rörelsens mått. */
  checks: { key: string; what: string; value: unknown; unit: string; limit: string; verdict: string }[];
  /** Alla rörelsens mått med vad de betyder (src/pipeline/rorelse.ts). */
  values: Record<string, { value: number | null; what: string }>;
};

/**
 * Dockans mått för cykeln i `body` (`cycle`, `seat`, `index`, `action`): handleden när kortet läggs (tagning.ts,
 * dollWrist) och rörelsens mått (rorelse.ts, dollMotion), prövade mot gränserna i content/tagning.json som när ett paket
 * görs. Ingenting sparas.
 */
export async function measureMove(root: string, body: unknown): Promise<Measured> {
  const asked = (body ?? {}) as Json;
  const card = cardOf(asked);
  const [{ cycleMove }, { dollMotion }, { dollWrist, readTagning }, { judgeOne }] = await Promise.all([
    import('../pipeline/cykel.ts'),
    import('../pipeline/rorelse.ts'),
    import('../pipeline/tagning.ts'),
    import('../pipeline/matning.ts'),
  ]);
  const content = readTagning(root);
  return withCycle(root, asked.cycle, (parts) => {
    let moved;
    try {
      moved = cycleMove(parts, card);
    } catch (error) {
      throw new MoveError((error as Error).message);
    }
    const values = dollMotion(parts, moved, content.motion, content.reference.fps);
    const judged = [];
    if (content.limits.dockansHandled) judged.push(judgeOne('dockansHandled', dollWrist(parts, card), content.limits.dockansHandled));
    for (const [key, { value }] of Object.entries(values)) if (content.limits[key] && value !== null) judged.push(judgeOne(key, value, content.limits[key]!));
    // Gränsens källa är lång och står i content/tagning.json; Labbet visar vad måttet är, värdet och gränsen.
    return { checks: judged.map(({ source: _source, ...rest }) => rest), values };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Spara en ny rörelse

/** Löven i ett JSON-värde: vägen och värdet, för att jämföra två cykler. */
function leaves(value: unknown, path: string[] = [], into = new Map<string, unknown>()): Map<string, unknown> {
  if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value as Json)) leaves(inner, [...path, key], into);
  } else {
    into.set(path.join('.'), value);
  }
  return into;
}

const IGNORED = new Set(['about', 'id', 'source', 'basis', 'schemaVersion']);
const said = (value: unknown): string => (typeof value === 'number' ? shown(value) : value === undefined ? 'inget' : String(value));

/** Det som skiljer cykeln `next` från `before`, värde för värde: "parts.deal 1,6 → 1,4". */
export function changesBetween(before: unknown, next: unknown): string[] {
  const a = leaves(before);
  const b = leaves(next);
  const keys = [...new Set([...a.keys(), ...b.keys()])].filter((key) => !IGNORED.has(key.split('.')[0]!));
  return keys.filter((key) => a.get(key) !== b.get(key)).map((key) => `${key} ${said(a.get(key))} → ${said(b.get(key))}`);
}

/** Ett värde som filerna i content/moves/ skriver det: korta grupper på en rad, längre uppdelade, två blanksteg in. */
function written(value: unknown, indent = ''): string {
  const flat = (inner: unknown): string =>
    Array.isArray(inner) ? `[${inner.map(flat).join(', ')}]` : inner && typeof inner === 'object' ? `{ ${Object.entries(inner).map(([key, part]) => `${JSON.stringify(key)}: ${flat(part)}`).join(', ')} }` : JSON.stringify(inner);
  const short = flat(value);
  if (!value || typeof value !== 'object' || Array.isArray(value) || indent.length + short.length <= 120) return short;
  const inner = `${indent}  `;
  return `{\n${Object.entries(value as Json).map(([key, part]) => `${inner}${JSON.stringify(key)}: ${written(part, inner)}`).join(',\n')}\n${indent}}`;
}

export type Saved = { name: string; file: string; overwrote: boolean; changes: string[] };

/**
 * Sparar cykeln i `body` som content/moves/<name>.json: `cycle` är cykelns värden så som de är ändrade ur rörelsen
 * `from`, och `note` Jakobs egna ord om varför. Namnet, about, source och basis skrivs här: about och source säger vad
 * som ändrats ur `from`, och basis är antaget. Den skrivs bara om den går igenom läsaren, och aldrig över en rörelse
 * som är låst (listMoves, locked). `now` är tiden som registret skriver den.
 */
export async function saveMove(root: string, body: unknown, now: string): Promise<Saved> {
  const asked = (body ?? {}) as Json;
  const name = text(asked.name)?.trim() ?? '';
  if (!MOVE_NAME.test(name)) throw new MoveError('Namnet ska vara 1–80 tecken: små bokstäver a–z, siffror och bindestreck, och börja med en bokstav eller siffra');
  const from = text(asked.from) ?? '';
  if (!MOVE_NAME.test(from) || !existsSync(join(movesDir(root), `${from}.json`))) throw new MoveError(`Rörelsen den är ändrad ur (${from || 'inget namn'}) finns inte i content/moves/`);
  const note = text(asked.note)?.trim() ?? '';
  if (note.length > 2000) throw new MoveError('Orden om varför är för långa (högst 2 000 tecken)');
  const cycle = asked.cycle;
  if (!cycle || typeof cycle !== 'object' || Array.isArray(cycle)) throw new MoveError('Cykeln ska vara ett objekt med cykelns värden');

  // Låsen läses ur registret och paketen. Går registret inte att läsa går det inte att se om ett klipp är gjort med den.
  let moves: MoveInfo[];
  try {
    moves = listMoves(root);
  } catch (error) {
    throw new MoveError(`Registret gick inte att läsa, så det går inte att se om ett klipp är gjort med rörelsen: ${(error as Error).message}`);
  }
  const existing = moves.find((move) => move.name === name);
  if (existing?.locked) throw new MoveError(`${name} finns redan och skrivs inte över: ${existing.locked}. Välj ett nytt namn.`);

  const before = readJson(join(movesDir(root), `${from}.json`));
  const changes = changesBetween(before, cycle);
  if (changes.length === 0 && name === from) throw new MoveError('Ingenting är ändrat');
  const listed = changes.length > 0 ? changes.join('; ') : 'inga värden ändrade';
  const words = note ? ` Jakobs ord: ${/[.!?]$/.test(note) ? note : `${note}.`}` : '';
  // Fälten i den ordning ursprunget har dem; namnet, about, source och basis skrivs här.
  const made: Json = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(cycle as Json)])) made[key] = (cycle as Json)[key] ?? before[key];
  Object.assign(made, {
    id: name,
    about: `Ändrad i Labbet ur ${from} (läs dess about): ${listed}.${words}`,
    basis: 'antaget',
    source: `${MADE_IN_LAB} ${now}, ur ${from}: ${listed}.${words} Inte prövad i en beställning.`,
  });
  await withCycle(root, made, () => undefined);

  const file = join(movesDir(root), `${name}.json`);
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${written(made)}\n`);
  renameSync(temporary, file);
  return { name, file: `content/moves/${name}.json`, overwrote: existing !== undefined, changes };
}
