// Följden: dealerns klipp efter varandra på en tidslinje. Här räknas vilket klipp och vilken tid i det som visas vid en
// tid i följden, vilka kort som ligger, vilket kort som är på väg, om klippets märkkort har landat, och hur långt ett lagt
// kort har gått från där handen lade det till kortplanen (glideAt). Ingen bild läses här: film.ts spelar följden, och
// scenbygget (build.ts) lägger korten efter den.
// Följden avgör ingenting i spelet: vilka kort som läggs och var står i beställningen.
//
// En del utan film (`from` satt) är spelkärnans fallback för ett kort som saknar klipp: dealern står i REDO medan
// scenens kort glider från skon, flyttas från en annan kortplats eller vänds där det ligger, och ligger från `card.at`.

import { spotKey, type CardSpot, type ClipCard } from './dealer.ts';
import type { FeltPoint } from './description.ts';

/**
 * En del av följden: dess längd i sekunder och kortet den lägger. `from` finns bara på en del utan film: varifrån
 * kortet kommer (skon, en annan kortplats, eller samma kortplats när det vänds).
 */
export type ReelPart = { seconds: number; card?: ClipCard; from?: CardSpot | 'skon' };

/**
 * Följden: delarna, var och en börjar, hur länge sista rutan står kvar efter sista delen (`hold`), och hela längden med
 * den tiden inräknad. Allt i sekunder.
 */
export type Reel = { parts: ReelPart[]; starts: number[]; hold: number; seconds: number };

// Tider som skiljer mindre än så här är samma tid: summan av klippens längder avrundas annorlunda än en tid räknad ur dem.
const SLACK = 1e-9;

/** Var följden står: delen (från 0), tiden i den, och om följden är förbi sista delen och står på dess sista ruta. */
export type ReelPlace = { index: number; local: number; held: boolean };

export function makeReel(parts: ReelPart[], hold = 0): Reel {
  if (parts.length === 0) throw new Error('En följd behöver minst ett klipp');
  const starts: number[] = [];
  let at = 0;
  for (const part of parts) {
    starts.push(at);
    at += Math.max(0, part.seconds);
  }
  const rest = Math.max(0, hold);
  return { parts, starts, hold: rest, seconds: at + rest };
}

/** Där sista delen slutar och dess sista ruta börjar stå kvar. */
export const reelEnd = (reel: Reel): number => reel.seconds - reel.hold;

/** Där delen `index` slutar. */
export const partEnd = (reel: Reel, index: number): number => reel.starts[index]! + Math.max(0, reel.parts[index]!.seconds);

/** Om delen är en fallback: ingen film, och kortet går självt. */
export const isStill = (part: ReelPart): boolean => part.from !== undefined;

/**
 * Var följden står vid tiden `time`. En del gäller från sin början fram till nästa dels början. Före början står
 * följden på första delens början; från sista delens slut står den på dess sista ruta (`held`, och `local` är delens
 * längd).
 */
export function placeIn(reel: Reel, time: number): ReelPlace {
  const t = Math.max(0, time);
  const last = reel.parts.length - 1;
  let index = 0;
  for (let i = last; i >= 0; i--) {
    if (t >= reel.starts[i]!) {
      index = i;
      break;
    }
  }
  const seconds = Math.max(0, reel.parts[index]!.seconds);
  const local = t - reel.starts[index]!;
  if (index === last && local >= seconds - SLACK) return { index, local: seconds, held: true };
  return { index, local, held: false };
}

/**
 * Delarna vars kort ligger vid tiden `time`, i den ordning korten landade: varje tidigare dels kort, och den visade
 * delens när dess tid har kommit. Ett senare kort på samma kortplats tar det tidigares plats. Ett kort som en fallback
 * flyttar eller vänder lämnar sin kortplats när delen börjar, och ligger igen när den har landat.
 */
export function lyingAt(reel: Reel, time: number): number[] {
  const { index, local } = placeIn(reel, time);
  return [...lying(reel, index, local).values()];
}

/** Korten som ligger när delen `index` har gått `local` sekunder, med kortplatsen som nyckel. Delarna före är hela. */
function lying(reel: Reel, index: number, local: number): Map<string, number> {
  const laid = new Map<string, number>();
  reel.parts.forEach((part, i) => {
    if (!part.card || i > index) return;
    if (part.from && part.from !== 'skon') laid.delete(spotKey(part.from));
    if (i === index && local < part.card.at) return;
    const place = spotKey(part.card);
    laid.delete(place);
    laid.set(place, i);
  });
  return laid;
}

/**
 * Kortet som är på väg vid tiden `time`: delen som för det, hur långt det har kommit (0 till 1), och delen vars kort
 * låg på kortplatsen det kommer från (det som flyttas eller vänds), om något låg där. Null när inget kort är på väg:
 * i ett klipp bär filmen kortet.
 */
export function flyingAt(reel: Reel, time: number): { part: number; progress: number; left: number | null } | null {
  const { index, local } = placeIn(reel, time);
  const part = reel.parts[index]!;
  if (!part.from || !part.card || local >= part.card.at) return null;
  const from = part.from;
  // Det som låg på kortplatsen när delen började: alla delar före den, hela.
  const left = from === 'skon' || index === 0 ? null : (lying(reel, index - 1, Infinity).get(spotKey(from)) ?? null);
  return { part: index, progress: part.card.at > 0 ? Math.min(1, Math.max(0, local / part.card.at)) : 1, left };
}

/**
 * Hur ett lagt kort går från där handen lade det till sin plats i kortplanen och sin storlek på bordet
 * (content/scene.json, card.onTable.glide): det börjar `after` sekunder efter att kortet har landat och tar `seconds`.
 */
export type Glide = { after: number; seconds: number };

// Två lägen på filten närmare än så här, i meter, är samma plats: kortplanen och registrets place står på 0,1 mm.
const SAME_PLACE = 0.00005;

/** Mjukt i början och slutet, som GLSL:s smoothstep mellan 0 och 1. */
const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * Hur långt delen `index`s kort har gått vid tiden `time`, från där handen lade det (0) till sin plats i kortplanen och
 * sin storlek på bordet (1), mjukt i början och slutet. Det börjar `glide.after` sekunder efter att kortet har landat
 * (card.at), alltså när handen har släppt kortet och lyft, och kan fortsätta in i nästa del. Före det, och när följden
 * har börjat om, är det 0. En del utan film lägger kortet direkt på planens plats (build.ts, carry): där är det 1.
 */
export function glideAt(reel: Reel, index: number, time: number, glide: Glide): number {
  const part = reel.parts[index];
  if (!part?.card) return 0;
  if (isStill(part)) return 1;
  const start = reel.starts[index]! + part.card.at + Math.max(0, glide.after);
  const t = Math.max(0, time) - start;
  if (glide.seconds <= 0) return t >= 0 ? 1 : 0;
  return ease(Math.min(1, Math.max(0, t / glide.seconds)));
}

/**
 * Var delen `index`s kort ligger på filten vid tiden `time`, och hur stort det är: från `from` (där handen lade det, i
 * filmens storlek) till `to` (planens plats) och storleken `scale`, så långt som glideAt säger. `still` är sant när
 * kortet inte är på väg: före och efter glidningen. Är `from` och `to` samma och `scale` 1 rör sig ingenting, och kortet
 * är stilla hela tiden.
 */
export function laidAt(reel: Reel, index: number, time: number, glide: Glide, from: FeltPoint, to: FeltPoint, scale: number): { place: FeltPoint; scale: number; still: boolean } {
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) < SAME_PLACE && Math.abs(scale - 1) < 1e-9) return { place: [from[0], from[1]], scale: 1, still: true };
  const g = glideAt(reel, index, time, glide);
  if (g <= 0) return { place: [from[0], from[1]], scale: 1, still: true };
  if (g >= 1) return { place: [to[0], to[1]], scale, still: true };
  return { place: [from[0] + (to[0] - from[0]) * g, from[1] + (to[1] - from[1]) * g], scale: 1 + (scale - 1) * g, still: false };
}

/**
 * Om märkkortet i bilden ska tas bort vid tiden `time`: från att den visade delens kort har landat, så att scenens kort
 * syns där. Under en fallback står filmens ruta kvar, med det förra klippets kort lagt: där är märkkortet borta.
 */
export function markerDown(reel: Reel, time: number): boolean {
  const { index, local } = placeIn(reel, time);
  const part = reel.parts[index]!;
  if (isStill(part)) return true;
  return part.card !== undefined && local >= part.card.at;
}
