// Hur mänsklig en rörelse är. Måtten tar det granskarna hittills inte mätte: fart, acceleration och ryck över tid för
// kroppens delar, hur länge allt står dödstilla, hur samlad rörelsen är i tiden, hur jämn den är, och i vilken ordning
// blick, huvud, bål och hand börjar och slutar. Samma mått gäller dockan (ur poseAt, i meter) och en film (ur bilden,
// i bildpunkter), så att en cykel kan prövas innan den beställs och klippet när det kommer.
//
// Måttens grund (antagen ur litteraturen, inte mätt här): en mänsklig sträckning följer i stort en klockformad fartkurva
// med minsta möjliga ryck (Flash och Hogan 1985); jämnheten mäts som fartkurvans spektrala båglängd, SPARC
// (Balasubramanian m.fl. 2012 och 2015), där minsta ryck ger −1,40 med gränserna här (se testet) och en hackig rörelse
// lägre tal. Blicken går före handen till målet, huvudet följer blicken och stannar före handen, och bålen börjar med
// eller före armen och stannar efter den. Ingenting står helt stilla: andning och små viktförskjutningar finns alltid.
// Gränserna för måtten är satta mot filmer, mätta med samma kod (output/work/rorelse/forslag.md).
//
// Ett spår är en följd av punkter med jämn takt (`fps`); en punkt som saknas i en ruta (null) fylls mellan grannarna.
// Kommandot:
//   node src/pipeline/rorelse.ts docka <plats> [kort] [--cykel namn] [--handling deal|hole|flip] [--fps n] [--giv] [--delar]
//   node src/pipeline/rorelse.ts film <film.mp4> [--enkel] [--delar] [--spar spår.json]
// Hur måtten tas och deras gränser står i content/tagning.json (motion, limits); tagning.ts prövar dem på dockan när ett
// paket görs och på klippet när det tas emot.
// Ingenting här avgör något i spelet.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Frame, Vec3 } from '../scene/description.ts';
import { moveFor, pickUpCard, poseAt, type Action, type Seat } from '../scene/dollPose.ts';
import { cycleMove, isSkin, readCycleParts, type CycleParts } from './cykel.ts';
import { eachFrame, isBlue, isYellow, judge, probe, type Limit, type Picture } from './matning.ts';

export class MotionError extends Error {}

/** Ett spår: en punkt (2 eller 3 tal) per ruta, eller null där den inte syns. */
export type Track = { fps: number; points: (number[] | null)[] };
/** Ett spår för en vinkel i grader, när delen vrids i stället för flyttas (blickens riktning). */
export type Tracks = Record<string, Track>;

const round = (value: number, digits = 3): number => Math.round(value * 10 ** digits) / 10 ** digits;

// ---------------------------------------------------------------------------------------------------------------------
// Fart, acceleration och ryck

/** Spåret med luckorna fyllda: rakt mellan närmaste kända grannar, och som den närmaste i ändarna. */
export function filled(track: Track): number[][] {
  const { points } = track;
  const known = points.map((point, k) => (point ? k : -1)).filter((k) => k >= 0);
  if (known.length === 0) throw new MotionError('Spåret saknar punkter');
  return points.map((point, k) => {
    if (point) return point;
    const after = known.find((j) => j > k);
    const before = known.findLast((j) => j < k);
    if (before === undefined) return points[after!]!;
    if (after === undefined) return points[before]!;
    const share = (k - before) / (after - before);
    return points[before]!.map((value, d) => value + (points[after]![d]! - value) * share);
  });
}

/** Spåret utjämnat med en binomialkärna (1 4 6 4 1)/16, `times` gånger. Ändarna hålls kvar. Mot brus i bildspår. */
export function smoothed(points: number[][], times = 1): number[][] {
  let out = points;
  for (let pass = 0; pass < times; pass++) {
    const was = out;
    out = was.map((point, k) => {
      if (k < 2 || k >= was.length - 2) return point;
      return point.map((_, d) => (was[k - 2]![d]! + 4 * was[k - 1]![d]! + 6 * was[k]![d]! + 4 * was[k + 1]![d]! + was[k + 2]![d]!) / 16);
    });
  }
  return out;
}

const norm = (v: number[]): number => Math.hypot(...v);

/** Farten i varje ruta, enheter per sekund: centrala differenser, framåt och bakåt i ändarna. */
export function speedOf(points: number[][], fps: number): number[] {
  const n = points.length;
  return points.map((_, k) => {
    const a = points[Math.max(0, k - 1)]!;
    const b = points[Math.min(n - 1, k + 1)]!;
    const span = Math.min(n - 1, k + 1) - Math.max(0, k - 1);
    return span === 0 ? 0 : (norm(b.map((value, d) => value - a[d]!)) * fps) / span;
  });
}

/** Accelerationens och ryckets storlek i varje ruta (andra och tredje derivatan av läget), enheter per s² och s³. */
export function derivatives(points: number[][], fps: number): { acceleration: number[]; jerk: number[] } {
  const n = points.length;
  const at = (k: number): number[] => points[Math.max(0, Math.min(n - 1, k))]!;
  const acceleration = points.map((point, k) => norm(point.map((value, d) => (at(k + 1)[d]! - 2 * value + at(k - 1)[d]!) * fps * fps)));
  const jerk = points.map((point, k) => norm(point.map((_, d) => ((at(k + 2)[d]! - 2 * at(k + 1)[d]! + 2 * at(k - 1)[d]! - at(k - 2)[d]!) * fps ** 3) / 2)));
  return { acceleration, jerk };
}

/** En rörelse i ett fartspår: rutorna från och med `from` till och med `to`. */
export type Segment = { from: number; to: number; peak: number; at: number };

/**
 * Rörelserna i ett fartspår: sammanhängande rutor där farten är över `share` av spårets största, med glapp kortare än
 * `bridge` sekunder överbryggade och rörelser kortare än `least` sekunder bortlagda.
 */
export function segments(speed: number[], fps: number, share = 0.05, bridge = 0.12, least = 0.12): Segment[] {
  const top = Math.max(...speed);
  if (!(top > 0)) return [];
  const runs: [number, number][] = [];
  let start = -1;
  speed.forEach((value, k) => {
    if (value > share * top && start < 0) start = k;
    if ((value <= share * top || k === speed.length - 1) && start >= 0) {
      runs.push([start, value > share * top ? k : k - 1]);
      start = -1;
    }
  });
  const merged: [number, number][] = [];
  for (const run of runs) {
    const last = merged.at(-1);
    if (last && (run[0] - last[1] - 1) / fps < bridge) last[1] = run[1];
    else merged.push([...run]);
  }
  return merged
    .filter(([from, to]) => (to - from + 1) / fps >= least)
    .map(([from, to]) => {
      let at = from;
      for (let k = from; k <= to; k++) if (speed[k]! > speed[at]!) at = k;
      return { from, to, peak: speed[at]!, at };
    });
}

/**
 * Jämnheten i en rörelses fartkurva: SPARC, den spektrala båglängden (Balasubramanian m.fl. 2015). Fartkurvans
 * normerade spektrum upp till `cutoff` Hz, där det är över `floor` av sitt största, mäts som en båglängd; ju fler
 * toppar och knyckar, desto längre båge och desto lägre (mer negativt) tal. En kurva med minsta ryck ger −1,40 (rorelse.test.ts).
 */
export function sparc(speed: number[], fps: number, cutoff = 10, floor = 0.05, pad = 4): number {
  const n = 2 ** (Math.ceil(Math.log2(Math.max(2, speed.length))) + pad);
  const top = Math.min(cutoff, fps / 2);
  const bins = Math.floor((top * n) / fps);
  const magnitude: number[] = [];
  for (let f = 0; f <= bins; f++) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < speed.length; k++) {
      const turn = (-2 * Math.PI * f * k) / n;
      re += speed[k]! * Math.cos(turn);
      im += speed[k]! * Math.sin(turn);
    }
    magnitude.push(Math.hypot(re, im));
  }
  const most = Math.max(...magnitude) || 1;
  const m = magnitude.map((value) => value / most);
  const first = m.findIndex((value) => value >= floor);
  const last = m.findLastIndex((value) => value >= floor);
  if (first < 0 || last <= first) return 0;
  const width = last - first;
  let arc = 0;
  for (let f = first + 1; f <= last; f++) arc += Math.hypot(1 / width, m[f]! - m[f - 1]!);
  return -arc;
}

/** Topparna i en rörelses fartkurva: lokala största som reser sig minst `rise` av rörelsens största över dalen före. */
export function peaksIn(speed: number[], segment: Segment, rise = 0.1): number {
  let peaks = 0;
  let valley = speed[segment.from]!;
  let climbing = true;
  for (let k = segment.from + 1; k <= segment.to; k++) {
    const value = speed[k]!;
    if (climbing && value < speed[k - 1]! && speed[k - 1]! - valley >= rise * segment.peak) {
      peaks++;
      climbing = false;
      valley = value;
    } else if (!climbing && value > speed[k - 1]!) {
      climbing = true;
    }
    if (value < valley) valley = value;
  }
  // En rörelse som slutar i full fart har sin topp sist.
  if (climbing && speed[segment.to]! - valley >= rise * segment.peak) peaks++;
  return Math.max(1, peaks);
}

// Största acceleration gånger varaktighet delat med största fart, för en rörelse med minsta ryck mätt som i `snap`:
// rörelsen räknas från 5 % av toppfarten (0,84 av hela tiden), accelerationen ur farten ruta för ruta. Se testet.
const MINIMUM_JERK_SNAP = 2.6;

/**
 * Knycken i en rörelse: den största ändringen av farten mellan två rutor, som acceleration, mot den en rörelse med
 * minsta ryck med samma toppfart och längd har. 1 är som minsta ryck; en del som går från full fart till stilla på en ruta
 * ger tal långt över.
 */
export function snap(speed: number[], fps: number, segment: Segment): number {
  return Math.max(0, ...pieces(speed, segment).map((piece) => {
    let most = 0;
    for (let k = Math.max(1, piece.from); k <= Math.min(speed.length - 1, piece.to + 1); k++) most = Math.max(most, Math.abs(speed[k]! - speed[k - 1]!) * fps);
    const seconds = (piece.to - piece.from + 1) / fps;
    return piece.peak > 0 ? (most * seconds) / (piece.peak * MINIMUM_JERK_SNAP) : 0;
  }));
}

/**
 * En rörelse delad i sina delrörelser: vid varje dal där farten sjunker under `deep` av den lägre av topparna på var sin
 * sida. En kropp som aldrig står still (andning) blir annars en enda rörelse över hela cykeln, och knycken mäts mot fel
 * längd.
 */
export function pieces(speed: number[], segment: Segment, deep = 0.6): Segment[] {
  const cuts: number[] = [];
  for (let k = segment.from + 1; k < segment.to; k++) {
    if (!(speed[k]! <= speed[k - 1]! && speed[k]! < speed[k + 1]!)) continue;
    const left = Math.max(...speed.slice(segment.from, k));
    const right = Math.max(...speed.slice(k + 1, segment.to + 1));
    if (speed[k]! < deep * Math.min(left, right)) cuts.push(k);
  }
  const bounds = [segment.from, ...cuts, segment.to];
  return bounds.slice(1).map((to, i) => {
    const from = bounds[i]!;
    let at = from;
    for (let k = from; k <= to; k++) if (speed[k]! > speed[at]!) at = k;
    return { from, to, peak: speed[at]!, at };
  });
}

/**
 * Tvära stopp och starter: rutor där farten går från minst `high` av delrörelsens topp till under `low` av den, eller
 * tvärtom, på högst `within` rutor (en rörelse med minsta ryck kortare än cirka 0,5 s i 24 rutor/s når 31 % på två rutor). En människa gör inte det; en docka vars del slutar räknas gör det.
 */
export function abrupt(speed: number[], segment: Segment, high = 0.4, low = 0.08, within = 2): number {
  // Varje delrörelse mot sin egen topp (pieces), så att en kort rörelse efter en lång inte mäts mot den långas fart.
  const found = new Set<number>();
  for (const piece of pieces(speed, segment)) {
    for (let k = Math.max(1, piece.from - within); k <= Math.min(speed.length - 1, piece.to + within); k++) {
      for (let j = 1; j <= within && k - j >= 0; j++) {
        const before = speed[k - j]!;
        const now = speed[k]!;
        const stop = before >= high * piece.peak && now < low * piece.peak;
        const start = before < low * piece.peak && now >= high * piece.peak;
        if ((stop || start) && ![...found].some((at) => Math.abs(at - k) <= within)) {
          found.add(k);
          break;
        }
      }
    }
  }
  return found.size;
}

/** Hur stor del av tiden som bär `share` av hela vägen: de snabbaste rutorna först. Litet tal: rörelsen sker i stötar. */
export function busiest(speed: number[], share = 0.8): number {
  const total = speed.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return 0;
  const sorted = [...speed].sort((a, b) => b - a);
  let sum = 0;
  for (let k = 0; k < sorted.length; k++) {
    sum += sorted[k]!;
    if (sum >= share * total) return (k + 1) / speed.length;
  }
  return 1;
}

/** Den längsta följden rutor där `still` är sant, i sekunder. En cykel kedjas, så följden får gå runt från slut till början. */
export function longestRun(still: boolean[], fps: number, cyclic = true): number {
  const n = still.length;
  if (still.every(Boolean)) return n / fps;
  let best = 0;
  let run = 0;
  const laps = cyclic ? 2 : 1;
  for (let k = 0; k < n * laps; k++) {
    run = still[k % n] ? run + 1 : 0;
    best = Math.max(best, Math.min(run, n));
  }
  return best / fps;
}

/** Första och sista rutan i fönstret där farten är över `share` av fönstrets största. */
export function onsetOffset(speed: number[], from: number, to: number, share = 0.1): { on: number; off: number; peak: number } | null {
  let top = 0;
  for (let k = from; k <= to; k++) top = Math.max(top, speed[k] ?? 0);
  if (!(top > 0)) return null;
  let on = -1;
  let off = -1;
  for (let k = from; k <= to; k++) {
    if ((speed[k] ?? 0) > share * top) {
      if (on < 0) on = k;
      off = k;
    }
  }
  return { on, off, peak: top };
}

/** Pearsons korrelation mellan två lika långa följder. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let k = 0; k < n; k++) {
    ab += (a[k]! - ma) * (b[k]! - mb);
    aa += (a[k]! - ma) ** 2;
    bb += (b[k]! - mb) ** 2;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

/** Fördröjningen i sekunder där `follower` liknar `leader` mest (korskorrelation inom ±`most` s); positiv: följaren kommer efter. */
export function lagBetween(leader: number[], follower: number[], fps: number, most = 0.5): { lag: number; r: number } {
  let best = { lag: 0, r: -2 };
  const reach = Math.round(most * fps);
  for (let shift = -reach; shift <= reach; shift++) {
    const a: number[] = [];
    const b: number[] = [];
    for (let k = 0; k < leader.length; k++) {
      const j = k + shift;
      if (j < 0 || j >= follower.length) continue;
      a.push(leader[k]!);
      b.push(follower[j]!);
    }
    const r = correlation(a, b);
    if (r > best.r) best = { lag: shift / fps, r };
  }
  return { lag: round(best.lag), r: round(best.r) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Måtten

/**
 * Vilka spår som är vad. `hand` är den givande handen (eller kortet den bär), `head` huvudet, `trunk` bålen, `gaze`
 * blickens riktning i grader när den finns, `turn` huvudets riktning i grader när den finns. `body` är alla spår som räknas när det mäts om hela kroppen står still.
 * `yaw` är spåret vars första tal är huvudets vridning i sidled, `yawScale` grader per enhet i det (dockan: grader, 1;
 * en film: hudens förskjutning i huvudet, kalibrerad). `toShoe` är vinkeln i grader mellan huvudets riktning och kortet
 * i skons mynning, när den finns (dockan).
 */
export type Roles = { hand: string; head: string; trunk: string; gaze?: string; turn?: string; body: string[]; yaw?: string; yawScale?: number; toShoe?: string };

/** Ett mått: talet och vad det betyder. */
export type Value = { value: number | null; what: string };

/**
 * Hur måtten tas. `scale`: spårens enheter på en huvudbredd (håret med), så att docka och film mäts i samma mått.
 * `still`: under så många huvudbredder per sekund står en del still. `moving`: en del vars toppfart i en rörelse är under
 * så många huvudbredder per sekund gör bara småsaker (andning, sväng), och dess knyckar räknas inte. Vinklar (blicken)
 * räknas inte om: `still` och `moving` gäller dem som grader per sekund gånger `degrees`. `smooth`: utjämningar av
 * spåren (bildspår brusar). `cyclic`: rörelsen är en cykel som kedjas, så stillheten i slutet och i början är en.
 * `restLeast`: huvudet i vila mäts bara där handen står still minst så många sekunder i sträck (kortare är vändningen i
 * REDO). `slowShare`: cykelns tider (cycleTimes). `phases`: om cykelns tider mäts (inte i en vändning eller väntan, där
 * handen inte gör en väg ut och tillbaka med ett kort). `orderLeast` och `orderTurn`: ordningen genom korskorrelation
 * räknas bara när huvudet vrids minst orderTurn grader och sambandet är minst orderLeast (r).
 */
export type MotionOptions = {
  scale: number;
  still: number;
  moving: number;
  degrees: number;
  smooth: number;
  cyclic: boolean;
  restLeast: number;
  slowShare: number;
  orderLeast: number;
  orderTurn: number;
  phases?: boolean;
};

/** Förändringen ruta för ruta (centrala differenser), för korskorrelation av förändringar i stället för lägen. */
const changes = (values: number[]): number[] => values.map((_, k) => (values[Math.min(values.length - 1, k + 1)]! - values[Math.max(0, k - 1)]!) / 2);

/**
 * Cykelns tider ur handens fart, i rutor (rapporten om en verklig dealer, avsnitt 8). `out` och `back` är handens väg ut
 * och tillbaka (motionValues). Handen lämnar skon när farten på vägen ut först går över `slowShare` av dess topp, kortet
 * ligger när den efter toppen sjunker under det, handen lämnar kortet när farten på vägen tillbaka går över `slowShare`
 * av dess topp, och den är vid skon från att farten sista gången sjunker under det. Det långsamma emellan är tiden vid
 * skon och på kortet, också när handen inte står helt still (knuffen, nypet).
 */
export function cycleTimes(speed: number[], out: Segment, back: Segment, slowShare: number): { leaves: number; lands: number; leavesCard: number; arrives: number } | null {
  const outSlow = slowShare * out.peak;
  const backSlow = slowShare * back.peak;
  const leaves = speed.findIndex((value, k) => k <= out.at && value > outSlow);
  const lands = speed.findIndex((value, k) => k > out.at && value < outSlow);
  const leavesCard = speed.findIndex((value, k) => k >= lands && k <= back.at && value > backSlow);
  const after = speed.findIndex((value, k) => k > back.at && value < backSlow);
  if (leaves < 0 || lands < 0 || leavesCard < 0 || after < 0 || !(leaves < lands && lands <= leavesCard && leavesCard < after)) return null;
  return { leaves, lands, leavesCard, arrives: after };
}

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

/**
 * Måtten för en rörelse. Allt i sekunder, andelar, huvudbredder per sekund eller rena tal, så att de jämförs lika för
 * docka och film. Rörelserna räknas ur handens fart: den första är vägen ut, den sista vägen tillbaka.
 */
export function motionValues(tracks: Tracks, roles: Roles, options: MotionOptions): Record<string, Value> {
  const fps = tracks[roles.hand]!.fps;
  const angles = [roles.gaze, roles.turn].filter((name): name is string => !!name);
  const names = [...new Set([roles.hand, roles.head, roles.trunk, ...angles, ...roles.body])];
  // Fart i huvudbredder per sekund; blicken i grader per sekund delat med `degrees`, så att samma gränser gäller.
  const speeds: Record<string, number[]> = {};
  for (const name of names) {
    const per = angles.includes(name) ? options.degrees : options.scale;
    speeds[name] = speedOf(smoothed(filled(tracks[name]!), options.smooth), fps).map((value) => value / per);
  }
  const hand = speeds[roles.hand]!;
  const n = hand.length;
  const moves = segments(hand, fps);
  const stillAt = (name: string): boolean[] => speeds[name]!.map((value) => value <= options.still);
  const bodyStill = roles.body.map(stillAt);
  const frozen = hand.map((_, k) => bodyStill.every((still) => still[k]!));
  const handStill = stillAt(roles.hand);
  // Vägen ut och tillbaka. En hand som lägger kortet och genast lyfter (Life.touch) gör det i en enda rörelse: då delas
  // den vid sin djupaste dal.
  const ways = moves.length === 1 ? pieces(hand, moves[0]!, 0.25) : moves;
  const out = ways[0];
  const back = ways.length > 1 ? ways.at(-1)! : null;

  // Ordningen på vägen ut och tillbaka: när delarna börjar och slutar mot handen, i sekunder (positivt: före handen).
  // En del börjar när den går över en tiondel av sin topp i fönstret och över stillhetens gräns.
  const order = (name: string, segment: Segment | null | undefined): { lead: number; trail: number } | null => {
    if (!segment) return null;
    const from = Math.max(0, segment.from - Math.round(0.6 * fps));
    const to = Math.min(n - 1, segment.to + Math.round(0.6 * fps));
    const speed = speeds[name]!.map((value) => (value > options.still ? value : 0));
    const part = onsetOffset(speed, from, to);
    const own = onsetOffset(hand, segment.from, segment.to);
    if (!part || !own) return null;
    return { lead: round((own.on - part.on) / fps), trail: round((part.off - own.off) / fps) };
  };
  const headOut = order(roles.head, out);
  const trunkOut = order(roles.trunk, out);
  const gazeOut = roles.gaze ? order(roles.gaze, out) : null;
  const turnOut = roles.turn ? order(roles.turn, out) : null;
  const headBack = order(roles.head, back);
  const trunkBack = order(roles.trunk, back);

  // Knyckar och tvära stopp räknas bara i rörelser som är mer än småsaker.
  // Ögonen får kasta (sackader); knyckar räknas i kroppens delar.
  const parts = names.filter((name) => name !== roles.gaze);
  const real = (speed: number[]): Segment[] => segments(speed, fps).filter((segment) => segment.peak >= options.moving);
  const worstSnap = Math.max(0, ...parts.flatMap((name) => real(speeds[name]!).map((segment) => snap(speeds[name]!, fps, segment))));
  const abrupts = parts.reduce((sum, name) => sum + real(speeds[name]!).reduce((s, segment) => s + abrupt(speeds[name]!, segment), 0), 0);
  // Där handen vilar: rutor där den står still minst restLeast sekunder i sträck (med cykeln kedjad). En kortare stillhet
  // är vändningen i REDO, där varje del går genom REDO med farten noll när ingen andning finns.
  const rested = handStill.map(() => false);
  const longest = Math.max(1, Math.round(options.restLeast * fps));
  if (handStill.every(Boolean)) rested.fill(true);
  else {
    // Från en ruta där handen rör sig, så att en stillhet som går runt från slutet till början räknas som en.
    const start = options.cyclic ? handStill.findIndex((still) => !still) : 0;
    let run: number[] = [];
    const close = (): void => {
      if (run.length >= longest) for (const k of run) rested[k] = true;
      run = [];
    };
    for (let i = 0; i < n; i++) {
      const k = (start + i) % n;
      if (handStill[k]) run.push(k);
      else close();
    }
    close();
  }
  const quiet = hand.map((_, k) => k).filter((k) => rested[k]);
  const idle = (name: string): number | null => {
    const values = quiet.map((k) => speeds[name]![k]!);
    const middle = median(values);
    return middle === null ? null : round(middle, 4);
  };

  // Cykelns tider (vid skon, ut, på kortet, tillbaka) ur handens spår i huvudbredder.
  const handTrack = smoothed(filled(tracks[roles.hand]!), options.smooth).map((point) => point.map((value) => value / options.scale));
  const times = options.phases !== false && out && back ? cycleTimes(hand, out, back, options.slowShare) : null;
  const seconds = (frames: number): number => round(frames / fps, 2);
  // Huvudets vridning i sidled, i grader: hur långt den svänger under cykeln, och om den går före handens sidled.
  const yaw = roles.yaw && tracks[roles.yaw] ? smoothed(filled(tracks[roles.yaw]!), options.smooth).map((point) => point[0]! * (roles.yawScale ?? 1)) : null;
  const handX = handTrack.map((point) => point[0]!);
  const leadOrder = yaw && times ? lagBetween(changes(handX), changes(yaw), fps, 0.5) : null;
  const toShoe = roles.toShoe && tracks[roles.toShoe] ? filled(tracks[roles.toShoe]!).map((point) => point[0]!) : null;

  return {
    stillaHelt: { value: round(frozen.filter(Boolean).length / n), what: 'andel av tiden då hela kroppen står still' },
    langstaStillhet: { value: round(longestRun(frozen, fps, options.cyclic)), what: `längsta tid hela kroppen står still, i sekunder${options.cyclic ? ', med cykeln kedjad' : ''}` },
    handStilla: { value: round(longestRun(handStill, fps, options.cyclic)), what: 'längsta tid handen står still, i sekunder' },
    huvudetIVila: { value: idle(roles.head), what: 'huvudets fart medan handen står still, median, huvudbredder per sekund (andning och små rörelser; 0 är en docka)' },
    balenIVila: { value: idle(roles.trunk), what: 'bålens fart medan handen står still, median, huvudbredder per sekund' },
    rorelser: { value: moves.length, what: 'handens rörelser (fart över 5 % av toppen, glapp under 0,12 s överbryggade)' },
    samlad: { value: round(busiest(hand, 0.8)), what: 'andel av tiden som bär 80 % av handens väg (litet: rörelsen sker i stötar)' },
    jamnhet: { value: moves.length ? Math.min(...moves.map((segment) => round(sparc(hand.slice(segment.from, segment.to + 1), fps), 2))) : null, what: 'handens jämnhet, SPARC, sämsta rörelsen (minsta ryck −1,40; lägre är hackigare)' },
    toppar: { value: moves.length ? Math.max(...moves.map((segment) => peaksIn(hand, segment))) : null, what: 'flest fartoppar i en av handens rörelser (en är en klocka)' },
    knyck: { value: round(worstSnap, 2), what: 'största knyck i någon del: acceleration mot minsta ryck med samma toppfart och längd (1 är som minsta ryck)' },
    tvara: { value: abrupts, what: 'tvära stopp och starter i alla delar: från 40 % av delrörelsens toppfart till under 8 % (eller tvärtom) på två rutor' },
    blickFore: { value: gazeOut?.lead ?? null, what: 'blicken börjar före handen på vägen ut, i sekunder (negativt: efter)' },
    vridningFore: { value: turnOut?.lead ?? null, what: 'huvudet börjar vridas före handen på vägen ut, i sekunder (negativt: efter)' },
    huvudFore: { value: headOut?.lead ?? null, what: 'huvudet börjar före handen på vägen ut, i sekunder (negativt: efter)' },
    balFore: { value: trunkOut?.lead ?? null, what: 'bålen börjar före handen på vägen ut, i sekunder (negativt: efter)' },
    huvudStannar: { value: headOut ? round(-headOut.trail) : null, what: 'huvudet stannar före handen på vägen ut, i sekunder (negativt: efter)' },
    balEfter: { value: trunkOut?.trail ?? null, what: 'bålen stannar efter handen på vägen ut, i sekunder (negativt: före)' },
    huvudForeTillbaka: { value: headBack?.lead ?? null, what: 'huvudet börjar före handen på vägen tillbaka, i sekunder' },
    balEfterTillbaka: { value: trunkBack?.trail ?? null, what: 'bålen stannar efter handen på vägen tillbaka, i sekunder' },
    vidSkon: { value: times ? seconds(n - 1 - times.arrives + times.leaves) : null, what: 'handen vid skon: från att den är tillbaka till att den lämnar skon med nästa kort, med cykeln kedjad, i sekunder' },
    vagUt: { value: times ? seconds(times.lands - times.leaves) : null, what: 'vägen ut: från att handen lämnar skon tills kortet ligger (handens fart under slowShare av toppen), i sekunder' },
    paKortet: { value: times ? seconds(times.leavesCard - times.lands) : null, what: 'handen på kortet: från att kortet ligger tills handen har lämnat det, i sekunder' },
    vagTillbaka: { value: times ? seconds(times.arrives - times.leavesCard) : null, what: 'vägen tillbaka: från att handen lämnar kortet tills den är vid skon, i sekunder' },
    tillbakaMotUt: { value: times && times.lands > times.leaves ? round((times.arrives - times.leavesCard) / (times.lands - times.leaves), 2) : null, what: 'vägen tillbaka mot vägen ut, i tid' },
    huvudSvang: { value: yaw ? round(Math.max(...yaw) - Math.min(...yaw), 1) : null, what: 'huvudets sväng i sidled under cykeln, största mot minsta vridning, i grader' },
    huvudForeKors: {
      value: leadOrder && yaw && leadOrder.r >= options.orderLeast && Math.max(...yaw) - Math.min(...yaw) >= options.orderTurn ? round(-leadOrder.lag, 3) : null,
      what: `huvudets vridning går före handens sidled, korskorrelation av förändringarna inom ±0,5 s, i sekunder (negativt: efter); bara när huvudet vrids minst ${options.orderTurn}° och r är minst ${options.orderLeast}${leadOrder ? ` (r ${leadOrder.r})` : ''}`,
    },
    redoMotSkon: { value: toShoe ? round(toShoe[0]!, 1) : null, what: 'vinkeln mellan huvudets riktning i REDO och kortet i skons mynning, i grader (0: hon ser på skon)' },
    huvudMotSkon: { value: toShoe ? round(Math.min(...toShoe), 1) : null, what: 'minsta vinkel mellan huvudets riktning och kortet i skons mynning under cykeln, i grader' },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Dockan

/** Blickens riktning som två vinklar i grader: sidled (kring lodlinjen) och höjd. */
function aim(from: Vec3, to: Vec3): number[] {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  return [(Math.atan2(d[0]!, d[2]!) * 180) / Math.PI, (Math.atan2(d[1]!, Math.hypot(d[0]!, d[2]!)) * 180) / Math.PI];
}

/**
 * Dockans delar över en rörelse, `fps` prov per sekund: lägen i meter, blicken i grader. `motSkon` är vinkeln i grader
 * mellan huvudets riktning och kortet i skons mynning (hämtstället, pickUpCard).
 */
export function dollTracks(parts: Pick<CycleParts, 'scene' | 'doll'>, move: Parameters<typeof poseAt>[2], fps: number): Tracks {
  const n = Math.round(move.seconds * fps) + 1;
  const names = ['grepp', 'handled', 'armbage', 'axel', 'andraAxeln', 'huvud', 'ansikte', 'bal', 'blick', 'vilandeHand', 'kort', 'motSkon'] as const;
  const tracks = Object.fromEntries(names.map((name) => [name, { fps, points: [] as number[][] }])) as Record<(typeof names)[number], { fps: number; points: number[][] }>;
  const mouth = pickUpCard(parts.scene, parts.doll).centre;
  const between = (a: number[], b: number[]): number =>
    (Math.acos(Math.max(-1, Math.min(1, (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / Math.hypot(...a) / Math.hypot(...b)))) * 180) / Math.PI;
  for (let k = 0; k < n; k++) {
    const pose = poseAt(parts.scene, parts.doll, move, Math.min(move.seconds, k / fps));
    const left = pose.hands.left;
    tracks.grepp.points.push(left[4]!.map((value, d) => (value + left[8]![d]!) / 2));
    tracks.handled.points.push([...pose.arms.left.wrist]);
    tracks.armbage.points.push([...pose.arms.left.elbow]);
    tracks.axel.points.push([...pose.arms.left.shoulder]);
    tracks.andraAxeln.points.push([...pose.arms.right.shoulder]);
    tracks.huvud.points.push([...pose.head]);
    tracks.bal.points.push([...pose.torso]);
    tracks.blick.points.push(aim(pose.head, pose.gaze));
    tracks.ansikte.points.push(aim(pose.head, pose.face));
    tracks.vilandeHand.points.push([...pose.arms.right.wrist]);
    tracks.kort.points.push([...(pose.laid ?? pose.card ?? pose.shoeCard).centre]);
    const head = pose.head;
    tracks.motSkon.points.push([between(pose.face.map((value, d) => value - head[d]!), mouth.map((value, d) => value - head[d]!))]);
  }
  return tracks;
}

export const DOLL_ROLES: Roles = {
  hand: 'grepp',
  head: 'huvud',
  trunk: 'axel',
  gaze: 'blick',
  turn: 'ansikte',
  body: ['grepp', 'armbage', 'axel', 'andraAxeln', 'huvud', 'ansikte', 'bal', 'vilandeHand'],
  yaw: 'ansikte',
  yawScale: 1,
  toShoe: 'motSkon',
};

// ---------------------------------------------------------------------------------------------------------------------
// En film

/** Skärmen: grön (Klings klipp) eller ateljéns grå skärm och bord (dockans film, content/tagning.json, reference.studio). */
export type Screen = { grey: number[][]; tolerance: number };

const isScreen = (screen: Screen, r: number, g: number, b: number): boolean =>
  g - Math.max(r, b) > 50 || screen.grey.some((c) => Math.abs(r - c[0]!) <= screen.tolerance && Math.abs(g - c[1]!) <= screen.tolerance && Math.abs(b - c[2]!) <= screen.tolerance);

const STEP = 2;

type Sampled = { width: number; height: number; fg: Uint8Array; skin: Uint8Array; card: Uint8Array; light: Uint8Array; dark: Uint8Array };

/** Rutan provad i var STEP:e bildpunkt: förgrund (inte skärm), hud, kort (gult eller blått), ljust (blus, docka) och mörkt (kavaj). */
function sample(picture: Picture, screen: Screen): Sampled {
  const width = Math.floor(picture.width / STEP);
  const height = Math.floor(picture.height / STEP);
  const fg = new Uint8Array(width * height);
  const skin = new Uint8Array(width * height);
  const card = new Uint8Array(width * height);
  const light = new Uint8Array(width * height);
  const dark = new Uint8Array(width * height);
  const { data } = picture;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = (y * STEP * picture.width + x * STEP) * 3;
      const r = data[k]!;
      const g = data[k + 1]!;
      const b = data[k + 2]!;
      const i = y * width + x;
      if (isScreen(screen, r, g, b)) continue;
      fg[i] = 1;
      if (isSkin(r, g, b)) skin[i] = 1;
      if (isBlue(r, g, b) || isYellow(r, g, b)) card[i] = 1;
      if (r > 200 && g > 185 && b > 170 && r - b < 45) light[i] = 1;
      if (r + g + b < 150) dark[i] = 1;
    }
  }
  return { width, height, fg, skin, card, light, dark };
}

/** Var huvudet och kroppen står i första rutan: huvudets topp, mitt och bredd, och axlarnas rad, i provade bildpunkter. */
type Figure = { top: number; x: number; width: number; shoulders: number };

function figureOf(s: Sampled): Figure {
  const rowCount = (y: number, x0 = 0, x1 = s.width): number => {
    let count = 0;
    for (let x = Math.max(0, x0); x < Math.min(s.width, x1); x++) count += s.fg[y * s.width + x]!;
    return count;
  };
  // Det översta förgrunden är huvudet (skon och korten ligger lägre).
  let top = 0;
  while (top < s.height && rowCount(top) < 3) top++;
  if (top >= s.height) throw new MotionError('Ingen förgrund i första rutan');
  let sum = 0;
  let count = 0;
  for (let y = top; y < Math.min(s.height, top + 12); y++) {
    for (let x = 0; x < s.width; x++) {
      if (s.fg[y * s.width + x]) {
        sum += x;
        count++;
      }
    }
  }
  const x = Math.round(sum / count);
  // Bredden på den sammanhängande förgrunden kring huvudets mitt, rad för rad.
  const run = (y: number): number => {
    if (!s.fg[y * s.width + x]) return 0;
    let a = x;
    let b = x;
    while (a > 0 && s.fg[y * s.width + a - 1]) a--;
    while (b < s.width - 1 && s.fg[y * s.width + b + 1]) b++;
    return b - a + 1;
  };
  let width = 0;
  for (let y = top; y < Math.min(s.height, top + Math.round(s.height * 0.15)); y++) width = Math.max(width, run(y));
  let shoulders = top + Math.round(width * 0.6);
  while (shoulders < s.height - 1 && run(shoulders) < 2 * width) shoulders++;
  return { top, x, width, shoulders };
}

/** Grenar runt en punkt: den sammanhängande delen av `mask` närmast `near` inom `reach`, minst `least` prov; tyngdpunkten. */
function nearestPart(mask: Uint8Array, width: number, height: number, near: number[], reach: number, least: number): number[] | null {
  const seen = new Uint8Array(mask.length);
  let best: { d: number; c: number[] } | null = null;
  const x0 = Math.max(0, Math.round(near[0]! - reach));
  const x1 = Math.min(width - 1, Math.round(near[0]! + reach));
  const y0 = Math.max(0, Math.round(near[1]! - reach));
  const y1 = Math.min(height - 1, Math.round(near[1]! + reach));
  const stack: number[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const start = y * width + x;
      if (!mask[start] || seen[start]) continue;
      let n = 0;
      let sx = 0;
      let sy = 0;
      let closest = Infinity;
      stack.push(start);
      seen[start] = 1;
      while (stack.length) {
        const i = stack.pop()!;
        const px = i % width;
        const py = (i - px) / width;
        n++;
        sx += px;
        sy += py;
        closest = Math.min(closest, Math.hypot(px - near[0]!, py - near[1]!));
        for (const j of [i - 1, i + 1, i - width, i + width]) {
          if (j < 0 || j >= mask.length || seen[j] || !mask[j]) continue;
          if (Math.abs((j % width) - px) > 1) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
      if (n >= least && (!best || closest < best.d)) best = { d: closest, c: [sx / n, sy / n] };
    }
  }
  return best ? best.c : null;
}

/** Masken vuxen `by` prov åt alla håll. */
function grownMask(mask: Uint8Array, width: number, height: number, by: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let yy = Math.max(0, y - by); yy <= Math.min(height - 1, y + by); yy++) out.fill(1, yy * width + Math.max(0, x - by), yy * width + Math.min(width - 1, x + by) + 1);
    }
  }
  return out;
}

/** Tyngdpunkten av `mask` i en ruta av provade bildpunkter, eller null när färre än `least` prov är satta. */
function centreIn(mask: Uint8Array, width: number, box: { x0: number; y0: number; x1: number; y1: number }, least: number): number[] | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = Math.max(0, box.y0); y < box.y1; y++) {
    for (let x = Math.max(0, box.x0); x < Math.min(width, box.x1); x++) {
      if (!mask[y * width + x]) continue;
      sx += x;
      sy += y;
      n++;
    }
  }
  return n >= least ? [sx / n, sy / n] : null;
}

/** Masken med allt ovanför raden `row` borttaget. */
const below = (mask: Uint8Array, width: number, row: number): Uint8Array => {
  const out = new Uint8Array(mask);
  out.fill(0, 0, Math.max(0, row) * width);
  return out;
};

/**
 * Spåren i en film av en dealer på skärm, i bildpunkter. Delarna letas ur första rutan (figureOf) och följs sedan:
 * - `huvud`: tyngdpunkten av förgrunden i huvudets övre del, kring förra rutans mitt.
 * - `ansikte`: hudens tyngdpunkt i huvudet mot huvudets, i sidled, i hundradelar av huvudets bredd: vridningen.
 * - `flank`: den vilande sidans flank (vänster i bild) i raderna under axlarna, i sidled: bålens lutning åt sidan.
 * - `axel`: kavajens övre kant ovanför den flanken: axelns höjd.
 * - `brost`: tyngdpunkten av blusen (det ljusa) mellan slagen: bålen.
 * - `kort`: det gula eller blå som inte var det i första rutan, under axlarna (blont hår kan se gult ut), närmast förra läget.
 * - `hand`: huden under axlarna som inte var hud i första rutan, utom vid skon där givhanden stod, närmast förra läget.
 * Rutorna läses en gång.
 */
export async function filmTracks(path: string, screen: Screen, blend = 0.25): Promise<{ tracks: Tracks; fps: number; frames: number; headWidth: number }> {
  const film = await probe(path);
  const frame: Frame = { width: film.width, height: film.height };
  type Start = { figure: Figure; staticSkin: Uint8Array; firstCard: Uint8Array; card: number[] };
  let start: Start | null = null;
  let headX = 0;
  let hand: number[] | null = null;
  let card: number[] | null = null;
  const skins: Uint8Array[] = [];
  const tracks: Record<string, (number[] | null)[]> = { huvud: [], ansikte: [], flank: [], axel: [], brost: [], kort: [], hand: [] };
  const push = (name: string, point: number[] | null): void => {
    tracks[name]!.push(point ? point.map((value) => value * STEP) : null);
  };
  await eachFrame(path, frame, (picture) => {
    const s = sample(picture, screen);
    const { width, height } = s;
    if (!start) {
      const figure = figureOf(s);
      const at = centreIn(below(s.card, width, figure.shoulders), width, { x0: 0, y0: 0, x1: width, y1: height }, 5) ?? [figure.x + figure.width, figure.shoulders + figure.width];
      // Hud i första rutan utom givhanden vid skons kort: den vilande handen, ansiktet, halsen.
      const keep = new Uint8Array(s.skin);
      const reach = figure.width * 0.7;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (Math.hypot(x - at[0]!, y - at[1]!) < reach) keep[y * width + x] = 0;
      start = { figure, staticSkin: grownMask(keep, width, height, 6), firstCard: grownMask(s.card, width, height, 4), card: at };
      headX = figure.x;
      hand = nearestPart(s.skin, width, height, at, figure.width, 20);
    }
    const { figure: f, staticSkin, firstCard } = start;
    const wide = f.width;
    // Huvudet: översta förgrunden kring förra rutans mitt, och tyngdpunkten i huvudets övre del.
    const x0 = Math.max(0, Math.round(headX - wide));
    const x1 = Math.min(width, Math.round(headX + wide));
    const count = (y: number): number => {
      let c = 0;
      for (let x = x0; x < x1; x++) c += s.fg[y * width + x]!;
      return c;
    };
    let top = 0;
    while (top < height && count(top) < 3) top++;
    const headBox = { x0: Math.round(headX - 0.75 * wide), y0: top, x1: Math.round(headX + 0.75 * wide), y1: top + Math.round((f.shoulders - f.top) * 0.6) };
    const head = centreIn(s.fg, width, headBox, 20);
    const face = centreIn(s.skin, width, headBox, 20);
    if (head) headX = head[0]!;
    push('huvud', head);
    tracks.ansikte!.push(head && face ? [((face[0]! - head[0]!) / wide) * 100] : null);
    // Bålen: den vilande sidans flank (vänster i bild) i raderna under axlarna.
    let fx = 0;
    let fn = 0;
    for (let y = f.shoulders + Math.round(0.2 * wide); y < Math.min(height, f.shoulders + Math.round(0.8 * wide)); y++) {
      for (let x = Math.max(0, Math.round(f.x - 2.5 * wide)); x < f.x; x++) {
        if (s.fg[y * width + x]) {
          fx += x;
          fn++;
          break;
        }
      }
    }
    push('flank', fn ? [fx / fn] : null);
    // Axeln: kavajens övre kant ovanför flanken, medel över några kolumner.
    let ay = 0;
    let an = 0;
    for (let x = Math.round(f.x - 1.05 * wide); x <= Math.round(f.x - 0.75 * wide); x++) {
      if (x < 0) continue;
      let y = Math.max(0, f.top);
      while (y < height && !s.dark[y * width + x]) y++;
      if (y < height) {
        ay += y;
        an++;
      }
    }
    push('axel', an ? [ay / an] : null);
    push('brost', centreIn(s.light, width, { x0: Math.round(f.x - 0.6 * wide), y0: f.shoulders, x1: Math.round(f.x + 0.6 * wide), y1: f.shoulders + Math.round(1.2 * wide) }, 20));
    // Kortet: gult eller blått under axlarna som inte var det i första rutan, närmast förra läget.
    const cards = below(s.card, width, f.shoulders + Math.round(0.25 * wide));
    for (let i = 0; i < cards.length; i++) if (firstCard[i]) cards[i] = 0;
    const foundCard = nearestPart(cards, width, height, card ?? start.card, wide * 4, 15);
    if (foundCard) card = foundCard;
    push('kort', foundCard);
    // Huden som kan vara givhanden: under axlarna, inte hud i första rutan, och inte i halsens och bröstets ruta (bålen
    // som lutar flyttar sin hud). Handen följs när kortet ligger (se nedan).
    const moving = below(s.skin, width, f.shoulders + Math.round(0.2 * wide));
    const chest = { x0: Math.round(f.x - 0.6 * wide), x1: Math.round(f.x + 0.6 * wide), y1: f.shoulders + Math.round(1.3 * wide) };
    for (let i = 0; i < moving.length; i++) {
      const x = i % width;
      if (staticSkin[i] || (x >= chest.x0 && x < chest.x1 && i < chest.y1 * width)) moving[i] = 0;
    }
    skins.push(grownMask(moving, width, height, 2));
  });
  // Handen: medan kortet bärs är det kortet (handen håller det i änden), före det handen i REDO, och när kortet ligger
  // still följs huden från kortet och tillbaka.
  const fps = film.fps;
  const cardPoints = filled({ fps, points: tracks.kort!.some(Boolean) ? tracks.kort! : [[0, 0]] });
  const cardSpeed = speedOf(smoothed(cardPoints, 1), fps);
  const cardTop = Math.max(...cardSpeed);
  const firstSeen = tracks.kort!.findIndex(Boolean);
  const landed = cardTop > 0 ? cardSpeed.findLastIndex((value) => value > 0.05 * cardTop) + 1 : -1;
  const wide = start!.figure.width;
  hand = hand ? [hand[0]!, hand[1]!] : null;
  let offset: number[] | null = null;
  skins.forEach((mask, k) => {
    if (firstSeen < 0 || landed < 0 || k < firstSeen) {
      tracks.hand!.push(hand ? hand.map((value) => value * STEP) : null);
      return;
    }
    if (k <= landed) {
      hand = cardPoints[k]!.map((value) => value / STEP);
      tracks.hand!.push(cardPoints[k]!);
      return;
    }
    const found = hand ? nearestPart(mask, Math.floor(frame.width / STEP), Math.floor(frame.height / STEP), hand, wide, 30) : null;
    if (found) hand = found;
    // Huden ligger en bit från kortets mitt: skillnaden där spåret byter från kortet till huden tonas bort på `blend`
    // sekunder (content/tagning.json, motion.handBlend), så att bytet inte mäts som ett ryck i handen.
    if (found && !offset) offset = cardPoints[landed]!.map((value, d) => value - found[d]! * STEP);
    const fade = offset ? Math.max(0, 1 - (k - landed - 1) / Math.max(1, Math.round(blend * fps))) : 0;
    tracks.hand!.push(found ? found.map((value, d) => value * STEP + (offset ? offset[d]! * fade : 0)) : null);
  });
  const out: Tracks = {};
  for (const [name, points] of Object.entries(tracks)) if (points.some(Boolean)) out[name] = { fps, points };
  return { tracks: out, fps, frames: film.frames, headWidth: start ? (start as Start).figure.width * STEP : 0 };
}

// Huvudets vridning i en film: hudens förskjutning i huvudet (spåret ansikte), i grader genom motion.yawPerShare.
export const FILM_ROLES: Roles = { hand: 'hand', head: 'huvud', trunk: 'flank', body: ['hand', 'huvud', 'flank', 'brost'], yaw: 'ansikte' };

// ---------------------------------------------------------------------------------------------------------------------
// Måtten för en tagning

/** Hur rörelsens mått tas, så som det står i content/tagning.json (motion). Vad varje tal är står där. */
export type MotionMeasure = { still: number; moving: number; degrees: number; handBlend: number; restLeast: number; slowShare: number; orderLeast: number; orderTurn: number; yawPerShare: number };

/** Skärmen i dockans grå ateljé och Klings gröna (content/tagning.json, reference.studio; grönt känns igen utan tal). */
export const screenOf = (studio: { screen: number[]; table: number[] }): Screen => ({ grey: [studio.screen, studio.table], tolerance: 14 });

/** Talen ur måtten, som de prövas mot gränserna (matning.ts, judge). */
const numbers = (values: Record<string, Value>): Record<string, number | null> => Object.fromEntries(Object.entries(values).map(([key, { value }]) => [key, value]));

/** Dockans rörelse mätt i 3D, `fps` prov per sekund, i huvudbredder (2 × body.head.radius). */
export function dollMotion(parts: Pick<CycleParts, 'scene' | 'doll'>, move: Parameters<typeof poseAt>[2], measure: MotionMeasure, fps = 24): Record<string, Value> {
  // En vändning och en väntan gör ingen väg ut och tillbaka med ett kort: cykelns tider mäts inte för dem.
  const phases = !move.action || move.action === 'deal' || move.action === 'hole';
  return motionValues(dollTracks(parts, move, fps), DOLL_ROLES, { ...measure, scale: 2 * parts.doll.body.head.radius, smooth: 0, cyclic: !!move.back, phases });
}

/** En film av en dealer på skärm mätt i bild, i huvudbredder. `cyclic`: filmen är en cykel som kedjas. */
export async function filmMotion(path: string, measure: MotionMeasure, screen: Screen, cyclic = true, phases = true): Promise<{ values: Record<string, Value>; tracks: Tracks; headWidth: number; frames: number; fps: number }> {
  const { tracks, fps, frames, headWidth } = await filmTracks(path, screen, measure.handBlend);
  return { values: motionValues(tracks, { ...FILM_ROLES, yawScale: measure.yawPerShare }, { ...measure, scale: headWidth, smooth: 1, cyclic, phases }), tracks, headWidth, frames, fps };
}

/** Rörelsens mått som tal, för gränserna i content/tagning.json (limits). */
export const motionNumbers = numbers;

// ---------------------------------------------------------------------------------------------------------------------
// Kommandot

type Content = { motion: MotionMeasure; reference: { studio: { screen: number[]; table: number[] } }; limits: Record<string, Limit> };
const content = (): Content => JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'content', 'tagning.json'), 'utf8')) as Content;

function print(title: string, values: Record<string, Value>, limits: Record<string, Limit>): void {
  console.log(title);
  const judged = new Map(judge(numbers(values), Object.fromEntries(Object.keys(values).filter((key) => limits[key]).map((key) => [key, limits[key]!]))).map((entry) => [entry.key, entry]));
  for (const [key, { value, what }] of Object.entries(values)) {
    const verdict = judged.get(key);
    console.log(`  ${(verdict ? verdict.verdict : '').padEnd(9)} ${key.padEnd(18)} ${String(value).padStart(8)} ${(verdict ? verdict.limit : '').padEnd(14)} ${what}`);
  }
}

/** Varje del för sig: toppfart, rörelserna med knyck och tvära stopp, och farten ruta för ruta i hundradelar av toppen. */
export function partsReport(tracks: Tracks, smooth: number): string[] {
  const lines: string[] = [];
  for (const [name, track] of Object.entries(tracks)) {
    const speed = speedOf(smoothed(filled(track), smooth), track.fps);
    const moves = segments(speed, track.fps);
    const words = moves.map((m) => `${round(m.from / track.fps, 2)}–${round(m.to / track.fps, 2)} s topp ${round(m.peak, 2)} vid ${round(m.at / track.fps, 2)} knyck ${round(snap(speed, track.fps, m), 1)} tvära ${abrupt(speed, m)} toppar ${peaksIn(speed, m)}`);
    lines.push(`${name}: ${words.join('; ')}`);
    const top = Math.max(...speed) || 1;
    lines.push(`  ${speed.map((v) => Math.round((99 * v) / top)).join(' ')}`);
  }
  return lines;
}

async function main(args: string[]): Promise<void> {
  const [what, ...rest] = args;
  const flag = (name: string): string | undefined => {
    const k = rest.indexOf(name);
    return k >= 0 ? rest[k + 1] : undefined;
  };
  const plain = rest.filter((word, k) => !word.startsWith('--') && !['--fps', '--spar', '--cykel', '--handling'].includes(rest[k - 1] ?? ''));
  const { motion, reference, limits } = content();
  if (what === 'docka') {
    const parts = readCycleParts(flag('--cykel') ?? 'cykel-nyp');
    const seat: Seat = plain[0] === 'D' ? 'D' : Number(plain[0] ?? 4);
    const index = Number(plain[1] ?? 0);
    const one = rest.includes('--giv');
    const action = (flag('--handling') ?? 'deal') as Action;
    const move = one ? moveFor(parts.scene, parts.doll, parts.base, seat, { index }) : cycleMove(parts, { seat, index, action });
    const fps = Number(flag('--fps') ?? 24);
    print(`${move.id}, ${round(move.seconds)} s, ${fps} prov/s, huvudbredd ${round(2 * parts.doll.body.head.radius)} m`, dollMotion(parts, move, motion, fps), limits);
    if (rest.includes('--delar')) console.log(partsReport(dollTracks(parts, move, fps), 0).join('\n'));
    return;
  }
  if (what === 'film') {
    const path = plain[0];
    if (!path) throw new MotionError('Skriv filmen: node src/pipeline/rorelse.ts film <film.mp4>');
    const { values, tracks, headWidth, frames, fps } = await filmMotion(path, motion, screenOf(reference.studio), !rest.includes('--enkel'));
    const missing = Object.entries(tracks).map(([name, track]) => `${name} ${track.points.filter((p) => !p).length}`).join(', ');
    print(`${path}: ${frames} rutor à ${fps}/s, huvudbredd ${headWidth} bp; saknas: ${missing}`, values, limits);
    if (rest.includes('--delar')) console.log(partsReport(tracks, 1).join('\n'));
    const json = flag('--spar');
    if (json) writeFileSync(json, JSON.stringify(tracks));
    return;
  }
  throw new MotionError('Skriv docka <plats> [kort] [--cykel namn] [--handling deal|hole|flip] [--fps n] [--giv] [--delar], eller film <film.mp4> [--enkel] [--delar] [--spar spår.json]');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof MotionError ? error.message : error);
    process.exit(1);
  });
}