// Den vilande armen: hur mycket den vilande handen och armbågen rör sig i ett klipp. Handen mäts som hudens tyngdpunkt
// kring dockans vilande hand, och fingrarna som hur mycket hudens form ändras mot första rutan; armbågen som
// silhuettens yttre kant i armbågens rader. Allt i bildpunkter och i cm vid handens avstånd från ögat, räknat genom
// filmens öga (cykel.ts, cycleEye). Rutorna och punkterna kommer ur dockan i REDO, som klippet är gjort efter.

import { poseAt } from '../scene/dollPose.ts';
import { see, type Pixel, type SeatView } from '../scene/geometry.ts';
import { cycleEye, cycleMove, isSkin, type CycleCard, type CycleParts } from './cykel.ts';
import { clipBox, eachFrame, grow as growBox, parts as partsOf, type Box, type Picture, type Rgb } from './matning.ts';

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

/** Var den vilande armen mäts: handens ruta, armbågens rader och kolumner, och hur många cm en bildpunkt är vid handen. */
export type RestPlaces = { hand: Box; elbowRows: [number, number]; elbowXs: [number, number]; side: -1 | 1; cmPerPx: number };

/**
 * Den vilande armens rutor, letade i filmens första ruta `first` med dockan i REDO som ledning (sedd genom cykelns öga):
 * handen är den största huddelen på dockans vilande sida, under axlarna, närmast dockans vilande hand, vuxen `grow` bp;
 * armbågen är silhuettens yttersta punkt på den sidan mellan axlarna och handen, och dess rader (±`rows` bp) med
 * kolumnerna där kanten letas. Ankarets arm ligger inte som dockans, så rutorna tas ur bilden. `side` är åt vilket håll i
 * bild armbågen sticker ut.
 */
export function restPlaces(parts: CycleParts, view: SeatView, card: CycleCard, first: Picture, key: Rgb, grow = 30, rows = 25): RestPlaces | null {
  const eye = cycleEye(parts, view);
  const move = cycleMove(parts, card);
  const rest = (move.carry ?? 'left') === 'left' ? 'right' : 'left';
  const redo = poseAt(parts.scene, parts.doll, move, 0);
  const at = (point: readonly number[]): Pixel => {
    const pixel = see(eye, point as [number, number, number]);
    if (!pixel) throw new Error('Den vilande armen ligger bakom ögat');
    return pixel;
  };
  const dollHand = redo.hands[rest].map(at);
  const guide = { x: dollHand.reduce((sum, p) => sum + p.x, 0) / dollHand.length, y: dollHand.reduce((sum, p) => sum + p.y, 0) / dollHand.length };
  const shoulder = at(redo.arms[rest].shoulder);
  const head = at(redo.head);
  const side: -1 | 1 = shoulder.x < head.x ? -1 : 1;
  const frame = eye.frame;
  // Den vilande sidan av bilden under axlarna, utan mitten (blusen räknas som hud).
  const area: Box = side < 0 ? { x0: 0, y0: Math.round(shoulder.y), x1: Math.round(head.x), y1: frame.height } : { x0: Math.round(head.x), y0: Math.round(shoulder.y), x1: frame.width, y1: frame.height };
  const skin = partsOf(first, clipBox(area, frame), (r, g, b) => isSkin(r, g, b), 800);
  const hand = [...skin].sort((a, b) => Math.hypot(a.c.x - guide.x, a.c.y - guide.y) - Math.hypot(b.c.x - guide.x, b.c.y - guide.y))[0];
  // Syns ingen vilande hand eller armbåge i första rutan går armen inte att mäta: svaret är null, och måtten saknas.
  if (!hand) return null;
  // Armbågen: den yttersta bildpunkten som inte är skärm, rad för rad mellan axeln och handen.
  let outer: Pixel | null = null;
  for (let y = Math.round(shoulder.y); y < hand.box.y0; y++) {
    for (let step = 0; step < frame.width / 2; step++) {
      const x = side < 0 ? area.x0 + step : area.x1 - 1 - step;
      const i = (y * first.width + x) * 3;
      if (isScreen(first.data[i]!, first.data[i + 1]!, first.data[i + 2]!, key)) continue;
      if (!outer || (side < 0 ? x < outer.x : x > outer.x)) outer = { x, y };
      break;
    }
  }
  if (!outer) return null;
  const points = redo.hands[rest];
  const centre = [0, 1, 2].map((k) => points.reduce((sum, point) => sum + point[k]!, 0) / points.length);
  const depth = Math.hypot(centre[0]! - eye.position[0], centre[1]! - eye.position[1], centre[2]! - eye.position[2]);
  return {
    hand: clipBox(growBox(hand.box, grow), frame),
    elbowRows: [Math.round(outer.y - rows), Math.round(outer.y + rows)],
    elbowXs: side < 0 ? [Math.max(0, outer.x - 2 * grow), outer.x + 6 * grow] : [outer.x - 6 * grow, Math.min(frame.width, outer.x + 2 * grow)],
    side,
    cmPerPx: (100 * depth) / eye.focalPx,
  };
}

/** Om en bildpunkt är skärmens gröna (eller nära den): inte dealer. */
const isScreen = (r: number, g: number, b: number, key: Rgb): boolean => Math.max(Math.abs(r - key[0]), Math.abs(g - key[1]), Math.abs(b - key[2])) < 40 || (g > r + 40 && g > b + 40);

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

/**
 * Hur mycket den vilande armen rör sig i filmen `clip` (i rutans upplösning): handens tyngdpunkt längst från sin median
 * och dess väg per sekund, hur mycket hudens form i handens ruta ändras mot första rutan (1 − minsta överlapp), och
 * armbågens yttre kant längst från sin median. Null där inget syns.
 */
export async function restMotion(clip: string, frame: { width: number; height: number }, fps: number, places: RestPlaces | null, key: Rgb, onFrame?: (index: number, hand: Pixel | null, elbow: number | null) => void): Promise<Record<string, number | null>> {
  if (!places) return { vilaHandBp: null, vilaHandCm: null, vilaHandFart: null, vilaFingrar: null, vilaArmbageBp: null, vilaArmbageCm: null };
  const centres: (Pixel | null)[] = [];
  const edges: (number | null)[] = [];
  let first: Uint8Array | null = null;
  let leastOverlap = 1;
  const box = places.hand;
  const w = box.x1 - box.x0;
  await eachFrame(clip, frame, (picture) => {
    const mask = new Uint8Array(w * (box.y1 - box.y0));
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (let y = box.y0; y < box.y1; y++) {
      for (let x = box.x0; x < box.x1; x++) {
        const i = (y * picture.width + x) * 3;
        if (!isSkin(picture.data[i]!, picture.data[i + 1]!, picture.data[i + 2]!)) continue;
        mask[(y - box.y0) * w + (x - box.x0)] = 1;
        n++;
        sx += x;
        sy += y;
      }
    }
    centres.push(n > 200 ? { x: sx / n, y: sy / n } : null);
    if (!first) first = mask;
    else {
      let both = 0;
      let either = 0;
      for (let p = 0; p < mask.length; p++) {
        if (mask[p] && first[p]) both++;
        if (mask[p] || first[p]) either++;
      }
      if (either) leastOverlap = Math.min(leastOverlap, both / either);
    }
    // Armbågens yttre kant: i varje rad den yttersta bildpunkten som inte är skärm, och medianen av raderna.
    const found: number[] = [];
    for (let y = Math.max(0, places.elbowRows[0]); y <= Math.min(frame.height - 1, places.elbowRows[1]); y++) {
      const [from, to] = places.elbowXs;
      if (places.side < 0) {
        for (let x = from; x < to; x++) {
          const i = (y * picture.width + x) * 3;
          if (!isScreen(picture.data[i]!, picture.data[i + 1]!, picture.data[i + 2]!, key)) {
            found.push(x);
            break;
          }
        }
      } else {
        for (let x = to - 1; x >= from; x--) {
          const i = (y * picture.width + x) * 3;
          if (!isScreen(picture.data[i]!, picture.data[i + 1]!, picture.data[i + 2]!, key)) {
            found.push(x);
            break;
          }
        }
      }
    }
    edges.push(found.length ? median(found) : null);
    onFrame?.(edges.length - 1, centres.at(-1) ?? null, edges.at(-1) ?? null);
  });
  const seen = centres.filter((point): point is Pixel => point !== null);
  const middle = seen.length ? { x: median(seen.map((p) => p.x)), y: median(seen.map((p) => p.y)) } : null;
  const handMost = middle && seen.length ? Math.max(...seen.map((p) => Math.hypot(p.x - middle.x, p.y - middle.y))) : null;
  let path = 0;
  for (let k = 1; k < centres.length; k++) {
    const a = centres[k - 1];
    const b = centres[k];
    if (a && b) path += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const known = edges.filter((edge): edge is number => edge !== null);
  const edgeMiddle = known.length ? median(known) : null;
  const elbowMost = edgeMiddle !== null ? Math.max(...known.map((edge) => Math.abs(edge - edgeMiddle))) : null;
  const seconds = centres.length / fps;
  return {
    vilaHandBp: handMost === null ? null : round(handMost, 1),
    vilaHandCm: handMost === null ? null : round(handMost * places.cmPerPx, 2),
    vilaHandFart: seen.length ? round((path * places.cmPerPx) / seconds, 2) : null,
    vilaFingrar: first ? round(1 - leastOverlap, 3) : null,
    vilaArmbageBp: elbowMost === null ? null : round(elbowMost, 1),
    vilaArmbageCm: elbowMost === null ? null : round(elbowMost * places.cmPerPx, 2),
  };
}
