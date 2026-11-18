// Följden: dealerns klipp efter varandra på en tidslinje. Här räknas vilket klipp och vilken tid i det som visas vid en
// tid i följden, vilka kort som ligger, och om klippets märkkort har landat. Ingen bild läses här: film.ts spelar
// följden, och scenbygget (build.ts) lägger korten efter den.
// Följden avgör ingenting i spelet: vilka kort som läggs och var står i beställningen.

import type { ClipCard } from './dealer.ts';

/** Ett klipp i följden: dess längd i sekunder, och kortet det lägger. */
export type ReelPart = { seconds: number; card?: ClipCard };

/**
 * Följden: klippen, var vart och ett börjar, hur länge sista rutan står kvar efter sista klippet (`hold`), och hela
 * längden med den tiden inräknad. Allt i sekunder.
 */
export type Reel = { parts: ReelPart[]; starts: number[]; hold: number; seconds: number };

// Tider som skiljer mindre än så här är samma tid: summan av klippens längder avrundas annorlunda än en tid räknad ur dem.
const SLACK = 1e-9;

/** Var följden står: klippet (från 0), tiden i det, och om följden är förbi sista klippet och står på dess sista ruta. */
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

/** Där sista klippet slutar och dess sista ruta börjar stå kvar. */
export const reelEnd = (reel: Reel): number => reel.seconds - reel.hold;

/**
 * Var följden står vid tiden `time`. Ett klipp gäller från sin början fram till nästa klipps början. Före början står
 * följden på första klippets början; från sista klippets slut står den på dess sista ruta (`held`, och `local` är
 * klippets längd).
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
 * Klippen vars kort ligger vid tiden `time`, i den ordning korten landade: varje tidigare klipps kort, och det visade
 * klippets när dess tid har kommit. Ett senare kort på samma kortplats tar det tidigares plats.
 */
export function lyingAt(reel: Reel, time: number): number[] {
  const { index, local } = placeIn(reel, time);
  const lying = new Map<string, number>();
  reel.parts.forEach((part, i) => {
    if (!part.card || i > index || (i === index && local < part.card.at)) return;
    const place = `${part.card.seat}/${part.card.index}`;
    lying.delete(place);
    lying.set(place, i);
  });
  return [...lying.values()];
}

/** Om det visade klippets märkkort har landat vid tiden `time`: då tas dess blå bort, så att scenens kort syns där. */
export function markerDown(reel: Reel, time: number): boolean {
  const { index, local } = placeIn(reel, time);
  const card = reel.parts[index]!.card;
  return card !== undefined && local >= card.at;
}
