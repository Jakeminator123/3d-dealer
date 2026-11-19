// Tagningarna som Labbets steg Klipp visar, och filerna ur deras paket. Bara läsning.
//
//   GET /api/tagningar           takes: varje klipp i registret som har ett paket i output/tagningar/, och de arkiverade
//                                underkända som har kvar sitt paket, med paketets mått och beställningen. waiting:
//                                paketen som väntar på att beställas (bestallning.json utan post.json).
//   GET /tagning/<paket>/<fil>   referens.mp4 (dockans förlaga), ark.jpg, bevis.mp4, forsta.png, sista.png och
//                                ark-docka.jpg ur paketet, och klippet.mp4: ett arkiverat klipp ur output/work/arkiv/.
//                                Ett klipp i assets/ hämtas genom /media/.
//
// Paketen görs av src/pipeline/tagning.ts (forbered och ta-emot); här läses bara bestallning.json och matning.json.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clipAnchor } from '../pipeline/dealer.ts';
import { ARCHIVE, query, viewRegistry, type RegistryEntry } from '../pipeline/registry.ts';
import { pathInside } from './files.ts';

/**
 * Paketets filer som Labbet visar: stegen Klipp och Dockan. Inga andra lämnas ut. forsta.png och sista.png är bilderna
 * filmen börjar och slutar på, ark-docka.jpg dockans film som rutor, och referensklipp.mp4 det godkända klippet som
 * skickades i stället för dockans film (tagning.ts forbered --referensklipp).
 */
export const TAKE_FILES = ['referens.mp4', 'ark.jpg', 'bevis.mp4', 'klippet.mp4', 'forsta.png', 'sista.png', 'ark-docka.jpg', 'referensklipp.mp4'] as const;
export type TakeFile = (typeof TAKE_FILES)[number];

/** De mått ur matning.json som steget alltid visar; de andra visas när de ligger utanför sin gräns. */
const SHOWN = ['takt', 'kortetsMitt', 'kortetsOverlapp', 'kortetLigger'];

const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/;

export type Judged = { key: string; what: string; value: unknown; unit: string; limit: string; verdict: string };
type Row = Record<string, unknown>;
type Seat = number | 'D';

export type Take = {
  /** Paketets namn i output/tagningar/. */
  id: string;
  /** Registernamnet under assets/ (eller där filen stod innan den arkiverades). */
  file: string;
  title: string;
  dealer: string | null;
  view: unknown;
  seat: Seat | null;
  index: number | null;
  action: string;
  take: number | null;
  move: string | null;
  /** Ordet som skiljer en tagning som görs på ett annat sätt än serien (tagning.ts forbered --variant), eller null. */
  variant: string | null;
  /** REDO-ankaret klippet är gjort ur (dealer.ts, clipAnchor). */
  anchor: string | null;
  status: string;
  statusBy: string | null;
  statusAt: string | null;
  comment: string | null;
  reply: string | null;
  /** Filen finns i assets/. */
  present: boolean;
  archived: { at: string | null; why: string } | null;
  /** Vilka av TAKE_FILES som går att hämta för tagningen. */
  files: TakeFile[];
  bytes: number | null;
  /** Filmens format som ta-emot mätte det (matning.json, film), och om nedladdningen bar ljud. */
  film: { width?: number; height?: number; fps?: number; frames?: number; seconds?: number; codec?: string; audio?: boolean } | null;
  soundInDownload: boolean | null;
  /** Tiderna i klippet och i dockans film, i sekunder (matning.json, seconds och doll). */
  times: { clip: Record<string, number | null>; doll: Record<string, number | null> } | null;
  judged: { inside: number; total: number; shown: Judged[] } | null;
  /** Dockans film i paketet (referens.mp4), skickad eller inte: bestallning.json, doll.film, annars inputs.referenceVideos. */
  reference: { frames: number | null; fps: number | null; seconds: number | null } | null;
  /** Det som skickades till filmmodellen som film (sentOf). */
  sent: Sent;
  /** Det paketet beställde: modell, upplösning, längd och bildformat. */
  request: { model: string | null; resolution: string | null; duration: number | null; ratio: string | null; made: string | null };
  /** Beställningen i registret (orders), med längden ur dess indata. */
  order: { at: string | null; model: string; credits: number | null; basis: string; seconds: number | null; received: boolean } | null;
  eye: unknown;
  shoe: unknown;
  place: unknown;
  lands: unknown;
};

/**
 * Filmen som skickas med första och sista bilden (bestallning.json, inputs, så som src/pipeline/tagning.ts forbered
 * skriver det): dockans film (`docka`, inputs.referenceVideos), ett godkänt klipp i dess ställe (`klipp`, som
 * rörelsereferens i referenceVideos eller som filmen som görs om i referenceVideo, med klippets registernamn), eller
 * ingen film (`ingen`).
 */
export type Sent = { kind: 'docka' | 'klipp' | 'ingen'; role: 'referenceVideos' | 'referenceVideo' | null; asset: string | null; frames: number | null; fps: number | null; seconds: number | null };

export type Waiting = { id: string; dealer: string | null; view: string | null; seat: Seat | null; index: number | null; action: string; take: number | null; move: string | null; anchor: string | null; clip: string | null; made: string | null; sent: Sent['kind'] };
export type Takes = { takes: Take[]; waiting: Waiting[] };

const readJson = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const count = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const seatOf = (value: unknown): Seat | null => (value === 'D' ? 'D' : Number.isInteger(value) ? (value as number) : null);
const quoted = (value: string): string => `'${value.replaceAll("'", "''")}'`;

type Package = { id: string; dir: string; order: any };

function packagesOf(root: string): Package[] {
  const base = join(root, 'output', 'tagningar');
  if (!existsSync(base)) return [];
  const found: Package[] = [];
  for (const id of readdirSync(base).sort()) {
    const dir = join(base, id);
    if (!PACKAGE.test(id) || !existsSync(join(dir, 'bestallning.json'))) continue;
    try {
      found.push({ id, dir, order: readJson(join(dir, 'bestallning.json')) });
    } catch {
      // Ett paket som håller på att skrivas läses nästa gång.
    }
  }
  return found;
}

/** Var ett arkiverat klipp ligger nu, om det ligger i arkivet. */
function archivedPath(root: string, place: unknown): string | null {
  if (typeof place !== 'string' || !place.startsWith(`${ARCHIVE}/`)) return null;
  const path = pathInside(join(root, ARCHIVE), place.slice(ARCHIVE.length + 1));
  return path && existsSync(path) ? path : null;
}

/** Det paketet skickar som film (Sent): ur inputs, och klippets namn ur filen eller motionFrom. */
export function sentOf(order: any): Sent {
  const inputs = order?.inputs ?? {};
  const one = inputs.referenceVideo ?? (Array.isArray(inputs.referenceVideos) ? inputs.referenceVideos[0] : undefined);
  if (!one) return { kind: 'ingen', role: null, asset: null, frames: null, fps: null, seconds: null };
  const role = inputs.referenceVideo ? 'referenceVideo' : 'referenceVideos';
  const asset = text(one.asset) ?? text(order?.motionFrom?.file);
  const clip = asset !== null || String(one.file ?? '').endsWith('/referensklipp.mp4');
  return { kind: clip ? 'klipp' : 'docka', role, asset, frames: count(one.frames), fps: count(one.fps), seconds: count(one.durationSeconds) };
}

/** Dockans film i paketet: den som står i doll.film när ett klipp skickades i dess ställe, annars den som skickades. */
function dollFilmOf(order: any): Take['reference'] {
  const film = order?.doll?.film ?? (sentOf(order).kind === 'docka' ? order?.inputs?.referenceVideos?.[0] : undefined);
  return film ? { frames: count(film.frames), fps: count(film.fps), seconds: count(film.durationSeconds) } : null;
}

const durationOf = (inputs: unknown): number | null => {
  try {
    return count(JSON.parse(String(inputs ?? '{}')).duration);
  } catch {
    return null;
  }
};

function takeOf(root: string, pkg: Package, entry: RegistryEntry & { present?: boolean }, archived: { at: string | null; why: string; place: unknown } | null, verdict: Row | undefined, order: Row | undefined): Take {
  const matningPath = join(pkg.dir, 'matning.json');
  let matning: any = null;
  try {
    matning = existsSync(matningPath) ? readJson(matningPath) : null;
  } catch {
    matning = null;
  }
  const judged: any[] = Array.isArray(matning?.judged) ? matning.judged : [];
  const lands = (entry.lands ?? {}) as { seat?: unknown; index?: unknown };
  const files = TAKE_FILES.filter((name) => (name === 'klippet.mp4' ? archived !== null && archivedPath(root, archived.place) !== null : existsSync(join(pkg.dir, name))));
  return {
    id: pkg.id,
    file: entry.file,
    title: String(entry.title ?? ''),
    dealer: text(entry.dealer) ?? text(pkg.order.dealer),
    view: entry.view ?? pkg.order.view ?? null,
    seat: seatOf(entry.seat ?? lands.seat ?? pkg.order.seat),
    index: count(entry.index ?? lands.index ?? pkg.order.index),
    action: String(entry.action ?? pkg.order.action ?? 'deal'),
    take: count(entry.take ?? pkg.order.take),
    move: text(entry.move) ?? text(pkg.order.cycle),
    variant: text(pkg.order.variant),
    anchor: clipAnchor(entry) ?? text(pkg.order.anchor),
    status: archived ? String(verdict?.status ?? entry.status) : entry.status,
    statusBy: archived ? (text(verdict?.who) ?? text(entry.statusBy)) : text(entry.statusBy),
    statusAt: archived ? (text(verdict?.at) ?? text(entry.statusAt)) : text(entry.statusAt),
    comment: text(entry.comment),
    reply: text(entry.reply),
    present: archived === null && entry.present !== false,
    archived: archived ? { at: archived.at, why: archived.why } : null,
    files,
    bytes: count(entry.bytes),
    film: matning?.film ?? null,
    soundInDownload: typeof matning?.soundInDownload === 'boolean' ? matning.soundInDownload : null,
    times: matning?.seconds ? { clip: matning.seconds, doll: matning.doll ?? {} } : null,
    judged: matning
      ? {
          inside: judged.filter((one) => one.verdict === 'inom').length,
          total: judged.length,
          shown: judged
            .filter((one) => SHOWN.includes(one.key) || one.verdict !== 'inom')
            .map((one) => ({ key: String(one.key), what: String(one.what ?? one.key), value: one.value ?? null, unit: String(one.unit ?? ''), limit: String(one.limit ?? ''), verdict: String(one.verdict ?? '') })),
        }
      : null,
    reference: dollFilmOf(pkg.order),
    sent: sentOf(pkg.order),
    request: { model: text(pkg.order.model), resolution: text(pkg.order.resolution), duration: count(pkg.order.duration), ratio: text(pkg.order.ratio), made: text(pkg.order.made) },
    order: order
      ? { at: text(order.at), model: String(order.model), credits: count(order.credits), basis: String(order.basis ?? ''), seconds: durationOf(order.inputs), received: String(order.note ?? '').includes('togs emot') }
      : null,
    eye: entry.eye ?? null,
    shoe: entry.shoe ?? null,
    place: entry.place ?? null,
    lands: entry.lands ?? null,
  };
}

/**
 * Tagningarna: registrets klipp som har ett paket, i registrets ordning, och sedan de arkiverade klipp vars senaste
 * omdöme är `utgår` och som har kvar sitt paket. Och paketen som väntar på beställning.
 */
export function listTakes(root: string): Takes {
  const packages = packagesOf(root);
  const byClip = new Map(packages.map((pkg) => [String(pkg.order.clip), pkg]));
  const registry = viewRegistry(root);
  const verdicts = new Map(
    query(root, "SELECT v.file, v.status, v.who, v.at FROM verdicts v WHERE v.id = (SELECT max(id) FROM verdicts w WHERE w.file = v.file)").rows.map((row) => [String(row.file), row]),
  );
  const orders = new Map<string, Row>();
  for (const row of query(root, 'SELECT at, model, credits, basis, inputs, result, note FROM orders WHERE result IS NOT NULL ORDER BY id').rows) orders.set(String(row.result), row);

  const takes: Take[] = [];
  for (const entry of registry.assets) {
    const pkg = entry.group === 'clips' ? byClip.get(entry.file) : undefined;
    if (pkg) takes.push(takeOf(root, pkg, entry, null, verdicts.get(entry.file), orders.get(entry.file)));
  }
  const listed = new Set(takes.map((take) => take.file));
  for (const row of query(root, "SELECT what, at, why, place, post FROM left_out WHERE how = 'arkiverad' ORDER BY id").rows) {
    const file = String(row.what);
    const pkg = byClip.get(file);
    if (!pkg || listed.has(file) || !row.post) continue;
    const post = JSON.parse(String(row.post)) as RegistryEntry;
    if (post.group !== 'clips' || verdicts.get(file)?.status !== 'utgår') continue;
    listed.add(file);
    takes.push(takeOf(root, pkg, post, { at: text(row.at), why: String(row.why ?? ''), place: row.place }, verdicts.get(file), orders.get(file)));
  }

  const waiting: Waiting[] = packages
    .filter((pkg) => !existsSync(join(pkg.dir, 'post.json')) && !listed.has(String(pkg.order.clip)))
    .map((pkg) => ({
      id: pkg.id,
      dealer: text(pkg.order.dealer),
      view: text(pkg.order.viewWord),
      seat: seatOf(pkg.order.seat),
      index: count(pkg.order.index),
      action: String(pkg.order.action ?? 'deal'),
      take: count(pkg.order.take),
      move: text(pkg.order.cycle),
      anchor: text(pkg.order.anchor),
      clip: text(pkg.order.clip),
      made: text(pkg.order.made),
      sent: sentOf(pkg.order).kind,
    }));
  return { takes, waiting };
}

/**
 * Filen `name` ur tagningen `id`, eller null: bara TAKE_FILES, bara ur ett paket i output/tagningar/, och klippet.mp4
 * bara när klippet är arkiverat och ligger i arkivet.
 */
export function takeFile(root: string, id: string, name: string): string | null {
  if (!(TAKE_FILES as readonly string[]).includes(name) || !PACKAGE.test(id) || id.includes('..')) return null;
  const dir = pathInside(join(root, 'output', 'tagningar'), id);
  if (!dir || !existsSync(join(dir, 'bestallning.json'))) return null;
  if (name !== 'klippet.mp4') {
    const path = join(dir, name);
    return existsSync(path) ? path : null;
  }
  let clip: unknown;
  try {
    clip = readJson(join(dir, 'bestallning.json')).clip;
  } catch {
    return null;
  }
  if (typeof clip !== 'string') return null;
  const row = query(root, `SELECT place FROM left_out WHERE how = 'arkiverad' AND what = ${quoted(clip)} ORDER BY id DESC LIMIT 1`).rows[0];
  return row ? archivedPath(root, row.place) : null;
}
