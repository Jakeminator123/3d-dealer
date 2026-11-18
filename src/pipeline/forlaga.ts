// Förlagan: en stillbild eller ett klipp som scenen har ritat ur en fast vy, sparat under output/forlagor/.
// Scenen ritar rutorna i webbläsaren och lämnar dem en i taget. Här får förlagan sitt namn, rutorna sin plats, och när den
// sista rutan är inne sätts klippet ihop med ffmpeg och beskrivningen skrivs bredvid: vy, öga, dealer, bakgrund, rutor och tid.
// En förlaga är underlag för filmer som görs sedan. Den avgör ingenting i spelet.

import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import type { CardNote, CardSpot, ClipCard, DealerNote as Dealer, FilmClip, FilmEye, FilmNote, FilmShoe, OneClipNote, Rgb, Studio } from '../scene/dealer.ts';
import type { Frame, Vec3 } from '../scene/description.ts';
import { viewName, type SeatView, type View } from '../scene/geometry.ts';

export class ForlagaError extends Error {}

/** Det scenen säger om förlagan när den börjar. */
export type ForlagaOrder = {
  /** Sant för en stillbild, falskt för ett klipp. */
  still: boolean;
  frames: number;
  fps: number;
  frame: Frame;
  view: View;
  /** Ögat förlagan ritas ur, med brännvidden i förlagans ruta. */
  eye: { position: Vec3; forward: Vec3; focalPx: number };
  /** Dealern (se scene/dealer.ts). `time` är tiden i filmen eller rörelsen som en stillbild visar. */
  dealer: DealerNote | null;
  /** Bakgrunden som registrets `file`, med reglagens värden. */
  background: {
    file: string;
    kind: '360' | 'platt';
    turn: number;
    lift: number;
    blur: number;
    exposure: number;
    mirror: boolean;
    height: number;
    radius: number;
  } | null;
  /** Ateljén (se scene/dealer.ts). Null när scenen visas som den är. */
  studio: Studio | null;
  shoe: boolean;
  /** Om kortplatserna är utritade på filten. */
  places?: boolean;
  /** Scenens kort på en kortplats (se scene/dealer.ts), när ett sådant ligger där. */
  card?: CardNote;
  /** Ett ord som skiljer förlagan från andra ur samma uppställning, till exempel ställningen en stillbild visar. */
  label?: string;
};

export type DealerNote = Dealer & { time?: number };

/** Det som står i förlagans beskrivning, output/forlagor/<namn>.json. */
export type ForlagaRecord = ForlagaOrder & { name: string; file: string; seconds: number; savedAt: string };

/** Det scenen får veta när förlagan är sparad. Filerna räknas från projektmappen. */
export type Saved = { name: string; file: string; json: string; frames: number; seconds: number };

// Flest rutor i en förlaga: två minuter i 30 rutor per sekund. Skyddar disken mot en förfrågan som har räknat fel.
const MOST_FRAMES = 3600;
// Klippets kodning: nära förlustfri, och i det färgformat som webbläsare och filmmodeller läser.
const ENCODING = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
// Rutornas färger är skärmens (sRGB). Klippet märks med HD-filmens färgrymd, så att en spelare visar samma färger.
const COLOUR = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const NAME = /^[a-z0-9][a-z0-9_-]{0,119}$/;

const run = promisify(execFile);

export const forlagorDir = (root: string): string => join(root, 'output', 'forlagor');

/** Ett namn som går att ha i en sökväg: små bokstäver, siffror och bindestreck. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** En fils namn utan mapp och ändelse, städat. */
const stem = (file: string): string => slug(file.split(/[\\/]/).at(-1)!.replace(/\.[^.]*$/, ''));

// En följd heter efter sitt första klipp och hur många klipp den har; ett ensamt klipp heter som sin fil.
const dealerName = (dealer: DealerNote): string =>
  dealer.kind === 'docka'
    ? slug(`docka-${dealer.pose === 'vila' ? 'vila' : `${dealer.move}${dealer.action && dealer.action !== 'deal' ? `-${dealer.action}` : ''}${dealer.seat === undefined ? '' : `-till-${dealer.seat}`}${dealer.index === undefined ? '' : `-kort-${dealer.index}`}`}`)
    : 'clips' in dealer
      ? `${stem(dealer.clips.find((clip) => clip.file !== null)?.file ?? 'utan-klipp')}${dealer.clips.length > 1 ? `-och-${dealer.clips.length - 1}-till` : ''}`
      : stem(dealer.file);

/**
 * Förlagans namn: dealerns filnamn eller dockans rörelse, vyn och bakgrundens filnamn (`atelje` i ateljén), med
 * understreck emellan. En stillbild får `bild` sist, så att den och klippet ur samma uppställning inte skriver över
 * varandras beskrivning, och ett `label` läggs allra sist.
 */
export function forlagaName(order: Pick<ForlagaOrder, 'dealer' | 'view' | 'background' | 'still'> & Partial<Pick<ForlagaOrder, 'studio' | 'label'>>): string {
  const parts = [
    (order.dealer && dealerName(order.dealer)) || 'utan-dealer',
    viewName(order.view),
    (order.background && stem(order.background.file)) || (order.studio ? 'atelje' : 'utan-rum'),
    ...(order.still ? ['bild'] : []),
    ...(order.label && slug(order.label) ? [slug(order.label)] : []),
  ];
  return parts.join('_').slice(0, 120);
}

/** Var en förlaga med det namnet ligger. Ett namn som inte är städat tas inte emot: det ska inte kunna peka ut ur mappen. */
export function forlagaPaths(root: string, name: string): { dir: string; order: string; film: string; picture: string; json: string } {
  if (!NAME.test(name)) throw new ForlagaError(`Ogiltigt namn på förlagan: ${name}`);
  const base = forlagorDir(root);
  return {
    dir: join(base, name),
    order: join(base, name, 'bestallning.json'),
    film: join(base, `${name}.mp4`),
    picture: join(base, `${name}.png`),
    json: join(base, `${name}.json`),
  };
}

const frameFile = (index: number): string => `ruta-${String(index + 1).padStart(4, '0')}.png`;

/** Var ruta `index` (från 0) i en förlaga ligger: output/forlagor/<namn>/ruta-0001.png och framåt. */
export function framePath(root: string, name: string, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= MOST_FRAMES) throw new ForlagaError(`Ogiltigt nummer på rutan: ${index}`);
  return join(forlagaPaths(root, name).dir, frameFile(index));
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isVector = (value: unknown): boolean => Array.isArray(value) && value.length === 3 && value.every(isNumber);
const isRgb = (value: unknown): value is Rgb => isVector(value) && (value as number[]).every((part) => part >= 0 && part <= 255);
const isSeatView = (view: Partial<View> | undefined): view is SeatView =>
  (view?.kind === 'spelaren' || (view?.kind === 'plats' && Number.isInteger(view.seat) && (view.seat ?? 0) > 0)) &&
  (view.close === undefined || typeof view.close === 'boolean');
const seatView = (view: SeatView): SeatView => ({
  ...(view.kind === 'plats' ? { kind: 'plats', seat: view.seat } : { kind: 'spelaren' }),
  ...(view.close ? { close: true } : {}),
});
const MOVE = /^[a-z0-9][a-z0-9-]{0,79}$/;
// Flest klipp i en följd: en runda med dealerns kort och marginal.
const MOST_CLIPS = 64;

const isFace = (face: unknown): face is string => typeof face === 'string' && face.length >= 2 && face.length <= 3;
const isSpot = (spot: Partial<CardSpot> | undefined): boolean =>
  ((Number.isInteger(spot?.seat) && (spot!.seat as number) > 0) || spot?.seat === 'D') &&
  Number.isInteger(spot!.index) &&
  spot!.index! >= 0 &&
  (spot!.hand === undefined || (Number.isInteger(spot!.hand) && spot!.hand >= 0));
const isPair = (value: unknown): boolean => Array.isArray(value) && value.length === 2 && value.every(isNumber);
const isClipCard = (card: Partial<ClipCard> | undefined): card is ClipCard =>
  isSpot(card) && (card!.face === null || isFace(card!.face)) && isNumber(card!.at) && card!.at >= 0 && (card!.place === undefined || isPair(card!.place));
// Ögat och skon en följds filmer är gjorda med (dealer.ts, FilmEye och FilmShoe).
const isFilmEye = (eye: Partial<FilmEye> | undefined): boolean =>
  isVector(eye?.position) && isVector(eye?.forward) && isNumber(eye?.focalPx) && eye!.focalPx > 0 && isNumber(eye!.frame?.width) && isNumber(eye!.frame?.height);
const isFilmShoe = (shoe: Partial<FilmShoe> | undefined): boolean => isPair(shoe?.at) && isNumber(shoe?.yawDeg) && isNumber(shoe?.length) && shoe!.length! > 0;
// Ett klipp är en fil med sitt kort, eller en del utan fil där kortet går självt (spelkärnans fallback).
const isClip = (clip: Partial<FilmClip> | undefined): clip is FilmClip =>
  clip?.file === null
    ? isNumber(clip.seconds) && clip.seconds > 0 && isClipCard(clip.card) && (clip.from === 'skon' || isSpot(clip.from as Partial<CardSpot>))
    : typeof clip?.file === 'string' && clip.file !== '' && (clip.card === undefined || isClipCard(clip.card));
const spotOf = (spot: CardSpot): CardSpot => ({ seat: spot.seat, index: spot.index, ...(spot.hand ? { hand: spot.hand } : {}) });

function isDealer(dealer: Partial<DealerNote> | null | undefined): dealer is DealerNote {
  if (!dealer || !(dealer.time === undefined || isNumber(dealer.time))) return false;
  if (dealer.kind === 'docka') {
    const seated = dealer.seat === undefined || dealer.seat === 'D' || (Number.isInteger(dealer.seat) && dealer.seat > 0);
    const placed = dealer.index === undefined || (Number.isInteger(dealer.index) && dealer.index >= 0);
    const acting = dealer.action === undefined || dealer.action === 'deal' || dealer.action === 'hole' || dealer.action === 'flip' || dealer.action === 'wait';
    return typeof dealer.move === 'string' && MOVE.test(dealer.move) && (dealer.pose === 'giv' || dealer.pose === 'vila') && seated && placed && acting;
  }
  if (dealer.kind !== 'film' || !isSeatView(dealer.view)) return false;
  if ('clips' in dealer) {
    const { clips, hold, loop, eye, shoe } = dealer as Partial<FilmNote>;
    return (
      Array.isArray(clips) &&
      clips.length >= 1 &&
      clips.length <= MOST_CLIPS &&
      clips.every(isClip) &&
      (hold === undefined || (isNumber(hold) && hold >= 0)) &&
      (loop === undefined || typeof loop === 'boolean') &&
      (eye === undefined || isFilmEye(eye)) &&
      (shoe === undefined || isFilmShoe(shoe))
    );
  }
  const { file } = dealer as Partial<OneClipNote>;
  return typeof file === 'string' && file !== '';
}

function dealerNote(dealer: DealerNote): DealerNote {
  const time = dealer.time === undefined ? {} : { time: dealer.time };
  if (dealer.kind === 'docka') {
    return {
      kind: 'docka',
      move: dealer.move,
      pose: dealer.pose,
      ...(dealer.seat === undefined ? {} : { seat: dealer.seat }),
      ...(dealer.index === undefined ? {} : { index: dealer.index }),
      ...(dealer.action === undefined || dealer.action === 'deal' ? {} : { action: dealer.action }),
      ...time,
    };
  }
  if ('clips' in dealer) {
    const cardOf = (card: ClipCard): ClipCard => ({ ...spotOf(card), face: card.face, at: card.at, ...(card.place ? { place: [card.place[0], card.place[1]] as [number, number] } : {}) });
    const clips = dealer.clips.map((clip): FilmClip =>
      clip.file === null
        ? { file: null, seconds: clip.seconds, card: cardOf(clip.card), from: clip.from === 'skon' ? 'skon' : spotOf(clip.from) }
        : { file: clip.file, ...(clip.card ? { card: cardOf(clip.card) } : {}) },
    );
    return {
      kind: 'film',
      view: seatView(dealer.view),
      clips,
      ...(dealer.hold === undefined ? {} : { hold: dealer.hold }),
      ...(dealer.loop === undefined ? {} : { loop: dealer.loop }),
      ...(dealer.eye
        ? { eye: { position: [...dealer.eye.position] as Vec3, forward: [...dealer.eye.forward] as Vec3, focalPx: dealer.eye.focalPx, frame: { width: dealer.eye.frame.width, height: dealer.eye.frame.height } } }
        : {}),
      ...(dealer.shoe ? { shoe: { at: [dealer.shoe.at[0], dealer.shoe.at[1]] as [number, number], yawDeg: dealer.shoe.yawDeg, length: dealer.shoe.length } } : {}),
      ...time,
    };
  }
  return { kind: 'film', file: dealer.file, view: seatView(dealer.view), ...time };
}

/** Tar emot det scenen säger om förlagan och säger på svenska vad som saknas. Bara det som hör till förlagan följer med. */
export function readOrder(value: unknown): ForlagaOrder {
  const order = (value ?? {}) as Partial<ForlagaOrder>;
  const wrong: string[] = [];
  const need = (ok: boolean, what: string) => {
    if (!ok) wrong.push(what);
  };
  const { view, eye, dealer, background, frame } = order;
  need(typeof order.still === 'boolean', 'still');
  need(Number.isInteger(order.frames) && order.frames! >= 1 && order.frames! <= MOST_FRAMES, 'frames');
  need(order.still !== true || order.frames === 1, 'en stillbild är en ruta');
  need(isNumber(order.fps) && order.fps > 0, 'fps');
  need(Number.isInteger(frame?.width) && frame!.width > 0 && Number.isInteger(frame?.height) && frame!.height > 0, 'frame');
  need(isSeatView(view), 'view');
  need(isVector(eye?.position) && isVector(eye?.forward) && isNumber(eye?.focalPx) && eye.focalPx > 0, 'eye');
  need(dealer === null || isDealer(dealer), 'dealer');
  const studio = order.studio ?? null;
  need(studio === null || (isRgb(studio.screen) && (studio.table === null || isRgb(studio.table)) && (studio.grid === undefined || studio.grid === null || isRgb(studio.grid))), 'studio');
  need(order.label === undefined || typeof order.label === 'string', 'label');
  need(order.places === undefined || typeof order.places === 'boolean', 'places');
  const card = order.card;
  need(
    card === undefined ||
      (Number.isInteger(card?.seat) && card.seat > 0 && Number.isInteger(card.index) && card.index >= 0 && isFace(card.face) && isNumber(card.from)),
    'card',
  );
  // I en följd står varje kort i sitt klipp; `card` hör till ett ensamt klipp skrivet som förr.
  need(card === undefined || !(dealer && 'clips' in dealer), 'card hör till ett ensamt klipp; i en följd står kortet i klippet');
  need(
    background === null ||
      (typeof background?.file === 'string' &&
        background.file !== '' &&
        (background.kind === '360' || background.kind === 'platt') &&
        [background.turn, background.lift, background.blur, background.exposure, background.height, background.radius].every(isNumber) &&
        typeof background.mirror === 'boolean'),
    'background',
  );
  need(typeof order.shoe === 'boolean', 'shoe');
  if (wrong.length > 0) throw new ForlagaError(`Förlagans beställning går inte att använda: ${wrong.join('; ')}`);

  return {
    still: order.still!,
    frames: order.frames!,
    fps: order.fps!,
    frame: { width: frame!.width, height: frame!.height },
    view: seatView(view as SeatView),
    eye: { position: [...eye!.position] as Vec3, forward: [...eye!.forward] as Vec3, focalPx: eye!.focalPx },
    dealer: dealer ? dealerNote(dealer) : null,
    background: background
      ? {
          file: background.file,
          kind: background.kind,
          turn: background.turn,
          lift: background.lift,
          blur: background.blur,
          exposure: background.exposure,
          mirror: background.mirror,
          height: background.height,
          radius: background.radius,
        }
      : null,
    studio: studio
      ? { screen: [...studio.screen] as Rgb, table: studio.table ? ([...studio.table] as Rgb) : null, ...(studio.grid ? { grid: [...studio.grid] as Rgb } : {}) }
      : null,
    shoe: order.shoe!,
    ...(order.places ? { places: true } : {}),
    ...(card ? { card: { seat: card.seat, index: card.index, face: card.face, from: card.from } } : {}),
    ...(order.label ? { label: order.label } : {}),
  };
}

/**
 * Börjar en förlaga: ger den dess namn, tömmer mappen på rutor från en tidigare sparning med samma namn och skriver
 * beställningen där. Rutorna lämnas sedan en i taget med `saveFrame`.
 */
export function startForlaga(root: string, value: unknown): { name: string; frames: number } {
  const order = readOrder(value);
  const name = forlagaName(order);
  const paths = forlagaPaths(root, name);
  mkdirSync(paths.dir, { recursive: true });
  for (const file of readdirSync(paths.dir)) {
    if (/^ruta-\d+\.png$/.test(file)) rmSync(join(paths.dir, file));
  }
  writeFileSync(paths.order, `${JSON.stringify({ name, ...order }, null, 2)}\n`);
  return { name, frames: order.frames };
}

/**
 * Sparar en ruta av en påbörjad förlaga. Rutan ska vara en PNG med förlagans mått. När den sista rutan är inne
 * görs förlagan klar, och det som sparades kommer tillbaka; annars null. `now` är tiden som skrivs i beskrivningen.
 */
export async function saveFrame(root: string, name: string, index: number, png: Buffer, now: string): Promise<Saved | null> {
  const paths = forlagaPaths(root, name);
  if (!existsSync(paths.order)) throw new ForlagaError(`Förlagan ${name} är inte påbörjad`);
  const order = readOrder(JSON.parse(readFileSync(paths.order, 'utf8')));
  const path = framePath(root, name, index);
  if (index >= order.frames) throw new ForlagaError(`Förlagan har ${order.frames} rutor; ruta ${index + 1} finns inte`);
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new ForlagaError('Rutan är inte en PNG');
  // En PNG börjar med sina mått: bredd och höjd står på plats 16 och 20.
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== order.frame.width || height !== order.frame.height) {
    throw new ForlagaError(`Rutan är ${width} × ${height}; förlagan är ${order.frame.width} × ${order.frame.height}`);
  }
  writeFileSync(path, png);
  return index === order.frames - 1 ? finish(root, name, order, now) : null;
}

/** Gör förlagan klar: stillbilden läggs bredvid mappen, klippet sätts ihop av rutorna, och beskrivningen skrivs. */
async function finish(root: string, name: string, order: ForlagaOrder, now: string): Promise<Saved> {
  const paths = forlagaPaths(root, name);
  const missing = Array.from({ length: order.frames }, (_, index) => index).filter((index) => !existsSync(framePath(root, name, index)));
  if (missing.length > 0) {
    throw new ForlagaError(`Förlagan saknar ${missing.length} av ${order.frames} rutor, först ruta ${missing[0]! + 1}`);
  }
  const target = order.still ? paths.picture : paths.film;
  if (order.still) {
    // Stillbilden är förlagan själv: mappen med den enda rutan och beställningen behövs inte längre.
    copyFileSync(framePath(root, name, 0), target);
    rmSync(paths.dir, { recursive: true });
  } else {
    try {
      await run('ffmpeg', ['-v', 'error', '-y', '-framerate', String(order.fps), '-start_number', '1', '-i', join(paths.dir, 'ruta-%04d.png'), ...COLOUR, ...ENCODING, target]);
    } catch (error) {
      throw new ForlagaError(`ffmpeg kunde inte sätta ihop klippet: ${(error as Error).message.trim().split('\n').at(-1)}`);
    }
  }
  const within = (path: string): string => relative(root, path).replaceAll('\\', '/');
  // En stillbild har ingen längd.
  const seconds = order.still ? 0 : +(order.frames / order.fps).toFixed(4);
  const record: ForlagaRecord = { name, file: within(target), savedAt: now, seconds, ...order };
  writeFileSync(paths.json, `${JSON.stringify(record, null, 2)}\n`);
  return { name, file: within(target), json: within(paths.json), frames: order.frames, seconds };
}
