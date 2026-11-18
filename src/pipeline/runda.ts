// Rundan: en giv som spelkärnan har delat, spelad med dealerns klipp ur en vy och sparad som film ur vyn med rum.
//
//   node src/pipeline/runda.ts <dealer> <vy> [--fro <ord>] [--fart <tal>] [--nara] [--plan]
//
// <vy> är spelaren eller plats-N. Spelkärnan delar rundan i servern (/api/runda, src/server/game.ts): skon blandas ur
// fröet i content/runda.json, eller ur --fro, och spelarna där spelar efter dess regel. Samma frö ger samma runda.
// Vilket klipp varje kort får väljs i src/scene/round.ts, som Labbets steg Scen och Casinot också går genom: ett
// godkänt cykelklipp efter postens seat, index och action, eller spelkärnans fallback när klippet saknas (kortet går
// självt medan dealern står i REDO). Klipp som saknas sägs. Klippen spelas i farten i content/runda.json (speed.clips),
// eller i --fart, 1–2, utan att filen ändras; filmen sparas ändå i rundans takt (film.fps), så att i 1,5 tas var
// 1,5:e ruta ur klippen. Filmen sparas genom shoot.ts som en förlaga under output/forlagor/, med beställningen och
// beskrivningen, rundan (<namn>-runda.json) och ett ark bredvid: första rutan och en ruta när varje kort ligger. Med
// --nara sparas också vyns närbild, och med --plan sägs bara vad som skulle spelas.
//
// En egen server startas på en ledig port, så att Jakobs studio på 5310 inte rörs; SHOOT_SERVER pekar ut en som går.
// Rundan avgör ingenting i spelet: korten och utfallet är spelkärnans.

import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { readScene } from '../scene/description.ts';
import { seatsOf, type SeatView } from '../scene/geometry.ts';
import { isSpeed, PLAN_LIMITS } from '../scene/plan.ts';
import { makeReel, partEnd } from '../scene/reel.ts';
import { anchorName, backgroundOf, dealName, dealsOf, planRound, readRound, RoundError, roundFilm, spotName, type DealtRound, type OrderBackground, type Plan, type Round } from '../scene/round.ts';
import { readRegistry, studioRoot } from './registry.ts';
import { shootAll, startServer, type Shot } from './shoot.ts';

export {
  anchorName,
  anchorOf,
  backgroundOf,
  dealName,
  dealsOf,
  planRound,
  readRound,
  RoundError,
  roundFilm,
  spotName,
  type CardAction,
  type Deal,
  type DealtRound,
  type OrderBackground,
  type Plan,
  type Round,
  type RoundEntry,
  type RoundStep,
} from '../scene/round.ts';

const comma = (value: number): string => value.toFixed(2).replace('.', ',');

/**
 * Vyn ur ett ord: `spelaren` eller `plats-N`, så som registrets poster bär den (utan närbild). Samma ord som
 * tagning.ts tar; här utan cykel.ts, så att servern, som läser rundan härifrån, inte laddar dockan.
 */
export function viewOfWord(word: string): SeatView {
  if (word === 'spelaren') return { kind: 'spelaren' };
  const seat = /^plats-(\d+)$/.exec(word)?.[1];
  if (!seat) throw new RoundError(`Okänd vy: ${word}. Skriv spelaren eller plats-N.`);
  return { kind: 'plats', seat: Number(seat) };
}

/**
 * Beställningen av rundan som film: dealerns följd ur vyn `view` (med `close` ur dess närbild), med rummet och scenens
 * sko, i rundans takt. Samma form som varje annan förlaga (src/lab/shoot.ts).
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

/**
 * Rundans tidslinje ur klippens längder i registret och fallbackens, med klippen i farten `speed` (reel.ts): där varje
 * del slutar, i filmens tid.
 */
export function clipEnds(plan: Plan, hold: number, speed = 1): number[] {
  const parts = plan.dealt.map((deal, index) => {
    const clip = plan.clips[index]!;
    return { seconds: deal.seconds, ...(clip.file === null ? { from: clip.from } : {}) };
  });
  const reel = makeReel(parts, hold, undefined, speed);
  return reel.starts.map((_, index) => partEnd(reel, index));
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

/** Ett kort i arket: valören (eller baksidan), kortplatsen, och om dealern lade det eller det gick självt. */
const tileText = (deal: Plan['dealt'][number]): string => `${deal.face ?? 'baksidan'} ${dealName(deal)}${deal.file ? '' : ', utan klipp'}`;

/** Arkets rutor: första rutan, och sista rutan i varje del, med kortet den lade. */
export function sheetTimes(plan: Plan, round: Round): { time: number; text: string }[] {
  const ends = clipEnds(plan, round.film.hold, round.speed.clips);
  const half = 0.5 / round.film.fps;
  return [
    { time: half, text: 'början' },
    ...plan.dealt.map((deal, index) => ({ time: Math.max(half, ends[index]! - half), text: `${index + 1}: ${tileText(deal)} (${comma(ends[index]! - half)} s)` })),
  ];
}

/** Rundan som spelkärnan delar i servern på `server`, med fröet `seed` (utan: content/runda.json). */
export async function fetchRound(server: string, seed?: string): Promise<DealtRound> {
  const response = await fetch(`${server}/api/runda${seed ? `?fro=${encodeURIComponent(seed)}` : ''}`);
  const body = (await response.json()) as DealtRound & { error?: string };
  if (!response.ok) throw new RoundError(`Servern delade ingen runda: ${body.error ?? response.status}`);
  return body;
}

/** Sparar rundans beställningar genom shoot.ts på servern `server`, och ett ark bredvid varje film. */
export async function shootRound(root: string, server: string, orders: Shot[], plan: Plan, round: Round, say: (text: string) => void) {
  const results = await shootAll(orders, say, { server });
  const saved: { film: string; json: string; sheet: string }[] = [];
  for (const result of results) {
    if (!result.ok) throw new RoundError(`Rundan gick inte att spara: ${result.error}${result.problems.length ? ` (${result.problems.join('; ')})` : ''}`);
    const film = join(root, result.saved.file);
    const out = film.replace(/\.mp4$/, '-ark.jpg');
    await sheet(film, sheetTimes(plan, round), out);
    saved.push({ film, json: join(root, result.saved.json), sheet: out });
  }
  return saved;
}

/**
 * Vilket REDO-ankare följdens klipp är gjorda ur, och de andra som har godkända klipp för rundan: en följd blandar
 * aldrig klipp ur olika ankare (planRound).
 */
export function anchorsText(plan: Plan): string {
  if (plan.anchor === null && plan.anchors.length === 0) return 'inget, rundan har inga godkända klipp';
  const [chosen, ...others] = plan.anchors;
  const text = `${anchorName(plan.anchor)} (klipp till ${chosen?.clips ?? 0} av rundans kort)`;
  return others.length === 0 ? text : `${text}; inte valda: ${others.map((one) => `${anchorName(one.anchor)} (${one.clips})`).join(', ')}`;
}

/**
 * Det som sparas bredvid filmen om rundan: fröet, insatserna och farten (så att den går att göra om), korten och
 * utfallet.
 */
function roundRecord(dealt: DealtRound, plan: Plan, dealer: string, viewWord: string, speed: number) {
  return {
    made: `node src/pipeline/runda.ts ${dealer} ${viewWord} --fro ${dealt.seed} --fart ${speed}`,
    speed,
    seed: dealt.seed,
    bets: dealt.bets,
    hitBelow: dealt.hitBelow,
    anchor: plan.anchor,
    anchors: plan.anchors,
    steps: dealt.steps.map((step) => [step.op, step.action].filter(Boolean).join(' ')),
    cards: plan.dealt.map((deal) => ({ card: deal.face, spot: spotName(deal), action: deal.action, clip: deal.file })),
    missing: plan.missing.map(dealName),
    result: dealt.result,
  };
}

if (import.meta.main) {
  const words = process.argv.slice(2);
  const flags = new Set<string>();
  const positional: string[] = [];
  let seed: string | undefined;
  let seedMissing = false;
  let fart: string | undefined;
  let fartWrong = false;
  for (let index = 0; index < words.length; index++) {
    const word = words[index]!;
    if (word === '--fro') {
      seed = words[++index];
      seedMissing = !seed || seed.startsWith('--');
    } else if (word === '--fart') {
      fart = words[++index];
      fartWrong = !isSpeed(Number(fart?.replace(',', '.')));
    } else if (word.startsWith('--')) flags.add(word);
    else positional.push(word);
  }
  const [dealer, viewWord] = positional;
  if (!dealer || !viewWord || seedMissing || fartWrong) {
    if (fartWrong) console.error(`--fart ska vara ett tal ${PLAN_LIMITS.speed[0]}–${PLAN_LIMITS.speed[1]}, inte ${fart ?? 'inget'}.`);
    console.error('Använd: node src/pipeline/runda.ts <dealer> <spelaren|plats-N> [--fro <ord>] [--fart <tal>] [--nara] [--plan]');
    process.exit(1);
  }
  let server: { url: string; stop(): void } | null = null;
  try {
    const root = studioRoot();
    const content = (file: string): unknown => JSON.parse(readFileSync(join(root, 'content', file), 'utf8'));
    const saved = readRound(content('runda.json'));
    // --fart gäller bara den här filmen; content/runda.json ändras inte.
    const round: Round = fart === undefined ? saved : { ...saved, speed: { clips: Number(fart.replace(',', '.')) } };
    const speed = round.speed.clips;
    const scene = readScene(content('scene.json'));
    const view = viewOfWord(viewWord);
    if (view.kind === 'plats' && !seatsOf(scene).includes(view.seat)) throw new RoundError(`Scenen har ingen plats ${view.seat}`);
    server = process.env.SHOOT_SERVER ? { url: process.env.SHOOT_SERVER.replace(/\/$/, ''), stop: () => {} } : await startServer();
    const dealt = await fetchRound(server.url, seed);
    const registry = readRegistry(root);
    const plan = planRound(dealsOf(dealt.steps), registry.assets, dealer, view, round.fallback);
    const played = plan.dealt.filter((deal) => deal.file !== null).length;
    console.log(`Rundan för ${dealer} ur ${viewWord}, frö ${dealt.seed}, insatser ${dealt.bets.map((bet) => `plats ${bet.seat}: ${bet.main}`).join(', ')}, Hit under ${dealt.hitBelow}.`);
    console.log(`Spelkärnan: ${dealt.steps.map((step) => [step.op, step.action].filter(Boolean).join(' ')).join(' → ')}. ${plan.dealt.length} kort, ${played} med dealerns klipp.`);
    console.log(`Ankare: ${anchorsText(plan)}.`);
    console.log(`Fart: klippen i ${String(speed).replace('.', ',')}${fart === undefined ? ' (content/runda.json)' : ' (--fart)'}, kort utan klipp och väntan i 1; filmen i ${round.film.fps} rutor/s.`);
    plan.dealt.forEach((deal, index) =>
      console.log(`  ${index + 1}. ${deal.face ?? 'baksidan upp'}, ${dealName(deal)}: ${deal.file ? `${deal.file} (kortet ligger från ${comma(deal.at)} s)` : `utan klipp: går självt på ${comma(deal.seconds)} s`}`),
    );
    if (plan.missing.length > 0) console.log(`Saknar klipp: ${plan.missing.map(dealName).join('; ')}.`);
    for (const item of plan.unusable) console.log(`Spelas inte: ${item.file}: ${item.why}.`);
    const settle = dealt.result.settle;
    if (settle) console.log(`Utfall: dealern ${settle.dealerTotal}${settle.dealerBlackjack ? ' (blackjack)' : ''}; ${settle.hands.map((hand) => `plats ${hand.seat}: ${hand.outcome}, ${hand.returned} tillbaka av ${hand.stake}`).join('; ')}. Kassan ${dealt.result.before} → ${dealt.result.after}.`);
    if (!flags.has('--plan')) {
      const background = backgroundOf(registry.assets.find((entry) => entry.file === round.film.background), scene);
      const label = `runda-${dealer}-${dealt.seed}${speed === 1 ? '' : `-fart-${String(speed).replace('.', '-')}`}`;
      const orders = [roundOrder(plan, round, view, background, label), ...(flags.has('--nara') ? [roundOrder(plan, round, view, background, label, true)] : [])];
      const saved = await shootRound(root, server.url, orders, plan, round, (text) => console.error(text));
      for (const files of saved) {
        const record = files.film.replace(/\.mp4$/, '-runda.json');
        writeFileSync(record, `${JSON.stringify(roundRecord(dealt, plan, dealer, viewWord, speed), null, 2)}\n`);
        console.log(`Sparad: ${files.film}\n  ark: ${files.sheet}\n  beskrivning: ${files.json}\n  rundan: ${record}`);
      }
    }
    server.stop();
    process.exit(0);
  } catch (error) {
    server?.stop();
    console.error((error as Error).message);
    process.exit(1);
  }
}
