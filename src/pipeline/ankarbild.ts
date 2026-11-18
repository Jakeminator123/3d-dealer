// De lokala stegen för ett REDO-ankare och måtten på det: bildmodellens bild görs till ett ankare på en enda grön skärm,
// med händerna i dockans storlek och märkkortet där dockans kort står. Allt verkar på en Picture (matning.ts) av vilken
// storlek som helst och tar sina tal som argument: talen står i content/ankare.json (local), och punkterna i bild
// (dockans händer, grepp, kort, bordskant) räknar src/pipeline/ankare.ts ur dockan och scenen genom underlagets öga.
//
// Lyft ur skripten som gjorde ankarna för hand: output/work/giv-4/ (krymp-hand.ts, platta-gront.ts, klistra-huvud.ts,
// passa-ankare.ts) och output/work/ankare-2/ (krymp-hand-2.ts, mala-skokort-2.ts, fyll-midja.ts, rent.ts, mat-2.ts,
// bordskant.ts). Inga tal här gäller en viss bild.

import sharp from 'sharp';
import type { Pixel } from '../scene/geometry.ts';
import { screenShare } from '../scene/key.ts';
import { clipBox, grow as growBox, isYellow, type Box, type Picture, type Rgb } from './matning.ts';

// ---------------------------------------------------------------------------------------------------------------------
// Bilder

/** En bild läst i rutan `width` × `height`, utdragen till den (lanczos3), som bildmodellens bilder skalades för hand. */
export async function readFitted(path: string, width: number, height: number): Promise<Picture & { own: { width: number; height: number } }> {
  const meta = await sharp(path).metadata();
  const data = await sharp(path).resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().toColourspace('srgb').raw().toBuffer();
  return { data, width, height, own: { width: meta.width ?? 0, height: meta.height ?? 0 } };
}

export const copyOf = (picture: Picture): Picture => ({ data: Buffer.from(picture.data), width: picture.width, height: picture.height });

export async function savePicture(picture: Picture, path: string): Promise<void> {
  await sharp(picture.data, { raw: { width: picture.width, height: picture.height, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path);
}

// ---------------------------------------------------------------------------------------------------------------------
// Färger, som skripten hade dem

const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** Skärm eller bord: tydligt grönt. */
export const isGreen = (r: number, g: number, b: number): boolean => g > 90 && g - r > 40 && g - b > 40;
/** Ett kort: gult eller blått. */
export const isCard = (r: number, g: number, b: number): boolean => (r > 185 && g > 150 && b < 120 && r - b > 100) || (b > 165 && b - r > 60);
/** Hud, som i src/pipeline/cykel.ts (isSkin), utan det gröna och utan kortet. Dockans hudfärgade händer är också hud. */
export const isSkin = (r: number, g: number, b: number): boolean => r > 105 && r > g + 8 && g >= b - 6 && r - b > 22 && !isGreen(r, g, b) && !isCard(r, g, b);
/** Gulaktigt: kortet och dess kant mot skon. */
export const isYellowish = (r: number, g: number, b: number): boolean => r > 120 && g > 100 && r - b > 70 && g - b > 50;
/** Skons och ärmens mörka. */
export const isDark = (r: number, g: number, b: number): boolean => r < 75 && g < 80 && b < 75;
/** Dockans hudfärgade fingrar i underlaget: ljus hud, inte skons mässingsram. */
export const isDollSkin = (r: number, g: number, b: number): boolean => r > 200 && g > 150 && b > 120 && r > g + 8 && r - b > 22;

const rgbAt = (picture: Picture, p: number): [number, number, number] => [picture.data[p * 3]!, picture.data[p * 3 + 1]!, picture.data[p * 3 + 2]!];
const median = (values: number[]): number => values.sort((a, b) => a - b)[values.length >> 1]!;

// ---------------------------------------------------------------------------------------------------------------------
// Masker inom en ruta

type Mask = Uint8Array;

/** Det sammanhängande (fyra grannar) kring `from` som klarar `test`, inom rutan. */
export function flood(width: number, height: number, box: Box, test: (p: number) => boolean, from: number[]): Mask {
  const mask = new Uint8Array(width * height);
  const inBox = (x: number, y: number) => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
  const stack = from.filter((p) => inBox(p % width, Math.floor(p / width)) && test(p));
  for (const p of stack) mask[p] = 1;
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % width;
    const y = (p - x) / width;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      const q = ny * width + nx;
      if (inBox(nx, ny) && !mask[q] && test(q)) {
        mask[q] = 1;
        stack.push(q);
      }
    }
  }
  return mask;
}

/** Masken vuxen `reach` bildpunkter (fyra grannar), inom rutan. */
export function growMask(mask: Mask, width: number, box: Box, reach: number): Mask {
  let now = mask;
  for (let step = 0; step < reach; step++) {
    const next = new Uint8Array(now);
    for (let y = box.y0 + 1; y < box.y1 - 1; y++) {
      for (let x = box.x0 + 1; x < box.x1 - 1; x++) {
        const p = y * width + x;
        if (!now[p] && (now[p - 1] || now[p + 1] || now[p - width] || now[p + width])) next[p] = 1;
      }
    }
    now = next;
  }
  return now;
}

/** Masken krympt `reach` bildpunkter: bara det som har hela sin fyrgrannskap i masken står kvar, steg för steg. */
export function shrinkMask(mask: Mask, width: number, box: Box, reach: number): Mask {
  let now = mask;
  for (let step = 0; step < reach; step++) {
    const next = new Uint8Array(now);
    for (let y = box.y0 + 1; y < box.y1 - 1; y++) {
      for (let x = box.x0 + 1; x < box.x1 - 1; x++) {
        const p = y * width + x;
        if (now[p] && !(now[p - 1] && now[p + 1] && now[p - width] && now[p + width])) next[p] = 0;
      }
    }
    now = next;
  }
  return now;
}

const count = (mask: Mask): number => mask.reduce((sum, value) => sum + (value ? 1 : 0), 0);

// ---------------------------------------------------------------------------------------------------------------------
// Skärmen

export type FlattenOptions = { share: number; least: number; shadow: number; shadowLeast: number };

/**
 * Gör skärmen till ett enda grönt (`key`): varje bildpunkt vars grönhet (grönt över rött och blått) är minst `share` av
 * skärmens egen och vars grönt är över `least`, och, för skuggorna bildmodellen lägger på bordet, varje bildpunkt som är
 * minst `shadow` grönare än röd och blå med grönt från `shadowLeast`. Skärmens egen färg är medianen i `sample`.
 * Dealerns färger (hud, svart, grått, kort) är aldrig gröna på det sättet. Ur output/work/giv-4/platta-gront.ts.
 */
export function flattenScreen(picture: Picture, key: Rgb, sample: Box, options: FlattenOptions): { screen: Rgb; flattened: number } {
  const area = clipBox(sample, picture);
  const values: number[][] = [[], [], []];
  for (let y = area.y0; y < area.y1; y += 3) for (let x = area.x0; x < area.x1; x += 3) for (let c = 0; c < 3; c++) values[c]!.push(picture.data[(y * picture.width + x) * 3 + c]!);
  const screen = values.map(median) as unknown as Rgb;
  const excess = Math.max(1, screen[1] - Math.max(screen[0], screen[2]));
  let flattened = 0;
  const { data } = picture;
  for (let p = 0; p < picture.width * picture.height; p++) {
    const r = data[p * 3]!;
    const g = data[p * 3 + 1]!;
    const b = data[p * 3 + 2]!;
    const over = g - Math.max(r, b);
    if ((over / excess >= options.share && g > options.least) || (over >= options.shadow && g >= options.shadowLeast)) {
      data[p * 3] = key[0];
      data[p * 3 + 1] = key[1];
      data[p * 3 + 2] = key[2];
      flattened++;
    }
  }
  return { screen, flattened };
}

// ---------------------------------------------------------------------------------------------------------------------
// Händerna

export type HandOptions = { reach: number; seek: number; close: number; dark: number };
export type Hand = { mask: Mask; box: Box; area: number; bounds: Box; start: Pixel };

/**
 * Var handen kring `at` börjar: den största sammanhängande huden (inom `reach` från punkten) som har en bildpunkt inom
 * `seek` från den, och dess punkt närmast `at`. Så tas inte en lös hudfärgad kant på kortet för handen. Null utan hud.
 */
export function skinStart(picture: Picture, at: Pixel, seek: number, reach: number, skin = isSkin): Pixel | null {
  const { width, height } = picture;
  const box = clipBox({ x0: at.x - reach, y0: at.y - reach, x1: at.x + reach, y1: at.y + reach }, picture);
  const near = clipBox({ x0: at.x - seek, y0: at.y - seek, x1: at.x + seek + 1, y1: at.y + seek + 1 }, picture);
  const taken = new Uint8Array(width * height);
  let best: { n: number; start: Pixel } | null = null;
  for (let y = near.y0; y < near.y1; y++) {
    for (let x = near.x0; x < near.x1; x++) {
      const p = y * width + x;
      if (taken[p] || Math.hypot(x - at.x, y - at.y) > seek || !skin(...rgbAt(picture, p))) continue;
      const part = flood(width, height, box, (q) => skin(...rgbAt(picture, q)), [p]);
      let n = 0;
      let start: Pixel = { x, y };
      let least = Infinity;
      for (let yy = box.y0; yy < box.y1; yy++) {
        for (let xx = box.x0; xx < box.x1; xx++) {
          const q = yy * width + xx;
          if (!part[q]) continue;
          taken[q] = 1;
          n++;
          const d = Math.hypot(xx - at.x, yy - at.y);
          if (d < least) (least = d), (start = { x: xx, y: yy });
        }
      }
      if (!best || n > best.n) best = { n, start };
    }
  }
  return best?.start ?? null;
}

/**
 * En hand i bilden kring `at`: huden närmast punkten (inom `seek`), sluten med `close` bildpunkter så att tatueringarnas
 * linjer och fingrarnas fogar kommer med, utan kortets gula och blå, utan det mörka i ärmen och skon (ljushet under
 * `dark`) och utan skärmen, och med det den sluter in. Inom `reach` bildpunkter från punkten. Null när där ingen hud
 * finns. Ur output/work/ankare-2/krymp-hand-2.ts (strikt).
 */
export function handAt(picture: Picture, at: Pixel, options: HandOptions, skin = isSkin): Hand | null {
  const { width, height } = picture;
  const start = skinStart(picture, at, options.seek, options.reach, skin);
  if (!start) return null;
  const box = clipBox({ x0: start.x - options.reach, y0: start.y - options.reach, x1: start.x + options.reach, y1: start.y + options.reach }, picture);
  const seed = start.y * width + start.x;
  const skinMask = flood(width, height, box, (p) => skin(...rgbAt(picture, p)), [seed]);
  const near = shrinkMask(growMask(skinMask, width, box, options.close), width, box, options.close);
  const open = flood(width, height, box, (p) => {
    const [r, g, b] = rgbAt(picture, p);
    return near[p] === 1 && !isGreen(r, g, b) && !isCard(r, g, b) && lum(r, g, b) >= options.dark;
  }, [seed]);
  const border: number[] = [];
  for (let x = box.x0; x < box.x1; x++) border.push(box.y0 * width + x, (box.y1 - 1) * width + x);
  for (let y = box.y0; y < box.y1; y++) border.push(y * width + box.x0, y * width + box.x1 - 1);
  const outside = flood(width, height, box, (p) => !open[p], border);
  const mask = new Uint8Array(picture.width * picture.height);
  let area = 0;
  const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      if (outside[y * width + x]) continue;
      mask[y * width + x] = 1;
      area++;
      bounds.x0 = Math.min(bounds.x0, x);
      bounds.y0 = Math.min(bounds.y0, y);
      bounds.x1 = Math.max(bounds.x1, x + 1);
      bounds.y1 = Math.max(bounds.y1, y + 1);
    }
  }
  return area > 0 ? { mask, box, area, bounds, start } : null;
}

/** Medelpunkten av det strax utanför handen (inom 4 bp) som klarar `test`: där fingrarna rör kortet, eller ärmen. */
export function rimPoint(picture: Picture, hand: Hand, test: (r: number, g: number, b: number) => boolean): Pixel | null {
  const rim = growMask(hand.mask, picture.width, hand.box, 4);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = hand.box.y0; y < hand.box.y1; y++) {
    for (let x = hand.box.x0; x < hand.box.x1; x++) {
      const p = y * picture.width + x;
      if (!rim[p] || hand.mask[p] || !test(...rgbAt(picture, p))) continue;
      sx += x;
      sy += y;
      n++;
    }
  }
  return n ? { x: sx / n, y: sy / n } : null;
}

/** Handens storlek bortom handleden: bildpunkter där vägen från handleden längs underarmen (`along`) är positiv, och bredden tvärs den. */
export function beyondWrist(hand: Hand, width: number, wrist: Pixel, along: Pixel): { area: number; width: number; reach: number } {
  let area = 0;
  let far = 0;
  let low = Infinity;
  let high = -Infinity;
  for (let y = hand.box.y0; y < hand.box.y1; y++) {
    for (let x = hand.box.x0; x < hand.box.x1; x++) {
      if (!hand.mask[y * width + x]) continue;
      const dx = x - wrist.x;
      const dy = y - wrist.y;
      const length = dx * along.x + dy * along.y;
      if (length <= 0) continue;
      const across = -dx * along.y + dy * along.x;
      area++;
      far = Math.max(far, length);
      low = Math.min(low, across);
      high = Math.max(high, across);
    }
  }
  return { area, width: area ? Math.round(high - low) : 0, reach: Math.round(far) };
}

export type Moved = { cover: Uint8Array; hole: Mask; removedYellow: number; filled: number };

/**
 * Flyttar en hand: den tas bort och platsen fylls med det som ligger närmast utanför (median 7 × 7 över fyllningen), och
 * handen läggs tillbaka skalad `scale` kring `fixed` med den punkten på `target`. Med `yellow` tas också det gula kort
 * som rör handen bort, så att märkkortet kan målas där dockans står. Svaret har hur mycket den lagda handen täcker varje
 * bildpunkt (0–255), och var bilden är gissad (`hole`). Ur output/work/ankare-2/krymp-hand-2.ts.
 */
export function moveHand(picture: Picture, hand: Hand, scale: number, fixed: Pixel, target: Pixel, yellow: boolean): Moved {
  const { width, height } = picture;
  const src = Buffer.from(picture.data);
  const shift = Math.ceil(Math.hypot(target.x - fixed.x, target.y - fixed.y));
  const box = clipBox(growBox(hand.box, shift + 4), picture);
  const inBox = (x: number, y: number) => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
  // Handen med två bildpunkters kant, så att den blandas in; utan det gula och blå, som är kortet och inte handen.
  const moved = growMask(hand.mask, width, box, 2);
  for (let p = 0; p < width * height; p++) if (moved[p] && !hand.mask[p] && isCard(...rgbAt(picture, p))) moved[p] = 0;
  const removed = new Uint8Array(width * height);
  let removedYellow = 0;
  if (yellow) {
    const rim = growMask(moved, width, box, 3);
    const touching: number[] = [];
    for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) if (rim[y * width + x] && !moved[y * width + x] && isCard(...rgbAt(picture, y * width + x))) touching.push(y * width + x);
    const found = growMask(flood(width, height, box, (p) => isYellowish(...rgbAt(picture, p)), touching), width, box, 2);
    for (let p = 0; p < width * height; p++) if (found[p] && !moved[p]) (removed[p] = 1), removedYellow++;
  }
  const hole = growMask(moved, width, box, 3);
  for (let p = 0; p < width * height; p++) if (removed[p]) hole[p] = 1;
  // Fyllningen: varje bildpunkt i hålet får färgen hos den närmaste utanför (bredden först).
  const origin = new Int32Array(width * height).fill(-1);
  let front: number[] = [];
  for (let y = box.y0 + 1; y < box.y1 - 1; y++) {
    for (let x = box.x0 + 1; x < box.x1 - 1; x++) {
      const p = y * width + x;
      if (!hole[p] && (hole[p - 1] || hole[p + 1] || hole[p - width] || hole[p + width])) (origin[p] = p), front.push(p);
    }
  }
  while (front.length) {
    const next: number[] = [];
    for (const p of front) {
      for (const q of [p - 1, p + 1, p - width, p + width]) {
        const x = q % width;
        const y = (q - x) / width;
        if (!inBox(x, y) || !hole[q] || origin[q]! >= 0) continue;
        origin[q] = origin[p]!;
        next.push(q);
      }
    }
    front = next;
  }
  const filledData = Buffer.from(src);
  let filled = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const p = y * width + x;
      if (!hole[p] || origin[p]! < 0) continue;
      for (let c = 0; c < 3; c++) filledData[p * 3 + c] = src[origin[p]! * 3 + c]!;
      filled++;
    }
  }
  const out = picture.data;
  const SMOOTH = 3;
  for (let y = Math.max(box.y0, SMOOTH); y < Math.min(box.y1, height - SMOOTH); y++) {
    for (let x = Math.max(box.x0, SMOOTH); x < Math.min(box.x1, width - SMOOTH); x++) {
      const p = y * width + x;
      if (!hole[p]) continue;
      for (let c = 0; c < 3; c++) {
        const values: number[] = [];
        for (let dy = -SMOOTH; dy <= SMOOTH; dy++) for (let dx = -SMOOTH; dx <= SMOOTH; dx++) values.push(filledData[(p + dy * width + dx) * 3 + c]!);
        out[p * 3 + c] = median(values);
      }
    }
  }
  // Handen tillbaka, bilinjärt ur originalet, med täckningen ur handens mask.
  const cover = new Uint8Array(width * height);
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const qx = fixed.x + (x - target.x) / scale;
      const qy = fixed.y + (y - target.y) / scale;
      if (qx < 0 || qy < 0 || qx > width - 1 || qy > height - 1) continue;
      const fx = Math.floor(qx);
      const fy = Math.floor(qy);
      const tx = qx - fx;
      const ty = qy - fy;
      let r = 0;
      let g = 0;
      let b = 0;
      let k = 0;
      for (const [dx, dy, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]] as const) {
        const q = Math.min(height - 1, fy + dy) * width + Math.min(width - 1, fx + dx);
        r += src[q * 3]! * w;
        g += src[q * 3 + 1]! * w;
        b += src[q * 3 + 2]! * w;
        k += moved[q]! * w;
      }
      if (k <= 0.02) continue;
      const p = y * width + x;
      out[p * 3] = Math.round(r * k + out[p * 3]! * (1 - k));
      out[p * 3 + 1] = Math.round(g * k + out[p * 3 + 1]! * (1 - k));
      out[p * 3 + 2] = Math.round(b * k + out[p * 3 + 2]! * (1 - k));
      cover[p] = Math.round(k * 255);
    }
  }
  return { cover, hole, removedYellow, filled };
}

// ---------------------------------------------------------------------------------------------------------------------
// Märkkortet i skon

/** Hur långt in i en fyrhörning (konvex, hörnen åt ett håll) en punkt ligger, i bildpunkter: positivt inne. */
function insideQuad(quad: Pixel[], x: number, y: number): number {
  const centre = { x: quad.reduce((s, p) => s + p.x, 0) / quad.length, y: quad.reduce((s, p) => s + p.y, 0) / quad.length };
  let least = Infinity;
  for (let k = 0; k < quad.length; k++) {
    const a = quad[k]!;
    const b = quad[(k + 1) % quad.length]!;
    const nx = b.y - a.y;
    const ny = a.x - b.x;
    const length = Math.hypot(nx, ny) || 1;
    const side = Math.sign((centre.x - a.x) * nx + (centre.y - a.y) * ny) || 1;
    least = Math.min(least, (((x - a.x) * nx + (y - a.y) * ny) / length) * side);
  }
  return least;
}

const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/**
 * Målar märkkortet i skons mynning, enfärgat `colour`, inom dockans korthörn (`quad`) där underlaget visar kortet eller
 * dockans fingrar över det (som konvext hölje, så att kanten blir rak också där skon skymmer ett hörn), utom där den
 * lagda handen täcker (`cover`, 0–255). Ur output/work/ankare-2/mala-skokort-2.ts.
 */
export function paintShoeCard(picture: Picture, guide: Picture, cover: Uint8Array | null, quad: Pixel[], colour: Rgb): { painted: number; spared: number } {
  const { width, height } = picture;
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const seen: [number, number][] = [];
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(height - 1, Math.ceil(Math.max(...ys))); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(width - 1, Math.ceil(Math.max(...xs))); x++) {
      const [r, g, b] = rgbAt(guide, y * width + x);
      if (insideQuad(quad, x, y) > 0 && (isYellow(r, g, b) || isDollSkin(r, g, b))) seen.push([x, y]);
    }
  }
  if (seen.length < 3) return { painted: 0, spared: 0 };
  seen.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (points: [number, number][]) => {
    const out: [number, number][] = [];
    for (const point of points) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, point) <= 0) out.pop();
      out.push(point);
    }
    return out;
  };
  const hull = [...half(seen).slice(0, -1), ...half([...seen].reverse()).slice(0, -1)];
  const inHull = (x: number, y: number): boolean => hull.every((point, k) => cross(point, hull[(k + 1) % hull.length]!, [x, y]) >= -0.5);
  let painted = 0;
  let spared = 0;
  for (let y = Math.max(0, Math.floor(Math.min(...ys)) - 1); y <= Math.min(height - 1, Math.ceil(Math.max(...ys)) + 1); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs)) - 1); x <= Math.min(width - 1, Math.ceil(Math.max(...xs)) + 1); x++) {
      const k = Math.max(0, Math.min(1, insideQuad(quad, x, y) + 0.5));
      if (k === 0 || !inHull(x, y)) continue;
      const p = y * width + x;
      const hand = cover ? cover[p]! / 255 : 0;
      if (hand >= 0.98) {
        spared++;
        continue;
      }
      const t = k * (1 - hand);
      for (let c = 0; c < 3; c++) picture.data[p * 3 + c] = Math.round(colour[c]! * t + picture.data[p * 3 + c]! * (1 - t));
      painted++;
    }
  }
  return { painted, spared };
}

// ---------------------------------------------------------------------------------------------------------------------
// Midjan: kavajen ned till bordskanten

export type WaistOptions = { reach: number; below: number; sample: [number, number] };

/**
 * Låter kläderna gå ned till dealerns bordskant: i varje kolumn i `band` där dealern når `reach` bildpunkter ovanför
 * kanten men slutar mot skärm före den, fylls skärmen ned till kanten + `below` med klädernas färg i kolumnen (medianen
 * `sample` rader ovanför fållen), blandad som nyckeln delar en bildpunkt (src/scene/key.ts, screenShare).
 * `edge` ger kantens rad i en kolumn. Ur output/work/ankare-2/fyll-midja.ts.
 */
export function fillWaist(picture: Picture, key: Rgb, edge: (x: number) => number, band: [number, number], options: WaistOptions): { cols: number; filled: number; most: number } {
  const { width, height, data } = picture;
  const share = (x: number, y: number): number => {
    const i = (y * width + x) * 3;
    return screenShare(data[i]!, data[i + 1]!, data[i + 2]!, key);
  };
  let cols = 0;
  let filled = 0;
  let most = 0;
  for (let x = Math.max(0, Math.round(band[0])); x <= Math.min(width - 1, Math.round(band[1])); x++) {
    const row = Math.round(edge(x));
    const top = row - options.reach;
    if (top < options.sample[1] || row + options.below >= height || share(x, top) >= 0.5) continue;
    let y = top;
    while (y < height - 1 && share(x, y + 1) < 0.5) y++;
    if (y >= row + options.below) continue;
    const cloth = [0, 1, 2].map((c) => {
      const values: number[] = [];
      for (let k = options.sample[0]; k <= options.sample[1]; k++) values.push(data[((y - k) * width + x) * 3 + c]!);
      return median(values);
    });
    for (let yy = y - 2; yy <= row + options.below; yy++) {
      const s = share(x, yy);
      if (s <= 0) continue;
      const i = (yy * width + x) * 3;
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(Math.min(255, Math.max(0, data[i + c]! - s * key[c]!) + s * cloth[c]!));
      filled++;
    }
    most = Math.max(most, row - y);
    cols++;
  }
  return { cols, filled, most };
}

// ---------------------------------------------------------------------------------------------------------------------
// Rent för nyckeln

export type ScreenPart = { n: number; box: Box; border: boolean };

/** Skärmens delar (andel ≥ 0,5, som nyckeln) och det som inte är skärm, sammanhängande med fyra grannar. */
function screenLabels(picture: Picture, key: Rgb): { screen: Uint8Array; share: Float32Array; parts: Record<0 | 1, ScreenPart[]>; id: Record<0 | 1, Int32Array> } {
  const { width, height, data } = picture;
  const share = new Float32Array(width * height);
  const screen = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    share[p] = screenShare(data[p * 3]!, data[p * 3 + 1]!, data[p * 3 + 2]!, key);
    screen[p] = share[p]! >= 0.5 ? 1 : 0;
  }
  const label = (want: 0 | 1) => {
    const id = new Int32Array(width * height).fill(-1);
    const parts: ScreenPart[] = [];
    const stack = new Int32Array(width * height);
    for (let s = 0; s < width * height; s++) {
      if (screen[s] !== want || id[s] !== -1) continue;
      const k = parts.length;
      const part: ScreenPart = { n: 0, box: { x0: width, y0: height, x1: 0, y1: 0 }, border: false };
      let top = 0;
      stack[top++] = s;
      id[s] = k;
      while (top) {
        const p = stack[--top]!;
        const x = p % width;
        const y = (p - x) / width;
        part.n++;
        part.box.x0 = Math.min(part.box.x0, x);
        part.box.y0 = Math.min(part.box.y0, y);
        part.box.x1 = Math.max(part.box.x1, x + 1);
        part.box.y1 = Math.max(part.box.y1, y + 1);
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) part.border = true;
        if (x > 0 && screen[p - 1] === want && id[p - 1] === -1) (id[p - 1] = k), (stack[top++] = p - 1);
        if (x < width - 1 && screen[p + 1] === want && id[p + 1] === -1) (id[p + 1] = k), (stack[top++] = p + 1);
        if (y > 0 && screen[p - width] === want && id[p - width] === -1) (id[p - width] = k), (stack[top++] = p - width);
        if (y < height - 1 && screen[p + width] === want && id[p + width] === -1) (id[p + width] = k), (stack[top++] = p + width);
      }
      parts.push(part);
    }
    return { id, parts };
  };
  const solid = label(0);
  const open = label(1);
  return { screen, share, parts: { 0: solid.parts, 1: open.parts }, id: { 0: solid.id, 1: open.id } };
}

/**
 * Hur ren bilden är för nyckeln: lösa delar som inte är skärm och är mindre än `keepLeast` (fläckar, hårstrån), skärm
 * innesluten i dealern eller skon (hål: grönt i hår eller tatueringar, glipor), och bildpunkter inne i dealern som
 * nyckeln delvis tar bort (andel över 0 mer än 2 bp från skärmen). Ur output/work/ankare-2/rent.ts.
 */
export function screenReport(picture: Picture, key: Rgb, keepLeast: number): { spots: ScreenPart[]; holes: ScreenPart[]; partial: number } {
  const { width, height } = picture;
  const { screen, share, parts } = screenLabels(picture, key);
  let partial = 0;
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const p = y * width + x;
      if (screen[p] || share[p]! <= 0) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (screen[p + dy * width + dx]) {
        near = true;
        break;
      }
      if (!near) partial++;
    }
  }
  const bySize = (a: ScreenPart, b: ScreenPart) => b.n - a.n;
  return { spots: parts[0].filter((part) => part.n < keepLeast).sort(bySize), holes: parts[1].filter((part) => !part.border).sort(bySize), partial };
}

/**
 * Lagar det minsta: inneslutna hål om högst `holeMost` bp fylls med medianen av grannarna som inte är skärm (inom 3 bp),
 * och lösa delar om högst `spotMost` bp blir skärm. Större hål (glipan mellan arm och bål, mellan tumme och finger) och
 * hårstrån står kvar. Ur output/work/ankare-2/rent.ts (laga).
 */
export function cleanScreen(picture: Picture, key: Rgb, holeMost: number, spotMost: number): { holesFilled: number; spotsRemoved: number } {
  const { width, height } = picture;
  const { screen, parts, id } = screenLabels(picture, key);
  const src = Buffer.from(picture.data);
  let holesFilled = 0;
  let spotsRemoved = 0;
  parts[1].forEach((part, k) => {
    if (part.border || part.n > holeMost) return;
    for (let y = part.box.y0; y < part.box.y1; y++) {
      for (let x = part.box.x0; x < part.box.x1; x++) {
        const p = y * width + x;
        if (id[1][p] !== k) continue;
        const values: number[][] = [[], [], []];
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || screen[ny * width + nx]) continue;
          for (let c = 0; c < 3; c++) values[c]!.push(src[(ny * width + nx) * 3 + c]!);
        }
        if (!values[0]!.length) continue;
        for (let c = 0; c < 3; c++) picture.data[p * 3 + c] = median(values[c]!);
        holesFilled++;
      }
    }
  });
  parts[0].forEach((part, k) => {
    if (part.n > spotMost) return;
    for (let y = part.box.y0; y < part.box.y1; y++) {
      for (let x = part.box.x0; x < part.box.x1; x++) {
        const p = y * width + x;
        if (id[0][p] !== k) continue;
        for (let c = 0; c < 3; c++) picture.data[p * 3 + c] = key[c]!;
        spotsRemoved++;
      }
    }
  });
  return { holesFilled, spotsRemoved };
}

// ---------------------------------------------------------------------------------------------------------------------
// Huvudet ur likhetssteget, när det har flyttat resten av bilden

const greenness = (d: Buffer, p: number): number => d[p * 3 + 1]! - Math.max(d[p * 3]!, d[p * 3 + 2]!);
const isCloth = (d: Buffer, p: number): boolean => 0.2126 * d[p * 3]! + 0.7152 * d[p * 3 + 1]! + 0.0722 * d[p * 3 + 2]! < 48 && greenness(d, p) < 15;

/**
 * Lägger huvudet ur `head` på `base` (båda plattade, skärmen `key`): ovanför kragens linje `collar(x)` inom `box` tas
 * basens huvud bort och huvudbildens läggs på, förskjutet så att klädernas mörka kring kragen sammanfaller (inom
 * ±`reach` bp). Kropp, armar, kort och sko står kvar ur basen. Ur output/work/giv-4/klistra-huvud.ts.
 */
export function pasteHead(base: Picture, head: Picture, key: Rgb, box: Box, collar: (x: number) => number, reach: number): { dx: number; dy: number; removed: number; placed: number } {
  const { width, height } = base;
  const area = clipBox(box, base);
  let best = { dx: 0, dy: 0, score: -Infinity };
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      let score = 0;
      for (let y = area.y0; y < area.y1; y += 2) {
        for (let x = area.x0; x < area.x1; x += 2) {
          if (Math.abs(y - collar(x)) > 50) continue;
          const sx = x + dx;
          const sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
          score += isCloth(base.data, y * width + x) === isCloth(head.data, sy * width + sx) ? 1 : -1;
        }
      }
      if (score > best.score) best = { dx, dy, score };
    }
  }
  const src = Buffer.from(base.data);
  let removed = 0;
  let placed = 0;
  for (let y = area.y0; y < area.y1; y++) {
    for (let x = area.x0; x < area.x1; x++) {
      if (y >= collar(x)) continue;
      const p = y * width + x;
      if (greenness(src, p) <= 40 && !isCloth(src, p)) {
        for (let c = 0; c < 3; c++) base.data[p * 3 + c] = key[c]!;
        removed++;
      }
      const sx = x + best.dx;
      const sy = y + best.dy;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const q = sy * width + sx;
      if (greenness(head.data, q) <= 40) {
        for (let c = 0; c < 3; c++) base.data[p * 3 + c] = head.data[q * 3 + c]!;
        placed++;
      }
    }
  }
  return { dx: best.dx, dy: best.dy, removed, placed };
}

// ---------------------------------------------------------------------------------------------------------------------
// Måtten mot underlaget

/** Den största sammanhängande mörka delen inom `area` (skon), som ruta, eller null. Ur output/work/ankare-2/mat-2.ts. */
export function darkBox(picture: Picture, area: Box, least: number): Box | null {
  const { width } = picture;
  const box = clipBox(area, picture);
  const mask = new Uint8Array(width * picture.height);
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) if (isDark(...rgbAt(picture, y * width + x))) mask[y * width + x] = 1;
  const seen = new Uint8Array(mask.length);
  let best: (Box & { n: number }) | null = null;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const s = y * width + x;
      if (!mask[s] || seen[s]) continue;
      const part = { x0: x, y0: y, x1: x + 1, y1: y + 1, n: 0 };
      const stack = [s];
      seen[s] = 1;
      while (stack.length) {
        const p = stack.pop()!;
        const px = p % width;
        const py = (p - px) / width;
        part.n++;
        part.x0 = Math.min(part.x0, px);
        part.y0 = Math.min(part.y0, py);
        part.x1 = Math.max(part.x1, px + 1);
        part.y1 = Math.max(part.y1, py + 1);
        for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]] as const) {
          const q = ny * width + nx;
          if (nx >= box.x0 && nx < box.x1 && ny >= box.y0 && ny < box.y1 && mask[q] && !seen[q]) (seen[q] = 1), stack.push(q);
        }
      }
      if (part.n >= least && (!best || part.n > best.n)) best = part;
    }
  }
  return best ? { x0: best.x0, y0: best.y0, x1: best.x1, y1: best.y1 } : null;
}

/** Överlappet (skärning genom förening) mellan det mörka i två bilder inom `area`, utom i `skip` (till exempel handen). */
export function darkOverlap(a: Picture, b: Picture, area: Box, skip?: Box): number | null {
  const box = clipBox(area, a);
  let both = 0;
  let either = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      if (skip && x >= skip.x0 && x < skip.x1 && y >= skip.y0 && y < skip.y1) continue;
      const p = y * a.width + x;
      const inA = isDark(...rgbAt(a, p));
      const inB = isDark(...rgbAt(b, p));
      if (inA && inB) both++;
      if (inA || inB) either++;
    }
  }
  return either ? Math.round((both / either) * 1000) / 1000 : null;
}

/** Största avståndet mellan två rutors kanter, i bildpunkter. */
export const boxOffset = (a: Box, b: Box): number => Math.max(Math.abs(a.x0 - b.x0), Math.abs(a.y0 - b.y0), Math.abs(a.x1 - b.x1), Math.abs(a.y1 - b.y1));

/**
 * Raden där kolumnen `x` slår om från skärm till bord: nedifrån den första raden inom `rows` där grönt (medel av fem
 * kolumner) har nått halvvägs från skärmens (överst i `rows`) till bordets (det grönaste i `rows`), eller null när
 * bordet inte är minst `least` grönare än skärmen. Bara i bilder där bordet syns (före plattningen). Rutnätets mörkare
 * linjer på bordet ligger under kanten och tas inte för den. Ur output/work/ankare-2/bordskant.ts.
 */
export function tableEdge(picture: Picture, x: number, rows: [number, number], least: number): number | null {
  const { width, height, data } = picture;
  const g = (y: number): number => {
    let s = 0;
    for (let dx = -2; dx <= 2; dx++) s += data[(y * width + Math.min(width - 1, Math.max(0, x + dx))) * 3 + 1]!;
    return s / 5;
  };
  const top = Math.max(0, Math.round(rows[0]));
  const bottom = Math.min(height - 1, Math.round(rows[1]));
  if (bottom <= top) return null;
  const screen = g(top);
  let table = screen;
  for (let y = top; y <= bottom; y++) table = Math.max(table, g(y));
  if (table - screen < least) return null;
  for (let y = top; y <= bottom; y++) if (g(y) >= (screen + table) / 2) return y;
  return null;
}

/** Överlappet mellan silhuetterna (det som inte är grönt) i två bilder inom `area`, utom i `skip`. */
export function silhouetteOverlap(a: Picture, b: Picture, area: Box, skip?: Box): number | null {
  const box = clipBox(area, a);
  let both = 0;
  let either = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      if (skip && x >= skip.x0 && x < skip.x1 && y >= skip.y0 && y < skip.y1) continue;
      const p = y * a.width + x;
      const inA = !isGreen(...rgbAt(a, p));
      const inB = !isGreen(...rgbAt(b, p));
      if (inA && inB) both++;
      if (inA || inB) either++;
    }
  }
  return either ? Math.round((both / either) * 1000) / 1000 : null;
}

/** Andelen bildpunkter i bilden som är exakt skärmens färg, i procent. */
export function exactScreen(picture: Picture, key: Rgb): number {
  let n = 0;
  for (let p = 0; p < picture.width * picture.height; p++) if (picture.data[p * 3] === key[0] && picture.data[p * 3 + 1] === key[1] && picture.data[p * 3 + 2] === key[2]) n++;
  return Math.round((10000 * n) / (picture.width * picture.height)) / 100;
}

export { count as maskArea };

// ---------------------------------------------------------------------------------------------------------------------
// Ett ankare fört över till ett nytt öga

type Vec3 = [number, number, number];
export type EyeLike = { position: readonly number[]; forward: readonly number[]; focalPx: number; frame: { width: number; height: number } };

const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
const crossV = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Ögats axlar som src/scene/geometry.ts tar dem: höger är fram × upp (0, 1, 0), upp är höger × fram. */
function axes(eye: EyeLike): { f: Vec3; r: Vec3; u: Vec3 } {
  const f = unit([eye.forward[0]!, eye.forward[1]!, eye.forward[2]!]);
  const r = unit(crossV(f, [0, 1, 0]));
  return { f, r, u: crossV(r, f) };
}

/** Bildpunkten i ögat `to` som visar det `from` ser i (x, y): samma stråle, när ögonen står på samma plats. */
export function pixelBetween(from: EyeLike, to: EyeLike, x: number, y: number): Pixel {
  const A = axes(from);
  const B = axes(to);
  const a = (x - (from.frame.width - 1) / 2) / from.focalPx;
  const b = -(y - (from.frame.height - 1) / 2) / from.focalPx;
  const d: Vec3 = [A.f[0] + A.r[0] * a + A.u[0] * b, A.f[1] + A.r[1] * a + A.u[1] * b, A.f[2] + A.r[2] * a + A.u[2] * b];
  const depth = dot(d, B.f);
  return { x: (to.frame.width - 1) / 2 + (to.focalPx * dot(d, B.r)) / depth, y: (to.frame.height - 1) / 2 - (to.focalPx * dot(d, B.u)) / depth };
}

/**
 * För över en bild gjord genom ögat `from` till ögat `to`, som står på samma plats men pekar åt ett annat håll eller har
 * en annan brännvidd: en exakt homografi, provtagen med Lanczos 3 (vikterna normerade). Det som faller utanför den
 * gamla bilden blir `fill`. Omsamplingen blandar skärmens gröna in i silhuettens kant: platta skärmen efteråt
 * (flattenScreen). Ett öga som har flyttats går inte att föra över så: då görs ankaret om. Ur
 * output/work/ankare-3/homografi.ts (mätt där till 0,04 bp på dockan).
 */
export function toEye(picture: Picture, from: EyeLike, to: EyeLike, fill: Rgb): { picture: Picture; outside: number } {
  const moved = Math.hypot(from.position[0]! - to.position[0]!, from.position[1]! - to.position[1]!, from.position[2]! - to.position[2]!);
  if (moved > 1e-6) throw new Error(`Ögonen står inte på samma plats (${moved.toFixed(4)} m isär): ingen homografi`);
  if (picture.width !== from.frame.width || picture.height !== from.frame.height) throw new Error(`Bilden är ${picture.width} × ${picture.height}, ögat säger ${from.frame.width} × ${from.frame.height}`);
  const { width: SW, height: SH, data: src } = picture;
  const W = to.frame.width;
  const H = to.frame.height;
  const out = Buffer.alloc(W * H * 3);
  const lanczos = (t: number): number => {
    if (t === 0) return 1;
    if (Math.abs(t) >= 3) return 0;
    const p = Math.PI * t;
    return (3 * Math.sin(p) * Math.sin(p / 3)) / (p * p);
  };
  const wx = new Float64Array(6);
  const wy = new Float64Array(6);
  let outside = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const { x: sx, y: sy } = pixelBetween(to, from, x, y);
      const o = (y * W + x) * 3;
      if (!(sx >= -0.5 && sy >= -0.5 && sx <= SW - 0.5 && sy <= SH - 0.5)) {
        out[o] = fill[0];
        out[o + 1] = fill[1];
        out[o + 2] = fill[2];
        outside++;
        continue;
      }
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      let sumX = 0;
      let sumY = 0;
      for (let k = 0; k < 6; k++) {
        wx[k] = lanczos(sx - (ix - 2 + k));
        wy[k] = lanczos(sy - (iy - 2 + k));
        sumX += wx[k]!;
        sumY += wy[k]!;
      }
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < 6; j++) {
        const yy = Math.min(SH - 1, Math.max(0, iy - 2 + j));
        for (let k = 0; k < 6; k++) {
          const xx = Math.min(SW - 1, Math.max(0, ix - 2 + k));
          const v = (wy[j]! / sumY) * (wx[k]! / sumX);
          const s = (yy * SW + xx) * 3;
          r += src[s]! * v;
          g += src[s + 1]! * v;
          b += src[s + 2]! * v;
        }
      }
      out[o] = Math.max(0, Math.min(255, Math.round(r)));
      out[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      out[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }
  }
  return { picture: { data: out, width: W, height: H }, outside };
}
