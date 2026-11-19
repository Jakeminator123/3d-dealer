// Tagningen: en filmbeställning av en cykel, från paketet som beställs till klippet i registret, på ett och samma sätt
// för varje dealer, vy, plats och kortplats. Runways MCP-server kan bara en agent anropa: koden förbereder allt före
// anropet och tar hand om allt efter.
//
//   node src/pipeline/tagning.ts forbered <dealer> <vy> <plats> <kort> [deal|hole|flip]
//     Gör paketet output/tagningar/<dealer>_<vy>_<slag>_<plats>-<kort>_t<n>/: första bilden (vyns REDO-ankare; i en
//     vändning med hålkortet målat gult), sista bilden (ankaret med märkkortet där dockan lägger det), dockans
//     referensfilm ur vyns närbild, texten, dockans film mätt och sedd som ark, och bestallning.json med allt MCP-anropet
//     behöver. Skriver ut vad agenten gör härnäst. Platsen är 1–7, eller D för dealern. Handlingen är deal (kortet läggs
//     med framsidan upp, utan den), hole (hålkortet läggs med baksidan upp) eller flip (hålkortet vänds där det ligger);
//     hole och flip gäller dealerns kort. Slaget är cykeln med handlingen: cykel-nyp, cykel-nyp-hole, cykel-nyp-flip.
//     [--cykel <namn>] en annan cykel i content/moves/; [--text <fil>] eller [--textnamn <namn>] en annan text än
//     mallens: ur en fil, eller en namngiven text ur content/tagning.json (prompt.named).
//     [--referensklipp <klipp> [--roll referenceVideos|referenceVideo]] skickar ett godkänt klipp ur registret i stället
//     för dockans film: som rörelsereferens (referenceVideos, om inget sägs) eller som filmen som görs om
//     (referenceVideo, video till video). Klippet ska göra samma kort ur samma ankare. Dockans film bakom klippet (dess
//     paket) står kvar i paketet som referens.mp4 och mäts som förut, men skickas inte. Ett sådant paket ska ha en egen
//     [--variant <ord>], som står efter slaget i namnen (cykel-nyp-rask-<ord>), så att tagningen skiljs från serien.
//     [--utan-referens] skickar ingen film alls: rörelsen är filmmodellens egen, styrd av första och sista bilden och
//     texten. Dockans film sparas ändå i paketet och mäts, som baslinje. Också den tagningen har en egen variant.
//     [--sedan 5-0,6-0] gör en följd: fler kort i samma tagning, med REDO emellan, utan referensfilm. Sista bilden har
//     alla korten målade; REDO mellan givarna mäts mot första och sista bilden, efter de kort filmen då har lagt (foljd.ts).
//     [--langd <s>] ger filmen en annan längd i hela sekunder än cyklernas. [--modell <id> --upplosning <r>] en annan
//     filmmodell, och [--bilder referens] skickar första bilden som referensbild och ingen sista bild, för en modell som
//     inte tar dem tillsammans med en referensfilm; en film i en annan upplösning mäts i en kopia skalad till rutan.
//   node src/pipeline/tagning.ts ta-emot <id> <nedladdad film> --task <taskId> --krediter <n> --saldo-fore <n> --saldo-efter <n> [--tid "ÅÅÅÅ-MM-DD TT:MM"]
//     Tar bort ljudet utan omkodning, mäter klippet mot bilderna, dockan och scenen och prövar måtten mot gränserna,
//     gör ark och beviset i scenen, skriver matning.json och post.json, och för in klippet, beställningen och måtten
//     i registret (registry.ts). Adresserna till de uppladdade filerna tas med om de står i paketets uppladdat.json.
//   node src/pipeline/tagning.ts mät-om <id>
//     Mäter om ett klipp som redan är taget emot, med dagens mätningar och scen: dockans film, klippet och beviset.
//     Ersätter matning.json, måtten i post.json och registrets mätningar från tagning.ts. Klippet, beställningen,
//     posten och omdömet rörs inte.
//   node src/pipeline/tagning.ts pröva
//     Kör forbered och ta-emot på pilottagningen (output/work/cykel/pilot/) och jämför talen med pilotens egna.
//
// Vyn är `spelaren` eller `plats-N`, kort är kortplatsens nummer på platsen (0 för den första). Det som tagningen byggs
// av och prövas mot står i content/tagning.json; vyns REDO-ankare och dealerns ord för texten i hennes fil
// (content/dealers/<dealer>.json, dealer.ts); scenen, dockan och cykeln i content/scene.json, doll.json och moves/.
// Mätningarna står i matning.ts. STUDIO_DATA pekar ut ett annat register, som för npm run reg.
//
// Registrets post för ett klipp bär `seat` (1–7, eller "D" för dealern), `index` (kortplatsens nummer) och `action`
// ("deal", "hole" eller "flip"). Formen är bestämd: uppspelningen läser den (src/scene/round.ts).

import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { FilmEye } from '../scene/dealer.ts';
import { readScene, type Vec3 } from '../scene/description.ts';
import { ACTIONS, cardPlace, poseAt, type Action, type Seat } from '../scene/dollPose.ts';
import { see, viewEye, type Eye, type SeatView } from '../scene/geometry.ts';
import { dealerFile, fillText, placeholdersOf, readDealer, readMall, wordKeys, wordsOf, type Words } from './dealer.ts';
import { closeView, cycleEye, cycleMove, paintedPicture, placeWords, readCycleParts, type CycleCard, type CycleParts } from './cykel.ts';
import { limitsFor, readAdjusted } from './justerat.ts';
import { dollMotion, filmMotion, MotionError, motionNumbers, screenOf, type MotionMeasure } from './rorelse.ts';
import {
  countIn,
  cornerError,
  eachFrame,
  firstFrame,
  grow,
  isCyan,
  judge,
  judgeOne,
  layoutFor,
  probe,
  readDollFilm,
  readFilm,
  readPicture,
  valuesOf,
  whiteCorners,
  type DollRead,
  type Judged,
  type Layout,
  type Limit,
  type Measure,
  type Picture,
  type Probe,
  type Values,
} from './matning.ts';
import { anchorOf as clipAnchorOf, type RoundEntry } from '../scene/round.ts';
import { about, addMeasurement, addOrder, addUpload, dropMeasurements, getEntry, importAsset, registerPath, sha256Of, stamp, studioRoot, unsigned, type Order, type Post, type RegistryEntry } from './registry.ts';
import { measureSequence, type SequenceRead } from './foljd.ts';
import { restMotion, restPlaces } from './vila.ts';
import { shootAll } from './shoot.ts';

export class TagningError extends Error {}

const run = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '..', '..');
/** Vem som mätte, som det står i registrets mätningar. */
const WHO = 'src/pipeline/tagning.ts';
/** Var paketen ligger, räknat från projektmappen. */
export const PACKAGES = 'output/tagningar';

// ---------------------------------------------------------------------------------------------------------------------
// Det som står i content/tagning.json

export type TagningContent = {
  order: { tool: string; model: string; resolution: string; duration: number; least: number; ratio: string; source: string };
  reference: { studio: { screen: number[]; table: number[] }; fps: number };
  /**
   * `text` är texten för en giv. `actions` säger vad som byts i den för de andra handlingarna: varje par är en mening ur
   * `text` och den mening som står i stället, så att det som är lika står på ett ställe.
   */
  prompt: {
    text: string;
    source: string;
    actions: Record<Exclude<Action, 'deal' | 'wait'>, { replace: [string, string][]; source: string }> & { wait: { text: string; source: string } };
    /** Namngivna texter i stället för mallens (forbered --textnamn), var och en för en handling och med sin källa. */
    named?: Record<string, { text: string; action: Action; source: string }>;
  };
  proof: { background: { file: string; kind: '360' | 'platt'; turn: number; blur: number; exposure: number; mirror: boolean }; face: string; fps: number };
  measure: Measure;
  /** Hur rörelsens mått tas (rorelse.ts): stillhet, rörelse och grader per huvudbredd. */
  motion: MotionMeasure;
  limits: Record<string, Limit>;
};

export function readTagning(root = ROOT): TagningContent {
  const read = JSON.parse(readFileSync(join(root, 'content', 'tagning.json'), 'utf8')) as TagningContent & { limits: Record<string, unknown> };
  const wrong: string[] = [];
  const need = (ok: boolean, what: string) => {
    if (!ok) wrong.push(what);
  };
  for (const group of ['order', 'reference', 'prompt', 'proof', 'measure', 'motion', 'limits'] as const) {
    const marked = read[group] as { basis?: unknown; source?: unknown } | undefined;
    need((marked?.basis === 'mätt' || marked?.basis === 'antaget') && typeof marked?.source === 'string', `${group}: basis och source`);
  }
  need(typeof read.order?.model === 'string' && Number.isFinite(read.order?.duration) && Number.isFinite(read.order?.least) && read.order.least > 0, 'order: model, duration och least');
  need(Number.isFinite(read.measure?.frameMargin) && read.measure.frameMargin >= 0, 'measure.frameMargin');
  need(Number.isFinite(read.reference?.fps) && read.reference.fps > 0, 'reference.fps');
  need([read.motion?.still, read.motion?.moving, read.motion?.degrees, read.motion?.slowShare, read.motion?.yawPerShare].every((value) => Number.isFinite(value) && value! > 0) && [read.motion?.handBlend, read.motion?.restLeast, read.motion?.orderLeast, read.motion?.orderTurn].every((value) => Number.isFinite(value) && value! >= 0), 'motion: still, moving, degrees, slowShare och yawPerShare över 0, och handBlend, restLeast, orderLeast och orderTurn från 0');
  // Texten bär bara dealerns ord som platshållare (dealer.ts, fillText): det som gäller en viss dealer står i hennes fil.
  const known = wordKeys(readMall(root));
  const unknown = (text: unknown): boolean => typeof text !== 'string' || placeholdersOf(text).some((key) => !known.includes(key));
  need(!unknown(read.prompt?.text), `prompt.text: bara dealerns ord som platshållare (${known.join(', ')})`);
  need(typeof read.prompt?.actions?.wait?.text === 'string' && read.prompt.actions.wait.text !== '' && !unknown(read.prompt.actions.wait.text) && typeof read.prompt.actions.wait.source === 'string', 'prompt.actions.wait: text och source, med bara dealerns ord som platshållare');
  for (const action of ACTIONS.filter((entry): entry is Exclude<Action, 'deal' | 'wait'> => entry !== 'deal' && entry !== 'wait')) {
    const given = read.prompt?.actions?.[action];
    const pairs = Array.isArray(given?.replace) && given.replace.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((part) => typeof part === 'string' && part !== ''));
    need(pairs && typeof given?.source === 'string' && given.source !== '', `prompt.actions.${action}: replace (par av meningar) och source`);
  }
  for (const [name, named] of Object.entries(read.prompt?.named ?? {})) {
    need(WORD.test(name) && typeof named?.text === 'string' && named.text !== '' && !unknown(named.text) && ACTIONS.includes(named.action) && typeof named.source === 'string' && named.source !== '', `prompt.named.${name}: text med bara dealerns ord som platshållare, action (${ACTIONS.join(', ')}) och source`);
  }
  const limits = Object.fromEntries(Object.entries(read.limits ?? {}).filter(([key]) => key !== 'basis' && key !== 'source')) as Record<string, Limit>;
  for (const [key, limit] of Object.entries(limits)) {
    need(typeof limit.what === 'string' && typeof limit.source === 'string' && (limit.is !== undefined || limit.least !== undefined || limit.most !== undefined), `limits.${key}: what, source och en gräns`);
  }
  if (wrong.length > 0) throw new TagningError(`content/tagning.json går inte att använda: ${wrong.join('; ')}`);
  return { ...read, limits };
}

/**
 * Texten till filmmodellen för en handling: samma för varje plats och vy (content/tagning.json, prompt). För en giv är
 * det mallens text; för hålkortet och vändningen byts de meningar som handlingen kräver (prompt.actions). En mening som
 * inte står i texten precis en gång är ett fel: då har mallen ändrats utan att bytena har det. Sist fylls dealerns ord
 * (`words`, dealer.ts wordsOf): utan dem står inget som gäller en viss dealer, till exempel inga tatueringar.
 */
export function promptFor(content: TagningContent, action: Action = 'deal', words: Words = {}): string {
  if (action === 'deal') return fillText(content.prompt.text, words);
  // En väntan delar inget kort, så den har en egen text.
  if (action === 'wait') return fillText(content.prompt.actions.wait.text, words);
  let text = content.prompt.text;
  for (const [from, to] of content.prompt.actions[action].replace) {
    const at = text.indexOf(from);
    if (at < 0 || text.indexOf(from, at + 1) >= 0) throw new TagningError(`prompt.actions.${action}: "${from.slice(0, 60)}…" står inte precis en gång i texten`);
    text = text.slice(0, at) + to + text.slice(at + from.length);
  }
  return fillText(text, words);
}

/**
 * En namngiven text ur content/tagning.json (prompt.named) med dealerns ord ifyllda. Den gäller den handling den är
 * skriven för: för en annan är den ett fel, eftersom den då talar om fel kort.
 */
export function namedText(content: TagningContent, name: string, action: Action = 'deal', words: Words = {}): string {
  const named = content.prompt.named?.[name];
  if (!named) throw new TagningError(`content/tagning.json har ingen text som heter ${name} (prompt.named: ${Object.keys(content.prompt.named ?? {}).join(', ') || 'inga'})`);
  if (named.action !== action) throw new TagningError(`Texten ${name} är skriven för ${named.action}, inte för ${action}`);
  return fillText(named.text, words);
}

/** Dealerns ord för texten (dealer.ts, wordsOf), eller inga när hennes fil inte går att läsa. */
function wordsFor(root: string, dealer: string): Words {
  try {
    const mall = readMall(root);
    return wordsOf(readDealer(root, dealer, mall), mall);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Paketets namn

/**
 * En tagning: dealer, vy, plats (1–7 eller D), kortplats, handling (deal om inget sägs), cykel (cykel-nyp om inget
 * sägs) och variant: ett ord som skiljer tagningar som görs på ett annat sätt än serien (till exempel med ett färdigt
 * klipp som referens) från seriens, i paketets och klippets namn.
 */
export type Spec = {
  dealer: string; view: string; seat: Seat; index: number; action?: Action; cycle?: string; variant?: string;
  /** Kort som läggs efter det första i samma tagning, med REDO emellan: en följd (foljd.ts). Bara givar, utan referensfilm. */
  then?: { seat: Seat; index: number }[];
};

const WORD = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** Cykeln och handlingen efter den när den inte är deal: cykel-nyp, cykel-nyp-hole, cykel-nyp-flip. */
const moveKind = (spec: Spec, cycle: string): string => `${cycle}${(spec.action ?? 'deal') === 'deal' ? '' : `-${spec.action}`}`;
/** Slaget i ett namn: cykeln med handlingen, och varianten sist när den finns: cykel-nyp-rask, cykel-nyp-rask-klippref. */
const kindOf = (spec: Spec, cycle: string): string => `${moveKind(spec, cycle)}${spec.variant ? `-${spec.variant}` : ''}`;
/** Platsen i ett filnamn, med små bokstäver som registrets namn: 1–7, eller d för dealern. */
const seatName = (seat: Seat): string => (seat === 'D' ? 'd' : String(seat));
/** Korten i ett namn: plats-kort, och för en följd alla korten i ordning: 4-0, 4-0-5-0. */
const cardsName = (spec: Spec): string => [spec, ...(spec.then ?? [])].map((card) => `${seatName(card.seat)}-${card.index}`).join('-');
const prefixOf = (spec: Spec, cycle: string): string => `${spec.dealer}_${spec.view}_${kindOf(spec, cycle)}_${cardsName(spec)}`;
/**
 * Paketets namn: dealer, vy, slag, plats-kort och tagning, till exempel <dealer>_spelaren_cykel-nyp_4-0_t1 och
 * <dealer>_spelaren_cykel-nyp-hole_d-1_t1.
 */
export const packageId = (spec: Spec, cycle: string, take: number): string => `${prefixOf(spec, cycle)}_t${take}`;
/** Klippets namn i registret, som tagningarna där heter: dealers/<dealer>/clips/<slag>-<plats>-<kort>_<vy>_t<n>.mp4. */
export const clipFile = (spec: Spec, cycle: string, take: number): string =>
  `dealers/${spec.dealer}/clips/${kindOf(spec, cycle)}-${cardsName(spec)}_${spec.view}_t${take}.mp4`;

/** Det klippet gör, i ord: "plats 4, kort 1", "dealerns kort 0", "hålkortet (dealerns kort 1)", "vändningen av hålkortet (dealerns kort 1)". */
export function cardWords(seat: Seat, index: number, action: Action = 'deal'): string {
  const where = seat === 'D' ? `dealerns kort ${index}` : `plats ${seat}, kort ${index}`;
  if (action === 'wait') return 'väntan i REDO';
  return action === 'hole' ? `hålkortet (${where})` : action === 'flip' ? `vändningen av hålkortet (${where})` : where;
}

/** Nästa tagning av samma kort: en mer än den högsta som har ett paket. */
export function nextTake(out: string, spec: Spec, cycle: string): number {
  if (!existsSync(out)) return 1;
  const prefix = `${prefixOf(spec, cycle)}_t`;
  const taken = readdirSync(out)
    .filter((name) => name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)))
    .map((name) => Number(name.slice(prefix.length)));
  return taken.length ? Math.max(...taken) + 1 : 1;
}

const viewOf = (word: string): SeatView => {
  const view = closeView(word);
  return view.kind === 'plats' ? { kind: 'plats', seat: view.seat } : { kind: 'spelaren' };
};
const viewTitle = (view: SeatView): string => (view.kind === 'plats' ? `Plats ${view.seat}` : 'Spelaren');
const posix = (path: string): string => path.replaceAll('\\', '/');
const write = (path: string, value: unknown): void => writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);
const shown = (value: unknown): string => (typeof value === 'number' ? String(value).replace('.', ',') : String(value));

// ---------------------------------------------------------------------------------------------------------------------
// Ark: rutor ur en film i rader, med nummer och tid

type Tile = { image: Buffer; label: string };

async function tileOf(picture: Picture, label: string, width = 360): Promise<Tile> {
  const image = await sharp(picture.data, { raw: { width: picture.width, height: picture.height, channels: 3 } }).resize(width).png().toBuffer();
  return { image, label };
}

const escapeXml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Ett ark av rutorna, `columns` i bredd, som JPEG. Med 360 bp per ruta och fyra i bredd blir arket 1 440 bp brett. */
export async function makeSheet(tiles: Tile[], out: string, columns = 4): Promise<void> {
  if (tiles.length === 0) throw new TagningError('Inga rutor att lägga i arket');
  const meta = await sharp(tiles[0]!.image).metadata();
  const width = meta.width!;
  const height = meta.height!;
  const label = 22;
  const rows = Math.ceil(tiles.length / columns);
  const parts = tiles.flatMap((tile, k) => {
    const left = (k % columns) * width;
    const top = Math.floor(k / columns) * (height + label);
    const text = Buffer.from(`<svg width="${width}" height="${label}"><rect width="${width}" height="${label}" fill="#2f3337"/><text x="6" y="16" font-size="14" font-family="sans-serif" fill="#ffffff">${escapeXml(tile.label)}</text></svg>`);
    return [
      { input: text, left, top },
      { input: tile.image, left, top: top + label },
    ];
  });
  mkdirSync(dirname(out), { recursive: true });
  await sharp({ create: { width: columns * width, height: rows * (height + label), channels: 3, background: '#2f3337' } })
    .composite(parts)
    .jpeg({ quality: 85 })
    .toFile(out);
}

/** Var `every`:e ruta och den sista, som rutor till ett ark. */
function sheetCollector(frames: number, fps: number, every: number, what: string) {
  const tiles: Promise<Tile>[] = [];
  return {
    tiles,
    take: (picture: Picture, index: number): void => {
      if (index % every === 0 || index === frames - 1) tiles.push(tileOf(picture, `${what} ruta ${index}  ${(index / fps).toFixed(2).replace('.', ',')} s`));
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Dockan

/**
 * Dockans handled när kortet läggs och fingrarna vilar: största vinkeln mellan underarm och hand, i grader. Handen är den
 * som lägger kortet (move.carry, ur cykelns fil; vänster om inget sägs).
 */
export function dollWrist(parts: CycleParts, card: CycleCard): number {
  const { scene, doll } = parts;
  const move = cycleMove(parts, card);
  const side = move.carry ?? 'left';
  const from = Math.max(0, move.moments.rests - 6);
  const to = move.back?.letsGo ?? move.frameCount - 1;
  let most = 0;
  for (let frame = from; frame <= to; frame++) {
    const pose = poseAt(scene, doll, move, frame / move.fps);
    const { elbow, wrist } = pose.arms[side];
    const hand = pose.hands[side];
    const a = [wrist[0] - elbow[0], wrist[1] - elbow[1], wrist[2] - elbow[2]];
    const b = [hand[9]![0] - hand[0]![0], hand[9]![1] - hand[0]![1], hand[9]![2] - hand[0]![2]];
    const cos = (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (Math.hypot(...a) * Math.hypot(...b));
    most = Math.max(most, (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
  }
  return Math.round(most);
}

/**
 * Ögat ett REDO-ankare är gjort genom, ur dess post i registret (`eye`, som ett klipp bär det), eller null när registret
 * eller posten saknas eller posten inte bär något öga (äldre poster): då gäller vyns närbild i dag.
 */
export function anchorEyeOf(registry: string, file: string): Eye | null {
  if (!existsSync(registerPath(registry))) return null;
  const eye = getEntry(registry, file)?.eye as Partial<FilmEye> | undefined;
  const vector = (value: unknown): value is [number, number, number] => Array.isArray(value) && value.length === 3 && value.every((part) => Number.isFinite(part));
  if (!eye || !vector(eye.position) || !vector(eye.forward) || !(Number(eye.focalPx) > 0) || !(Number(eye.frame?.width) > 0) || !(Number(eye.frame?.height) > 0)) return null;
  return { position: [...eye.position], forward: [...eye.forward], focalPx: eye.focalPx!, frame: { width: eye.frame!.width, height: eye.frame!.height } };
}

/**
 * Hur nära rutans kant, i bildpunkter genom ögat `eye`, kortet och handen som lägger det kommer: kortets hörn och
 * givhandens punkter från att kortet ligger tills handen lämnar det, och det lagda kortets hörn i sista rutan. Negativt
 * när något är utanför rutan. En väntan lägger inget kort: där prövas handen i REDO.
 */
export function withinFrame(parts: CycleParts, card: CycleCard, eye: Eye): number {
  const move = cycleMove(parts, card);
  const from = card.action === 'wait' ? 0 : move.moments.rests;
  const to = card.action === 'wait' ? 0 : (move.back?.letsGo ?? move.frameCount - 1);
  const points: Vec3[] = [];
  for (let frame = from; frame <= to; frame++) {
    const pose = poseAt(parts.scene, parts.doll, move, frame / move.fps);
    points.push(...pose.hands[move.carry ?? 'left'], ...((pose.laid ?? pose.card)?.corners ?? []));
  }
  const last = poseAt(parts.scene, parts.doll, move, move.seconds).laid;
  if (last) points.push(...last.corners);
  let least = Infinity;
  for (const point of points) {
    const pixel = see(eye, point);
    if (!pixel) return -Infinity;
    least = Math.min(least, pixel.x, pixel.y, eye.frame.width - pixel.x, eye.frame.height - pixel.y);
  }
  return least;
}

/** Filmens längd för en cykel: cykelns sekunder uppåt till hela sekunder, och minst order.least (Kling 4 tar 3–30 s). */
export const durationFor = (content: TagningContent, seconds: number): number => Math.max(content.order.least, Math.ceil(seconds - 1e-9));

/** Dockans referensfilm ur vyns närbild i grå ateljé, sparad av scenen med shoot.ts. Svaret är filen, räknad från projektmappen. */
async function shootReference(content: TagningContent, cycle: string, view: SeatView, card: CycleCard, say: (text: string) => void): Promise<string> {
  const { seat, index, action } = card;
  const order = {
    view: { ...view, close: true },
    dealer: { kind: 'docka', move: cycle, pose: 'giv', seat, index, ...(action === 'deal' ? {} : { action }) },
    background: null,
    studio: content.reference.studio,
    shoe: true,
    still: false,
    fps: content.reference.fps,
  };
  const [result] = await shootAll([order], say);
  if (!result?.ok) throw new TagningError(`Dockans film gick inte att spara: ${result && !result.ok ? result.error : 'inget svar'}`);
  return result.saved.file;
}

/**
 * Mäter dockans referensfilm i paketet som klippet sedan mäts (matning.ts, readDollFilm) och skriver docka.json, och med
 * `sheet` arket ark-docka.jpg. Görs när paketet görs och igen när klippet mäts, så att dockans värden alltid är mätta med
 * samma kod som klippets. Svaret har också masken över skons bildpunkter som dockans arm aldrig täcker.
 */
async function measureDoll(root: string, dir: string, layout: Layout, measure: Measure, sheet: boolean): Promise<{ doll: DollRead; shoeFree: Uint8Array }> {
  const film = join(dir, 'referens.mp4');
  const facts = await probe(film);
  const tiles = sheetCollector(facts.frames, facts.fps, 6, 'docka');
  const start = await firstFrame(film, layout.frame);
  const { doll, shoeFree } = await readDollFilm(film, facts.fps, { layout, measure, key: null, start }, sheet ? (picture, index) => tiles.take(picture, index) : undefined);
  write(join(dir, 'docka.json'), {
    about:
      'Dockans referensfilm mätt som klippet sedan mäts (src/pipeline/matning.ts): tiderna i sekunder och rutor, givhandens bredd i bp i varje ruta, hur stor del av nästa kort i mynningen som syns i varje ruta (next), handen bortom handleden i bp (beyond), dockans egna kortmått (own) och hur många bildpunkter i skons ruta hennes arm aldrig täcker (shoe). Mätt, inte antaget.',
    film: posix(relative(root, film)),
    ...doll,
  });
  if (sheet) await makeSheet(await Promise.all(tiles.tiles), join(dir, 'ark-docka.jpg'));
  return { doll, shoeFree };
}

// ---------------------------------------------------------------------------------------------------------------------
// Ett färdigt klipp som referens

/** Klippet som det skickas: registrets namn, filen i assets/, omdömet, hur det skickas, och dockans film bakom det. */
type ClipSent = { file: string; path: string; status: string; role: ClipRole; dollFilm: string | null };
const GOOD = 'godkänd';

/** Klippets post i registret, när det är ett godkänt klipp och tagningen har en egen variant. Annars ett fel som säger vad. */
function clipEntry(registry: string, from: FromClip, spec: Spec): RegistryEntry {
  if (!(CLIP_ROLES as readonly string[]).includes(from.role)) throw new TagningError(`--roll ska vara ${CLIP_ROLES.join(' eller ')}, inte ${from.role}`);
  if (!spec.variant) throw new TagningError('En tagning med ett klipp som referens har en egen variant, så att den skiljs från serien: skriv --variant <ord>');
  const entry = existsSync(registerPath(registry)) ? getEntry(registry, from.file) : undefined;
  if (!entry) throw new TagningError(`${from.file} står inte i registret`);
  if (entry.group !== 'clips') throw new TagningError(`${from.file} är inget klipp (gruppen ${String(entry.group)})`);
  if (entry.status !== GOOD) throw new TagningError(`${from.file} är ${entry.status}: bara ett godkänt klipp ges som referens`);
  return entry;
}

/**
 * Prövar att klippet gör samma kort med samma cykel ur samma vy och samma REDO-ankare som tagningen, och att filen i
 * registrets assets/ är den registret känner. Svaret har dockans film bakom klippet, ur paketet det gjordes i (räknat
 * från projektmappen `root`), när den finns kvar.
 */
function sameCard(root: string, registry: string, entry: RegistryEntry, from: FromClip, spec: Spec & { cycle: string; action: Action }, view: SeatView, anchorFile: string): ClipSent {
  const seen = entry.view as { kind?: unknown; seat?: unknown } | undefined;
  const sameView = seen?.kind === view.kind && (view.kind !== 'plats' || seen?.seat === view.seat);
  const action = (entry.action as Action | undefined) ?? 'deal';
  if (entry.seat !== spec.seat || entry.index !== spec.index || action !== spec.action || entry.move !== spec.cycle || !sameView) {
    throw new TagningError(`${entry.file} gör ${cardWords(entry.seat as Seat, Number(entry.index), action)} med ${String(entry.move)} ur ${JSON.stringify(entry.view)}: inte samma som tagningen (${cardWords(spec.seat, spec.index, spec.action)} med ${spec.cycle} ur ${spec.view})`);
  }
  const made = clipAnchorOf(entry as RoundEntry);
  if (made !== anchorFile) throw new TagningError(`${entry.file} är gjort ur ${made ?? 'ett okänt ankare'}, inte ur vyns REDO-ankare ${anchorFile}: första och sista bilden passar inte klippet`);
  const path = join(registry, 'assets', entry.file);
  if (!existsSync(path)) throw new TagningError(`${entry.file} finns inte i assets/`);
  const known = (entry.source as { sha256?: string } | undefined)?.sha256;
  if (known && sha256Of(path) !== known) throw new TagningError(`${entry.file} i assets/ är inte filmen registret känner (sha256)`);
  const pkg = (entry.source as { package?: unknown } | undefined)?.package;
  const doll = typeof pkg === 'string' ? `${pkg}/referens.mp4` : null;
  return { file: entry.file, path, status: entry.status, role: from.role, dollFilm: doll && existsSync(join(root, doll)) ? doll : null };
}

// ---------------------------------------------------------------------------------------------------------------------
// forbered

export type Prepared = { id: string; dir: string; order: Record<string, unknown>; checks: Judged[] };
/** Hur ett färdigt klipp skickas: som rörelsereferens (referenceVideos) eller som filmen som görs om (referenceVideo). */
export const CLIP_ROLES = ['referenceVideos', 'referenceVideo'] as const;
export type ClipRole = (typeof CLIP_ROLES)[number];
/** Ett godkänt klipp ur registret som skickas i stället för dockans film, och hur. */
export type FromClip = { file: string; role: ClipRole };
export type PrepareOptions = {
  root?: string;
  out?: string;
  /** Tagningens nummer; annars nästa. */
  take?: number;
  /** Dockans film, när den redan finns (räknad från projektmappen), i stället för att scenen sparar en ny. */
  reference?: string;
  /** En annan text än mallens, ur en fil (--text), eller för en tagning som redan är beställd (pröva). */
  text?: string;
  /** En namngiven text ur content/tagning.json (prompt.named) i stället för mallens (--textnamn). */
  textName?: string;
  /** Ett godkänt klipp som skickas i stället för dockans film (--referensklipp, --roll). Kräver spec.variant. */
  fromClip?: FromClip;
  /** Ingen film skickas (--utan-referens): rörelsen är filmmodellens egen, styrd av bilderna och texten. Kräver spec.variant. */
  noReference?: boolean;
  /** Filmens längd i hela sekunder (--langd), i stället för cykelns (durationFor). */
  duration?: number;
  /** En annan filmmodell och upplösning än content/tagning.json säger (--modell, --upplosning). Kräver spec.variant. */
  model?: string;
  resolution?: string;
  /**
   * Hur bilderna skickas (--bilder): `ram` som första och sista bild (om inget sägs), eller `referens`: första bilden (REDO)
   * som referensbild och ingen sista bild, för en modell som inte tar första och sista bild tillsammans med en
   * referensfilm (Seedance). Då låser ingenting första och sista rutan.
   */
  frames?: 'ram' | 'referens';
  /** Registret där ankarets post står (med dess öga); annars projektets, eller STUDIO_DATA. */
  registry?: string;
  say?: (text: string) => void;
};

/** Gör paketet för en tagning. Se överst i filen. Går det inte, tas ett paket som gjordes nu bort, så att numret är ledigt. */
export async function forbered(spec: Spec, options: PrepareOptions = {}): Promise<Prepared> {
  const made: { dir?: string; fresh?: boolean } = {};
  try {
    return await prepare(spec, options, made);
  } catch (error) {
    if (made.fresh && made.dir) rmSync(made.dir, { recursive: true, force: true });
    throw error;
  }
}

async function prepare(spec: Spec, options: PrepareOptions, made: { dir?: string; fresh?: boolean }): Promise<Prepared> {
  const root = options.root ?? ROOT;
  const out = options.out ?? join(root, PACKAGES);
  const say = options.say ?? ((text: string) => console.log(text));
  const content = readTagning(root);
  const registry = options.registry ?? (options.root ? root : studioRoot());
  if (options.noReference && options.fromClip) throw new TagningError('Skriv --utan-referens eller --referensklipp, inte båda');
  // Ett färdigt klipp som referens: det ska stå i registret, vara godkänt, och tagningen ska ha en egen variant.
  const from = options.fromClip ? clipEntry(registry, options.fromClip, spec) : null;
  const cycle = spec.cycle ?? (typeof from?.move === 'string' ? from.move : 'cykel-nyp');
  const action = spec.action ?? 'deal';
  if (!WORD.test(spec.dealer)) throw new TagningError(`Ogiltig dealer: ${spec.dealer}`);
  if (!ACTIONS.includes(action)) throw new TagningError(`Okänd handling: ${action}. Skriv ${ACTIONS.join(', ')}.`);
  if (spec.variant !== undefined && (!WORD.test(spec.variant) || (ACTIONS as readonly string[]).includes(spec.variant))) throw new TagningError(`Ogiltig variant: ${spec.variant} (små bokstäver, siffror och bindestreck, och inte en handling)`);
  if (options.text !== undefined && options.textName !== undefined) throw new TagningError('Skriv --text eller --textnamn, inte båda');
  if (options.noReference && !spec.variant) throw new TagningError('En tagning utan referensfilm har en egen variant, så att den skiljs från serien: skriv --variant <ord>');
  if ((options.model || options.resolution || options.frames === 'referens') && !spec.variant) throw new TagningError('En tagning med en annan modell, upplösning eller roll för bilderna har en egen variant: skriv --variant <ord>');
  if (options.frames !== undefined && options.frames !== 'ram' && options.frames !== 'referens') throw new TagningError(`--bilder ska vara ram eller referens, inte ${options.frames}`);
  if (options.frames === 'referens' && (spec.then?.length ?? 0) > 0) throw new TagningError('En följd skickar första och sista bild (--bilder ram)');
  if (action !== 'deal' && spec.seat !== 'D') throw new TagningError(action === 'wait' ? 'Väntan görs vid dealerns plats: skriv plats D och kort 0' : `${action} gäller dealerns hålkort: skriv plats D`);
  // En följd: fler kort i samma tagning. Dockan har ingen film av en följd, så den görs utan referensfilm.
  const extra = spec.then ?? [];
  if (extra.length > 0 && action !== 'deal') throw new TagningError('En följd med flera kort gäller givar (deal)');
  if (extra.length > 0 && !options.noReference) throw new TagningError('En följd med flera kort görs utan referensfilm (--utan-referens): dockan har ingen film av en följd');
  if (options.duration !== undefined && !(Number.isInteger(options.duration) && options.duration >= content.order.least)) throw new TagningError(`--langd ska vara hela sekunder, minst ${content.order.least}`);
  const view = viewOf(spec.view);
  const parts = readCycleParts(cycle, root);
  const { scene } = parts;
  const places = spec.seat === 'D' ? scene.places.dealer : scene.places.seats.find((entry) => entry.seat === spec.seat)?.cards;
  if (!places) throw new TagningError(`Scenen har ingen plats ${spec.seat}`);
  if (!Number.isInteger(spec.index) || !places[spec.index]) throw new TagningError(`${spec.seat === 'D' ? 'Dealern' : `Plats ${spec.seat}`} har ingen kortplats ${spec.index}`);
  cardPlace(scene, spec.seat, spec.index);
  const card: CycleCard = { seat: spec.seat, index: spec.index, action };
  const words = cardWords(spec.seat, spec.index, action);
  // Vyns REDO-ankare och orden för texten står i dealerns fil (dealer.ts).
  const mall = readMall(root);
  const dealer = readDealer(root, spec.dealer, mall);
  const anchorFile = dealer.anchors.redo[spec.view];
  if (!anchorFile) throw new TagningError(`${dealerFile(spec.dealer)} säger inget REDO-ankare ur ${spec.view} (anchors.redo). Gör ett: node src/pipeline/ankare.ts förbered ${spec.dealer} ${spec.view}`);
  const anchor = join(root, 'assets', anchorFile);
  if (!existsSync(anchor)) throw new TagningError(`${anchorFile} finns inte i assets/`);
  // Ankarets öga: dockans film, kortets hörn och sista bilden görs genom det, så att ett ankare gäller också när
  // kortplanen ändras och närbilden räknas om. En äldre post utan eye: vyns närbild i dag, som förut.
  const anchorEye = anchorEyeOf(registry, anchorFile);
  // Klippet ska göra samma kort med samma cykel ur samma vy och samma ankare: första och sista bilden är dess.
  const clip = from ? sameCard(root, registry, from, options.fromClip!, { ...spec, cycle, action }, view, anchorFile) : null;
  const seen: CycleParts = anchorEye ? { ...parts, eye: anchorEye } : parts;
  const eye = cycleEye(seen, view);
  const margin = withinFrame(seen, card, eye);
  if (margin < content.measure.frameMargin) {
    throw new TagningError(
      `${words} ligger ${shown(Math.round(margin))} bp från kanten av ${anchorFile}s ruta (minst ${content.measure.frameMargin}, content/tagning.json measure.frameMargin): kortet eller handen som lägger det syns inte hela genom ankarets öga. Gör ankaret om i dagens närbild.`,
    );
  }
  const cards: CycleCard[] = [card, ...extra.map((next) => ({ seat: next.seat, index: next.index, action: 'deal' as const }))];
  const margins = [margin];
  for (const next of cards.slice(1)) {
    const nextPlaces = next.seat === 'D' ? scene.places.dealer : scene.places.seats.find((entry) => entry.seat === next.seat)?.cards;
    if (!nextPlaces || !Number.isInteger(next.index) || !nextPlaces[next.index]) throw new TagningError(`Scenen har ingen kortplats ${cardWords(next.seat, next.index)}`);
    const nextMargin = withinFrame(seen, next, eye);
    if (nextMargin < content.measure.frameMargin) throw new TagningError(`${cardWords(next.seat, next.index)} ligger ${shown(Math.round(nextMargin))} bp från kanten av ${anchorFile}s ruta (minst ${content.measure.frameMargin})`);
    margins.push(nextMargin);
  }

  const take = options.take ?? nextTake(out, spec, cycle);
  const id = packageId(spec, cycle, take);
  const dir = join(out, id);
  Object.assign(made, { dir, fresh: !existsSync(dir) });
  mkdirSync(dir, { recursive: true });
  const at = (file: string) => join(dir, file);

  // Första bilden är ankaret; i en vändning ligger hålkortet målat gult i den. Sista bilden har kortet som det ligger.
  const firstPainted = await paintedPicture(seen, anchor, card, 'first', at('forsta.png'), { ...view, close: true });
  if (!firstPainted) copyFileSync(anchor, at('forsta.png'));
  if (cards.length > 1) {
    return prepareSequence({ root, content, spec, cycle, view, parts, seen, eye, anchor, anchorFile, anchorEye, dir, id, take, cards, margins, text: options.text, textName: options.textName, duration: options.duration, words: wordsOf(dealer, mall), say });
  }
  // En väntan slutar som den börjar: sista bilden är ankaret.
  const painted = await paintedPicture(seen, anchor, card, 'last', at('sista.png'), { ...view, close: true });
  if (!painted) copyFileSync(anchor, at('sista.png'));

  // Dockans film: den som kom med, den bakom referensklippet (dess paket), eller en ny ur scenen.
  let source = options.reference ?? clip?.dollFilm ?? undefined;
  if (!source) {
    say(`Dockans film för ${words} ur ${spec.view} sparas i ${content.reference.fps} rutor/s${anchorEye ? ' genom ankarets öga' : ''} …`);
    source = await shootReference(content, cycle, anchorEye ? { ...view, eye } : view, card, say);
  }
  copyFileSync(join(root, source), at('referens.mp4'));
  const reference = await probe(at('referens.mp4'));
  if (clip) copyFileSync(clip.path, at('referensklipp.mp4'));
  const sentClip = clip ? await probe(at('referensklipp.mp4')) : null;
  const dealerWords = wordsOf(dealer, mall);
  const text = options.text ?? (options.textName ? namedText(content, options.textName, action, dealerWords) : promptFor(content, action, dealerWords));
  writeFileSync(at('text.txt'), text);

  // Dockans film mätt som klippet sedan mäts, och sedd som ark.
  const layout = layoutFor(seen, view, card, content.measure);
  const { doll } = await measureDoll(root, dir, layout, content.measure, true);

  const wrist = dollWrist(parts, card);
  // Cykeln prövas mot originalen, med det som är justerat för just den i originalets ställe (justerat.ts).
  const limits = limitsFor(content.limits, readAdjusted(root), parts.cycle.id);
  const checks = limits.dockansHandled ? [judgeOne('dockansHandled', wrist, limits.dockansHandled)] : [];
  // Dockans rörelse mot rörelsens gränser (rorelse.ts), innan något beställs: en stel docka ger ett stelt klipp.
  const moved = cycleMove(parts, card);
  const motion = motionNumbers(dollMotion(parts, moved, content.motion, content.reference.fps));
  // Ett mått som inte gäller slaget saknas (null) och prövas inte: en väntan har ingen väg ut och tillbaka, en vändning inga
  // tider för en giv, och ordningen mellan huvud och hand mäts bara när huvudet vrids (motion.orderTurn).
  for (const [key, value] of Object.entries(motion)) if (limits[key] && value !== null) checks.push(judgeOne(key, value, limits[key]!));
  const pkg = posix(relative(root, dir));
  const kind = moveKind(spec, cycle);
  const dollVideo = {
    file: `${pkg}/referens.mp4`,
    source: posix(source),
    sha256: sha256Of(at('referens.mp4')),
    durationSeconds: reference.seconds,
    frames: reference.frames,
    fps: reference.fps,
    note: `dockan gör ${kind}, ${words}, ur ${viewTitle(view)}s närbild i grå ateljé (mätt med ffprobe)`,
  };
  // Det som skickas som film: dockans, eller det godkända klippet i dess ställe (som rörelsereferens eller som filmen som
  // görs om). Dockans film står då kvar i paketet och mäts, men skickas inte.
  const clipVideo = clip && sentClip
    ? {
        file: `${pkg}/referensklipp.mp4`,
        asset: clip.file,
        sha256: sha256Of(at('referensklipp.mp4')),
        durationSeconds: sentClip.seconds,
        frames: sentClip.frames,
        fps: sentClip.fps,
        status: clip.status,
        note: `det godkända klippet ${clip.file} (${kind}, ${words}, ur ${anchorFile}) ${clip.role === 'referenceVideo' ? 'som filmen som görs om (referenceVideo, video till video)' : 'som rörelsereferens (referenceVideos)'}, i stället för dockans film (mätt med ffprobe)`,
      }
    : null;
  const free = options.noReference === true;
  const asReference = options.frames === 'referens';
  if (asReference && firstPainted) throw new TagningError('--bilder referens gäller en tagning som börjar i REDO utan kort');
  const sent = free ? {} : clipVideo ? (clip!.role === 'referenceVideo' ? { referenceVideo: clipVideo } : { referenceVideos: [clipVideo] }) : { referenceVideos: [dollVideo] };
  const sentRole: ClipRole | null = free ? null : (clip?.role ?? 'referenceVideos');
  const sentFile = free ? null : clipVideo ? 'referensklipp.mp4' : 'referens.mp4';
  const dollSent = !free && !clipVideo;
  const order = {
    about: `Beställningen av en tagning, gjord av src/pipeline/tagning.ts forbered. Allt Runways generate_video behöver: modell, upplösning, längd, text och vilka filer som är startFrame, endFrame${sentRole ? ` och ${sentRole}` : ''} (inputs: det som skickas, och inget annat${free ? '; ingen film skickas' : ''}). Filerna ligger i paketet; source och asset säger var de kommer ifrån. doll är dockans film, som klippet mäts mot${dollSent ? '' : '; den skickas inte'}.`,
    id,
    made: stamp(),
    dealer: spec.dealer,
    view,
    viewWord: spec.view,
    seat: spec.seat,
    index: spec.index,
    action,
    take,
    cycle,
    ...(spec.variant ? { variant: spec.variant } : {}),
    clip: clipFile(spec, cycle, take),
    anchor: anchorFile,
    ...(clip ? { motionFrom: { file: clip.file, role: clip.role, status: clip.status } } : {}),
    ...(free ? { noReference: true } : {}),
    model: options.model ?? content.order.model,
    resolution: options.resolution ?? content.order.resolution,
    // Filmen är lika lång som cykeln (en väntan kan ha sin egen längd), i hela sekunder och minst order.least (Kling 4 tar
    // 3–30 s); content/tagning.json säger vanliga längden (duration), som formatets gräns gäller.
    duration: options.duration ?? durationFor(content, moved.seconds),
    ratio: content.order.ratio,
    tool: content.order.tool,
    promptFile: `${pkg}/text.txt`,
    ...(options.textName ? { promptName: options.textName } : {}),
    prompt: text,
    ...(asReference ? { framesAs: 'referens', framesNote: 'Första bilden (REDO) skickas som referensbild och sista bilden inte alls: modellen tar inte första och sista bild tillsammans med en referensfilm. Ingenting låser första och sista rutan; forsta.png och sista.png står kvar i paketet och klippet mäts mot dem.' } : {}),
    inputs: asReference
      ? { referenceImages: [{ file: `${pkg}/forsta.png`, asset: anchorFile, sha256: sha256Of(at('forsta.png')), note: `vyns REDO-ankare (${dealerFile(spec.dealer)}, anchors.redo) som referensbild, oförändrat` }], ...sent }
      : {
      startFrame: firstPainted
        ? {
            file: `${pkg}/forsta.png`,
            sha256: sha256Of(at('forsta.png')),
            madeWith: `paintedPicture i src/pipeline/cykel.ts: ${anchorFile} med märkkortet målat ${firstPainted.side === 'baksida' ? 'gult' : 'blått'} där kortet ligger när ${kind} börjar, ${words}`,
            painted: firstPainted.painted,
            spared: firstPainted.spared,
            corners: firstPainted.corners,
          }
        : { file: `${pkg}/forsta.png`, asset: anchorFile, sha256: sha256Of(at('forsta.png')), note: `vyns REDO-ankare (${dealerFile(spec.dealer)}, anchors.redo), oförändrat` },
      endFrame: painted
        ? {
            file: `${pkg}/sista.png`,
            sha256: sha256Of(at('sista.png')),
            madeWith: `paintedPicture i src/pipeline/cykel.ts: ${anchorFile} med märkkortet målat ${painted.side === 'baksida' ? 'gult' : 'blått'} där ${kind} lägger kortet, ${words}`,
            painted: painted.painted,
            spared: painted.spared,
            corners: painted.corners,
          }
        : { file: `${pkg}/sista.png`, asset: anchorFile, sha256: sha256Of(at('sista.png')), note: 'vyns REDO-ankare, oförändrat: en väntan slutar som den börjar' },
      ...sent,
    },
    doll: {
      file: `${pkg}/docka.json`,
      ...(clipVideo ? { film: dollVideo, sent: false, filmFrom: clip!.dollFilm ? `dockans film bakom ${clip!.file} (dess paket)` : options.reference ? 'filmen som kom med (reference)' : 'sparad ur scenen nu, eftersom klippets paket inte har sin' } : {}),
      ...(free ? { film: dollVideo, sent: false, filmFrom: options.reference ? 'filmen som kom med (reference)' : 'sparad ur scenen nu, bara att mäta mot' } : {}),
      seconds: doll.seconds,
      wristDeg: wrist,
      sheet: `${pkg}/ark-docka.jpg`,
    },
    scene: {
      shoe: shoeOf(scene.shoe),
      eye: eyeOf(anchorEye ?? viewEye(scene, { ...view, close: true })),
      eyeFrom: anchorEye ? `${anchorFile}: ögat ankaret är gjort genom (registrets post, eye)` : `vyns närbild i content/scene.json (${anchorFile}s post saknar eye)`,
      frameMargin: Math.round(margin),
      place: cardPlace(scene, spec.seat, spec.index),
      source: 'content/scene.json när paketet gjordes: skon, som är inbakad i ankaret och klippet, ögat filmen görs genom (ankarets, eyeFrom), och kortplatsen kortet läggs på. frameMargin: hur nära rutans kant kortet och handen som lägger det kommer, i bp. Klippet mäts mot dem (partsOf), och posten bär dem (eye, shoe, place)',
    },
    checks,
    uploads: `${pkg}/uppladdat.json: [{ "role": ${asReference ? '"referenceImages"' : '"startFrame" | "endFrame"'}${sentRole ? ` | "${sentRole}"` : ''}, "url": "<adressen>", "assetId": "<id>", "at": "ÅÅÅÅ-MM-DD TT:MM" }]`,
  };
  write(at('bestallning.json'), order);

  say(`Paket: ${pkg}`);
  if (asReference) say(`  ${order.model}, ${order.resolution}: första bilden som referensbild, ingen sista bild; ingenting låser första och sista rutan`);
  say(`  första bild   forsta.png   (${anchorFile}${firstPainted ? `, med hålkortet målat gult: ${firstPainted.painted} bp` : ''})`);
  say(painted ? `  sista bild    sista.png    (märkkortet ${painted.side === 'baksida' ? 'gult' : 'blått'}, ${words}: ${painted.painted} bp målade)` : `  sista bild    sista.png    (${anchorFile}, som första)`);
  say(`  ${dollSent ? 'referens     ' : 'dockans film '} referens.mp4 (${shown(reference.seconds)} s, ${reference.frames} rutor, ${shown(reference.fps)} rutor/s)${dollSent ? '' : ', skickas inte'}`);
  if (clipVideo) say(`  ${sentRole!.padEnd(13)} referensklipp.mp4 (${clip!.file}, ${clip!.status}: ${shown(clipVideo.durationSeconds)} s, ${clipVideo.frames} rutor)`);
  if (free) say('  ingen film skickas: rörelsen är filmmodellens egen');
  say(`  text          text.txt${options.textName ? ` (content/tagning.json, prompt.named.${options.textName})` : ''}`);
  say(`  dockan        ark-docka.jpg; kortet ligger ${shown(doll.seconds.lands)} s, handen åter i skon ${shown(doll.seconds.home)} s`);
  for (const check of checks) say(`  ${check.verdict.toUpperCase().padEnd(9)} ${check.what}: ${shown(check.value)} ${check.unit} (${check.limit})`);
  say('Härnäst, för agenten:');
  say('  1. Se på ark-docka.jpg. Läs saldot (whoami eller show_plans_and_credits).');
  say(`  2. Ladda upp ${asReference ? 'forsta.png' : 'forsta.png, sista.png'}${sentFile ? ` och ${sentFile}` : ''} (init_upload, curl, complete_upload). Skriv adresserna i`);
  say(`     ${pkg}/uppladdat.json (formen står i bestallning.json, uploads).`);
  say(`  3. generate_video: ${order.model}, ${order.resolution}, ${order.duration} s, ${content.order.ratio}; ${asReference ? 'referenceImages [forsta.png], ingen första eller sista bild' : 'startFrame forsta.png,'}`);
  say(`     ${asReference ? '' : 'endFrame sista.png, '}${!sentRole ? 'ingen referensfilm' : sentRole === 'referenceVideo' ? `referenceVideo ${sentFile} med durationSeconds ur bestallning.json` : `referenceVideos [${sentFile}] med durationSeconds ur bestallning.json`}, texten ur text.txt.`);
  say('  4. Läs saldot igen och ladda ned filmen. Sedan:');
  say(`     node src/pipeline/tagning.ts ta-emot ${id} <film> --task <taskId> --krediter <n> --saldo-fore <n> --saldo-efter <n>`);
  return { id, dir, order, checks };
}

// ---------------------------------------------------------------------------------------------------------------------
// En följd: flera kort i samma tagning, med REDO emellan

type SequenceContext = {
  root: string; content: TagningContent; spec: Spec; cycle: string; view: SeatView; parts: CycleParts; seen: CycleParts; eye: Eye;
  anchor: string; anchorFile: string; anchorEye: Eye | null; dir: string; id: string; take: number; cards: CycleCard[]; margins: number[];
  text?: string; textName?: string; duration?: number; words: Words; say: (text: string) => void;
};

/**
 * Paketet för en följd: första bilden (REDO), sista bilden (alla korten), texten och bestallning.json. Ingen film skickas och ingen dockfilm görs:
 * dockan har ingen film av en följd. Tagningen mäts mot bilderna (foljd.ts).
 */
async function prepareSequence(context: SequenceContext): Promise<Prepared> {
  const { root, content, spec, cycle, view, parts, seen, eye, anchor, anchorFile, anchorEye, dir, id, take, cards, margins, say } = context;
  const at = (file: string) => join(dir, file);
  const pkg = posix(relative(root, dir));
  const { scene } = parts;
  // Korten målas ett i taget, vart och ett på bilden före, och sista.png har alla. Bilderna däremellan tas bort: REDO
  // mellan givarna mäts mot första och sista bilden, efter de kort filmen då har lagt (foljd.ts).
  const painted: NonNullable<Awaited<ReturnType<typeof paintedPicture>>>[] = [];
  const steps: string[] = [];
  let source = anchor;
  for (const [k, card] of cards.entries()) {
    const file = k === cards.length - 1 ? 'sista.png' : `steg-${k + 1}.png`;
    const made = await paintedPicture(seen, source, card, 'last', at(file), { ...view, close: true });
    if (!made) throw new TagningError(`${cardWords(card.seat, card.index)}: cykeln lägger inget kort`);
    painted.push(made);
    source = at(file);
    if (file !== 'sista.png') steps.push(at(file));
  }
  for (const step of steps) rmSync(step, { force: true });
  const allWords = cards.map((card) => cardWords(card.seat, card.index)).join(', sedan ');
  const text = context.text ?? (context.textName ? namedText(content, context.textName, 'deal', context.words) : null);
  if (!text) throw new TagningError('En följd har ingen text i mallen: skriv --textnamn <namn> eller --text <fil>');
  writeFileSync(at('text.txt'), text);
  const seconds = cards.reduce((sum, card) => sum + cycleMove(parts, card).seconds, 0);
  const order = {
    about: 'Beställningen av en följd, gjord av src/pipeline/tagning.ts forbered: flera kort i samma tagning, med REDO emellan. Allt Runways generate_video behöver: modell, upplösning, längd, text, startFrame och endFrame (inputs: det som skickas, och inget annat; ingen film skickas). REDO mellan givarna mäts mot första och sista bilden, efter de kort filmen då har lagt (foljd.ts).',
    id,
    made: stamp(),
    dealer: spec.dealer,
    view,
    viewWord: spec.view,
    seat: spec.seat,
    index: spec.index,
    action: 'deal',
    cards: cards.map((card, k) => ({ seat: card.seat, index: card.index, action: card.action, words: cardWords(card.seat, card.index), place: cardPlace(scene, card.seat, card.index), corners: painted[k]!.corners, frameMargin: Math.round(margins[k]!) })),
    take,
    cycle,
    ...(spec.variant ? { variant: spec.variant } : {}),
    clip: clipFile(spec, cycle, take),
    anchor: anchorFile,
    noReference: true,
    model: content.order.model,
    resolution: content.order.resolution,
    // Längden som sades (--langd), annars cyklernas sammanlagda i hela sekunder.
    duration: context.duration ?? durationFor(content, seconds),
    ratio: content.order.ratio,
    tool: content.order.tool,
    promptFile: `${pkg}/text.txt`,
    ...(context.textName ? { promptName: context.textName } : {}),
    prompt: text,
    inputs: {
      startFrame: { file: `${pkg}/forsta.png`, asset: anchorFile, sha256: sha256Of(at('forsta.png')), note: `vyns REDO-ankare (${dealerFile(spec.dealer)}, anchors.redo), oförändrat` },
      endFrame: {
        file: `${pkg}/sista.png`,
        sha256: sha256Of(at('sista.png')),
        madeWith: `paintedPicture i src/pipeline/cykel.ts: ${anchorFile} med märkkorten målade blå där ${cycle} lägger dem, ${allWords}`,
        painted: painted.map((one) => one.painted),
        spared: painted.map((one) => one.spared),
      },
    },
    doll: null,
    scene: {
      shoe: shoeOf(scene.shoe),
      eye: eyeOf(anchorEye ?? viewEye(scene, { ...view, close: true })),
      eyeFrom: anchorEye ? `${anchorFile}: ögat ankaret är gjort genom (registrets post, eye)` : `vyns närbild i content/scene.json (${anchorFile}s post saknar eye)`,
      frameMargin: Math.round(Math.min(...margins)),
      source: 'content/scene.json när paketet gjordes: skon och ögat filmen görs genom (ankarets, eyeFrom). Kortplatserna står per kort (cards).',
    },
    checks: [],
    uploads: `${pkg}/uppladdat.json: [{ "role": "startFrame" | "endFrame", "url": "<adressen>", "assetId": "<id>", "at": "ÅÅÅÅ-MM-DD TT:MM" }]`,
  };
  write(at('bestallning.json'), order);
  say(`Paket: ${pkg} (en följd: ${allWords})`);
  say(`  första bild   forsta.png   (${anchorFile})`);
  say(`  sista bild    sista.png    (${cards.length} märkkort, ${painted.map((one) => one.painted).join(' + ')} bp målade)`);
  say(`  text          text.txt${context.textName ? ` (content/tagning.json, prompt.named.${context.textName})` : ''}`);
  say('  ingen film skickas och ingen dockfilm görs: dockan har ingen film av en följd');
  say('Härnäst, för agenten:');
  say('  1. Läs saldot (whoami eller show_plans_and_credits).');
  say(`  2. Ladda upp forsta.png och sista.png (init_upload, curl, complete_upload). Skriv adresserna i ${pkg}/uppladdat.json.`);
  say(`  3. generate_video: ${content.order.model}, ${content.order.resolution}, ${order.duration} s, ${content.order.ratio}; startFrame forsta.png, endFrame sista.png, ingen referensfilm, texten ur text.txt.`);
  say('  4. Läs saldot igen och ladda ned filmen. Sedan:');
  say(`     node src/pipeline/tagning.ts ta-emot ${id} <film> --task <taskId> --krediter <n> --saldo-fore <n> --saldo-efter <n>`);
  return { id, dir, order, checks: [] };
}

// ---------------------------------------------------------------------------------------------------------------------
// Beviset i scenen

type Proof = { file: string; frames: number; cyanMost: number; cyanFrames: number; corners: { x: number; y: number }[] | null; cornerError: number | null; sheet: string };

/** Ett klipp att spela i scenen: filen, namnet scenen läser det under, och kortet det lägger (plats, kort, valör, tid). */
export type SceneClip = { path: string; asset: string; card: { seat: Seat; index: number; face: string | null; at: number } };

/**
 * Klippen spelade efter varandra i scenen ur vyns närbild, nycklade, med rummet, kortplatserna utritade och varje kort
 * lagt från sin tid i sitt klipp (en följd, FilmNote), sparade som `out` i paketet `dir`. Scenen har skon där klippen
 * gjordes. Scenen läser filmerna ur en egen datamapp i paketet (STUDIO_DATA), så att assets/ inte rörs; mappen tas
 * bort efteråt.
 */
export async function playInScene(root: string, dir: string, clips: SceneClip[], view: SeatView, content: TagningContent, shoe: Shoe, out: string, say: (text: string) => void): Promise<string> {
  // Scenen med skon där klippet gjordes (partsOf), och dockans mått: där kortet i skons mynning står, som nyckeln målar
  // kortets kant efter (src/scene/marker.ts).
  const written = JSON.parse(readFileSync(join(root, 'content', 'scene.json'), 'utf8'));
  written.shoe = { ...written.shoe, ...shoeOf(shoe) };
  const scene = readScene(written);
  const data = join(dir, 'scen');
  rmSync(data, { recursive: true, force: true });
  mkdirSync(join(data, 'content'), { recursive: true });
  writeFileSync(join(data, 'content', 'scene.json'), JSON.stringify(written, null, 2));
  copyFileSync(join(root, 'content', 'doll.json'), join(data, 'content', 'doll.json'));
  const link = (from: string, file: string) => {
    const to = join(data, 'assets', file);
    mkdirSync(dirname(to), { recursive: true });
    try {
      linkSync(from, to);
    } catch {
      copyFileSync(from, to);
    }
  };
  for (const file of [scene.table.file, scene.shoe.file, content.proof.background.file]) link(join(root, 'assets', file), file);
  for (const clip of clips) link(clip.path, clip.asset);
  const order = {
    dealer: { kind: 'film', view, clips: clips.map((clip) => ({ file: clip.asset, card: clip.card })) },
    background: { ...content.proof.background, lift: scene.background.liftDeg, height: scene.room.captureHeight, radius: scene.room.radius },
    studio: null,
    shoe: true,
    places: true,
    view: { ...view, close: true },
    still: false,
    fps: content.proof.fps,
    label: 'bevis',
  };
  say(`${clips.length > 1 ? `${clips.length} klipp` : 'Klippet'} i scenen sparas …`);
  const [result] = await shootAll([order], say, { data });
  if (!result?.ok) throw new TagningError(`Filmen i scenen gick inte att spara: ${result && !result.ok ? result.error : 'inget svar'}`);
  const file = join(dir, out);
  renameSync(join(data, result.saved.file), file);
  rmSync(data, { recursive: true, force: true });
  return file;
}

/**
 * Klippet nycklat i scenen ur vyns närbild (playInScene), med scenens kort lagt från `landsAt`: med framsidan upp, eller
 * för hålkortet med baksidan (face null). Mätt: blått eller cyan kring kort och hand i varje ruta där kortet ligger, och
 * scenens korthörn i sista rutan.
 */
async function proofOf(root: string, dir: string, clip: string, asset: string, view: SeatView, card: CycleCard, landsAt: number, layout: Layout, content: TagningContent, shoe: Shoe, say: (text: string) => void): Promise<Proof> {
  const face = card.action === 'hole' ? null : content.proof.face;
  const file = await playInScene(root, dir, [{ path: clip, asset, card: { seat: card.seat, index: card.index, face, at: landsAt } }], view, content, shoe, 'bevis.mp4', say);

  const film = await probe(file);
  const sheet = sheetCollector(film.frames, film.fps, 6, 'bevis');
  // Ruta k visar klippets tid (k + 0,5) / fps: kortet ligger från ruta round(landsAt · fps).
  const from = Math.round(landsAt * content.proof.fps);
  let cyanMost = 0;
  let cyanFrames = 0;
  let last: Picture | null = null;
  const frames = await eachFrame(file, layout.frame, async (picture, k) => {
    if (k >= from) {
      const cyan = countIn(picture, layout.near, isCyan);
      cyanMost = Math.max(cyanMost, cyan);
      if (cyan > 0) cyanFrames++;
    }
    sheet.take(picture, k);
    last = picture;
  });
  const corners = last ? whiteCorners(last, grow(layout.cardBox, 12)) : null;
  await makeSheet(await Promise.all(sheet.tiles), join(dir, 'ark-bevis.jpg'));
  return { file: 'bevis.mp4', frames, cyanMost, cyanFrames, corners, cornerError: corners ? cornerError(corners, layout.corners) : null, sheet: 'ark-bevis.jpg' };
}

// ---------------------------------------------------------------------------------------------------------------------
// Mätningen av ett klipp i sitt paket: för ta-emot och mät-om

/**
 * Beställningen som tagning.ts läser den ur paketet. `action` och `anchor` saknas i paket från före dealerns kort: då är
 * handlingen deal och ankaret första bilden (`startFrame.asset`). I en vändning är första bilden målad och har ingen asset.
 */
type Ordered = {
  id: string; dealer: string; view: SeatView; viewWord: string; seat: Seat; index: number; action?: Action; take: number; cycle: string; clip: string; anchor?: string;
  /** Varianten och klippet som skickades i stället för dockans film, när paketet gjordes med --referensklipp. */
  variant?: string; motionFrom?: { file: string; role: ClipRole; status: string }; noReference?: boolean;
  /** En följd: korten i given ordning (prepareSequence). */
  cards?: { seat: Seat; index: number; action: Action; words: string; place: [number, number] }[];
  model: string; resolution: string; duration: number; ratio: string; prompt: string; promptName?: string;
  /** Det som skickades: dockans film eller ett klipp (asset) som referenceVideos, eller ett klipp som referenceVideo. */
  inputs: { startFrame?: { file: string; asset?: string }; endFrame?: { file: string }; referenceImages?: { file: string; asset?: string }[]; referenceVideos?: SentVideo[]; referenceVideo?: SentVideo };
  framesAs?: 'referens';
  scene?: { shoe: Shoe; eye?: FilmEye; place?: [number, number]; source: string };
};
type SentVideo = { file: string; source?: string; asset?: string; note?: string };
const cardOf = (ordered: Ordered): CycleCard => ({ seat: ordered.seat, index: ordered.index, action: ordered.action ?? 'deal' });
const anchorOf = (ordered: Ordered): string => ordered.anchor ?? ordered.inputs.startFrame?.asset ?? ordered.inputs.referenceImages![0]!.asset!;

/** Skons läge i scenen (content/scene.json, shoe): mitten på filten, vridningen och längden. */
export type Shoe = { at: [number, number]; yawDeg: number; length: number };
const shoeOf = (shoe: Shoe): Shoe => ({ at: [shoe.at[0], shoe.at[1]], yawDeg: shoe.yawDeg, length: shoe.length });

/**
 * Cykelns delar som paketet gjordes med: scenen med skon där den stod när paketet gjordes (bestallning.json, scene.shoe),
 * dockan och cykeln som de står i content/. Skon är inbakad i klippet, och var kortet hämtas räknas ur den: ett klipp
 * mäts mot sin egen sko också när skon i scenen har flyttats. Ett paket utan skons läge går inte att mäta.
 */
function partsOf(ordered: Ordered, root: string): CycleParts {
  const parts = readCycleParts(ordered.cycle, root);
  if (!ordered.scene?.shoe) throw new TagningError(`${ordered.id}: bestallning.json säger inte var skon stod (scene.shoe)`);
  if (!ordered.scene.eye) throw new TagningError(`${ordered.id}: bestallning.json säger inte vilket öga filmen görs genom (scene.eye)`);
  return { ...parts, scene: { ...parts.scene, shoe: { ...parts.scene.shoe, ...shoeOf(ordered.scene.shoe) } }, eye: { ...ordered.scene.eye } };
}

/** Ett öga som en post och en följd bär det (dealer.ts, FilmEye). */
const eyeOf = (eye: Eye): FilmEye => ({ position: [...eye.position] as [number, number, number], forward: [...eye.forward] as [number, number, number], focalPx: eye.focalPx, frame: { width: eye.frame.width, height: eye.frame.height } });
type Measured = { values: Values; judged: Judged[]; summary: string; landsAt: number | null; proof: Proof | null };

/**
 * Formatets gräns (limits.format, "1920×1080 24/s 97") gäller beställningens vanliga längd (order.duration). En längre
 * eller kortare beställning har lika många rutor fler eller färre per sekund: 5 s i stället för 4 ger 121 i stället för 97.
 */
export function formatFor(limits: Record<string, Limit>, duration: number, usual: number): Record<string, Limit> {
  const format = limits.format;
  const match = typeof format?.is === 'string' ? /^(\S+ (\d+)\/s )(\d+)$/.exec(format.is) : null;
  if (!format || !match || duration === usual) return limits;
  return { ...limits, format: { ...format, is: `${match[1]}${Number(match[3]) + Math.round((duration - usual) * Number(match[2]))}` } };
}

/**
 * Mäter klippet `clip` i paketet `dir` mot bilderna, dockan och scenen och prövar måtten mot gränserna: dockans film
 * först (docka.json), sedan klippet (ark.jpg) och beviset i scenen när kortet har landat. Skriver matning.json.
 * `heard` är om den nedladdade filmen hade ljud.
 */
async function measureTake(root: string, dir: string, ordered: Ordered, clip: string, film: Probe, heard: boolean, content: TagningContent, parts: CycleParts, proofToo: boolean, say: (text: string) => void): Promise<Measured> {
  const at = (file: string) => join(dir, file);
  const view = ordered.view;
  const layout = layoutFor(parts, view, cardOf(ordered), content.measure);
  const images = { first: await readPicture(at('forsta.png')), last: await readPicture(at('sista.png')) };
  const { doll, shoeFree } = await measureDoll(root, dir, layout, content.measure, false);
  const sheet = sheetCollector(film.frames, film.fps, 6, 'klipp');
  const key = parts.scene.studio.colours.screen as [number, number, number];
  // En film i en annan upplösning än rutan (en annan modell) mäts i en kopia skalad till rutan; formatet mäts på filmen
  // som den kom (film), så att det syns.
  const sized = film.width === layout.frame.width && film.height === layout.frame.height ? clip : at('matkopia.mp4');
  if (sized !== clip) await run('ffmpeg', ['-v', 'error', '-y', '-i', clip, '-vf', `scale=${layout.frame.width}:${layout.frame.height}:flags=lanczos`, '-an', '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', sized]);
  const read = await readFilm(sized, film.fps, { layout, measure: content.measure, key, start: images.first, shoeFree }, (picture, index) => sheet.take(picture, index));
  await makeSheet(await Promise.all(sheet.tiles), at('ark.jpg'));
  const { values, times, seconds } = valuesOf(read, film, film.audio, layout, content.measure, images, doll);
  // Den vilande armen (vila.ts): handen, fingrarna och armbågen, i bp och cm.
  Object.assign(values, await restMotion(sized, layout.frame, film.fps, restPlaces(parts, view, cardOf(ordered), read.first, key), key));
  // Rörelsen i klippet (rorelse.ts): stillhet, knyckar och ordningen mellan huvud, bål och hand. Går den inte att spåra
  // (ingen dealer i bild) saknas måtten, och det syns i omdömet.
  try {
    const action = ordered.action ?? 'deal';
    const motion = motionNumbers((await filmMotion(clip, content.motion, screenOf(content.reference.studio), true, action === 'deal' || action === 'hole')).values);
    // Som i forbered: ett mått som inte gäller saknas (null) och prövas inte. Huvudet mot skon mäts bara på dockan, och
    // ordningen mellan huvud och hand bara när huvudet vrids (motion.orderTurn).
    for (const [key, value] of Object.entries(motion)) if (value !== null) values[key] = value;
  } catch (error) {
    if (!(error instanceof MotionError)) throw error;
    say(`Rörelsen gick inte att mäta: ${error.message}`);
  }
  const landsAt = seconds.lands;

  // Beviset i scenen, när kortet har landat.
  let proof: Proof | null = null;
  if (proofToo && landsAt !== null) {
    proof = await proofOf(root, dir, sized, ordered.clip, view, cardOf(ordered), landsAt, layout, content, parts.scene.shoe, say);
    values.bevisBlatt = proof.cyanMost;
    values.bevisHorn = proof.cornerError;
  }
  const judged = judge(values, formatFor(content.limits, ordered.duration, content.order.duration), doll.own);
  const outside = judged.filter((entry) => entry.verdict !== 'inom');
  const summary = outside.length === 0 ? `alla ${judged.length} mått inom gränserna` : `${judged.length - outside.length} av ${judged.length} mått inom gränserna; ${outside.map((entry) => `${entry.key} ${shown(entry.value)} (${entry.verdict})`).join(', ')}`;

  write(at('matning.json'), {
    about: 'Klippet mätt av src/pipeline/tagning.ts ta-emot eller mät-om (mätningarna i src/pipeline/matning.ts, gränserna i content/tagning.json). Allt är mätt ur rutorna; tider i sekunder, ruta n vid n / fps; bp i 1920 × 1080. judged är varje mått mot sin gräns; values har också mått utan gräns.',
    measured: stamp(),
    clip: posix(relative(root, clip)),
    sha256: sha256Of(clip),
    film,
    soundInDownload: heard,
    times,
    seconds,
    doll: doll.seconds,
    dollOwn: doll.own ?? null,
    values,
    judged,
    proof,
    shoe: shoeOf(parts.scene.shoe),
    layout: { corners: layout.corners, cardArea: layout.cardArea, regions: layout.regions, dealer: layout.dealer, low: layout.low, handBox: layout.handBox, waist: layout.waist, near: layout.near },
    rows: read.rows,
  });
  return { values, judged, summary, landsAt, proof };
}

/** Om paketet är en följd med flera kort (prepareSequence). */
const isSequence = (ordered: Ordered): boolean => (ordered.cards?.length ?? 0) > 1;

/**
 * Mäter en följd (foljd.ts) mot sina bilder: första, de mellan givarna och sista. Skriver matning.json och arket. Inget
 * bevis i scenen: det ritar ett kort i taget.
 */
async function measureSequenceTake(root: string, dir: string, ordered: Ordered, clip: string, film: Probe, heard: boolean, content: TagningContent, parts: CycleParts, proofToo: boolean, say: (text: string) => void): Promise<Measured> {
  const at = (file: string) => join(dir, file);
  const layouts = ordered.cards!.map((card) => layoutFor(parts, ordered.view, { seat: card.seat, index: card.index, action: 'deal' }, content.measure));
  const images = { first: await readPicture(at('forsta.png')), last: await readPicture(at('sista.png')) };
  const key = parts.scene.studio.colours.screen as [number, number, number];
  const read = await measureSequence({ clip, dir, film, layouts, images, key, measure: content.measure, motion: content.motion, screen: screenOf(content.reference.studio), limits: content.limits, say });
  const sheet = sheetCollector(film.frames, film.fps, 6, 'klipp');
  await eachFrame(clip, layouts[0]!.frame, (picture, index) => sheet.take(picture, index));
  await makeSheet(await Promise.all(sheet.tiles), at('ark.jpg'));
  // Bitarna i scenen: ett klipp per kort, kortet lagt från tiden det landar i sin bit (i-scenen.mp4).
  const scene = proofToo ? await playInScene(root, dir, sceneClipsOf(dir, ordered, read, film.fps, content.proof.face), ordered.view, content, parts.scene.shoe, 'i-scenen.mp4', say) : null;
  const limits = formatFor(content.limits, ordered.duration, content.order.duration);
  const firstCard: CycleCard = { seat: ordered.cards![0]!.seat, index: ordered.cards![0]!.index, action: 'deal' };
  const rest = await restMotion(clip, layouts[0]!.frame, film.fps, restPlaces(parts, ordered.view, firstCard, await firstFrame(clip, layouts[0]!.frame), key), key);
  const values: Values = { format: `${film.width}×${film.height} ${film.fps}/s ${film.frames}`, ljud: film.audio, ...read.values, ...rest };
  const judged = [...(['format', 'ljud'] as const).filter((name) => limits[name]).map((name) => judgeOne(name, values[name], limits[name]!)), ...read.judged];
  const outside = judged.filter((entry) => entry.verdict !== 'inom');
  const summary = outside.length === 0 ? `alla ${judged.length} mått inom gränserna` : `${judged.length - outside.length} av ${judged.length} mått inom gränserna; ${outside.map((entry) => `${entry.key} ${shown(entry.value)} (${entry.verdict})`).join(', ')}`;
  write(at('matning.json'), {
    about: 'En följd mätt av src/pipeline/tagning.ts ta-emot eller mät-om (src/pipeline/foljd.ts, gränserna i content/tagning.json). cards, i given ordning: när varje kort läggs där det sedan ligger (laid, laidFrame), hur många stunder det blå ligger på platsen (stays) och när det ligger kvar otäckt till slutet (lands, frame), IoU och tyngdpunkt mot sista bilden, och hur stilla det ligger. order: korten (från 0, i given ordning) i den ordning filmen lägger dem. middles: rutan närmast REDO mellan två läggningar, med PSNR mot första bilden med de lagda kortens rutor ur sista bilden, och kortet som lades före (after). pieces: bitarna när tagningen klipps där, som filmer i paketet, och kortet varje bit lägger; seams: skarven när en bit följs av en annan, i huvud, bål, vilande hand, mynning och sko. Rörelsen är mätt i varje bit (BitN). Mätt, inte antaget.',
    measured: stamp(),
    clip: posix(relative(root, clip)),
    sha256: sha256Of(clip),
    film,
    soundInDownload: heard,
    values,
    judged,
    cards: read.cards,
    order: read.order,
    middles: read.middles,
    pieces: read.pieces,
    seams: read.seams,
    chain: read.chain,
    scene: scene ? posix(relative(root, scene)) : null,
    shoe: shoeOf(parts.scene.shoe),
  });
  return { values, judged, summary, landsAt: null, proof: null };
}

/**
 * En följds bitar som klipp i scenen: bit j lägger kortet den lägger i filmen (`piece.card`, nummer i given ordning)
 * från rutan det läggs där det sedan ligger, med valören `faces[kortet]` (eller samma för alla). Ett kort som inte läggs i sin bit
 * läggs i bitens sista ruta.
 */
export function sceneClipsOf(dir: string, ordered: Pick<Ordered, 'dealer' | 'id' | 'cards'>, read: Pick<SequenceRead, 'pieces' | 'cards'>, fps: number, faces: string | string[]): SceneClip[] {
  return read.pieces.flatMap((piece, j) => {
    if (piece.card === null) return [];
    const card = ordered.cards![piece.card]!;
    const laid = read.cards[piece.card]?.laidFrame;
    const inPiece = laid !== null && laid !== undefined && laid >= piece.from && laid <= piece.to ? laid : piece.to;
    const at = (inPiece - piece.from) / fps;
    return [{
      path: join(dir, piece.file),
      asset: `dealers/${ordered.dealer}/clips/${ordered.id}-bit-${j + 1}.mp4`,
      card: { seat: card.seat, index: card.index, face: Array.isArray(faces) ? faces[piece.card]! : faces, at: Math.max(0, Number(at.toFixed(3))) },
    }];
  });
}

/** En tagning mätt: en följd mot sina bilder (foljd.ts), annars en cykel mot dockan och scenen (measureTake). */
const measureAny = (root: string, dir: string, ordered: Ordered, clip: string, film: Probe, heard: boolean, content: TagningContent, parts: CycleParts, proofToo: boolean, say: (text: string) => void): Promise<Measured> =>
  isSequence(ordered) ? measureSequenceTake(root, dir, ordered, clip, film, heard, content, parts, proofToo, say) : measureTake(root, dir, ordered, clip, film, heard, content, parts, proofToo, say);

/**
 * Måtten som registret tar emot dem: varje mått med gräns, och de som bara visas. En följds egna mått utan gräns (när
 * korten landar, rutan närmast REDO) följer med som de står i values.
 */
function measurementsOf(file: string, judged: Judged[], values: Values, scene: CycleParts['scene']): PostFile['measurements'] {
  const judgedKeys = new Set(judged.map((entry) => entry.key));
  const sequenceShown = Object.keys(values).filter((key) => /^(kort\d+(Lagd|Stunder|Ligger|Synligt|Minst)|mittRutan\d+Ruta|losaBla(Flest|Sist)|lagdOrdning)$/.test(key) && !judgedKeys.has(key));
  const sequenceWhat = (key: string): string => {
    if (key === 'losaBlaFlest') return 'blå kort utanför alla kortplatser, flest i en ruta (1 är kortet som bärs)';
    if (key === 'losaBlaSist') return 'blå kort utanför alla kortplatser i sista rutan';
    if (key === 'lagdOrdning') return 'korten (nummer i given ordning) i den ordning filmen lägger dem';
    const n = key.match(/\d+/)![0];
    if (key.endsWith('Minst')) return `kort ${n}: minsta andel av dess blå i sista rutan som syns från att det är helt synligt till slutet`;
    if (key.endsWith('Lagd')) return `när kort ${n} läggs där det sedan ligger, s`;
    if (key.endsWith('Stunder')) return `hur många stunder det blå ligger på kort ${n}s plats (1: lagt en gång och kvar; fler: ett kort som vänds där eller flyttas därifrån)`;
    return key.endsWith('Ligger') ? `när kort ${n} ligger kvar på sin plats till slutet, s` : key.endsWith('Synligt') ? `när kort ${n} är helt synligt till slutet, s` : `rutan närmast REDO efter läggning ${n}`;
  };
  return [
    ...sequenceShown.map((key) => ({ file, what: `${key}: ${sequenceWhat(key)}`, value: { value: values[key] }, who: WHO, basis: 'mätt' as const, note: 'utan gräns' })),
    // Skons läge som klippet är gjort och mätt med: det står kvar i registret när paketet i output/ är borta.
    { file, what: 'skonsLage: skons läge i scenen när klippet gjordes, som klippet mäts mot (content/scene.json, shoe)', value: shoeOf(scene.shoe), who: WHO, basis: scene.shoe.basis, note: scene.shoe.source.slice(0, 300) },
    ...judged.map((entry) => ({ file, what: `${entry.key}: ${entry.what}`, value: { value: entry.value, unit: entry.unit, limit: entry.limit, verdict: entry.verdict }, who: WHO, basis: 'mätt' as const, note: `gränsen: ${entry.source}` })),
    ...Object.entries(SHOWN)
      .filter(([key]) => key in values)
      .map(([key, what]) => ({ file, what: `${key}: ${what}`, value: { value: values[key] }, who: WHO, basis: 'mätt' as const, note: 'utan gräns' })),
  ];
}

/** Måtten i ord, ett per rad, som ta-emot och mät-om skriver ut dem. */
function sayMeasured(say: (text: string) => void, measured: Measured, pkg: string): void {
  say(`Mätt: ${measured.summary}`);
  for (const entry of measured.judged) say(`  ${entry.verdict.padEnd(8)} ${entry.key.padEnd(19)} ${shown(entry.value).padStart(8)} ${entry.unit.padEnd(7)} ${entry.limit}`);
  for (const [key] of Object.entries(SHOWN)) if (key in measured.values) say(`  ${'visas'.padEnd(8)} ${key.padEnd(19)} ${shown(measured.values[key]).padStart(8)}`);
  say(`Ark: ${pkg}/ark.jpg${measured.proof ? `, ${pkg}/ark-bevis.jpg` : ''}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// ta-emot

export type Receipt = { taskId: string; credits: number; before: number; after: number; at?: string };
export type ReceiveOptions = { root?: string; out?: string; registry?: string; register?: boolean; proof?: boolean; say?: (text: string) => void };
export type PostFile = { post: Post; order: Order; measurements: { file: string; what: string; value: unknown; who: string; basis: 'mätt' | 'antaget'; note: string }[]; uploads: { file: string; url: string; assetId: string | null; at: string | null }[] };

/** Måtten utan gräns, med vad de är. */
const SHOWN: Record<string, string> = {
  landsAt: 'lands.at: första rutan där det blå är platt och stilla till slutet, s',
  kortetLamnarSkon: 'kortet lämnar skon, filmen mot dockan, s',
  kortetHeltSynligt: 'kortet helt synligt (det blå nästan som i sista rutan, och så till slutet) mot dockans tid då handen lämnar kortet, s',
  handenISkonMotDockan: 'handen åter i REDO, filmen mot dockan, s',
  handPaKortet: 'givhandens bredd på kortet mot dockans, medianer, gånger',
  nastaKortJamfort: 'nästa kort: tiden för rutan där det syns mest, som tillkommet gult räknas mot, s',
  huvudet: 'huvudets vridning: största skillnad i ögonens läge mot huvudets kontur, bp',
  skarvMedel: 'skarven: sista rutan mot första utanför kortet, medelavvikelse per kanal (pilotens mått)',
  bevisHorn: 'beviset i scenen: scenens korthörn i sista rutan mot de räknade, bp',
  vilaHandBp: 'den vilande handens tyngdpunkt (huden kring dockans vilande hand), längst från sin median, bp (vila.ts)',
  vilaHandCm: 'den vilande handens tyngdpunkt, längst från sin median, cm vid handens avstånd',
  vilaHandFart: 'den vilande handens väg per sekund, cm/s (med bildbrus)',
  vilaFingrar: 'den vilande handens form: 1 − minsta överlapp av huden mot första rutan',
  vilaArmbageBp: 'den vilande armbågens yttre kant, längst från sin median, bp',
  vilaArmbageCm: 'den vilande armbågens yttre kant, längst från sin median, cm vid handens avstånd',
};

/** Flaggor utan värde: ordet efter dem är inget värde. */
const SWITCHES = ['--utan-referens'];
const flag = (args: string[], name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
/** Orden som inte är flaggor eller flaggors värden. */
const wordsIn = (args: string[]): string[] => args.filter((arg, k) => !arg.startsWith('--') && !(args[k - 1]?.startsWith('--') && !SWITCHES.includes(args[k - 1]!)));

/** En film som skickades, i ord för registret: ett klipp med sin anmärkning ur paketet, dockans film med sin förlaga. */
function sentWhat(sent: SentVideo, ordered: Ordered, action: Action, words: string): string {
  if (sent.asset) return `${sent.file}: ${sent.note ?? sent.asset}`;
  return `${sent.file} (förlagan ${sent.source}): dockan gör ${ordered.cycle} med ${action}, ${words}, ur ${viewTitle(ordered.view)}s närbild i grå ateljé`;
}

/** Var texten kom ifrån: mallen, en namngiven text (prompt.named) som den står i dag, eller paketets egen. */
function promptNoteOf(content: TagningContent, ordered: Ordered, action: Action, words: Words, pkg: string): string {
  if (ordered.promptName) {
    let named: string | null = null;
    try {
      named = namedText(content, ordered.promptName, action, words);
    } catch {
      named = null;
    }
    return named === ordered.prompt ? `content/tagning.json, prompt.named.${ordered.promptName} (${pkg}/text.txt)` : `${pkg}/text.txt: prompt.named.${ordered.promptName} som den stod när paketet gjordes, inte som den står i dag`;
  }
  return ordered.prompt === promptFor(content, action, words)
    ? `mallen i content/tagning.json, prompt${action === 'deal' ? '' : ` med prompt.actions.${action}`} (${pkg}/text.txt)`
    : `${pkg}/text.txt, inte mallen i content/tagning.json`;
}

/** Tar emot en nedladdad film till ett paket. Se överst i filen. */
export async function taEmot(id: string, download: string, receipt: Receipt, options: ReceiveOptions = {}): Promise<{ post: PostFile; judged: Judged[]; values: Values; registered: string[] }> {
  const root = options.root ?? ROOT;
  const out = options.out ?? join(root, PACKAGES);
  const say = options.say ?? ((text: string) => console.log(text));
  const dir = join(out, id);
  const at = (file: string) => join(dir, file);
  if (!existsSync(at('bestallning.json'))) throw new TagningError(`Paketet ${id} finns inte i ${posix(relative(root, out))}: kör forbered först`);
  for (const [name, value] of Object.entries({ credits: receipt.credits, before: receipt.before, after: receipt.after })) {
    if (!Number.isInteger(value)) throw new TagningError(`${name} ska vara ett heltal`);
  }
  if (!receipt.taskId) throw new TagningError('taskId saknas');
  const ordered = JSON.parse(readFileSync(at('bestallning.json'), 'utf8')) as Ordered;
  const content = readTagning(root);
  const parts = partsOf(ordered, root);

  // Ljudet tas bort utan omkodning.
  const source = resolve(download);
  if (!existsSync(source)) throw new TagningError(`${download} finns inte`);
  const name = ordered.clip.split('/').at(-1)!;
  const clip = at(name);
  const heard = (await probe(source)).audio;
  if (heard && resolve(source) !== resolve(at('med-ljud.mp4'))) copyFileSync(source, at('med-ljud.mp4'));
  await run('ffmpeg', ['-v', 'error', '-y', '-i', source, '-map', '0:v:0', '-c', 'copy', '-an', clip]);
  const film = await probe(clip);
  say(`Klippet: ${posix(relative(root, clip))} (${film.width} × ${film.height}, ${shown(film.fps)} rutor/s, ${film.frames} rutor${heard ? ', ljudet borttaget' : ''})`);

  // Mätningen.
  const view = ordered.view;
  const measured = await measureAny(root, dir, ordered, clip, film, heard, content, parts, options.proof !== false, say);
  const { values, judged, summary, landsAt } = measured;
  const pkg = posix(relative(root, dir));

  // Posten, beställningen och måtten, som registret tar emot dem.
  const date = stamp();
  const action = ordered.action ?? 'deal';
  const anchor = anchorOf(ordered);
  const sequence = isSequence(ordered);
  const words = sequence ? ordered.cards!.map((card) => card.words).join(', sedan ') : cardWords(ordered.seat, ordered.index, action);
  const pictures = ordered.inputs;
  const startFile = pictures.startFrame ? (pictures.startFrame.asset ?? pictures.startFrame.file) : (pictures.referenceImages?.[0]?.asset ?? pictures.referenceImages?.[0]?.file ?? anchor);
  // En film som skickades: ett registrerat klipp står med sitt namn i registret, dockans film med sin fil i paketet.
  const video = ordered.inputs.referenceVideo ?? ordered.inputs.referenceVideos?.[0];
  if (!video && !ordered.noReference) throw new TagningError(`${id}: bestallning.json säger inte vilken film som skickades (inputs.referenceVideos eller referenceVideo, eller noReference)`);
  const sentAs = (role: string): string => {
    if (role === 'startFrame' || role === 'referenceImages') return startFile;
    if (role === 'endFrame' && pictures.endFrame) return pictures.endFrame.file;
    if (!video) throw new TagningError(`${id}: uppladdat.json har rollen ${role}, men ingen film skickades`);
    return video.asset ?? video.file;
  };
  const uploads = existsSync(at('uppladdat.json'))
    ? (JSON.parse(readFileSync(at('uppladdat.json'), 'utf8')) as { role: string; url: string; assetId?: string; at?: string; file?: string }[]).map((entry) => ({
        file: entry.file ?? sentAs(entry.role),
        url: unsigned(entry.url),
        signed: entry.url,
        assetId: entry.assetId ?? null,
        at: entry.at ?? null,
      }))
    : [];
  // Filens sha256 räknas här, ur projektmappen, så att registret inte behöver hitta den.
  const local = (file: string): string => (file.startsWith('output/') ? join(root, file) : join(root, 'assets', file));
  const sums = new Map(uploads.filter((entry) => existsSync(local(entry.file))).map((entry) => [entry.file, sha256Of(local(entry.file))]));
  const basis: 'mätt' | 'antaget' = receipt.credits === receipt.before - receipt.after ? 'mätt' : 'antaget';
  const references = [
    ...(pictures.startFrame ? [{ role: 'startFrame', what: pictures.startFrame.asset ?? `${pictures.startFrame.file}: ${anchor} med hålkortet målat gult där det ligger (src/pipeline/cykel.ts, paintedPicture)` }] : []),
    ...(pictures.endFrame ? [{ role: 'endFrame', what: `${pictures.endFrame.file}: ${anchor} med ${sequence ? 'märkkorten målade där korten ligger' : 'märkkortet målat där kortet ligger'}, ${words} (src/pipeline/cykel.ts, paintedPicture)` }] : []),
    ...(pictures.referenceImages ?? []).map((image, k) => ({ role: `referenceImages[${k}]`, what: `${image.asset ?? image.file}: referensbild, inte första bild (ingenting låser första och sista rutan)` })),
    ...(ordered.inputs.referenceVideos ?? []).map((sent, k) => ({ role: `referenceVideos[${k}]`, what: sentWhat(sent, ordered, action, words) })),
    ...(ordered.inputs.referenceVideo ? [{ role: 'referenceVideo', what: sentWhat(ordered.inputs.referenceVideo, ordered, action, words) }] : []),
  ];
  const doing = sequence
    ? `REDO → ${ordered.cards!.map((card) => `kortet lagt (${card.words})`).join(' → REDO → ')} → REDO`
    : action === 'wait' ? 'REDO → väntan med handen vid kortet i skon → REDO' : action === 'hole' ? 'REDO → hålkortet lagt med baksidan upp → REDO' : action === 'flip' ? 'REDO → hålkortet vänt där det ligger → REDO' : 'REDO → kortet lagt → REDO';
  const motionFrom = ordered.motionFrom
    ? `, med det godkända klippet ${ordered.motionFrom.file} ${ordered.motionFrom.role === 'referenceVideo' ? 'som filmen som görs om (referenceVideo)' : 'som rörelsereferens (referenceVideos)'} i stället för dockans film`
    : ordered.noReference
      ? ', utan referensfilm: rörelsen är filmmodellens egen, styrd av bilderna och texten'
      : '';
  const variant = ordered.variant ? `, variant ${ordered.variant}` : '';
  const post: Post = {
    from: '',
    file: ordered.clip,
    group: 'clips',
    dealer: ordered.dealer,
    title: `${sequence ? 'Följd: ' : action === 'deal' ? 'Cykel till ' : 'Cykel: '}${words} (nyp) ur ${viewTitle(view)}${variant}, tagning ${ordered.take}`,
    status: 'att granska',
    note: `Tagen emot ${date} genom src/pipeline/tagning.ts (paketet ${pkg}). ${ordered.model}, ${doing}${motionFrom}. Mätt: ${summary}. Inte dömd: döms av en oberoende granskare.`,
    pose: sequence ? ['redo', ...ordered.cards!.flatMap(() => ['kortet lagt', 'redo'])].join(' → ') : 'redo → redo',
    grip: 'nyp',
    // En följd bär sina kort (cards) i stället för seat, index och lands, så att rundan aldrig tar den för ett enda kort
    // (round.ts, takeOf); bitarna står i paketet.
    ...(sequence
      ? { cards: ordered.cards!.map((card, k) => ({ seat: card.seat, index: card.index, action: card.action, place: card.place, at: values[`kort${k + 1}Ligger`] ?? null })) }
      : { seat: ordered.seat, index: ordered.index, action }),
    take: ordered.take,
    move: ordered.cycle,
    ...(ordered.variant ? { variant: ordered.variant } : {}),
    use: 'dealerfilm',
    view,
    ...(sequence ? {} : { lands: { seat: ordered.seat, index: ordered.index, at: landsAt === null ? null : Number(landsAt.toFixed(2)) } }),
    // Ögat filmen är gjord genom, skon den bär och var kortet landar: uppspelningen lägger filmen och kortet efter dem,
    // också när scenens tal ändras (round.ts, build.ts).
    eye: ordered.scene!.eye!,
    shoe: shoeOf(ordered.scene!.shoe),
    ...(sequence ? {} : { place: ordered.scene!.place ?? cardPlace(parts.scene, ordered.seat, ordered.index) }),
    licence: 'Ingen tredjepartslicens: genererad på Jakobs Runway-konto',
    source: {
      from: 'runway',
      taskId: receipt.taskId,
      model: ordered.model,
      resolution: ordered.resolution,
      ratio: ordered.ratio,
      duration: ordered.duration,
      credits: receipt.credits,
      balanceBefore: receipt.before,
      balanceAfter: receipt.after,
      creditsBasis: basis === 'mätt' ? 'mätt: saldot direkt före och direkt efter' : `antaget: krediterna ${receipt.credits} är inte skillnaden mellan saldona ${receipt.before} och ${receipt.after}`,
      references,
      prompt: ordered.prompt,
      promptNote: promptNoteOf(content, ordered, action, wordsFor(root, ordered.dealer), pkg),
      package: pkg,
    },
  };
  const order: Order = {
    at: receipt.at ?? date,
    model: ordered.model,
    kind: 'film',
    purpose: `${sequence ? 'Följd: ' : action === 'deal' ? 'Cykel till ' : 'Cykel: '}${words} ur ${viewTitle(view)}${variant}, tagning ${ordered.take} (${id})${motionFrom}`,
    inputs: JSON.stringify({ resolution: ordered.resolution, duration: ordered.duration, ratio: ordered.ratio, references }),
    prompt: ordered.prompt,
    taskId: receipt.taskId,
    credits: receipt.credits,
    balanceBefore: receipt.before,
    balanceAfter: receipt.after,
    basis,
    outcome: `mätt: ${summary}`,
    result: ordered.clip,
    note: receipt.at ? null : 'at är tiden då filmen togs emot, inte då den beställdes',
  };
  const measurements = measurementsOf(ordered.clip, judged, values, parts.scene);
  const postFile: PostFile = { post, order, measurements, uploads: uploads.map(({ signed: _signed, ...rest }) => rest) };
  // Posten i filen bär sin film; registret får den räknad från registrets mapp.
  write(at('post.json'), { ...postFile, post: { ...post, from: posix(relative(root, clip)) } });

  sayMeasured(say, measured, pkg);

  const registered = options.register === false ? [] : await registrera(options.registry ?? studioRoot(), postFile, clip, uploads.map((entry) => ({ ...entry, sha256: sums.get(entry.file) ?? null })));
  for (const line of registered) say(line);
  return { post: postFile, judged, values, registered };
}

// ---------------------------------------------------------------------------------------------------------------------
// Registret

/**
 * För in tagningen i registret genom registry.ts: klippet som post med status `att granska`, beställningen och varje
 * mått. Det som redan står där (samma film, samma taskId, mått av samma slag) förs inte in igen.
 */
export async function registrera(registry: string, postFile: PostFile, clip: string, uploads: { file: string; url: string; signed: string; assetId: string | null; at: string | null; sha256: string | null }[]): Promise<string[]> {
  const said: string[] = [];
  const file = postFile.post.file;
  const existing = getEntry(registry, file);
  if (existing) {
    if ((existing.source as { sha256?: string }).sha256 !== sha256Of(clip)) throw new TagningError(`${file} står redan i registret med en annan film`);
    said.push(`Registret: ${file} hade redan sin post.`);
  } else {
    const entry = await importAsset(registry, { ...postFile.post, from: relative(registry, clip) });
    said.push(`Registret: ${entry.file} införd, ${entry.status}.`);
  }
  const known = about(registry, file);
  if (known.orders.some((row) => row.task_id === postFile.order.taskId)) said.push(`Registret: beställningen ${postFile.order.taskId} stod redan där.`);
  else said.push(`Registret: beställningen införd (rad ${addOrder(registry, postFile.order)}).`);
  // Måtten mäts om när klippet tas emot igen: de förra från tagning.ts ersätts, andras mätningar står kvar.
  const replaced = known.measurements.some((row) => row.who === WHO) ? dropMeasurements(registry, file, WHO) : 0;
  for (const measurement of postFile.measurements) addMeasurement(registry, measurement);
  said.push(`Registret: ${postFile.measurements.length} mått införda${replaced ? ` i stället för de ${replaced} förra` : ''}.`);
  for (const upload of uploads) {
    if (about(registry, upload.file).uploads.some((row) => row.url === upload.url)) continue;
    addUpload(registry, { file: upload.file, url: upload.signed, assetId: upload.assetId, at: upload.at, ...(upload.sha256 ? { sha256: upload.sha256, basis: 'mätt' as const } : {}) });
    said.push(`Registret: uppladdningen av ${upload.file} införd.`);
  }
  return said;
}

// ---------------------------------------------------------------------------------------------------------------------
// mät-om: ett klipp som redan är taget emot, med dagens mätningar och scen

/**
 * Mäter om klippet i paketet `id` som ta-emot mäter (measureTake): dockans film, klippet och beviset i scenen, och skriver
 * docka.json, matning.json och arken. Måtten i post.json och registrets mätningar från tagning.ts ersätts. Klippet,
 * beställningen, posten och omdömet rörs inte.
 */
export async function matOm(id: string, options: Omit<ReceiveOptions, 'out'> & { out?: string } = {}): Promise<{ judged: Judged[]; values: Values; registered: string[] }> {
  const root = options.root ?? ROOT;
  const out = options.out ?? join(root, PACKAGES);
  const say = options.say ?? ((text: string) => console.log(text));
  const dir = join(out, id);
  const at = (file: string) => join(dir, file);
  if (!existsSync(at('post.json'))) throw new TagningError(`Paketet ${id} har ingen post.json: klippet är inte taget emot (ta-emot)`);
  const ordered = JSON.parse(readFileSync(at('bestallning.json'), 'utf8')) as Ordered;
  const clip = at(ordered.clip.split('/').at(-1)!);
  if (!existsSync(clip)) throw new TagningError(`${posix(relative(root, clip))} finns inte`);
  const posted = JSON.parse(readFileSync(at('post.json'), 'utf8')) as PostFile;
  const before = existsSync(at('matning.json')) ? (JSON.parse(readFileSync(at('matning.json'), 'utf8')) as { soundInDownload?: boolean }) : {};
  const content = readTagning(root);
  const parts = partsOf(ordered, root);
  const film = await probe(clip);
  const measured = await measureAny(root, dir, ordered, clip, film, before.soundInDownload ?? false, content, parts, options.proof !== false, say);
  const measurements = measurementsOf(ordered.clip, measured.judged, measured.values, parts.scene);
  write(at('post.json'), { ...posted, measurements });
  sayMeasured(say, measured, posix(relative(root, dir)));

  const registered: string[] = [];
  if (options.register !== false) {
    const registry = options.registry ?? studioRoot();
    if (!getEntry(registry, ordered.clip)) throw new TagningError(`${ordered.clip} står inte i registret: ta emot klippet först`);
    const replaced = dropMeasurements(registry, ordered.clip, WHO);
    for (const measurement of measurements) addMeasurement(registry, measurement);
    registered.push(`Registret: ${measurements.length} mått införda i stället för de ${replaced} förra. Posten och omdömet är orörda.`);
  }
  for (const line of registered) say(line);
  return { judged: measured.judged, values: measured.values, registered };
}

// ---------------------------------------------------------------------------------------------------------------------
// pröva: piloten genom samma väg

const PILOT = 'output/work/cykel/pilot';

/** Kör forbered och ta-emot på pilottagningen och jämför med pilotens egna tal. Skriver jamforelse.json i paketet. */
export async function prova(options: { root?: string; registry?: string; say?: (text: string) => void } = {}): Promise<{ id: string; rows: { what: string; pilot: unknown; now: unknown }[] }> {
  const root = options.root ?? ROOT;
  const say = options.say ?? ((text: string) => console.log(text));
  const pilot = JSON.parse(readFileSync(join(root, PILOT, 'bestallning.json'), 'utf8'));
  const inputs = pilot.order.inputs;
  // Pilotens dealer, ur klippets namn i dess egen beställning (dealers/<dealer>/clips/…).
  const spec: Spec = { dealer: String(/^dealers\/([a-z0-9-]+)\//.exec(String(pilot.suggestedAssetPath))?.[1] ?? ''), view: 'spelaren', seat: 4, index: 0 };
  // Pilotens referensfilm: sparad i 30 rutor/s med den gamla handen. Den används som den var, och bara om den är oförändrad.
  const id = packageId(spec, 'cykel-nyp', 1);
  const kept = join(root, PACKAGES, id, 'referens.mp4');
  const wanted = inputs.referenceVideos[0].sha256 as string;
  const reference = [inputs.referenceVideos[0].file as string, posix(relative(root, kept))].find((file) => existsSync(join(root, file)) && sha256Of(join(root, file)) === wanted);
  if (!reference) throw new TagningError(`Pilotens referensfilm (sha256 ${wanted.slice(0, 12)}) finns inte längre oförändrad`);
  const text = readFileSync(join(root, pilot.order.promptFile), 'utf8');
  const made = await forbered(spec, { root, take: 1, reference, text, say });
  if (made.id !== id) throw new TagningError(`Paketet fick namnet ${made.id}`);
  const dir = made.dir;
  if (!existsSync(join(dir, 'referens.mp4')) || sha256Of(join(dir, 'referens.mp4')) !== wanted) throw new TagningError('Pilotens referensfilm kom inte med oförändrad');
  // Adresserna piloten laddade upp, med filerna så som de laddades upp.
  write(
    join(dir, 'uppladdat.json'),
    [
      { role: 'startFrame', file: inputs.startFrame.file.replace(/^assets\//, ''), url: inputs.startFrame.url, assetId: inputs.startFrame.assetId, at: inputs.startFrame.uploaded },
      { role: 'endFrame', file: inputs.endFrame.file, url: inputs.endFrame.url, assetId: inputs.endFrame.assetId, at: inputs.endFrame.uploaded },
      { role: 'referenceVideos', file: inputs.referenceVideos[0].file, url: inputs.referenceVideos[0].url, assetId: inputs.referenceVideos[0].assetId, at: inputs.referenceVideos[0].uploaded },
    ],
  );
  const received = await taEmot(id, join(root, pilot.file), { taskId: pilot.order.taskId, credits: pilot.order.credits, before: pilot.order.balanceBefore, after: pilot.order.balanceAfter, at: '2026-11-18 10:01' }, { root, registry: options.registry, say });
  const values = received.values;
  const measured = pilot.measured;
  const docka = JSON.parse(readFileSync(join(dir, 'docka.json'), 'utf8')) as DollRead;
  const ordered = JSON.parse(readFileSync(join(dir, 'bestallning.json'), 'utf8'));
  const matning = JSON.parse(readFileSync(join(dir, 'matning.json'), 'utf8'));
  // Pilotens tal ur dess bestallning.json (measured) och granskarens ur output/work/granskning-pilot/omdome.json (text).
  const rows = [
    { what: 'klippets sha256', pilot: pilot.sha256, now: matning.sha256 },
    { what: 'sista bildens sha256', pilot: inputs.endFrame.sha256, now: ordered.inputs.endFrame.sha256 },
    { what: 'referensfilmens sha256', pilot: wanted, now: ordered.inputs.referenceVideos[0].sha256 },
    { what: 'text', pilot: 'text-cykel-t1.txt', now: ordered.prompt === text ? 'samma' : 'annan' },
    { what: 'första rutan mot första bilden, PSNR dB', pilot: measured['1_firstAndLast'].firstFrameVsFirstImage.psnrDb, now: values.forstaRutan },
    { what: 'sista rutan mot sista bilden, PSNR dB', pilot: measured['1_firstAndLast'].lastFrameVsLastImage.psnrDb, now: values.sistaRutan },
    { what: 'skarven utanför kortet, medelavvikelse per kanal', pilot: measured['1_firstAndLast'].lastFrameVsFirstFrameOutsideCard.meanAbs, now: values.skarvMedel },
    { what: 'skarven per region, värsta (granskaren)', pilot: 2.82, now: values.skarvRegion },
    { what: 'skarven med tecken, värsta (granskaren)', pilot: 0.96, now: values.skarvLjus },
    { what: 'skarven, givhandens tyngdpunkt bp (granskaren)', pilot: 0.4, now: values.skarvHand },
    { what: 'kortet lämnar skon, film s', pilot: measured['3_tempo'].cardLeavesShoe.film, now: matning.seconds.leavesShoe },
    { what: 'kortet lämnar skon, docka s', pilot: measured['3_tempo'].cardLeavesShoe.doll, now: docka.seconds.leavesShoe },
    { what: 'lands.at, film s', pilot: measured['3_tempo'].cardLies.film, now: matning.seconds.lands },
    { what: 'kortet ligger, docka s', pilot: measured['3_tempo'].cardLies.doll, now: docka.seconds.lands },
    { what: 'handen lämnar kortet, film s', pilot: measured['3_tempo'].handLeavesCard.film, now: matning.seconds.leavesCard },
    { what: 'handen lämnar kortet, docka s', pilot: measured['3_tempo'].handLeavesCard.doll, now: docka.seconds.leavesCard },
    { what: 'handen åter i skon, film s', pilot: measured['3_tempo'].handBackInShoe.film, now: matning.seconds.home },
    { what: 'handen åter i skon, docka s', pilot: measured['3_tempo'].handBackInShoe.doll, now: docka.seconds.home },
    { what: 'kortets hörnfel från lands.at, bp', pilot: measured['2_cardStill'].cornerErrorPx, now: values.kortetsHorn },
    { what: 'kortets blå yta efter handen, mot räknad yta', pilot: `${measured['2_cardStill'].blueAreaPxAfterHandLeft} bp`, now: values.kortetsYta },
    { what: 'givhandens bredd i REDO mot ankarets', pilot: '1,00–1,01', now: values.handIRedo },
    { what: 'givhandens bredd mot dockans inom ±0,15 s (granskaren)', pilot: 'högst 1,08', now: values.handMotDockan },
    { what: 'skons bakre del mot ruta 0 (granskaren, medel av största kanal)', pilot: 1.29, now: values.skon },
    { what: 'inre skärmen som avviker > 12, % (granskaren)', pilot: '0,009–0,05', now: values.gront },
    { what: 'rutor med glipa (granskaren)', pilot: 1, now: values.glipaRutor },
    { what: 'största glipa bp (granskaren)', pilot: 4, now: values.glipaHojd },
    { what: 'flest kortdelar i en ruta', pilot: measured['7_faults'].mostCardsInAFrame, now: values.kortdelar },
    { what: 'rutor med gul form (granskaren)', pilot: 4, now: values.gulForm },
    { what: 'nästa kort, längst från ruta 0, bp (granskaren)', pilot: 'inom 4', now: values.nastaKortFlyttar },
    { what: 'takt (granskaren)', pilot: 1.49, now: values.takt },
    { what: 'huvudets vridning bp', pilot: 60, now: values.huvudet },
    { what: 'beviset: blått kvar, bp (granskaren)', pilot: 0, now: values.bevisBlatt ?? null },
    { what: 'beviset: korthörn, bp', pilot: measured.sceneProof.sceneCardCornerErrorPx, now: values.bevisHorn ?? null },
  ];
  write(join(dir, 'jamforelse.json'), { about: 'Pilotens tal (output/work/cykel/pilot/bestallning.json och granskarens output/work/granskning-pilot/omdome.json) mot samma tal mätta av src/pipeline/tagning.ts pröva.', rows });
  say('Jämförelse med pilotens tal:');
  for (const row of rows) say(`  ${row.what.padEnd(58)} pilot ${shown(row.pilot).padEnd(18)} nu ${shown(row.now)}`);
  return { id, rows };
}

// ---------------------------------------------------------------------------------------------------------------------
// Kommandoraden

const USAGE = `Använd:
  node src/pipeline/tagning.ts forbered <dealer> <vy> <plats> <kort> [deal|hole|flip] [--cykel <namn>] [--text <fil> | --textnamn <namn>]
      [--referensklipp <klipp i registret> [--roll referenceVideos|referenceVideo] --variant <ord>] [--utan-referens --variant <ord>]
      [--sedan <plats-kort>[,<plats-kort> …] --utan-referens --variant <ord> --textnamn <namn>] [--langd <s>]
      [--modell <id> --upplosning <r> --bilder ram|referens --variant <ord>]
  node src/pipeline/tagning.ts ta-emot <id> <film> --task <taskId> --krediter <n> --saldo-fore <n> --saldo-efter <n> [--tid "ÅÅÅÅ-MM-DD TT:MM"]
  node src/pipeline/tagning.ts mät-om <id>
  node src/pipeline/tagning.ts pröva
Vyn är spelaren eller plats-N. Platsen är 1–7, eller D för dealern; kort är kortplatsens nummer på platsen, 0 för den
första (dealerns kort 0 är det öppna kortet och kort 1 hålkortet). Handlingen är deal om inget sägs:
  deal  kortet läggs med framsidan upp         forbered <dealer> spelaren 3 2     forbered <dealer> spelaren D 0
  hole  hålkortet läggs med baksidan upp       forbered <dealer> spelaren D 1 hole
  flip  hålkortet vänds där det ligger          forbered <dealer> spelaren D 1 flip`;

/** Platsen ur ett ord: 1–7, eller D (d) för dealern. */
const seatOf = (word: string): Seat => (word === 'D' || word === 'd' ? 'D' : /^\d+$/.test(word) ? Number(word) : NaN);

if (import.meta.main) {
  const [word, ...args] = process.argv.slice(2);
  try {
    const words = wordsIn(args);
    if (word === 'forbered' && (words.length === 4 || words.length === 5)) {
      const [dealer, view, seat, index, action] = words;
      // --cykel: en annan cykel i content/moves/ än cykel-nyp; --text: texten till filmmodellen ur en fil i stället för
      // content/tagning.json, och --textnamn en namngiven text där; --referensklipp, --roll och --variant: se överst.
      const textFile = flag(args, '--text');
      const text = textFile ? readFileSync(join(ROOT, textFile), 'utf8').trim() : undefined;
      const clip = flag(args, '--referensklipp');
      const fromClip = clip ? { file: clip, role: (flag(args, '--roll') ?? 'referenceVideos') as ClipRole } : undefined;
      if (!clip && flag(args, '--roll')) throw new TagningError('--roll gäller --referensklipp');
      // --sedan 5-0,6-0: fler kort i samma tagning, med REDO emellan (en följd); --langd: filmens längd i hela sekunder.
      const then = flag(args, '--sedan')?.split(',').map((word) => {
        const match = /^([1-7dD])-(\d+)$/.exec(word.trim());
        if (!match) throw new TagningError(`--sedan: ${word} är inte plats-kort, till exempel 5-0`);
        return { seat: seatOf(match[1]!), index: Number(match[2]) };
      });
      const length = flag(args, '--langd');
      // --modell, --upplosning: en annan filmmodell än content/tagning.json; --bilder ram|referens: se PrepareOptions.frames.
      const others = { model: flag(args, '--modell'), resolution: flag(args, '--upplosning'), frames: flag(args, '--bilder') as PrepareOptions['frames'] };
      await forbered(
        { dealer: dealer!, view: view!, seat: seatOf(seat!), index: Number(index), action: (action ?? 'deal') as Action, cycle: flag(args, '--cykel'), variant: flag(args, '--variant'), ...(then ? { then } : {}) },
        { text, textName: flag(args, '--textnamn'), fromClip, noReference: args.includes('--utan-referens'), ...(length !== undefined ? { duration: Number(length) } : {}), ...Object.fromEntries(Object.entries(others).filter(([, value]) => value !== undefined)) },
      );
    } else if (word === 'ta-emot' && args.length >= 2) {
      const number = (name: string): number => {
        const value = flag(args, name);
        if (value === undefined || !/^\d+$/.test(value)) throw new TagningError(`${name} <heltal> saknas`);
        return Number(value);
      };
      const taskId = flag(args, '--task');
      if (!taskId) throw new TagningError('--task <taskId> saknas');
      await taEmot(args[0]!, args[1]!, { taskId, credits: number('--krediter'), before: number('--saldo-fore'), after: number('--saldo-efter'), at: flag(args, '--tid') });
    } else if ((word === 'mät-om' || word === 'mat-om') && args.length === 1) {
      await matOm(args[0]!);
    } else if (word === 'pröva' || word === 'prova') {
      await prova();
    } else {
      console.error(USAGE);
      process.exitCode = 2;
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}


