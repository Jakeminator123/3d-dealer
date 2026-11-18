// Följden: dealerns klipp efter varandra på en tidslinje. Här räknas vilket klipp och vilken tid i det som visas vid en
// tid i följden, vilka kort som ligger, vilket kort som är på väg, och om klippets märkkort har landat. Ingen bild läses
// här: film.ts spelar följden, och scenbygget (build.ts) lägger korten efter den.
// Följden avgör ingenting i spelet: vilka kort som läggs och var står i beställningen.
//
// En del utan film (`from` satt) är spelkärnans fallback för ett kort som saknar klipp: dealern står i REDO medan
// scenens kort glider från skon, flyttas från en annan kortplats eller vänds där det ligger, och ligger från `card.at`.

import { spotKey, type CardSpot, type ClipCard } from './dealer.ts';

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
 * Om märkkortet i bilden ska tas bort vid tiden `time`: från att den visade delens kort har landat, så att scenens kort
 * syns där. Under en fallback står filmens ruta kvar, med det förra klippets kort lagt: där är märkkortet borta.
 */
export function markerDown(reel: Reel, time: number): boolean {
  const { index, local } = placeIn(reel, time);
  const part = reel.parts[index]!;
  if (isStill(part)) return true;
  return part.card !== undefined && local >= part.card.at;
}
