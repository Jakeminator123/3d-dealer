// Rundan: dealerns cykelklipp för en vy, ordnade som en giv delas ut och sparade som en film ur vyn med rum.
//
//   node src/pipeline/runda.ts <dealer> <vy> [--nara] [--plan]
//
// <vy> är spelaren eller plats-N. Vilka klipp som spelas och i vilken ordning väljs i src/scene/round.ts, som Labbets
// steg Scen också spelar rundan genom (Hela given): dealerns cykelklipp gjorda i vyn, i ordningen och med valörerna i
// content/runda.json. Kort utan klipp sägs, och de klipp som finns spelas. Filmen sparas genom shoot.ts som en förlaga
// under output/forlagor/, med beställningen och beskrivningen, och ett ark bredvid: första rutan och en ruta när varje
// klipp är slut. Med --nara sparas också vyns närbild, och med --plan sägs bara vad som skulle spelas.
//
// Rundan avgör ingenting i spelet: korten och deras ordning är en stå-in tills spelkärnan delar ut.

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { Background } from '../scene/backdrop.ts';
import { readScene, type SceneDescription } from '../scene/description.ts';
import { seatsOf, type SeatView } from '../scene/geometry.ts';
import { makeReel } from '../scene/reel.ts';
import { planRound, readRound, RoundError, roundFilm, type Place, type Plan, type Round } from '../scene/round.ts';
import { closeView } from './cykel.ts';
import { readRegistry, studioRoot, type RegistryEntry } from './registry.ts';
import { shootAll, type Shot } from './shoot.ts';

export { planRound, readRound, RoundError, type Place, type Plan, type Round, type Take } from '../scene/round.ts';

/** Bakgrunden i en beställning: registrets fil och hur den visas (src/lab/shoot.ts). */
export type OrderBackground = Omit<Background, 'url'> & { file: string };

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const placeName = (place: Place): string => `plats ${place.seat}, kort ${place.index}`;

/** Vyn ur ett ord: `spelaren` eller `plats-N`, så som registrets poster bär den (utan närbild). */
export function viewOfWord(word: string): SeatView {
  const view = closeView(word);
  return view.kind === 'plats' ? { kind: 'plats', seat: view.seat } : { kind: 'spelaren' };
}

/** Bakgrunden ur registrets post: filen, gamla projektets visning (`oldView`) och rummets mått ur scenen. */
export function backgroundOf(entry: RegistryEntry | undefined, scene: SceneDescription): OrderBackground {
  if (!entry) throw new RoundError('Rundans bakgrund har ingen post i registret');
  const old = (entry.oldView ?? {}) as Record<string, unknown>;
  const number = (value: unknown, fallback: number): number => (isNumber(value) ? value : fallback);
  const round = entry.kind !== 'platt';
  return {
    file: entry.file,
    kind: round ? '360' : 'platt',
    turn: number(old.turn, 0),
    blur: number(old.blur, 0),
    exposure: number(old.exposure, 1),
    mirror: typeof old.mirror === 'boolean' ? old.mirror : false,
    lift: round ? scene.background.liftDeg : 0,
    height: scene.room.captureHeight,
    radius: scene.room.radius,
  };
}

/**
 * Beställningen av rundan som film: dealerns följd av klipp ur vyn `view` (med `close` ur dess närbild), med rummet
 * och scenens sko, i rundans takt. Samma form som varje annan förlaga (src/lab/shoot.ts).
 */
export function roundOrder(plan: Plan, round: Round, view: SeatView, background: OrderBackground, label: string, close = false): Shot {
  return {
    view: close ? { ...view, close: true } : view,
    dealer: roundFilm(plan, round, view),
    background,
    studio: null,
    shoe: true,
    still: false,
    fps: round.film.fps,
    label,
  };
}

/** Rundans tidslinje ur klippens längder i registret: där varje klipp slutar. */
export function clipEnds(plan: Plan, hold: number): number[] {
  const reel = makeReel(plan.dealt.map((take) => ({ seconds: take.seconds ?? 0 })), hold);
  return reel.starts.map((start, index) => start + reel.parts[index]!.seconds);
}

const run = promisify(execFile);

/** Rutan på tiden `time` i filmen `film`, som PNG. */
async function frameAt(film: string, time: number): Promise<Buffer> {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-ss', time.toFixed(4), '-i', film, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

const escapeXml = (text: string): string => text.replace(/[<>&]/g, (sign) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[sign]!);

/**
 * Ett ark ur filmen `film`: rutorna på tiderna `times`, var och en med sin text, fyra i bredd, 480 bildpunkter breda.
 * Arket sparas som JPEG i `out`.
 */
export async function sheet(film: string, times: { time: number; text: string }[], out: string, width = 480, columns = 4): Promise<void> {
  const tiles = await Promise.all(
    times.map(async ({ time, text }) => {
      const tile = await sharp(await frameAt(film, time)).resize({ width }).png().toBuffer();
      const { height = 0 } = await sharp(tile).metadata();
      const label = Buffer.from(
        `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${width}" height="24" fill="black" fill-opacity="0.6"/><text x="6" y="17" font-family="Arial, sans-serif" font-size="15" fill="white">${escapeXml(text)}</text></svg>`,
      );
      return { tile: await sharp(tile).composite([{ input: label }]).png().toBuffer(), height };
    }),
  );
  const height = tiles[0]?.height ?? 0;
  const rows = Math.ceil(tiles.length / columns);
  await sharp({ create: { width: width * Math.min(columns, tiles.length), height: height * rows, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite(tiles.map(({ tile }, index) => ({ input: tile, left: (index % columns) * width, top: Math.floor(index / columns) * height })))
    .jpeg({ quality: 85 })
    .toFile(out);
}

const comma = (value: number): string => value.toFixed(2).replace('.', ',');

/** Arkets rutor: första rutan, och sista rutan i varje klipp, med kortet det lade. */
export function sheetTimes(plan: Plan, round: Round): { time: number; text: string }[] {
  const ends = clipEnds(plan, round.film.hold);
  const half = 0.5 / round.film.fps;
  return [
    { time: half, text: 'början' },
    ...plan.dealt.map((take, index) => ({ time: Math.max(half, ends[index]! - half), text: `${index + 1}: ${placeName(take.place)} slut (${comma(ends[index]! - half)} s)` })),
  ];
}

/** Sparar rundans beställningar genom shoot.ts, och ett ark bredvid varje film. Svaret är filerna, räknade från `root`. */
export async function shootRound(root: string, orders: Shot[], plan: Plan, round: Round, say: (text: string) => void, data?: string) {
  const results = await shootAll(orders, say, data ? { data } : {});
  const saved: { film: string; json: string; sheet: string }[] = [];
  for (const result of results) {
    if (!result.ok) throw new RoundError(`Rundan gick inte att spara: ${result.error}${result.problems.length ? ` (${result.problems.join('; ')})` : ''}`);
    const base = data ?? root;
    const film = join(base, result.saved.file);
    const out = film.replace(/\.mp4$/, '-ark.jpg');
    await sheet(film, sheetTimes(plan, round), out);
    saved.push({ film, json: join(base, result.saved.json), sheet: out });
  }
  return saved;
}

if (import.meta.main) {
  const words = process.argv.slice(2);
  const flags = new Set(words.filter((word) => word.startsWith('--')));
  const [dealer, viewWord] = words.filter((word) => !word.startsWith('--'));
  if (!dealer || !viewWord) {
    console.error('Använd: node src/pipeline/runda.ts <dealer> <spelaren|plats-N> [--nara] [--plan]');
    process.exit(1);
  }
  try {
    const root = studioRoot();
    const content = (file: string): unknown => JSON.parse(readFileSync(join(root, 'content', file), 'utf8'));
    const round = readRound(content('runda.json'));
    const scene = readScene(content('scene.json'));
    const view = viewOfWord(viewWord);
    if (view.kind === 'plats' && !seatsOf(scene).includes(view.seat)) throw new RoundError(`Scenen har ingen plats ${view.seat}`);
    const registry = readRegistry(root);
    const plan = planRound(round, registry.assets, dealer, view);
    console.log(`Rundan för ${dealer} ur ${viewWord}: ${plan.dealt.length} av ${round.order.length} kort har klipp.`);
    plan.dealt.forEach((take, index) => console.log(`  ${index + 1}. ${placeName(take.place)}: ${take.face}, ${take.file} (${take.status}, kortet ligger från ${comma(take.at)} s)`));
    if (plan.missing.length > 0) console.log(`Saknar klipp: ${plan.missing.map(placeName).join('; ')}.`);
    for (const item of plan.unusable) console.log(`Spelas inte: ${item.file}: ${item.why}.`);
    if (flags.has('--plan')) process.exit(0);
    if (plan.clips.length === 0) throw new RoundError('Inget klipp att spela.');
    const background = backgroundOf(registry.assets.find((entry) => entry.file === round.film.background), scene);
    const label = `runda-${dealer}`;
    const orders = [roundOrder(plan, round, view, background, label), ...(flags.has('--nara') ? [roundOrder(plan, round, view, background, label, true)] : [])];
    const saved = await shootRound(root, orders, plan, round, (text) => console.error(text));
    for (const files of saved) console.log(`Sparad: ${files.film}\n  ark: ${files.sheet}\n  beskrivning: ${files.json}`);
    process.exit(0);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
