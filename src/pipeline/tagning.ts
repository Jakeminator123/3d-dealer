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
// av och prövas mot står i content/tagning.json; scenen, dockan och cykeln i content/scene.json, doll.json och moves/.
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
import { readScene } from '../scene/description.ts';
import { ACTIONS, cardPlace, poseAt, type Action, type Seat } from '../scene/dollPose.ts';
import { viewEye, type Eye, type SeatView } from '../scene/geometry.ts';
import { closeView, cycleMove, paintedPicture, placeWords, readCycleParts, type CycleCard, type CycleParts } from './cykel.ts';
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
import { about, addMeasurement, addOrder, addUpload, dropMeasurements, getEntry, importAsset, sha256Of, stamp, studioRoot, unsigned, type Order, type Post } from './registry.ts';
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
  order: { tool: string; model: string; resolution: string; duration: number; ratio: string; source: string };
  reference: { studio: { screen: number[]; table: number[] }; fps: number };
  redo: { anchors: Record<string, Record<string, string>> };
  /**
   * `text` är texten för en giv. `actions` säger vad som byts i den för de andra handlingarna: varje par är en mening ur
   * `text` och den mening som står i stället, så att det som är lika står på ett ställe.
   */
  prompt: { text: string; source: string; actions: Record<Exclude<Action, 'deal'>, { replace: [string, string][]; source: string }> };
  proof: { background: { file: string; kind: '360' | 'platt'; turn: number; blur: number; exposure: number; mirror: boolean }; face: string; fps: number };
  measure: Measure;
  limits: Record<string, Limit>;
};

export function readTagning(root = ROOT): TagningContent {
  const read = JSON.parse(readFileSync(join(root, 'content', 'tagning.json'), 'utf8')) as TagningContent & { limits: Record<string, unknown> };
  const wrong: string[] = [];
  const need = (ok: boolean, what: string) => {
    if (!ok) wrong.push(what);
  };
  for (const group of ['order', 'reference', 'redo', 'prompt', 'proof', 'measure', 'limits'] as const) {
    const marked = read[group] as { basis?: unknown; source?: unknown } | undefined;
    need((marked?.basis === 'mätt' || marked?.basis === 'antaget') && typeof marked?.source === 'string', `${group}: basis och source`);
  }
  need(typeof read.order?.model === 'string' && Number.isFinite(read.order?.duration), 'order: model och duration');
  need(Number.isFinite(read.reference?.fps) && read.reference.fps > 0, 'reference.fps');
  need(typeof read.prompt?.text === 'string' && !/[{}]/.test(read.prompt.text), 'prompt.text, utan platshållare');
  for (const action of ACTIONS.filter((entry): entry is Exclude<Action, 'deal'> => entry !== 'deal')) {
    const given = read.prompt?.actions?.[action];
    const pairs = Array.isArray(given?.replace) && given.replace.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((part) => typeof part === 'string' && part !== ''));
    need(pairs && typeof given?.source === 'string' && given.source !== '', `prompt.actions.${action}: replace (par av meningar) och source`);
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
 * inte står i texten precis en gång är ett fel: då har mallen ändrats utan att bytena har det.
 */
export function promptFor(content: TagningContent, action: Action = 'deal'): string {
  if (action === 'deal') return content.prompt.text;
  let text = content.prompt.text;
  for (const [from, to] of content.prompt.actions[action].replace) {
    const at = text.indexOf(from);
    if (at < 0 || text.indexOf(from, at + 1) >= 0) throw new TagningError(`prompt.actions.${action}: "${from.slice(0, 60)}…" står inte precis en gång i texten`);
    text = text.slice(0, at) + to + text.slice(at + from.length);
  }
  return text;
}

// ---------------------------------------------------------------------------------------------------------------------
// Paketets namn

/** En tagning: dealer, vy, plats (1–7 eller D), kortplats, handling (deal om inget sägs) och cykel (cykel-nyp om inget sägs). */
export type Spec = { dealer: string; view: string; seat: Seat; index: number; action?: Action; cycle?: string };

const WORD = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** Slaget i ett namn: cykeln, och handlingen efter den när den inte är deal: cykel-nyp, cykel-nyp-hole, cykel-nyp-flip. */
const kindOf = (spec: Spec, cycle: string): string => `${cycle}${(spec.action ?? 'deal') === 'deal' ? '' : `-${spec.action}`}`;
/** Platsen i ett filnamn, med små bokstäver som registrets namn: 1–7, eller d för dealern. */
const seatName = (seat: Seat): string => (seat === 'D' ? 'd' : String(seat));
const prefixOf = (spec: Spec, cycle: string): string => `${spec.dealer}_${spec.view}_${kindOf(spec, cycle)}_${seatName(spec.seat)}-${spec.index}`;
/**
 * Paketets namn: dealer, vy, slag, plats-kort och tagning, till exempel paulina_spelaren_cykel-nyp_4-0_t1 och
 * paulina_spelaren_cykel-nyp-hole_d-1_t1.
 */
export const packageId = (spec: Spec, cycle: string, take: number): string => `${prefixOf(spec, cycle)}_t${take}`;
/** Klippets namn i registret, som tagningarna där heter: dealers/<dealer>/clips/<slag>-<plats>-<kort>_<vy>_t<n>.mp4. */
export const clipFile = (spec: Spec, cycle: string, take: number): string =>
  `dealers/${spec.dealer}/clips/${kindOf(spec, cycle)}-${seatName(spec.seat)}-${spec.index}_${spec.view}_t${take}.mp4`;

/** Det klippet gör, i ord: "plats 4, kort 1", "dealerns kort 0", "hålkortet (dealerns kort 1)", "vändningen av hålkortet (dealerns kort 1)". */
export function cardWords(seat: Seat, index: number, action: Action = 'deal'): string {
  const where = seat === 'D' ? `dealerns kort ${index}` : `plats ${seat}, kort ${index}`;
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

/** Dockans handled när kortet läggs och fingrarna vilar: största vinkeln mellan underarm och hand, i grader. */
export function dollWrist(parts: CycleParts, card: CycleCard): number {
  const { scene, doll } = parts;
  const move = cycleMove(parts, card);
  const from = Math.max(0, move.moments.rests - 6);
  const to = move.back?.letsGo ?? move.frameCount - 1;
  let most = 0;
  for (let frame = from; frame <= to; frame++) {
    const pose = poseAt(scene, doll, move, frame / move.fps);
    const { elbow, wrist } = pose.arms.left;
    const hand = pose.hands.left;
    const a = [wrist[0] - elbow[0], wrist[1] - elbow[1], wrist[2] - elbow[2]];
    const b = [hand[9]![0] - hand[0]![0], hand[9]![1] - hand[0]![1], hand[9]![2] - hand[0]![2]];
    const cos = (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (Math.hypot(...a) * Math.hypot(...b));
    most = Math.max(most, (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
  }
  return Math.round(most);
}

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
// forbered

export type Prepared = { id: string; dir: string; order: Record<string, unknown>; checks: Judged[] };
export type PrepareOptions = {
  root?: string;
  out?: string;
  /** Tagningens nummer; annars nästa. */
  take?: number;
  /** En referensfilm som redan finns (räknad från projektmappen), i stället för att scenen sparar en ny. */
  reference?: string;
  /** En annan text än mallens: bara för en tagning som redan är beställd (pröva). */
  text?: string;
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
  const cycle = spec.cycle ?? 'cykel-nyp';
  const action = spec.action ?? 'deal';
  if (!WORD.test(spec.dealer)) throw new TagningError(`Ogiltig dealer: ${spec.dealer}`);
  if (!ACTIONS.includes(action)) throw new TagningError(`Okänd handling: ${action}. Skriv ${ACTIONS.join(', ')}.`);
  if (action !== 'deal' && spec.seat !== 'D') throw new TagningError(`${action} gäller dealerns hålkort: skriv plats D`);
  const view = viewOf(spec.view);
  const parts = readCycleParts(cycle, root);
  const { scene } = parts;
  const places = spec.seat === 'D' ? scene.places.dealer : scene.places.seats.find((entry) => entry.seat === spec.seat)?.cards;
  if (!places) throw new TagningError(`Scenen har ingen plats ${spec.seat}`);
  if (!Number.isInteger(spec.index) || !places[spec.index]) throw new TagningError(`${spec.seat === 'D' ? 'Dealern' : `Plats ${spec.seat}`} har ingen kortplats ${spec.index}`);
  cardPlace(scene, spec.seat, spec.index);
  const card: CycleCard = { seat: spec.seat, index: spec.index, action };
  const words = cardWords(spec.seat, spec.index, action);
  const anchorFile = content.redo.anchors[spec.dealer]?.[spec.view];
  if (!anchorFile) throw new TagningError(`content/tagning.json säger inget REDO-ankare för ${spec.dealer} ur ${spec.view} (redo.anchors)`);
  const anchor = join(root, 'assets', anchorFile);
  if (!existsSync(anchor)) throw new TagningError(`${anchorFile} finns inte i assets/`);

  const take = options.take ?? nextTake(out, spec, cycle);
  const id = packageId(spec, cycle, take);
  const dir = join(out, id);
  Object.assign(made, { dir, fresh: !existsSync(dir) });
  mkdirSync(dir, { recursive: true });
  const at = (file: string) => join(dir, file);

  // Första bilden är ankaret; i en vändning ligger hålkortet målat gult i den. Sista bilden har kortet som det ligger.
  const firstPainted = await paintedPicture(parts, anchor, card, 'first', at('forsta.png'), { ...view, close: true });
  if (!firstPainted) copyFileSync(anchor, at('forsta.png'));
  const painted = (await paintedPicture(parts, anchor, card, 'last', at('sista.png'), { ...view, close: true }))!;

  let source = options.reference;
  if (!source) {
    say(`Dockans film för ${words} ur ${spec.view} sparas i ${content.reference.fps} rutor/s …`);
    source = await shootReference(content, cycle, view, card, say);
  }
  copyFileSync(join(root, source), at('referens.mp4'));
  const reference = await probe(at('referens.mp4'));
  const text = options.text ?? promptFor(content, action);
  writeFileSync(at('text.txt'), text);

  // Dockans film mätt som klippet sedan mäts, och sedd som ark.
  const layout = layoutFor(parts, view, card, content.measure);
  const { doll } = await measureDoll(root, dir, layout, content.measure, true);

  const wrist = dollWrist(parts, card);
  const checks = content.limits.dockansHandled ? [judgeOne('dockansHandled', wrist, content.limits.dockansHandled)] : [];
  const pkg = posix(relative(root, dir));
  const order = {
    about: 'Beställningen av en tagning, gjord av src/pipeline/tagning.ts forbered. Allt Runways generate_video behöver: modell, upplösning, längd, text och vilka filer som är startFrame, endFrame och referenceVideos. Filerna ligger i paketet; source säger var de kommer ifrån.',
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
    clip: clipFile(spec, cycle, take),
    anchor: anchorFile,
    model: content.order.model,
    resolution: content.order.resolution,
    duration: content.order.duration,
    ratio: content.order.ratio,
    tool: content.order.tool,
    promptFile: `${pkg}/text.txt`,
    prompt: text,
    inputs: {
      startFrame: firstPainted
        ? {
            file: `${pkg}/forsta.png`,
            sha256: sha256Of(at('forsta.png')),
            madeWith: `paintedPicture i src/pipeline/cykel.ts: ${anchorFile} med märkkortet målat ${firstPainted.side === 'baksida' ? 'gult' : 'blått'} där kortet ligger när ${kindOf(spec, cycle)} börjar, ${words}`,
            painted: firstPainted.painted,
            spared: firstPainted.spared,
            corners: firstPainted.corners,
          }
        : { file: `${pkg}/forsta.png`, asset: anchorFile, sha256: sha256Of(at('forsta.png')), note: 'vyns REDO-ankare (content/tagning.json, redo.anchors), oförändrat' },
      endFrame: {
        file: `${pkg}/sista.png`,
        sha256: sha256Of(at('sista.png')),
        madeWith: `paintedPicture i src/pipeline/cykel.ts: ${anchorFile} med märkkortet målat ${painted.side === 'baksida' ? 'gult' : 'blått'} där ${kindOf(spec, cycle)} lägger kortet, ${words}`,
        painted: painted.painted,
        spared: painted.spared,
        corners: painted.corners,
      },
      referenceVideos: [
        {
          file: `${pkg}/referens.mp4`,
          source: posix(source),
          sha256: sha256Of(at('referens.mp4')),
          durationSeconds: reference.seconds,
          frames: reference.frames,
          fps: reference.fps,
          note: `dockan gör ${kindOf(spec, cycle)}, ${words}, ur ${viewTitle(view)}s närbild i grå ateljé (mätt med ffprobe)`,
        },
      ],
    },
    doll: { file: `${pkg}/docka.json`, seconds: doll.seconds, wristDeg: wrist, sheet: `${pkg}/ark-docka.jpg` },
    scene: {
      shoe: shoeOf(scene.shoe),
      eye: eyeOf(viewEye(scene, { ...view, close: true })),
      place: cardPlace(scene, spec.seat, spec.index),
      source: 'content/scene.json när paketet gjordes: skon, som är inbakad i ankaret och klippet, vyns närbild som filmen görs i, och kortplatsen kortet läggs på. Klippet mäts mot dem (partsOf), och posten bär dem (eye, shoe, place)',
    },
    checks,
    uploads: `${pkg}/uppladdat.json: [{ "role": "startFrame" | "endFrame" | "referenceVideos", "url": "<adressen>", "assetId": "<id>", "at": "ÅÅÅÅ-MM-DD TT:MM" }]`,
  };
  write(at('bestallning.json'), order);

  say(`Paket: ${pkg}`);
  say(`  första bild   forsta.png   (${anchorFile}${firstPainted ? `, med hålkortet målat gult: ${firstPainted.painted} bp` : ''})`);
  say(`  sista bild    sista.png    (märkkortet ${painted.side === 'baksida' ? 'gult' : 'blått'}, ${words}: ${painted.painted} bp målade)`);
  say(`  referens      referens.mp4 (${shown(reference.seconds)} s, ${reference.frames} rutor, ${shown(reference.fps)} rutor/s)`);
  say(`  text          text.txt`);
  say(`  dockan        ark-docka.jpg; kortet ligger ${shown(doll.seconds.lands)} s, handen åter i skon ${shown(doll.seconds.home)} s`);
  for (const check of checks) say(`  ${check.verdict.toUpperCase().padEnd(9)} ${check.what}: ${shown(check.value)} ${check.unit} (${check.limit})`);
  say('Härnäst, för agenten:');
  say('  1. Se på ark-docka.jpg. Läs saldot (whoami eller show_plans_and_credits).');
  say('  2. Ladda upp forsta.png, sista.png och referens.mp4 (init_upload, curl, complete_upload). Skriv adresserna i');
  say(`     ${pkg}/uppladdat.json (formen står i bestallning.json, uploads).`);
  say(`  3. generate_video: ${content.order.model}, ${content.order.resolution}, ${content.order.duration} s, ${content.order.ratio}; startFrame forsta.png,`);
  say('     endFrame sista.png, referenceVideos [referens.mp4], texten ur text.txt.');
  say('  4. Läs saldot igen och ladda ned filmen. Sedan:');
  say(`     node src/pipeline/tagning.ts ta-emot ${id} <film> --task <taskId> --krediter <n> --saldo-fore <n> --saldo-efter <n>`);
  return { id, dir, order, checks };
}

// ---------------------------------------------------------------------------------------------------------------------
// Beviset i scenen

type Proof = { file: string; frames: number; cyanMost: number; cyanFrames: number; corners: { x: number; y: number }[] | null; cornerError: number | null; sheet: string };

/**
 * Klippet nycklat i scenen ur vyns närbild, med rummet, kortplatserna utritade och scenens kort lagt från `landsAt`:
 * med framsidan upp, eller för hålkortet med baksidan (face null). Klippet är en följd med ett klipp (FilmNote).
 * Scenen läser filmen ur en egen datamapp i paketet (STUDIO_DATA), så att assets/ inte rörs; mappen tas bort efteråt.
 * Mätt: blått eller cyan kring kort och hand i varje ruta där kortet ligger, och scenens korthörn i sista rutan.
 */
async function proofOf(root: string, dir: string, clip: string, asset: string, view: SeatView, card: CycleCard, landsAt: number, layout: Layout, content: TagningContent, shoe: Shoe, say: (text: string) => void): Promise<Proof> {
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
  link(clip, asset);
  const face = card.action === 'hole' ? null : content.proof.face;
  const order = {
    dealer: { kind: 'film', view, clips: [{ file: asset, card: { seat: card.seat, index: card.index, face, at: landsAt } }] },
    background: { ...content.proof.background, lift: scene.background.liftDeg, height: scene.room.captureHeight, radius: scene.room.radius },
    studio: null,
    shoe: true,
    places: true,
    view: { ...view, close: true },
    still: false,
    fps: content.proof.fps,
    label: 'bevis',
  };
  say('Beviset i scenen sparas …');
  const [result] = await shootAll([order], say, { data });
  if (!result?.ok) throw new TagningError(`Beviset gick inte att spara: ${result && !result.ok ? result.error : 'inget svar'}`);
  const file = join(dir, 'bevis.mp4');
  renameSync(join(data, result.saved.file), file);
  rmSync(data, { recursive: true, force: true });

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
  model: string; resolution: string; duration: number; ratio: string; prompt: string;
  inputs: { startFrame: { file: string; asset?: string }; endFrame: { file: string }; referenceVideos: { file: string; source: string }[] };
  scene?: { shoe: Shoe; eye?: FilmEye; place?: [number, number]; source: string };
};
const cardOf = (ordered: Ordered): CycleCard => ({ seat: ordered.seat, index: ordered.index, action: ordered.action ?? 'deal' });
const anchorOf = (ordered: Ordered): string => ordered.anchor ?? ordered.inputs.startFrame.asset!;

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
  const read = await readFilm(clip, film.fps, { layout, measure: content.measure, key, start: images.first, shoeFree }, (picture, index) => sheet.take(picture, index));
  await makeSheet(await Promise.all(sheet.tiles), at('ark.jpg'));
  const { values, times, seconds } = valuesOf(read, film, film.audio, layout, content.measure, images, doll);
  const landsAt = seconds.lands;

  // Beviset i scenen, när kortet har landat.
  let proof: Proof | null = null;
  if (proofToo && landsAt !== null) {
    proof = await proofOf(root, dir, clip, ordered.clip, view, cardOf(ordered), landsAt, layout, content, parts.scene.shoe, say);
    values.bevisBlatt = proof.cyanMost;
    values.bevisHorn = proof.cornerError;
  }
  const judged = judge(values, content.limits, doll.own);
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

/** Måtten som registret tar emot dem: varje mått med gräns, och de som bara visas. */
function measurementsOf(file: string, judged: Judged[], values: Values, scene: CycleParts['scene']): PostFile['measurements'] {
  return [
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
};

const flag = (args: string[], name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

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
  const measured = await measureTake(root, dir, ordered, clip, film, heard, content, parts, options.proof !== false, say);
  const { values, judged, summary, landsAt } = measured;
  const pkg = posix(relative(root, dir));

  // Posten, beställningen och måtten, som registret tar emot dem.
  const date = stamp();
  const action = ordered.action ?? 'deal';
  const anchor = anchorOf(ordered);
  const words = cardWords(ordered.seat, ordered.index, action);
  const startFile = ordered.inputs.startFrame.asset ?? ordered.inputs.startFrame.file;
  const uploads = existsSync(at('uppladdat.json'))
    ? (JSON.parse(readFileSync(at('uppladdat.json'), 'utf8')) as { role: string; url: string; assetId?: string; at?: string; file?: string }[]).map((entry) => ({
        file: entry.file ?? (entry.role === 'startFrame' ? startFile : entry.role === 'endFrame' ? ordered.inputs.endFrame.file : ordered.inputs.referenceVideos[0]!.file),
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
    { role: 'startFrame', what: ordered.inputs.startFrame.asset ?? `${ordered.inputs.startFrame.file}: ${anchor} med hålkortet målat gult där det ligger (src/pipeline/cykel.ts, paintedPicture)` },
    { role: 'endFrame', what: `${ordered.inputs.endFrame.file}: ${anchor} med märkkortet målat där kortet ligger, ${words} (src/pipeline/cykel.ts, paintedPicture)` },
    { role: 'referenceVideos[0]', what: `${ordered.inputs.referenceVideos[0]!.file} (förlagan ${ordered.inputs.referenceVideos[0]!.source}): dockan gör ${ordered.cycle} med ${action}, ${words}, ur ${viewTitle(view)}s närbild i grå ateljé` },
  ];
  const doing = action === 'hole' ? 'REDO → hålkortet lagt med baksidan upp → REDO' : action === 'flip' ? 'REDO → hålkortet vänt där det ligger → REDO' : 'REDO → kortet lagt → REDO';
  const post: Post = {
    from: '',
    file: ordered.clip,
    group: 'clips',
    dealer: ordered.dealer,
    title: `${action === 'deal' ? 'Cykel till ' : 'Cykel: '}${words} (nyp) ur ${viewTitle(view)}, tagning ${ordered.take}`,
    status: 'att granska',
    note: `Tagen emot ${date} genom src/pipeline/tagning.ts (paketet ${pkg}). ${ordered.model}, ${doing}. Mätt: ${summary}. Inte dömd: döms av en oberoende granskare.`,
    pose: 'redo → redo',
    grip: 'nyp',
    seat: ordered.seat,
    index: ordered.index,
    action,
    take: ordered.take,
    move: ordered.cycle,
    use: 'dealerfilm',
    view,
    lands: { seat: ordered.seat, index: ordered.index, at: landsAt === null ? null : Number(landsAt.toFixed(2)) },
    // Ögat filmen är gjord genom, skon den bär och var kortet landar: uppspelningen lägger filmen och kortet efter dem,
    // också när scenens tal ändras (round.ts, build.ts).
    eye: ordered.scene!.eye!,
    shoe: shoeOf(ordered.scene!.shoe),
    place: ordered.scene!.place ?? cardPlace(parts.scene, ordered.seat, ordered.index),
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
      promptNote: ordered.prompt === promptFor(content, action)
        ? `mallen i content/tagning.json, prompt${action === 'deal' ? '' : ` med prompt.actions.${action}`} (${pkg}/text.txt)`
        : `${pkg}/text.txt, inte mallen i content/tagning.json`,
      package: pkg,
    },
  };
  const order: Order = {
    at: receipt.at ?? date,
    model: ordered.model,
    kind: 'film',
    purpose: `${action === 'deal' ? 'Cykel till ' : 'Cykel: '}${words} ur ${viewTitle(view)}, tagning ${ordered.take} (${id})`,
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
  const measured = await measureTake(root, dir, ordered, clip, film, before.soundInDownload ?? false, content, parts, options.proof !== false, say);
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
  const spec: Spec = { dealer: 'paulina', view: 'spelaren', seat: 4, index: 0 };
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
  node src/pipeline/tagning.ts forbered <dealer> <vy> <plats> <kort> [deal|hole|flip]
  node src/pipeline/tagning.ts ta-emot <id> <film> --task <taskId> --krediter <n> --saldo-fore <n> --saldo-efter <n> [--tid "ÅÅÅÅ-MM-DD TT:MM"]
  node src/pipeline/tagning.ts mät-om <id>
  node src/pipeline/tagning.ts pröva
Vyn är spelaren eller plats-N. Platsen är 1–7, eller D för dealern; kort är kortplatsens nummer på platsen, 0 för den
första (dealerns kort 0 är det öppna kortet och kort 1 hålkortet). Handlingen är deal om inget sägs:
  deal  kortet läggs med framsidan upp         forbered paulina spelaren 3 2      forbered paulina spelaren D 0
  hole  hålkortet läggs med baksidan upp       forbered paulina spelaren D 1 hole
  flip  hålkortet vänds där det ligger          forbered paulina spelaren D 1 flip`;

/** Platsen ur ett ord: 1–7, eller D (d) för dealern. */
const seatOf = (word: string): Seat => (word === 'D' || word === 'd' ? 'D' : /^\d+$/.test(word) ? Number(word) : NaN);

if (import.meta.main) {
  const [word, ...args] = process.argv.slice(2);
  try {
    if (word === 'forbered' && (args.length === 4 || args.length === 5)) {
      const [dealer, view, seat, index, action] = args;
      await forbered({ dealer: dealer!, view: view!, seat: seatOf(seat!), index: Number(index), action: (action ?? 'deal') as Action });
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


