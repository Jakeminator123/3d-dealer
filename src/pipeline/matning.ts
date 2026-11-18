// Mätningarna av en tagning: ett klipp ur filmmodellen, eller dockans referensfilm, läst ruta för ruta och mätt mot scenen
// och dockan. Rutorna där något letas räknas ur scenen och dockan sedda i vyns närbild (layoutFor), aldrig ur fasta tal:
// samma mätning gäller varje plats, kortplats och vy. Hur måtten tas står i content/tagning.json (measure), och
// gränserna de prövas mot i limits samma fil. Kommandot är src/pipeline/tagning.ts.
//
// Förd över ur pilotens och dess granskares mätskript (output/work/cykel/pilot/mat-cykel.mjs, skarv.mjs, glipa.mjs,
// vridning.mjs, bevis-mat.mjs; output/work/granskning-pilot/mat.mjs, kadens.mjs, skarv.mjs, glipa.mjs, bevis-bla.mjs).
// Färggränserna för korten är granskarens. Allt i bildpunkter (bp) i filmens ruta; tider i sekunder, ruta n vid n / fps.
// Ingenting här avgör något i spelet.

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { Frame, Vec3 } from '../scene/description.ts';
import { poseAt } from '../scene/dollPose.ts';
import { see, tilted, type Pixel, type SeatView } from '../scene/geometry.ts';
import { screenShare } from '../scene/key.ts';
import { cornersIn, cycleEye, cycleMove, isSkin, type CycleCard, type CycleParts } from './cykel.ts';

export class MeasureError extends Error {}

const run = promisify(execFile);

/** En bild i minnet: RGB, tre kanaler, rad för rad. */
export type Picture = { data: Buffer; width: number; height: number };
/** En ruta i bilden: x0 och y0 med, x1 och y1 inte. */
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Rgb = readonly [number, number, number];

/** Hur måtten tas, så som det står i content/tagning.json (measure). Vad varje tal är står där. */
export type Measure = {
  cardPart: number;
  frameMargin: number;
  mouthReach: number;
  merged: number;
  placeGrow: number;
  insideShare: number;
  coverShare: number;
  leavesPx: number;
  homePx: number;
  maskGrow: number;
  regionGrow: number;
  cardTop: number;
  handTop: number;
  cadencePeriod: number;
  cadenceStill: number;
  waist: [number, number];
  gapRows: number;
  gapLeast: number;
  greenInner: number;
  greenOff: number;
  greenEvery: number;
  handWindow: number;
  eyeRows: [number, number];
  headReach: number;
  headInner: number;
  dark: number;
  proofReach: number;
  visibleShare: number;
  nextShare: number;
  nextAround: number;
  nextGrow: number;
  armDiff: number;
  armGrow: number;
  handReach: number;
  wristNear: number;
  handEnd: number;
};

// ---------------------------------------------------------------------------------------------------------------------
// Färger

/** Märkkortets blå framsida och gula baksida, med granskarens gränser (output/work/granskning-pilot/mat.mjs). */
export const isBlue = (r: number, g: number, b: number): boolean => b > 150 && b - r > 60 && b - g > 20;
export const isYellow = (r: number, g: number, b: number): boolean => r > 170 && g > 140 && b < 120 && r - b > 90;
/** Blått eller cyan som är kvar efter nyckeln i scenen (granskarens bevis-bla.mjs). */
export const isCyan = (r: number, g: number, b: number): boolean => b > r + 50 && b > g + 10;

// ---------------------------------------------------------------------------------------------------------------------
// Rutor och bilder

/** Rutan begränsad till bilden. */
export const clipBox = (box: Box, frame: Frame): Box => ({
  x0: Math.max(0, Math.floor(box.x0)),
  y0: Math.max(0, Math.floor(box.y0)),
  x1: Math.min(frame.width, Math.ceil(box.x1)),
  y1: Math.min(frame.height, Math.ceil(box.y1)),
});
export const grow = (box: Box, by: number): Box => ({ x0: box.x0 - by, y0: box.y0 - by, x1: box.x1 + by, y1: box.y1 + by });
export const union = (...boxes: Box[]): Box => ({
  x0: Math.min(...boxes.map((box) => box.x0)),
  y0: Math.min(...boxes.map((box) => box.y0)),
  x1: Math.max(...boxes.map((box) => box.x1)),
  y1: Math.max(...boxes.map((box) => box.y1)),
});
/** Den minsta rutan kring punkterna, punkternas egna bildpunkter med. */
export const boxAround = (points: Pixel[]): Box => ({
  x0: Math.floor(Math.min(...points.map((p) => p.x))),
  y0: Math.floor(Math.min(...points.map((p) => p.y))),
  x1: Math.floor(Math.max(...points.map((p) => p.x))) + 1,
  y1: Math.floor(Math.max(...points.map((p) => p.y))) + 1,
});
const inside = (box: Box, x: number, y: number): boolean => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
const distance = (a: Pixel, b: Pixel): number => Math.hypot(a.x - b.x, a.y - b.y);
const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

/** En fyrhörnings yta i bp (skosnöresformeln). */
export function quadArea(points: Pixel[]): number {
  let twice = 0;
  for (let k = 0; k < points.length; k++) {
    const a = points[k]!;
    const b = points[(k + 1) % points.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

export type Difference = {
  /** Medelavvikelse per kanal (pilotens mått). */
  mean: number;
  /** Medel av största kanalskillnaden per bildpunkt (granskarens mått). */
  meanMax: number;
  psnr: number;
  /** Andel bildpunkter, i procent, där någon kanal skiljer mer än 24. */
  over24: number;
  /** Medelskillnad med tecken per kanal, a − b. */
  signed: [number, number, number];
};

/** Två bilder mot varandra, inom `box` (hela bilden om ingen sägs) och utom `skip`. PSNR för lika bilder skrivs som 99. */
export function difference(a: Picture, b: Picture, box?: Box, skip?: Box): Difference {
  if (a.width !== b.width || a.height !== b.height) throw new MeasureError(`Bilderna är ${a.width} × ${a.height} och ${b.width} × ${b.height}`);
  const area = clipBox(box ?? { x0: 0, y0: 0, x1: a.width, y1: a.height }, a);
  let sum = 0;
  let squares = 0;
  let most = 0;
  let over = 0;
  let n = 0;
  const signed = [0, 0, 0];
  for (let y = area.y0; y < area.y1; y++) {
    for (let x = area.x0; x < area.x1; x++) {
      if (skip && inside(skip, x, y)) continue;
      const i = (y * a.width + x) * 3;
      let biggest = 0;
      for (let c = 0; c < 3; c++) {
        const d = a.data[i + c]! - b.data[i + c]!;
        const size = Math.abs(d);
        sum += size;
        squares += d * d;
        signed[c]! += d;
        if (size > biggest) biggest = size;
      }
      most += biggest;
      if (biggest > 24) over++;
      n++;
    }
  }
  if (n === 0) throw new MeasureError('Ingen bildpunkt att jämföra');
  const mse = squares / (n * 3);
  return {
    mean: round(sum / (n * 3)),
    meanMax: round(most / n),
    psnr: mse === 0 ? 99 : round(10 * Math.log10((255 * 255) / mse), 1),
    over24: round((100 * over) / n, 3),
    signed: signed.map((value) => round(value / n)) as [number, number, number],
  };
}

/** Steget mellan två rutor för takten: medelavvikelse per kanal i var annan bildpunkt i `box` (granskarens kadens.mjs). */
export function stepBetween(a: Picture, b: Picture, box: Box): number {
  const area = clipBox(box, a);
  let sum = 0;
  let n = 0;
  for (let y = area.y0; y < area.y1; y += 2) {
    for (let x = area.x0; x < area.x1; x += 2) {
      const i = (y * a.width + x) * 3;
      sum += Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!);
      n += 3;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Takten: varje steg mot medel av sina två grannar, samlat per läge modulo `period`, och medianen i varje läge. Steg där
 * grannarna rör sig mindre än `still` hoppas över. En film som har gjorts om från 30 till 24 rutor/s genom att var femte
 * ruta strukits får vart fjärde steg ungefär dubbelt så stort. `most` är den största medianen.
 */
export function cadence(steps: number[], period: number, still: number): { medians: (number | null)[]; most: number | null } {
  const ratios: number[][] = Array.from({ length: period }, () => []);
  for (let i = 1; i < steps.length - 1; i++) {
    const beside = (steps[i - 1]! + steps[i + 1]!) / 2;
    if (beside < still) continue;
    ratios[i % period]!.push(steps[i]! / beside);
  }
  const medians = ratios.map((list) => {
    if (list.length === 0) return null;
    const sorted = [...list].sort((a, b) => a - b);
    return round(sorted[Math.floor(sorted.length / 2)]!);
  });
  const known = medians.filter((value): value is number => value !== null);
  return { medians, most: known.length ? Math.max(...known) : null };
}

/** En sammanhängande del av en bild: antal bp, tyngdpunkt, ruta, och hörnen som ytterpunkter (som ett kort). */
export type Part = { n: number; c: Pixel; box: Box; w: number; h: number; corners: Pixel[] };

/**
 * De sammanhängande delarna (fyra grannar) av bildpunkterna som klarar `test` inom `box`, med minst `least` bp, störst
 * först. Hörnen är ytterpunkterna i x + y och y − x, i ordningen bortre vänstra, bortre högra, hitre högra, hitre vänstra
 * (som cardCorners i src/scene/geometry.ts sett framifrån).
 */
export function parts(picture: Picture, box: Box, test: (r: number, g: number, b: number, x: number, y: number) => boolean, least: number): Part[] {
  const area = clipBox(box, picture);
  const bw = area.x1 - area.x0;
  const bh = area.y1 - area.y0;
  if (bw <= 0 || bh <= 0) return [];
  const mask = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = ((area.y0 + y) * picture.width + area.x0 + x) * 3;
      if (test(picture.data[i]!, picture.data[i + 1]!, picture.data[i + 2]!, area.x0 + x, area.y0 + y)) mask[y * bw + x] = 1;
    }
  }
  const stack = new Int32Array(bw * bh);
  const found: Part[] = [];
  for (let start = 0; start < bw * bh; start++) {
    if (mask[start] !== 1) continue;
    let top = 0;
    stack[top++] = start;
    mask[start] = 2;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let x0 = bw;
    let y0 = bh;
    let x1 = -1;
    let y1 = -1;
    const corner = [
      { at: 0, x: 0, y: 0, best: Infinity }, // minst x + y
      { at: 0, x: 0, y: 0, best: Infinity }, // minst y − x
      { at: 0, x: 0, y: 0, best: -Infinity }, // störst x + y
      { at: 0, x: 0, y: 0, best: -Infinity }, // störst y − x
    ];
    while (top > 0) {
      const p = stack[--top]!;
      const x = p % bw;
      const y = (p - x) / bw;
      n++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const sum = x + y;
      const slant = y - x;
      if (sum < corner[0]!.best) Object.assign(corner[0]!, { best: sum, x, y });
      if (slant < corner[1]!.best) Object.assign(corner[1]!, { best: slant, x, y });
      if (sum > corner[2]!.best) Object.assign(corner[2]!, { best: sum, x, y });
      if (slant > corner[3]!.best) Object.assign(corner[3]!, { best: slant, x, y });
      if (x > 0 && mask[p - 1] === 1) (mask[p - 1] = 2), (stack[top++] = p - 1);
      if (x < bw - 1 && mask[p + 1] === 1) (mask[p + 1] = 2), (stack[top++] = p + 1);
      if (y > 0 && mask[p - bw] === 1) (mask[p - bw] = 2), (stack[top++] = p - bw);
      if (y < bh - 1 && mask[p + bw] === 1) (mask[p + bw] = 2), (stack[top++] = p + bw);
    }
    if (n < least) continue;
    found.push({
      n,
      c: { x: round(area.x0 + sx / n, 1), y: round(area.y0 + sy / n, 1) },
      box: { x0: area.x0 + x0, y0: area.y0 + y0, x1: area.x0 + x1 + 1, y1: area.y0 + y1 + 1 },
      w: x1 - x0 + 1,
      h: y1 - y0 + 1,
      corners: corner.map((point) => ({ x: area.x0 + point.x, y: area.y0 + point.y })),
    });
  }
  return found.sort((a, b) => b.n - a.n);
}

/**
 * En fyrhörning med varje kant flyttad `by` bp inåt, och hörnen där de nya kanterna möts. Så ser ett kort ut som letas
 * med en färggräns: kantens blandade bildpunkter räknas inte, och ett spetsigt hörn förlorar mer än ett rakt.
 */
export function insetQuad(points: Pixel[], by: number): Pixel[] {
  const n = points.length;
  const turn = Math.sign(points.reduce((sum, a, k) => sum + (a.x * points[(k + 1) % n]!.y - points[(k + 1) % n]!.x * a.y), 0)) || 1;
  // Varje kant som en linje p + t·d, flyttad inåt längs sin normal.
  const lines = points.map((a, k) => {
    const b = points[(k + 1) % n]!;
    const d = { x: b.x - a.x, y: b.y - a.y };
    const length = Math.hypot(d.x, d.y) || 1;
    const inward = { x: (-d.y / length) * turn, y: (d.x / length) * turn };
    return { p: { x: a.x + inward.x * by, y: a.y + inward.y * by }, d };
  });
  return points.map((_, k) => {
    const before = lines[(k + n - 1) % n]!;
    const after = lines[k]!;
    const cross = before.d.x * after.d.y - before.d.y * after.d.x;
    if (Math.abs(cross) < 1e-9) return after.p;
    const t = ((after.p.x - before.p.x) * after.d.y - (after.p.y - before.p.y) * after.d.x) / cross;
    return { x: before.p.x + before.d.x * t, y: before.p.y + before.d.y * t };
  });
}

/** Om en punkt ligger inom en fyrhörning vuxen `by` bp. */
export function inQuad(points: Pixel[], x: number, y: number, by = 0): boolean {
  const grownQuad = by === 0 ? points : insetQuad(points, -by);
  let sign = 0;
  for (let k = 0; k < grownQuad.length; k++) {
    const a = grownQuad[k]!;
    const b = grownQuad[(k + 1) % grownQuad.length]!;
    const side = Math.sign((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x));
    if (side === 0) continue;
    if (sign === 0) sign = side;
    else if (side !== sign) return false;
  }
  return true;
}

/**
 * Hur stor del av en blå del (eller en del i färgen `test`) som ligger inom fyrhörningen `place`: 1 när kortet ligger på
 * sin plats, mindre i luften.
 */
export function insideShare(picture: Picture, part: Part, place: Pixel[], free: (x: number, y: number) => boolean = () => true, test: (r: number, g: number, b: number) => boolean = isBlue): number {
  let inPlace = 0;
  for (let y = part.box.y0; y < part.box.y1; y++) {
    for (let x = part.box.x0; x < part.box.x1; x++) {
      const i = (y * picture.width + x) * 3;
      if (test(picture.data[i]!, picture.data[i + 1]!, picture.data[i + 2]!) && free(x, y) && inQuad(place, x, y)) inPlace++;
    }
  }
  return round(Math.min(1, inPlace / part.n), 3);
}

/** Största avståndet mellan hörn och de räknade hörnen, i samma ordning. */
export const cornerError = (corners: Pixel[], expected: Pixel[]): number => round(Math.max(...corners.map((corner, k) => distance(corner, expected[k]!))), 1);

/** En mask som växer `by` bp åt alla håll (största värdet i en fyrkant 2·by + 1 bred). */
export function grown(mask: Uint8Array, width: number, height: number, by: number): Uint8Array {
  if (by <= 0) return mask;
  const across = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    let last = -Infinity;
    // Närmaste satta punkt till vänster, sedan till höger.
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) last = x;
      if (x - last <= by) across[y * width + x] = 1;
    }
    last = Infinity;
    for (let x = width - 1; x >= 0; x--) {
      if (mask[y * width + x]) last = x;
      if (last - x <= by) across[y * width + x] = 1;
    }
  }
  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    let last = -Infinity;
    for (let y = 0; y < height; y++) {
      if (across[y * width + x]) last = y;
      if (y - last <= by) out[y * width + x] = 1;
    }
    last = Infinity;
    for (let y = height - 1; y >= 0; y--) {
      if (across[y * width + x]) last = y;
      if (last - y <= by) out[y * width + x] = 1;
    }
  }
  return out;
}

/**
 * Huden som inte är givhanden, ur en bild där givhanden står i REDO: all hud utom delen vid `grip` (den som innehåller
 * punkten, annars den närmaste), vuxen `by` bp. Den vilande handen, halsen och en ljus blus ligger stilla nog för att
 * lämnas utanför givhanden på det sättet i varje ruta. Svaret är en mask över hela bilden, 1 där huden inte räknas.
 */
export function otherSkin(picture: Picture, grip: Pixel, by: number, least: number): Uint8Array {
  const big = parts(picture, { x0: 0, y0: 0, x1: picture.width, y1: picture.height }, isSkin, least);
  const holding = big.find((part) => inside(part.box, grip.x, grip.y)) ?? [...big].sort((a, b) => distance(a.c, grip) - distance(b.c, grip))[0];
  return maskBut(picture, isSkin, holding ?? null, by);
}

/**
 * En mask över hela bilden, 1 där bildpunkten klarar `test`, utom delen `keep` (fylld från en av dess bildpunkter: ett
 * hörn är alltid en av delens egna), vuxen `by` bp.
 */
export function maskBut(picture: Picture, test: (r: number, g: number, b: number) => boolean, keep: Part | null, by: number): Uint8Array {
  const { width, height, data } = picture;
  const mask = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) if (test(data[p * 3]!, data[p * 3 + 1]!, data[p * 3 + 2]!)) mask[p] = 1;
  if (keep) {
    const seed = keep.corners[0]!.y * width + keep.corners[0]!.x;
    const stack = [seed];
    mask[seed] = 0;
    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % width;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q >= 0 && q < width * height && mask[q] === 1) {
          mask[q] = 0;
          stack.push(q);
        }
      }
    }
  }
  return grown(mask, width, height, by);
}

/** Givhanden: den största hudsdelen i `box`, utom den hud masken `other` lämnar utanför. */
export function handIn(picture: Picture, box: Box, other: Uint8Array | null, least: number): { n: number; c: Pixel; w: number; h: number } | null {
  const width = picture.width;
  const found = parts(picture, box, (r, g, b, x, y) => isSkin(r, g, b) && !(other && other[y * width + x]), least)[0];
  return found ? { n: found.n, c: found.c, w: found.w, h: found.h } : null;
}

/**
 * Glipan mellan kavaj och bordskant, kolumn för kolumn i midjans band: där kolumnen är dealer `rows` rader ovanför
 * bordskanten och dealern slutar mot skärm mer än `least` bp ovanför kanten. `edge` ger kantens rad i en kolumn.
 */
export function gapIn(picture: Picture, key: Rgb, band: [number, number], edge: (x: number) => number, rows: number, least: number): { cols: number; most: number } {
  const { width, height } = picture;
  const screen = (x: number, y: number): boolean => {
    const i = (y * width + x) * 3;
    return screenShare(picture.data[i]!, picture.data[i + 1]!, picture.data[i + 2]!, key) >= 0.5;
  };
  let cols = 0;
  let most = 0;
  for (let x = Math.max(0, Math.round(band[0])); x <= Math.min(width - 1, Math.round(band[1])); x++) {
    const row = Math.round(edge(x));
    const start = row - rows;
    if (start < 0 || start >= height || screen(x, start)) continue;
    let y = start;
    while (y < height - 1 && !screen(x, y + 1)) y++;
    if (y < row - least) {
      cols++;
      most = Math.max(most, row - y);
    }
  }
  return { cols, most };
}

/**
 * Skärmen inne i bilden: bildpunkter som är skärm med hela sin omgivning (2·inner + 1 i fyrkant), så att kanterna mot
 * dealern inte räknas. Svaret är andelen, i procent, där någon kanal skiljer mer än `off` från skärmens färg.
 */
export function greenOff(picture: Picture, key: Rgb, inner: number, off: number): number {
  const { width, height, data } = picture;
  // Summor av skärmpunkter i en tabell, så att en fyrkant räknas med fyra uppslag.
  const sums = new Int32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (screenShare(data[i]!, data[i + 1]!, data[i + 2]!, key) >= 0.5) row++;
      sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1]! + row;
    }
  }
  const side = 2 * inner + 1;
  let n = 0;
  let deviating = 0;
  for (let y = inner; y < height - inner; y++) {
    for (let x = inner; x < width - inner; x++) {
      const a = (y - inner) * (width + 1) + (x - inner);
      const b = (y + inner + 1) * (width + 1) + (x + inner + 1);
      const count = sums[b]! - sums[(y + inner + 1) * (width + 1) + (x - inner)]! - sums[(y - inner) * (width + 1) + (x + inner + 1)]! + sums[a]!;
      if (count !== side * side) continue;
      n++;
      const i = (y * width + x) * 3;
      if (Math.max(Math.abs(data[i]! - key[0]), Math.abs(data[i + 1]! - key[1]), Math.abs(data[i + 2]! - key[2])) > off) deviating++;
    }
  }
  return n ? round((100 * deviating) / n, 3) : 0;
}

/**
 * Huvudets vridning: i ögonens rader, de mörka punkterna (ögonbryn och ögon) mot mitten av huvudets kontur, i bp.
 * Positivt när ansiktet är vänt åt höger i bild. Null när huvudet inte syns i raderna.
 */
export function headTurn(picture: Picture, key: Rgb, rows: [number, number], xs: [number, number], inner: number, dark: number): number | null {
  const { width, height, data } = picture;
  let middles = 0;
  let counted = 0;
  let darkN = 0;
  let darkX = 0;
  for (let y = Math.max(0, Math.round(rows[0])); y <= Math.min(height - 1, Math.round(rows[1])); y++) {
    let left = -1;
    let right = -1;
    for (let x = Math.max(0, Math.round(xs[0])); x < Math.min(width, Math.round(xs[1])); x++) {
      const i = (y * width + x) * 3;
      if (screenShare(data[i]!, data[i + 1]!, data[i + 2]!, key) < 0.5) {
        if (left < 0) left = x;
        right = x;
      }
    }
    if (left < 0) continue;
    middles += (left + right) / 2;
    counted++;
    for (let x = Math.round(left + inner); x <= right - inner; x++) {
      const i = (y * width + x) * 3;
      if (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]! < dark) {
        darkN++;
        darkX += x;
      }
    }
  }
  return counted && darkN ? round(darkX / darkN - middles / counted, 1) : null;
}

/**
 * Scenens vita kort i beviset: bildpunkter som är vita med vitt runt om inom två bp (kortplatsernas linjer är tunnare),
 * hörnen som ytterpunkter flyttade två bp ut till kanten (pilotens bevis-mat.mjs). Null när inget vitt kort syns.
 */
export function whiteCorners(picture: Picture, box: Box): Pixel[] | null {
  const { width, data } = picture;
  const white = (x: number, y: number): boolean => {
    const i = (y * width + x) * 3;
    return data[i]! > 215 && data[i + 1]! > 215 && data[i + 2]! > 215;
  };
  const area = clipBox(grow(box, -2), picture);
  const solid = parts(
    picture,
    area,
    (_r, _g, _b, x, y) => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!white(x + dx, y + dy)) return false;
      return true;
    },
    50,
  )[0];
  if (!solid) return null;
  const out = [[-2, -2], [2, -2], [2, 2], [-2, 2]];
  return solid.corners.map((corner, k) => ({ x: corner.x + out[k]![0]!, y: corner.y + out[k]![1]! }));
}

/** Bildpunkter i `box` som klarar `test`. */
export function countIn(picture: Picture, box: Box, test: (r: number, g: number, b: number) => boolean): number {
  const area = clipBox(box, picture);
  let n = 0;
  for (let y = area.y0; y < area.y1; y++) {
    for (let x = area.x0; x < area.x1; x++) {
      const i = (y * picture.width + x) * 3;
      if (test(picture.data[i]!, picture.data[i + 1]!, picture.data[i + 2]!)) n++;
    }
  }
  return n;
}

/**
 * Kort, inte delar: delar vars rutor ligger inom `reach` bp från varandra är ett kort. Ett finger eller en tumme kan dela
 * ett kort i två delar (granskaren av omgång 1: plats 1, ruta 22).
 */
export function cardCount(found: Part[], reach: number): number {
  const group = found.map((_, k) => k);
  const top = (k: number): number => (group[k] === k ? k : (group[k] = top(group[k]!)));
  const gap = (a: Box, b: Box): number => Math.max(0, a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
  for (let a = 0; a < found.length; a++) for (let b = a + 1; b < found.length; b++) if (gap(found[a]!.box, found[b]!.box) <= reach) group[top(a)] = top(b);
  return new Set(found.map((_, k) => top(k))).size;
}

/** Medel av största kanalskillnaden mellan två bilder inom `box`, bara där masken `keep` (över hela bilden) är satt. */
export function meanMaxIn(a: Picture, b: Picture, box: Box, keep: Uint8Array | null): number | null {
  const area = clipBox(box, a);
  let sum = 0;
  let n = 0;
  for (let y = area.y0; y < area.y1; y++) {
    for (let x = area.x0; x < area.x1; x++) {
      if (keep && !keep[y * a.width + x]) continue;
      const i = (y * a.width + x) * 3;
      sum += Math.max(Math.abs(a.data[i]! - b.data[i]!), Math.abs(a.data[i + 1]! - b.data[i + 1]!), Math.abs(a.data[i + 2]! - b.data[i + 2]!));
      n++;
    }
  }
  return n ? round(sum / n) : null;
}

/**
 * Överlappet (IoU) mellan det blå (eller färgen `test`) i två bilder inom `box`: bildpunkter blå i båda mot blå i någon.
 * Null utan blått.
 */
export function blueOverlap(a: Picture, b: Picture, box: Box, test: (r: number, g: number, b: number) => boolean = isBlue): number | null {
  const area = clipBox(box, a);
  let both = 0;
  let either = 0;
  for (let y = area.y0; y < area.y1; y++) {
    for (let x = area.x0; x < area.x1; x++) {
      const i = (y * a.width + x) * 3;
      const inA = test(a.data[i]!, a.data[i + 1]!, a.data[i + 2]!);
      const inB = test(b.data[i]!, b.data[i + 1]!, b.data[i + 2]!);
      if (inA && inB) both++;
      if (inA || inB) either++;
    }
  }
  return either ? round(both / either, 3) : null;
}

/** Handleden i bild och underarmens riktning genom den (armbåge → handled, längd 1). */
export type Wrist = { wrist: Pixel; along: Pixel };
/** Handen bortom handleden: längst ut längs underarmen och bredden tvärs över den, i bp. */
export type Beyond = { reach: number; width: number };

/**
 * Handen bortom handleden `at`: den största huddelen inom `reach` bp från handleden som har en bildpunkt inom `near` bp
 * från den och minst `least` bp, utan den hud masken `other` lämnar utanför. Gult och blått är inte hud. Räckvidden är
 * dess längsta punkt längs underarmen räknat från handleden, bredden dess utsträckning tvärs underarmen bortom handleden.
 * Så räknas inte handleden och underarmen in i handen (granskaren av omgång 1).
 */
export function handBeyond(picture: Picture, other: Uint8Array | null, at: Wrist, reach: number, near: number, least: number): Beyond | null {
  const { width, data } = picture;
  const { wrist, along } = at;
  const area = clipBox({ x0: wrist.x - reach, y0: wrist.y - reach, x1: wrist.x + reach + 1, y1: wrist.y + reach + 1 }, picture);
  const bw = area.x1 - area.x0;
  const bh = area.y1 - area.y0;
  if (bw <= 0 || bh <= 0) return null;
  // Delarna numreras: 0 är inte hud, -1 är hud som inte har fått sin del än.
  const label = new Int32Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const p = (area.y0 + y) * width + area.x0 + x;
      const i = p * 3;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (isSkin(r, g, b) && !isYellow(r, g, b) && !isBlue(r, g, b) && !(other && other[p])) label[y * bw + x] = -1;
    }
  }
  const stack = new Int32Array(bw * bh);
  let best = 0;
  let bestN = 0;
  let next = 0;
  for (let start = 0; start < bw * bh; start++) {
    if (label[start] !== -1) continue;
    const id = ++next;
    let top = 0;
    stack[top++] = start;
    label[start] = id;
    let n = 0;
    let close = false;
    while (top > 0) {
      const p = stack[--top]!;
      const x = p % bw;
      const y = (p - x) / bw;
      n++;
      if (!close && Math.hypot(area.x0 + x - wrist.x, area.y0 + y - wrist.y) <= near) close = true;
      if (x > 0 && label[p - 1] === -1) (label[p - 1] = id), (stack[top++] = p - 1);
      if (x < bw - 1 && label[p + 1] === -1) (label[p + 1] = id), (stack[top++] = p + 1);
      if (y > 0 && label[p - bw] === -1) (label[p - bw] = id), (stack[top++] = p - bw);
      if (y < bh - 1 && label[p + bw] === -1) (label[p + bw] = id), (stack[top++] = p + bw);
    }
    if (close && n >= least && n > bestN) (best = id), (bestN = n);
  }
  if (!best) return null;
  let far = 0;
  let low = Infinity;
  let high = -Infinity;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (label[y * bw + x] !== best) continue;
      const dx = area.x0 + x - wrist.x;
      const dy = area.y0 + y - wrist.y;
      const length = dx * along.x + dy * along.y;
      if (length <= 0) continue;
      const across = -dx * along.y + dy * along.x;
      if (length > far) far = length;
      if (across < low) low = across;
      if (across > high) high = across;
    }
  }
  return far > 0 ? { reach: Math.round(far), width: Math.round(high - low) } : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Filmer

export type Probe = { width: number; height: number; fps: number; frames: number; seconds: number; codec: string; audio: boolean };

/** Filmens bildspår och om den har ljud, ur ffprobe. */
export async function probe(path: string): Promise<Probe> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-count_packets', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_packets:format=duration', '-of', 'json', path]);
  const read = JSON.parse(stdout) as { streams: { codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string; nb_read_packets?: string }[]; format: { duration: string } };
  const video = read.streams.find((stream) => stream.codec_type === 'video');
  if (!video) throw new MeasureError(`${path} har inget bildspår`);
  const [over, under] = (video.r_frame_rate ?? '0/1').split('/').map(Number);
  return {
    width: video.width!,
    height: video.height!,
    fps: round(over! / (under || 1), 3),
    frames: Number(video.nb_read_packets ?? 0),
    seconds: round(Number(read.format.duration), 3),
    codec: video.codec_name,
    audio: read.streams.some((stream) => stream.codec_type === 'audio'),
  };
}

/** Läser en bild som RGB i minnet. */
export async function readPicture(path: string): Promise<Picture> {
  const { data, info } = await sharp(path).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new MeasureError(`${path} har ${info.channels} kanaler`);
  return { data, width: info.width, height: info.height };
}

/** Filmens första ruta som RGB. */
export async function firstFrame(path: string, frame: Frame): Promise<Picture> {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', path, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer', maxBuffer: frame.width * frame.height * 3 + 1024 });
  if (stdout.length !== frame.width * frame.height * 3) throw new MeasureError(`${path}: första rutan är inte ${frame.width} × ${frame.height}`);
  return { data: stdout, width: frame.width, height: frame.height };
}

/**
 * Går igenom filmens rutor i ordning, avkodade av ffmpeg till RGB (samma färger som när ffmpeg gör PNG-rutor). Varje
 * ruta är en egen buffert, så den som vill behålla en ruta kan göra det. Svaret är antalet rutor.
 */
export async function eachFrame(path: string, frame: Frame, visit: (picture: Picture, index: number) => void | Promise<void>): Promise<number> {
  const child = spawn('ffmpeg', ['-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let said = '';
  child.stderr.on('data', (chunk: Buffer) => (said += chunk.toString()));
  const ended = new Promise<number>((done) => child.on('close', (code) => done(code ?? 1)));
  const bytes = frame.width * frame.height * 3;
  let current = Buffer.allocUnsafe(bytes);
  let filled = 0;
  let index = 0;
  for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
    let offset = 0;
    while (offset < chunk.length) {
      const take = Math.min(bytes - filled, chunk.length - offset);
      chunk.copy(current, filled, offset, offset + take);
      filled += take;
      offset += take;
      if (filled === bytes) {
        await visit({ data: current, width: frame.width, height: frame.height }, index++);
        current = Buffer.allocUnsafe(bytes);
        filled = 0;
      }
    }
  }
  if ((await ended) !== 0) throw new MeasureError(`ffmpeg kunde inte läsa ${path}: ${said.trim().split('\n').at(-1) ?? ''}`);
  return index;
}

// ---------------------------------------------------------------------------------------------------------------------
// Var saker ligger i bild

/** Dealerns delar i bild, ur dockan i REDO och scenen sedda genom vyns närbild. */
export type Regions = { head: Box; torso: Box; rest: Box; mouth: Box; shoe: Box };

export type Layout = {
  frame: Frame;
  /**
   * Vad cykeln gör med kortet (dollPose.ts, Action), och sidan som är upp på det lagda kortet: framsidan (blått) eller
   * baksidan (gult, hålkortet). `lying` är sant när ett kort ligger på kortplatsen redan i första rutan (en vändning).
   */
  action: CycleCard['action'];
  side: 'framsida' | 'baksida';
  lying: boolean;
  /** Det lagda kortets hörn i bild, räknade ur dockan och scenen och sedda uppifrån (cornersIn); deras ruta och yta. */
  corners: Pixel[];
  cardBox: Box;
  cardArea: number;
  /** Kortplatsen vuxen placeGrow bp: där ett lagt kort ska ligga. */
  place: Pixel[];
  /** Kortet i skons mynning och givhandens grepp i REDO. */
  mouth: Pixel;
  grip: Pixel;
  /** Där kort och givhanden letas. */
  low: Box;
  handBox: Box;
  regions: Regions;
  /** Dealerns ruta, för takten. */
  dealer: Box;
  /** Midjans band i bp och bordskanten under det, som två punkter på kanten. */
  waist: [number, number];
  edge: [Pixel, Pixel];
  /** Huvudets vridning: ögonens rader, huvudets bredd och hur långt in från konturen. */
  eyeRows: [number, number];
  headXs: [number, number];
  inner: number;
  /** Där blått letas i beviset. */
  near: Box;
  /** Dockans givhand: handleden och underarmens riktning i bild vid tiden t i cykeln (dollPose, sedd genom vyns närbild). */
  arm: (t: number) => Wrist | null;
};

/** Bordskantens rad i en kolumn, mellan två punkter på kanten. */
export function edgeRow(layout: Pick<Layout, 'edge'>, x: number): number {
  const [a, b] = layout.edge;
  return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x || 1);
}

/** Rutorna en tagning mäts i, för en cykel till en kortplats (plats, kort och handling) sedd ur vyns närbild. */
export function layoutFor(parts: CycleParts, view: SeatView, card: CycleCard, measure: Measure): Layout {
  const { scene, doll } = parts;
  const eye = cycleEye(parts, view);
  const frame = eye.frame;
  const at = (point: Vec3): Pixel => {
    const pixel = see(eye, point);
    if (!pixel) throw new MeasureError('En punkt ligger bakom ögat');
    return pixel;
  };
  const move = cycleMove(parts, card);
  const redo = poseAt(scene, doll, move, 0);
  // En väntan lägger inget kort: där mäts kortet i skon som om det vore det lagda (måtten för det lagda kortet säger då
  // att det ligger kvar i mynningen).
  const laid = poseAt(scene, doll, move, move.seconds).laid ?? (card.action === 'wait' ? redo.card : null);
  if (!laid) throw new MeasureError(`Cykeln ${move.id} slutar utan lagt kort`);
  const corners = cornersIn(eye, laid);
  const cardBox = boxAround(corners);
  const g = measure.regionGrow;
  const fit = (box: Box): Box => clipBox(box, frame);

  const head = at(redo.head);
  const depth = Math.hypot(redo.head[0] - eye.position[0], redo.head[1] - eye.position[1], redo.head[2] - eye.position[2]);
  const radius = (eye.focalPx * doll.body.head.radius) / depth;
  const { left, right } = redo.arms;
  const edgeZ = scene.dealerEdge.z;
  const onEdge = (x: number): Pixel => at(tilted(scene, [x, 0, edgeZ]));
  const shoulderRow = Math.min(at(left.shoulder).y, at(right.shoulder).y);

  // Skons bakre halva: från bakänden till mitten, hela bredden, upp till taket längst bak (content/doll.json, shoeEnvelope).
  const yaw = (scene.shoe.yawDeg * Math.PI) / 180;
  const way: Vec3 = [Math.sin(yaw), 0, Math.cos(yaw)];
  const length = scene.shoe.length;
  const shoeBack: Pixel[] = [];
  for (const side of [-1, 1]) {
    for (const along of [-0.5, 0]) {
      for (const lift of [0, doll.shoeEnvelope.backHeight * length]) {
        const across = doll.shoeEnvelope.halfWidth * length * side;
        shoeBack.push(at(tilted(scene, [scene.shoe.at[0] + way[2] * across + way[0] * along * length, lift, scene.shoe.at[1] - way[0] * across + way[2] * along * length])));
      }
    }
  }

  const regions: Regions = {
    head: fit(grow({ x0: head.x - radius, y0: head.y - radius, x1: head.x + radius, y1: head.y + radius }, g)),
    torso: fit(grow(boxAround([at(left.shoulder), at(right.shoulder), at(right.elbow), onEdge(left.shoulder[0]), onEdge(right.shoulder[0])]), g)),
    rest: fit(grow(boxAround(redo.hands.right.map(at)), g)),
    mouth: fit(grow(boxAround([...redo.hands.left.map(at), ...redo.card!.corners.map(at)]), g)),
    shoe: fit(grow(boxAround(shoeBack), Math.round(g / 4))),
  };
  const gripPoint: Vec3 = redo.hands.left[4]!.map((value, k) => (value + redo.hands.left[8]![k]!) / 2) as Vec3;
  const handTop = Math.min(...redo.hands.left.map((point) => at(point).y));
  const waist = measure.waist.map((x) => onEdge(x)) as [Pixel, Pixel];
  const eyeRow = at([redo.head[0], doll.body.eyeHeight, redo.head[2]]).y;
  // Armen som lägger kortet: i en tvåhandsgiv den högra (move.carry, ur cykelns fil).
  const arm = (t: number): Wrist | null => {
    const { elbow, wrist } = poseAt(scene, doll, move, t).arms[move.carry ?? 'left'];
    const w = see(eye, wrist);
    const e = see(eye, elbow);
    if (!w || !e) return null;
    const length = Math.hypot(w.x - e.x, w.y - e.y) || 1;
    return { wrist: w, along: { x: (w.x - e.x) / length, y: (w.y - e.y) / length } };
  };
  return {
    arm,
    frame,
    action: card.action,
    side: laid.up,
    lying: redo.laid !== null,
    corners,
    cardBox,
    cardArea: round(quadArea(corners), 1),
    place: insetQuad(corners, -measure.placeGrow),
    mouth: at(redo.card!.centre),
    grip: at(gripPoint),
    low: fit({ x0: 0, y0: shoulderRow + measure.cardTop, x1: frame.width, y1: frame.height }),
    handBox: fit({ x0: 0, y0: handTop - measure.handTop, x1: frame.width, y1: frame.height }),
    regions,
    dealer: fit(union(regions.head, regions.torso, regions.rest, regions.mouth, grow(cardBox, g))),
    waist: [waist[0].x, waist[1].x],
    edge: waist,
    eyeRows: [eyeRow + measure.eyeRows[0] * radius, eyeRow + measure.eyeRows[1] * radius],
    headXs: [head.x - measure.headReach * radius, head.x + measure.headReach * radius],
    inner: measure.headInner * radius,
    near: fit(grow(cardBox, measure.proofReach)),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// En film ruta för ruta

type Lite = { n: number; c: Pixel };
/** Det som mäts i varje ruta. Rutor som bara mäts ibland saknar sina fält. */
export type FrameRow = {
  i: number;
  t: number;
  /** Kortdelar (≥ cardPart) i rutan, blå och gula. */
  blue: number;
  yellow: number;
  /**
   * Gula delar utom kortet som ligger gult på sin kortplats: hålkortet när det är lagt, och i en vändning innan det har
   * vänts. Annars samma som `yellow`. Saknas i en matning.json från före vändningen.
   */
  loose?: number;
  /** Kort i rutan: delarna, blå och gula, där delar inom mouthReach bp från varandra är ett kort (cardCount). */
  cards?: number;
  /** Hur stor del av mynningens kort i första rutan som är gult i rutan: 1 när det syns som då, mindre när något täcker det. */
  nextShare?: number | null;
  /** Givhanden bortom dockans handled vid samma tid (handBeyond). */
  beyond?: Beyond | null;
  /**
   * Det lagda kortets färg, störst: blått, eller för hålkortet gult utanför skons mynning. Yta, tyngdpunkt och största
   * hörnfel mot de räknade hörnen.
   */
  card: (Lite & { corners: Pixel[]; error: number; inside: number; share: number }) | null;
  /** Den gula delen närmast mynningens kort i första rutan, och hur långt bort den ligger. */
  next: (Lite & { d: number }) | null;
  /** Kortdelar längre än mouthReach från mynningen: kortet på väg. Kortet som ligger gult på sin plats räknas inte (loose). */
  away: { blue: number; yellow: number };
  /** En gul del större än `merged` gånger mynningens kort: dragna och nästa kort ihop. */
  merged: boolean;
  hand: { n: number; c: Pixel; w: number; h: number } | null;
  /** Steget från förra rutan, för takten. */
  step?: number;
  shoe?: number;
  gap?: { cols: number; most: number };
  green?: number;
  head?: number | null;
};

export type Watch = {
  layout: Layout;
  measure: Measure;
  /** Skärmens färg; null för dockans film, som inte har grön skärm. */
  key: Rgb | null;
  /** Bilden som givhandens grepp i REDO och den övriga huden läses ur: första bilden, eller dockans första ruta. */
  start: Picture;
  /** Bildpunkterna i skons ruta som skon mäts i (1), över hela bilden: de dockans arm aldrig täcker. Utan mask hela rutan. */
  shoeFree?: Uint8Array | null;
};

export type FilmRead = {
  rows: FrameRow[];
  first: Picture;
  last: Picture;
  /** Andra och näst sista rutan: stegen intill skarven (seamSteps). */
  second: Picture;
  beforeLast: Picture;
  /** Mynningens kort i första rutan. */
  mouth: Lite | null;
  /** Givhanden i startbilden. */
  startHand: { n: number; c: Pixel; w: number; h: number } | null;
  /** Mynningens ruta (regions.mouth i bilden) och det gula i den i varje ruta, 1 per gul bildpunkt, rad för rad. */
  mouthBox: Box;
  mouthYellow: Uint8Array[];
};

/**
 * Skarven när klippet kedjas, per region: steget från sista rutan till första mot stegen på var sida om skarven (näst
 * sista mot sista och första mot andra), som medel av största kanalskillnad. `beyond` är hur mycket skarvens steg är
 * större än grannstegens medel: 0 när kroppen rör sig genom skarven lika fort som runt den, och lika med skarvens steg
 * när den står still runt skarven men inte är på samma ställe i båda ändar. Ett hopp i skarven syns som ett steg som är
 * större än grannarna, vilket det än är som rör sig.
 */
export function seamSteps(read: Pick<FilmRead, 'first' | 'second' | 'last' | 'beforeLast'>, boxes: Box[], skip?: Box): { seam: number; around: number; beyond: number }[] {
  return boxes.map((box) => {
    const seam = difference(read.last, read.first, box, skip).meanMax;
    const around = (difference(read.beforeLast, read.last, box, skip).meanMax + difference(read.first, read.second, box, skip).meanMax) / 2;
    return { seam, around, beyond: Math.max(0, seam - around) };
  });
}

/** Det lagda kortets färg: blått med framsidan upp, gult med baksidan upp (hålkortet). */
export const laidColour = (layout: Pick<Layout, 'side'>): ((r: number, g: number, b: number) => boolean) => (layout.side === 'baksida' ? isYellow : isBlue);

/**
 * Mäter en film ruta för ruta. `onFrame` får varje ruta också, till exempel för ett ark. För dockans film (key null)
 * mäts bara kort och hand.
 *
 * Det lagda kortet letas i sin färg (laidColour): det största blå, eller för hålkortet den största gula delen utanför
 * skons mynning. Ett gult kort på sin kortplats är inte på väg: hålkortet när det har lagts, och i en vändning hålkortet
 * tills något blått har synts. Ett gult kort där efter det är kortet vänt tillbaka.
 */
export async function readFilm(path: string, fps: number, watch: Watch, onFrame?: (picture: Picture, index: number) => void | Promise<void>): Promise<FilmRead> {
  const { layout, measure, key, start } = watch;
  const other = otherSkin(start, layout.grip, measure.maskGrow, measure.cardPart);
  const startHand = handIn(start, layout.handBox, other, measure.cardPart);
  const rows: FrameRow[] = [];
  let first: Picture | null = null;
  let second: Picture | null = null;
  let previous: Picture | null = null;
  let beforeLast: Picture | null = null;
  let mouth: Lite | null = null;
  // Det som har kortens färger i första rutan utom kortet i mynningen står stilla (skons guldram i dockans film) och
  // räknas inte. Kortplatsen räknas alltid: där ligger hålkortet i en vändning.
  let still: Uint8Array | null = null;
  const width = layout.frame.width;
  const free = (x: number, y: number): boolean => !still || !still[y * width + x];
  const colour = laidColour(layout);
  const onPlace = (part: Part): boolean => inQuad(layout.place, part.c.x, part.c.y);
  let turned = false;
  // Mynningens kort i första rutan som bildpunkter, och mynningens ruta, där det gula sparas för varje ruta.
  const mouthCard: number[] = [];
  const mouthBox = clipBox(layout.regions.mouth, layout.frame);
  const mouthYellow: Uint8Array[] = [];
  const yellowAt = (picture: Picture, p: number): boolean => isYellow(picture.data[p * 3]!, picture.data[p * 3 + 1]!, picture.data[p * 3 + 2]!);
  await eachFrame(path, layout.frame, async (picture, i) => {
    if (i === 0) {
      first = picture;
      const yellow = parts(picture, layout.low, isYellow, measure.cardPart);
      const nearest = [...yellow].sort((a, b) => distance(a.c, layout.mouth) - distance(b.c, layout.mouth))[0];
      const found = nearest && distance(nearest.c, layout.mouth) <= 3 * measure.mouthReach ? nearest : null;
      mouth = found ? { n: found.n, c: found.c } : null;
      still = maskBut(picture, (r, g, b) => isYellow(r, g, b) || isBlue(r, g, b), found, 2);
      const place = clipBox(grow(layout.cardBox, measure.placeGrow + 2), layout.frame);
      for (let y = place.y0; y < place.y1; y++) for (let x = place.x0; x < place.x1; x++) if (inQuad(layout.place, x, y, 2)) still[y * width + x] = 0;
      if (found) for (let y = found.box.y0; y < found.box.y1; y++) for (let x = found.box.x0; x < found.box.x1; x++) if (yellowAt(picture, y * width + x)) mouthCard.push(y * width + x);
    }
    const seen = new Uint8Array((mouthBox.x1 - mouthBox.x0) * (mouthBox.y1 - mouthBox.y0));
    for (let y = mouthBox.y0; y < mouthBox.y1; y++) {
      for (let x = mouthBox.x0; x < mouthBox.x1; x++) if (yellowAt(picture, y * width + x) && free(x, y)) seen[(y - mouthBox.y0) * (mouthBox.x1 - mouthBox.x0) + x - mouthBox.x0] = 1;
    }
    mouthYellow.push(seen);
    const blue = parts(picture, layout.low, (r, g, b, x, y) => isBlue(r, g, b) && free(x, y), measure.cardPart);
    const yellow = parts(picture, layout.low, (r, g, b, x, y) => isYellow(r, g, b) && free(x, y), measure.cardPart);
    const centre = mouth?.c ?? layout.mouth;
    // Den gula delen närmast mynningen är nästa kort, eller det dragna och nästa kort ihop när den är för stor.
    const nearest = [...yellow].sort((a, b) => distance(a.c, centre) - distance(b.c, centre))[0];
    const merged = Boolean(nearest && mouth && nearest.n > measure.merged * mouth.n);
    const next = merged ? undefined : nearest;
    if (blue.length > 0) turned = true;
    // Kortet som ligger gult på sin plats, och de gula delarna utanför mynningen.
    const lyingYellow = (part: Part): boolean => onPlace(part) && (layout.side === 'baksida' || (layout.lying && !turned));
    const outside = yellow.filter((part) => !(merged && part === nearest) && distance(part.c, centre) > measure.mouthReach);
    const big = colour === isBlue ? blue[0] : outside[0];
    const wrist = layout.arm(i / fps);
    const row: FrameRow = {
      i,
      t: round(i / fps, 3),
      blue: blue.length,
      yellow: yellow.length,
      loose: yellow.filter((part) => !lyingYellow(part)).length,
      cards: cardCount([...blue, ...yellow], measure.mouthReach),
      nextShare: mouthCard.length ? round(mouthCard.filter((p) => yellowAt(picture, p)).length / mouthCard.length, 3) : null,
      beyond: wrist ? handBeyond(picture, other, wrist, measure.handReach, measure.wristNear, measure.cardPart) : null,
      card: big ? { n: big.n, c: big.c, corners: big.corners, error: cornerError(big.corners, layout.corners), inside: insideShare(picture, big, layout.place, free, colour), share: round(big.n / layout.cardArea, 3) } : null,
      next: next ? { n: next.n, c: next.c, d: round(distance(next.c, centre), 1) } : null,
      away: {
        blue: blue.filter((part) => distance(part.c, centre) > measure.mouthReach).length,
        yellow: outside.filter((part) => !lyingYellow(part)).length,
      },
      merged,
      hand: handIn(picture, layout.handBox, other, measure.cardPart),
    };
    if (key) {
      row.step = previous ? round(stepBetween(picture, previous, layout.dealer), 3) : 0;
      row.shoe = meanMaxIn(picture, first!, layout.regions.shoe, watch.shoeFree ?? null) ?? 0;
      row.gap = gapIn(picture, key, layout.waist, (x) => edgeRow(layout, x), measure.gapRows, measure.gapLeast);
      if (i % measure.greenEvery === 0) row.green = greenOff(picture, key, measure.greenInner, measure.greenOff);
      row.head = headTurn(picture, key, layout.eyeRows, layout.headXs, layout.inner, measure.dark);
    }
    rows.push(row);
    await onFrame?.(picture, i);
    if (i === 1) second = picture;
    beforeLast = previous;
    previous = picture;
  });
  if (!first || !previous) throw new MeasureError(`${path} har inga rutor`);
  const last: Picture = previous;
  // Sista rutan räknas alltid för det gröna.
  const end = rows.at(-1)!;
  if (key && end.green === undefined) end.green = greenOff(last, key, measure.greenInner, measure.greenOff);
  return { rows, first, last, second: second ?? last, beforeLast: beforeLast ?? first, mouth, startHand, mouthBox, mouthYellow };
}

/**
 * Dockans film mätt som klippet, och var hennes arm går i skons ruta: bildpunkter där någon ruta skiljer mer än armDiff
 * från ruta 0, vuxna armGrow bp. Svaret har dockans mått (dollOf) och masken över bildpunkterna i skons ruta som armen
 * aldrig täcker (1 = räknas), som klippets sko sedan mäts i.
 */
export async function readDollFilm(path: string, fps: number, watch: Watch, onFrame?: (picture: Picture, index: number) => void | Promise<void>): Promise<{ doll: DollRead; shoeFree: Uint8Array; read: FilmRead }> {
  const { layout, measure } = watch;
  const { width, height } = layout.frame;
  const box = clipBox(layout.regions.shoe, layout.frame);
  const covered = new Uint8Array(width * height);
  let zero: Picture | null = null;
  const read = await readFilm(path, fps, watch, async (picture, i) => {
    if (i === 0) zero = picture;
    const a = picture.data;
    const b = zero!.data;
    for (let y = box.y0; y < box.y1; y++) {
      for (let x = box.x0; x < box.x1; x++) {
        const p = y * width + x;
        const k = p * 3;
        if (Math.max(Math.abs(a[k]! - b[k]!), Math.abs(a[k + 1]! - b[k + 1]!), Math.abs(a[k + 2]! - b[k + 2]!)) > measure.armDiff) covered[p] = 1;
      }
    }
    await onFrame?.(picture, i);
  });
  const swept = grown(covered, width, height, measure.armGrow);
  const shoeFree = new Uint8Array(width * height);
  let counted = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      if (swept[y * width + x]) continue;
      shoeFree[y * width + x] = 1;
      counted++;
    }
  }
  const doll = { ...dollOf(read, fps, measure, layout), shoe: { counted, of: (box.x1 - box.x0) * (box.y1 - box.y0) } };
  return { doll, shoeFree, read };
}

// ---------------------------------------------------------------------------------------------------------------------
// Tiderna

export type Times = {
  /** Kortet har lämnat skon: första rutan med en kortdel längre än mouthReach från mynningen (inte två kort ihop). */
  leavesShoe: number | null;
  /** lands.at: första rutan där det blå är platt och stilla till slutet. */
  lands: number | null;
  /** Handen har lämnat kortet: tyngdpunkten har flyttat sig mer än leavesPx från där den var vid lands. */
  leavesCard: number | null;
  /** Handen är åter i REDO: tyngdpunkten inom homePx från sista rutans, och så till slutet. */
  home: number | null;
  /**
   * Kortet helt synligt: första rutan från lands.at där det blå är minst visibleShare av sista rutans, och så till slutet.
   * Saknas i en docka.json från före 2026-11-18.
   */
  visible?: number | null;
};

/** Tiderna i en film, som rutor. */
export function framesOf(rows: FrameRow[], measure: Measure): Times {
  const leavesShoe = rows.find((row) => row.away.blue + row.away.yellow > 0)?.i ?? null;
  const end = rows.at(-1)!;
  // Platt och stilla på sin plats: det blå ligger inom kortplatsen och täcker minst coverShare av den, och så till slutet.
  // Fingrar som vilar på kortet kan täcka ett hörn; då är det blå mindre men fortfarande inom platsen.
  let lands: number | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const card = rows[i]!.card;
    if (!card || card.inside < measure.insideShare || card.share < measure.coverShare) break;
    lands = i;
  }
  let leavesCard: number | null = null;
  const onCard = lands !== null ? rows[lands]!.hand : null;
  if (lands !== null && onCard) leavesCard = rows.find((row) => row.i > lands && row.hand && distance(row.hand.c, onCard.c) > measure.leavesPx)?.i ?? null;
  let home: number | null = null;
  const lastHand = end.hand;
  if (lastHand) {
    for (let i = rows.length - 1; i >= 0; i--) {
      const hand = rows[i]!.hand;
      if (!hand || distance(hand.c, lastHand.c) > measure.homePx) break;
      home = i;
    }
  }
  // Fingrar som vilar på kortet täcker en del av det, och det blås tyngdpunkt flyttar sig med dem (granskaren av omgång 1).
  let visible: number | null = null;
  const whole = end.card?.n;
  if (lands !== null && whole) {
    for (let i = rows.length - 1; i >= lands; i--) {
      const card = rows[i]!.card;
      if (!card || card.n < measure.visibleShare * whole) break;
      visible = i;
    }
  }
  return { leavesShoe, lands, leavesCard, home, visible };
}

/** Rutor till sekunder. */
export const secondsOf = (times: Times, fps: number): Times =>
  Object.fromEntries(Object.entries(times).map(([key, frame]) => [key, frame === null ? null : round(frame / fps, 3)])) as Times;

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

export type Values = Record<string, number | string | boolean | null>;

/**
 * Dockans film, mätt på samma sätt: tiderna, givhandens bredd i varje ruta, och (sedan granskningen av omgång 1) hur
 * mycket av hennes nästa kort som syns och hennes hand bortom handleden i varje ruta, hennes egna kort- och skomått
 * (`own`), och hur många bildpunkter i skons ruta som hennes arm aldrig täcker (`shoe`). Skrivs i paketet som docka.json.
 * Fälten efter `hands` saknas i en docka.json från före 2026-11-18.
 */
export type DollRead = {
  fps: number;
  frames: number;
  times: Times;
  seconds: Times;
  hands: { t: number; w: number | null }[];
  next?: (number | null)[];
  beyond?: (Beyond | null)[];
  own?: Values;
  shoe?: { counted: number; of: number };
};

export function dollOf(read: FilmRead, fps: number, measure: Measure, layout?: Pick<Layout, 'action' | 'corners'>): DollRead {
  const times = framesOf(read.rows, measure);
  return {
    fps,
    frames: read.rows.length,
    times,
    seconds: secondsOf(times, fps),
    hands: read.rows.map((row) => ({ t: row.t, w: row.hand?.w ?? null })),
    next: read.rows.map((row) => row.nextShare ?? null),
    beyond: read.rows.map((row) => row.beyond ?? null),
    own: {
      ...cardValues(read.rows, times, measure, layout?.action),
      ...(layout ? turnValues(read.rows, layout) : {}),
      // Hur långt före slutet dockans hand är åter i REDO, som handenISkon i klippet.
      handenISkon: times.home === null ? null : round((read.rows.length - 1 - times.home) / fps, 3),
    },
  };
}

/**
 * I en vändning: hur långt från kortplatsens mitt kortet är när det först syns blått, i bp (vandningenVidPlatsen). Kortet
 * ska vändas där det ligger, inte bäras bort och vändas. Andra handlingar har inget sådant mått.
 */
function turnValues(rows: FrameRow[], layout: Pick<Layout, 'action' | 'corners'>): Values {
  if (layout.action !== 'flip') return {};
  const middle = { x: layout.corners.reduce((sum, p) => sum + p.x, 0) / layout.corners.length, y: layout.corners.reduce((sum, p) => sum + p.y, 0) / layout.corners.length };
  const first = rows.find((row) => row.blue > 0 && row.card);
  return { vandningenVidPlatsen: first ? round(distance(first.card!.c, middle), 1) : null };
}

const most = (values: (number | null | undefined)[]): number | null => {
  const known = values.filter((value): value is number => typeof value === 'number');
  return known.length ? Math.max(...known) : null;
};

/**
 * Kortens mått som dockans film också har: flest kort i en ruta, gula former, vändningar tillbaka, rutor utan nästa kort.
 * Måtten följer handlingen (`action`): ett kort som läggs eller vänds med framsidan upp blir blått en gång och aldrig gult
 * igen (vandningTillbaka); hålkortet förblir gult (halkortetBlatt: rutor med något blått). I en vändning mäts också var
 * kortet vänds (vandningenVidPlatsen, i valuesOf).
 */
function cardValues(rows: FrameRow[], times: Times, measure: Measure, action: CycleCard['action'] = 'deal'): Values {
  const firstBlue = rows.find((row) => row.blue > 0)?.i ?? null;
  return {
    kortdelar: most(rows.map((row) => row.cards ?? row.blue + row.yellow)),
    gulForm: rows.filter((row) => row.merged).length,
    gulFormEfterDraget: rows.filter((row) => row.merged && times.leavesShoe !== null && row.i > times.leavesShoe).length,
    ...(action === 'hole'
      ? { halkortetBlatt: rows.filter((row) => row.blue > 0).length }
      : { vandningTillbaka: firstBlue === null ? 0 : rows.filter((row) => row.i > firstBlue && row.away.yellow > 0).length }),
    nastaKortSaknas: rows.filter((row) => !row.merged && (!row.next || row.next.d > measure.mouthReach)).length,
  };
}

/**
 * Om dockans nästa kort syns runt filmens tid `t`: till minst nextShare av sin yta i dockans ruta 0 i var och en av
 * dockans rutor inom ±nextAround av filmens rutor (`fps`). Utan dockans värden (en docka.json från före 2026-11-18)
 * prövas varje ruta.
 */
export function dollShowsNext(doll: Pick<DollRead, 'fps' | 'next'>, t: number, fps: number, measure: Pick<Measure, 'nextAround' | 'nextShare'>): boolean {
  const next = doll.next;
  if (!next || next.length === 0) return true;
  const reach = measure.nextAround / fps;
  const at = (time: number): number => Math.min(next.length - 1, Math.max(0, Math.round(time * doll.fps)));
  for (let j = at(t - reach); j <= at(t + reach); j++) {
    const share = next[j];
    if (share === null || share === undefined || share < measure.nextShare) return false;
  }
  return true;
}

/**
 * Tillkommet gult vid nästa kort: gula bildpunkter i mynningens ruta utanför nästa korts gula, vuxet nextGrow bp, i den
 * ruta där det syns mest. Prövas från första rutan där det dragna kortet är blått och bara en gul del finns kvar, i rutor
 * utan gult på väg och där `tested` säger ja. En hand som täcker kortet tar bort gult men lägger aldrig till; ett kort
 * som flyttar sig eller lyfts lägger till. Svaret är det mesta i en ruta, i bp, och rutan som jämfördes med.
 */
export function nextAdded(read: Pick<FilmRead, 'rows' | 'mouthBox' | 'mouthYellow'>, tested: (row: FrameRow) => boolean, measure: Pick<Measure, 'nextGrow'>): { most: number; from: number } | null {
  const { rows, mouthBox, mouthYellow } = read;
  // Från att det lagda kortet syns i sin färg och bara nästa kort är gult utöver det (hålkortet på sin plats räknas inte).
  // En rad utan `loose` (en matning.json från före vändningen) är en giv: där är det lagda kortet blått.
  const start = rows.find((row) => (row.loose === undefined ? row.blue > 0 && row.yellow <= 1 : row.card !== null && row.loose <= 1))?.i;
  if (start === undefined) return null;
  const candidates = rows.filter((row) => row.i >= start && row.away.yellow === 0 && mouthYellow[row.i] && tested(row));
  if (candidates.length === 0) return null;
  const count = (mask: Uint8Array): number => mask.reduce((sum, value) => sum + value, 0);
  const counts = new Map(candidates.map((row) => [row.i, count(mouthYellow[row.i]!)]));
  const reference = candidates.reduce((best, row) => (counts.get(row.i)! > counts.get(best.i)! ? row : best));
  const allowed = grown(mouthYellow[reference.i]!, mouthBox.x1 - mouthBox.x0, mouthBox.y1 - mouthBox.y0, measure.nextGrow);
  let most = 0;
  for (const row of candidates) {
    const seen = mouthYellow[row.i]!;
    let extra = 0;
    for (let p = 0; p < seen.length; p++) if (seen[p] && !allowed[p]) extra++;
    if (extra > most) most = extra;
  }
  return { most, from: reference.i };
}

/** Måtten för det lagda kortet och handen på det, som en väntan inte har (valuesOf). */
const NOT_IN_WAIT = ['kortetsRorelse', 'kortetsMitt', 'kortetsYta', 'nastaKortFlyttar', 'handMotDockan', 'handBreddMotDockan', 'kortetLigger'];

/**
 * Måtten för en tagning, med samma namn som gränserna i content/tagning.json (limits), och några till som bara visas.
 * `images` är första och sista bilden i beställningen; `doll` dockans film mätt på samma sätt.
 */
export function valuesOf(read: FilmRead, film: Probe, sound: boolean, layout: Layout, measure: Measure, images: { first: Picture; last: Picture }, doll: DollRead): { values: Values; times: Times; seconds: Times } {
  const { rows, first, last } = read;
  const fps = film.fps;
  const times = framesOf(rows, measure);
  const seconds = secondsOf(times, fps);
  const end = rows.at(-1)!;
  const lastT = end.t;
  const after = (from: number | null | undefined) => (from === null || from === undefined ? [] : rows.filter((row) => row.i >= from));

  // Korten. Det lagda kortet mäts från att det är helt synligt; sista rutans kort mot märkkortet i sista bilden, som är
  // målat där dockan lägger kortet: filmen ska sluta som det. Överlappet i stället för hörnen, för att kortet vid plats 1
  // och 7 är en sned parallellogram med spetsiga hörn, där en mjuk kant på 2–3 bp flyttar ett hörn dubbelt så långt.
  // Måtten följer handlingen: kortet söks i sin färg (laidColour), för hålkortet gult kring sin kortplats så att nästa kort
  // i skon inte räknas.
  const own = { ...cardValues(rows, times, measure, layout.action), ...turnValues(rows, layout) };
  const colour = laidColour(layout);
  const cardRegion = colour === isBlue ? layout.low : clipBox(grow(layout.cardBox, measure.regionGrow), layout.frame);
  const lastCard = end.card;
  const settled = after(times.visible).filter((row) => row.card);
  const painted = parts(images.last, cardRegion, colour, measure.cardPart)[0] ?? null;
  const area = median(settled.map((row) => row.card!.n));
  // Nästa kort prövas bara där dockans nästa kort syns: en arm framför mynningen döljer det hos henne som hos dockan.
  const tested = (row: FrameRow): boolean => dollShowsNext(doll, row.t, fps, measure);
  const added = nextAdded(read, tested, measure);

  // Händerna. Givhanden bortom dockans handled, längs och tvärs underarmen, mot dockans största inom handWindow s.
  const ratio = (a: number | undefined, b: number | undefined): number | null => (a && b ? round(a / b, 3) : null);
  const redo = [ratio(rows[0]!.hand?.w, read.startHand?.w), ratio(end.hand?.w, read.startHand?.w)];
  const handIRedo = redo.every((value) => value !== null) ? redo.reduce((worst, value) => (Math.abs(value! - 1) > Math.abs(worst! - 1) ? value : worst))! : null;
  // På kortet och på återvägen: från lands.at till handEnd s före dockans home; i REDO visar ankaret handryggen, dockan inte.
  const beyond = doll.beyond ?? [];
  const span = rows.filter((row) => row.t >= (seconds.lands ?? doll.seconds.lands ?? Infinity) && row.t < (doll.seconds.home ?? lastT) - measure.handEnd);
  const againstDoll = (key: keyof Beyond): number | null => {
    const ratios = span.map((row) => {
      const best = most(beyond.map((entry, j) => (entry && Math.abs(j / doll.fps - row.t) <= measure.handWindow + 1e-9 ? entry[key] : null)));
      const value = row.beyond?.[key];
      return value && best ? value / best : null;
    });
    const worst = most(ratios);
    return worst === null ? null : round(worst, 3);
  };
  const onCard = rows.filter((row) => times.lands !== null && times.leavesCard !== null && row.i >= times.lands && row.i < times.leavesCard);
  const dollOnCard = doll.hands.filter((hand) => doll.seconds.lands !== null && doll.seconds.leavesCard !== null && hand.t >= doll.seconds.lands && hand.t < doll.seconds.leavesCard && hand.w !== null).map((hand) => hand.w!);
  const filmOnCard = median(onCard.filter((row) => row.hand).map((row) => row.hand!.w));
  const dollOnCardWidth = median(dollOnCard);

  // Skarven: sista rutan mot första, per region (seamSteps), utom kortets ruta som i skarvMedel. Vid dealerns plats
  // ligger kortplatsen inne i regionerna (rest, torso), och kortet som klippet lägger där är ingen skarv.
  const outsideCard = grow(layout.cardBox, 10);
  const seams = Object.values(layout.regions).map((box) => difference(last, first, box, outsideCard));
  const steps = seamSteps(read, Object.values(layout.regions), outsideCard);
  const handA = rows[0]!.hand;
  const handB = end.hand;
  const heads = rows.map((row) => row.head).filter((value): value is number => typeof value === 'number');
  const delta = (film: number | null, dollTime: number | null): number | null => (film === null || dollTime === null ? null : round(film - dollTime, 3));

  const values: Values = {
    format: `${film.width}×${film.height} ${Number.isInteger(film.fps) ? film.fps : film.fps}/s ${rows.length}`,
    ljud: sound,
    takt: cadence(rows.map((row) => row.step ?? 0).slice(1), measure.cadencePeriod, measure.cadenceStill).most,
    ...own,
    kortetsRorelse: lastCard && settled.length ? round(Math.max(...settled.map((row) => distance(row.card!.c, lastCard.c))), 1) : null,
    kortetsOverlapp: blueOverlap(last, images.last, cardRegion, colour),
    kortetsMitt: lastCard && painted ? round(distance(lastCard.c, painted.c), 1) : null,
    kortetsYta: area === null ? null : round(area / layout.cardArea, 3),
    nastaKortSaknas: rows.filter((row) => tested(row) && !row.merged && (!row.next || row.next.d > measure.mouthReach)).length,
    nastaKortFlyttar: added?.most ?? null,
    handIRedo,
    handMotDockan: againstDoll('reach'),
    handBreddMotDockan: againstDoll('width'),
    skarvRegion: round(Math.max(...steps.map((step) => step.beyond)), 2),
    skarvLjus: Math.max(...seams.flatMap((seam) => seam.signed.map(Math.abs))),
    skarvHand: handA && handB ? round(distance(handA.c, handB.c), 1) : null,
    forstaRutan: difference(first, images.first).psnr,
    sistaRutan: difference(last, images.last).psnr,
    gront: most(rows.map((row) => row.green)),
    skon: most(rows.map((row) => row.shoe)),
    glipaRutor: rows.filter((row) => (row.gap?.cols ?? 0) > 0).length,
    glipaHojd: most(rows.map((row) => row.gap?.most ?? 0)),
    kortetLigger: delta(seconds.lands, doll.seconds.lands),
    handenISkon: seconds.home === null ? null : round(lastT - seconds.home, 3),
    // Bara för att visas.
    landsAt: seconds.lands,
    kortetLamnarSkon: delta(seconds.leavesShoe, doll.seconds.leavesShoe),
    kortetHeltSynligt: delta(seconds.visible ?? null, doll.seconds.leavesCard),
    nastaKortJamfort: added === null ? null : round(added.from / fps, 3),
    handenISkonMotDockan: delta(seconds.home, doll.seconds.home),
    handPaKortet: filmOnCard !== null && dollOnCardWidth !== null ? round(filmOnCard / dollOnCardWidth, 3) : null,
    huvudet: heads.length ? round(Math.max(...heads) - Math.min(...heads), 1) : null,
    skarvMedel: round(difference(last, first, undefined, outsideCard).mean, 2),
  };
  // En väntan lägger inget kort och handen går inte ut: måtten för det lagda kortet och handen på det går då inte att ta,
  // och utelämnas som rörelsens mått som inte gäller (judge prövar bara det som finns), i stället för att stå som saknade.
  if (layout.action === 'wait') for (const key of NOT_IN_WAIT) if (values[key] === null) delete values[key];
  return { values, times, seconds };
}

// ---------------------------------------------------------------------------------------------------------------------
// Gränserna

/** En gräns så som den står i content/tagning.json: minst, högst, exakt, och en övre gräns där klippet ska ses i full fart. */
export type Limit = { what: string; unit?: string; least?: number; most?: number; see?: number; is?: string | number | boolean; doll?: number; source: string };
export type Verdict = 'inom' | 'se efter' | 'utanför' | 'saknas';
export type Judged = { key: string; what: string; value: number | string | boolean | null; unit: string; limit: string; verdict: Verdict; source: string };

const shown = (value: number): string => String(value).replace('.', ',');

/** Gränsen i ord: "≥ 33", "≤ 1,6 (se efter över 1,25)", "−0,25 … 0,25", "= 1920×1080 24/s 97". */
export function limitText(limit: Limit): string {
  if (limit.is !== undefined) return `= ${String(limit.is)}`;
  const parts: string[] = [];
  if (limit.least !== undefined && limit.most !== undefined) parts.push(`${shown(limit.least)} … ${shown(limit.most)}`);
  else if (limit.least !== undefined) parts.push(`≥ ${shown(limit.least)}`);
  else if (limit.most !== undefined) parts.push(`≤ ${shown(limit.most)}`);
  if (limit.see !== undefined) parts.push(`(se efter över ${shown(limit.see)})`);
  return parts.join(' ');
}

/**
 * Gränsen för en plats: en gräns med `doll` flyttas till dockans eget värde för samma mått plus `doll`, när det ger mer
 * utrymme: en övre gräns (most) höjs, en undre (least) sänks (då är `doll` negativ). Det dockan själv gör vid platsen
 * (till exempel kortet som dras ut rakt framför mynningen vid plats 7, eller handen som är hemma i skon 0,17 s före
 * slutet i en cykel på 3 s) är inget fel.
 */
export function limitFor(limit: Limit, dollValue?: number | string | boolean | null): Limit {
  if (limit.doll === undefined || typeof dollValue !== 'number') return limit;
  return {
    ...limit,
    ...(limit.most !== undefined ? { most: Math.max(limit.most, dollValue + limit.doll) } : {}),
    ...(limit.least !== undefined ? { least: Math.min(limit.least, dollValue + limit.doll) } : {}),
  };
}

/** Ett mått mot sin gräns. Ett mått som inte gick att ta är `saknas`. `dollValue` är dockans eget värde (limitFor). */
export function judgeOne(key: string, value: number | string | boolean | null | undefined, given: Limit, dollValue?: number | string | boolean | null): Judged {
  const limit = limitFor(given, dollValue);
  const raised = limit.most !== given.most || limit.least !== given.least ? ` (dockan ${shown(dollValue as number)} ${given.doll! < 0 ? '−' : '+'} ${shown(Math.abs(given.doll!))})` : '';
  const base = { key, what: limit.what, value: value ?? null, unit: limit.unit ?? '', limit: `${limitText(limit)}${raised}`, source: limit.source };
  if (value === null || value === undefined) return { ...base, verdict: 'saknas' };
  if (limit.is !== undefined) return { ...base, verdict: value === limit.is ? 'inom' : 'utanför' };
  if (typeof value !== 'number') return { ...base, verdict: 'utanför' };
  if ((limit.least !== undefined && value < limit.least) || (limit.most !== undefined && value > limit.most)) return { ...base, verdict: 'utanför' };
  if (limit.see !== undefined && value > limit.see) return { ...base, verdict: 'se efter' };
  return { ...base, verdict: 'inom' };
}

/** Alla mått som har en gräns, i gränsernas ordning. `doll` är dockans egna värden för samma plats (DollRead, own). */
export function judge(values: Values, limits: Record<string, Limit>, doll: Values = {}): Judged[] {
  return Object.entries(limits)
    .filter(([key]) => key in values)
    .map(([key, limit]) => judgeOne(key, values[key], limit, doll[key]));
}
