// Helfiguren för en ny dealer: de lokala stegen mellan beställningarna till bild- och filmmodellen.
// In går en bild på en person. Ut kommer samma sittande grundställningar som mallens (VILA och REDO), i samma ruta och
// på samma gröna, och ett klipp mellan dem. Receptet med modeller och texter står i docs/production.md under
// "Helfigur för en ny dealer". Mallens mått står i content/figure-frame.json och rutan i content/scene.json.
//
//   node src/pipeline/helfigur.ts underlag <dealer> vila
//   node src/pipeline/helfigur.ts fardig <dealer> vila <bilden från modellen> [passa]
//   node src/pipeline/helfigur.ts underlag <dealer> redo
//   node src/pipeline/helfigur.ts fardig <dealer> redo <bilden från modellen> [passa]
//   node src/pipeline/helfigur.ts lagg <dealer>
//   node src/pipeline/helfigur.ts film <dealer> <filmen från modellen>
//   node src/pipeline/helfigur.ts mat <vila|redo> <bild>
//
// Arbetsfilerna hamnar i output/work/<dealer>/. Härifrån beställs ingenting, och ingenting skrivs i assets/ eller i
// registret: det gör den som har beställt, när bilderna är sedda.

import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { readScene } from '../scene/description.ts';
import type { Frame, Marked } from '../scene/description.ts';

export class HelfigurError extends Error {}

export type Rgb = [number, number, number];
/** En ruta i bilden. */
export type Box = { x0: number; y0: number; x1: number; y1: number };
/** En bild som råa bildpunkter: rött, grönt och blått, rad för rad. */
export type Picture = { data: Buffer; width: number; height: number };
export type Pose = 'vila' | 'redo';

/** Mallen, content/figure-frame.json. Vad varje tal är står i filen. */
export type FigureFrame = {
  reference: Marked & { dealer: string; vila: string; redo: string; clips: Record<string, string> };
  green: Marked & { rgb: Rgb };
  poses: { vila: Marked & { figure: Box; headCentre: number; hands: Box[] }; redo: Marked & { figure: Box; hands: Box[] } };
  handBand: Marked & { y0: number; y1: number };
  handLimit: Marked & { px: number };
  redoPatch: Marked & { x0: number; y0: number; y1: number; edge: number };
  redoRegion: Marked & Box;
};

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isBox = (value: unknown): value is Box => {
  const box = value as Partial<Box> | null;
  return [box?.x0, box?.y0, box?.x1, box?.y1].every(isNumber) && box!.x0! < box!.x1! && box!.y0! < box!.y1!;
};

export function readFigureFrame(root: string): FigureFrame {
  const value = JSON.parse(readFileSync(join(root, 'content', 'figure-frame.json'), 'utf8')) as Partial<FigureFrame>;
  const need = (ok: boolean, what: string) => {
    if (!ok) throw new HelfigurError(`content/figure-frame.json: ${what} saknas eller är fel`);
  };
  const { reference, green, poses, handBand, handLimit, redoPatch, redoRegion } = value;
  need([reference?.dealer, reference?.vila, reference?.redo].every((text) => typeof text === 'string' && text !== ''), 'reference');
  need(Array.isArray(green?.rgb) && green.rgb.length === 3 && green.rgb.every(isNumber), 'green.rgb');
  need(isBox(poses?.vila?.figure) && isNumber(poses.vila.headCentre) && isBox(poses?.redo?.figure), 'poses');
  need([poses?.vila?.hands, poses?.redo?.hands].every((hands) => Array.isArray(hands) && hands.length === 2 && hands.every(isBox)), 'poses.*.hands');
  need(isNumber(handBand?.y0) && isNumber(handBand?.y1) && handBand.y0 < handBand.y1, 'handBand');
  need(isNumber(handLimit?.px) && handLimit.px > 0, 'handLimit.px');
  need([redoPatch?.x0, redoPatch?.y0, redoPatch?.y1, redoPatch?.edge].every(isNumber) && redoPatch!.y0 < redoPatch!.y1, 'redoPatch');
  need(isBox(redoRegion), 'redoRegion');
  return value as FigureFrame;
}

// ---------------------------------------------------------------------------------------------------------------------
// Bilder

/** Läser en bild som råa bildpunkter. Med `size` skalas den dit, utan hänsyn till sina proportioner. */
export async function loadPicture(path: string, size?: Frame): Promise<Picture> {
  let image = sharp(path);
  if (size) image = image.resize(size.width, size.height, { fit: 'fill', kernel: 'lanczos3' });
  const { data, info } = await image.removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new HelfigurError(`${path}: väntade tre kanaler, fick ${info.channels}`);
  return { data, width: info.width, height: info.height };
}

export async function savePicture(picture: Picture, path: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  await sharp(picture.data, { raw: { width: picture.width, height: picture.height, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path);
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const toByte = (value: number): number => Math.round(Math.min(255, Math.max(0, value)));
const median = (values: number[]): number => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

function sameSize(a: Picture, b: Picture): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new HelfigurError(`Bilderna är olika stora: ${a.width} × ${a.height} och ${b.width} × ${b.height}`);
  }
}

/** Skärmens färg i en bild: medianen i en ruta i övre vänstra hörnet, där figuren aldrig står. */
export function screenColour(picture: Picture): Rgb {
  const { data, width, height } = picture;
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];
  for (let y = Math.min(20, height >> 3); y < Math.min(200, height >> 1); y += 3) {
    for (let x = Math.min(20, width >> 3); x < Math.min(300, width >> 1); x += 3) {
      const i = (y * width + x) * 3;
      red.push(data[i]!);
      green.push(data[i + 1]!);
      blue.push(data[i + 2]!);
    }
  }
  return [median(red), median(green), median(blue)];
}

/**
 * Skärmens andel av en bildpunkt, 0 för figur och 1 för ren skärm: det grönas övervikt över rött och blått, mätt mot
 * skärmens egen. Samma mått som nyckeln i scenen (src/scene/key.ts).
 */
function shareOf(picture: Picture, screen: Rgb): (i: number) => number {
  const excess = screen[1] - Math.max(screen[0], screen[2]);
  if (excess < 40) throw new HelfigurError(`Bildens övre vänstra hörn är inte grön skärm: RGB ${screen.join(', ')}`);
  const { data } = picture;
  return (i) => clamp01((data[i + 1]! - Math.max(data[i]!, data[i + 2]!)) / excess);
}

/** Samma bild med skärmen omräknad till ett annat grönt: ren skärm blir exakt det, och kanterna följer med i sin andel. */
export function recolour(picture: Picture, green: Rgb): Picture {
  const screen = screenColour(picture);
  const share = shareOf(picture, screen);
  const data = Buffer.alloc(picture.data.length);
  for (let i = 0; i < data.length; i += 3) {
    const part = share(i);
    for (let c = 0; c < 3; c += 1) {
      data[i + c] = part >= 0.98 ? green[c]! : toByte(picture.data[i + c]! + part * (green[c]! - screen[c]!));
    }
  }
  return { data, width: picture.width, height: picture.height };
}

/** Alla bildpunkter som ligger högst `reach` från en markerad, vågrätt och lodrätt (en kvadrat kring varje). */
function grow(mask: Uint8Array, width: number, height: number, reach: number): Uint8Array {
  const rows = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    let last = -Infinity;
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) last = x;
      if (x - last <= reach) rows[y * width + x] = 1;
    }
    last = Infinity;
    for (let x = width - 1; x >= 0; x -= 1) {
      if (mask[y * width + x]) last = x;
      if (last - x <= reach) rows[y * width + x] = 1;
    }
  }
  const grown = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    let last = -Infinity;
    for (let y = 0; y < height; y += 1) {
      if (rows[y * width + x]) last = y;
      if (y - last <= reach) grown[y * width + x] = 1;
    }
    last = Infinity;
    for (let y = height - 1; y >= 0; y -= 1) {
      if (rows[y * width + x]) last = y;
      if (last - y <= reach) grown[y * width + x] = 1;
    }
  }
  return grown;
}

/** Det som blir kvar när kanten skalas av med `reach` bildpunkter. Smalare streck än så försvinner helt. */
function shrink(mask: Uint8Array, width: number, height: number, reach: number): Uint8Array {
  return grow(mask.map((set) => (set ? 0 : 1)), width, height, reach).map((set) => (set ? 0 : 1));
}

/** Sammanhängande områden i en markering (grannar vågrätt och lodrätt), var och en med storlek och ruta. */
function parts(mask: Uint8Array, width: number, height: number): { label: Int32Array; found: (Box & { size: number })[] } {
  const label = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  const found: (Box & { size: number })[] = [];
  for (let start = 0; start < width * height; start += 1) {
    if (!mask[start] || label[start]) continue;
    const part = { x0: width, y0: height, x1: -1, y1: -1, size: 0 };
    found.push(part);
    let top = 0;
    stack[top++] = start;
    label[start] = found.length;
    while (top) {
      const at = stack[--top]!;
      const x = at % width;
      const y = (at - x) / width;
      part.size += 1;
      part.x0 = Math.min(part.x0, x);
      part.x1 = Math.max(part.x1, x);
      part.y0 = Math.min(part.y0, y);
      part.y1 = Math.max(part.y1, y);
      if (x > 0 && mask[at - 1] && !label[at - 1]) { label[at - 1] = found.length; stack[top++] = at - 1; }
      if (x < width - 1 && mask[at + 1] && !label[at + 1]) { label[at + 1] = found.length; stack[top++] = at + 1; }
      if (y > 0 && mask[at - width] && !label[at - width]) { label[at - width] = found.length; stack[top++] = at - width; }
      if (y < height - 1 && mask[at + width] && !label[at + width]) { label[at + width] = found.length; stack[top++] = at + width; }
    }
  }
  return { label, found };
}

/**
 * Mitten av huvudets bredd, x: medelvärdet av radernas mitt i det band där ansiktet sitter, 6 till 16,5 procent av
 * figurens höjd under hjässan. `edges` ger figurens yttersta bildpunkter på en rad, eller null för en tom rad.
 */
function headCentre(top: number, bottom: number, edges: (y: number) => [number, number] | null): number {
  const tall = bottom - top + 1;
  const centres: number[] = [];
  for (let y = top + Math.round(tall * 0.06); y < top + Math.round(tall * 0.165); y += 1) {
    const row = edges(y);
    if (row) centres.push((row[0] + row[1]) / 2);
  }
  if (!centres.length) throw new HelfigurError('Hittar inget huvud: figuren är för låg');
  return centres.reduce((sum, centre) => sum + centre, 0) / centres.length;
}

// ---------------------------------------------------------------------------------------------------------------------
// Underlag: det bildmodellen får som ställning

/** Underlaget till VILA: mallens VILA i rutan, med skärmen räknad om till rutans gröna. */
export function vilaBase(pose: Picture, green: Rgb): Picture {
  return recolour(pose, green);
}

/**
 * Underlaget till REDO: dealerns färdiga VILA med en lapp ur mallens REDO, där armen är sträckt åt sidan. Lappen går
 * från `patch.x0` till högra kanten och mellan raderna `patch.y0` och `patch.y1`, med mjuk kant. Ställningen i lappen
 * ligger kvar; kläder och hand i den är mallens och görs om av bildmodellen.
 */
export function redoBase(vila: Picture, pose: Picture, patch: FigureFrame['redoPatch'], green: Rgb): Picture {
  sameSize(vila, pose);
  const lapp = recolour(pose, green);
  const ramp = (value: number, edge: number) => clamp01((value - (edge - patch.edge)) / (2 * patch.edge));
  const data = Buffer.alloc(vila.data.length);
  for (let y = 0; y < vila.height; y += 1) {
    for (let x = 0; x < vila.width; x += 1) {
      const weight = Math.min(ramp(x, patch.x0), ramp(y, patch.y0), 1 - ramp(y, patch.y1));
      const i = (y * vila.width + x) * 3;
      for (let c = 0; c < 3; c += 1) data[i + c] = toByte(weight * lapp.data[i + c]! + (1 - weight) * vila.data[i + c]!);
    }
  }
  return { data, width: vila.width, height: vila.height };
}

// ---------------------------------------------------------------------------------------------------------------------
// Efterarbete: från modellens bild till den färdiga rutan

// Figurens kant (hår, mjuka övergångar) får vara kvar så här långt ut från figuren, i modellens bildpunkter.
const EDGE_REACH = 10;

export type Finished = {
  picture: Picture;
  report: {
    from: Frame;
    /** Det gröna modellen lämnade. */
    screen: Rgb;
    figurePixels: number;
    /** Bildpunkter utanför figuren som inte var skärm (spökbilder, skuggor, föremål) och som nu är gröna. */
    strayPixels: number;
    /** Figuren i modellens egna bildpunkter. */
    figure: { top: number; bottom: number; headCentre: number };
    scale: number;
    shift: { x: number; y: number };
  };
};

/**
 * Gör den färdiga rutan av en bild från modellen. Figuren är det största sammanhängande området som inte är skärm; allt
 * annat blir exakt `green`, och det gröna i figurens kant räknas om från modellens gröna. Sedan läggs bilden i rutan med
 * samma skala åt båda håll. Utan `fit` fylls rutan och det som sticker ut skärs bort lika på båda sidor. Med `fit` skalas
 * och flyttas figuren så att hjässa, sulor och huvudets mitt står där `fit` säger.
 */
export async function finishFrame(source: Picture, frame: Frame, green: Rgb, fit?: { top: number; bottom: number; headCentre: number }): Promise<Finished> {
  const { data, width, height } = source;
  const screen = screenColour(source);
  const share = shareOf(source, screen);

  const solid = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p += 1) if (share(p * 3) < 0.5) solid[p] = 1;
  const { label, found } = parts(solid, width, height);
  if (!found.length) throw new HelfigurError('Bilden är bara skärm: ingen figur');
  const best = found.reduce((largest, part) => (part.size > largest.size ? part : largest));
  const number = found.indexOf(best) + 1;
  const figure = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p += 1) if (label[p] === number) figure[p] = 1;
  const near = grow(figure, width, height, EDGE_REACH);

  const cleaned = Buffer.alloc(width * height * 3);
  let strayPixels = 0;
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 3;
    const raw = share(i);
    // Över 0,6 räknas andelen upp dubbelt så fort: kantens yttersta bildpunkter blir ren skärm i stället för en grön slöja.
    const part = raw < 0.6 ? raw : Math.min(1, 0.6 + (raw - 0.6) * 2);
    if (!near[p] || part >= 1) {
      if (!near[p] && raw < 0.9) strayPixels += 1;
      for (let c = 0; c < 3; c += 1) cleaned[i + c] = green[c]!;
    } else {
      for (let c = 0; c < 3; c += 1) cleaned[i + c] = toByte(data[i + c]! + part * (green[c]! - screen[c]!));
    }
  }

  const centre = headCentre(best.y0, best.y1, (y) => {
    let left = -1;
    let right = -1;
    for (let x = best.x0; x <= best.x1; x += 1) {
      if (!figure[y * width + x]) continue;
      if (left < 0) left = x;
      right = x;
    }
    return left < 0 ? null : [left, right];
  });

  const cover = Math.max(frame.width / width, frame.height / height);
  const scale = fit ? (fit.bottom - fit.top + 1) / (best.y1 - best.y0 + 1) : cover;
  const left = Math.round(fit ? fit.headCentre - centre * scale : (frame.width - width * scale) / 2);
  const top = Math.round(fit ? fit.top - best.y0 * scale : (frame.height - height * scale) / 2);
  const scaledWidth = Math.round(width * scale);
  const scaledHeight = Math.round(height * scale);
  const scaled = await sharp(cleaned, { raw: { width, height, channels: 3 } })
    .resize(scaledWidth, scaledHeight, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer();

  // Den skalade bilden läggs på en ruta av rent grönt. Det som hamnar utanför rutan skärs bort.
  const out = Buffer.alloc(frame.width * frame.height * 3);
  for (let i = 0; i < out.length; i += 3) for (let c = 0; c < 3; c += 1) out[i + c] = green[c]!;
  const skip = Math.max(0, -left);
  const count = Math.min(scaledWidth - skip, frame.width - Math.max(0, left));
  for (let y = Math.max(0, top); y < Math.min(frame.height, top + scaledHeight) && count > 0; y += 1) {
    const from = ((y - top) * scaledWidth + skip) * 3;
    scaled.copy(out, (y * frame.width + Math.max(0, left)) * 3, from, from + count * 3);
  }

  return {
    picture: { data: out, width: frame.width, height: frame.height },
    report: {
      from: { width, height },
      screen,
      figurePixels: best.size,
      strayPixels,
      figure: { top: best.y0, bottom: best.y1, headCentre: Number(centre.toFixed(1)) },
      scale: Number(scale.toFixed(5)),
      shift: { x: left, y: top },
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Mätning: var figuren står och var händerna ligger

// Skärm och hud som fasta färgvillkor. De behöver inte veta bildens eget gröna, så samma mått gäller mallen, modellens
// bilder och rutor ur en film. Händerna hittas i ett rutnät om GRID bildpunkter: en ruta är hud när minst hälften av den
// är det, och ett hudområde räknas från 25 rutor.
const isScreen = (r: number, g: number, b: number): boolean => g > 90 && g - r > 45 && g - b > 45;
const isSkin = (r: number, g: number, b: number): boolean => r > 120 && r > g + 12 && g > b && r - b > 30 && r - b < 150;
const GRID = 4;
const SKIN_CELLS = 25;

export type Measured = {
  /** Skärmens färg: medianen över hela bakgrunden, och i övre vänstra hörnet där scenens nyckel läser den. */
  screen: Rgb;
  corner: Rgb;
  /** Allt som inte är skärm, kanterna medräknade. */
  figure: Box;
  /** Mitten av huvudets bredd, x. */
  headCentre: number;
  /** Hudområden, störst först. x1 och y1 är första bildpunkten efter området. */
  skin: Box[];
};

/** Mäter en helfigur på grön skärm. Bilden ska vara i rutans storlek för att talen ska gå att jämföra med mallens. */
export function measureFigure(picture: Picture): Measured {
  const { data, width, height } = picture;
  const figure: Box = { x0: width, y0: height, x1: -1, y1: -1 };
  const rows: ([number, number] | null)[] = [];
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];
  for (let y = 0; y < height; y += 1) {
    let left = -1;
    let right = -1;
    let count = 0;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      if (!isScreen(data[i]!, data[i + 1]!, data[i + 2]!)) {
        if (left < 0) left = x;
        right = x;
        count += 1;
      } else if ((x + y) % 37 === 0) {
        red.push(data[i]!);
        green.push(data[i + 1]!);
        blue.push(data[i + 2]!);
      }
    }
    // En rad räknas till figuren först när mer än tre bildpunkter inte är skärm, så att enstaka brus inte flyttar ramen.
    rows.push(count > 3 ? [left, right] : null);
    if (count > 3) {
      figure.x0 = Math.min(figure.x0, left);
      figure.x1 = Math.max(figure.x1, right);
      figure.y0 = Math.min(figure.y0, y);
      figure.y1 = Math.max(figure.y1, y);
    }
  }
  if (figure.y1 < 0) throw new HelfigurError('Bilden är bara skärm: ingen figur att mäta');
  if (!green.length) throw new HelfigurError('Bilden har ingen grön skärm att mäta mot');

  const across = Math.floor(width / GRID);
  const down = Math.floor(height / GRID);
  const cells = new Uint8Array(across * down);
  for (let gy = 0; gy < down; gy += 1) {
    for (let gx = 0; gx < across; gx += 1) {
      let hits = 0;
      for (let dy = 0; dy < GRID; dy += 1) {
        for (let dx = 0; dx < GRID; dx += 1) {
          const i = ((gy * GRID + dy) * width + gx * GRID + dx) * 3;
          if (isSkin(data[i]!, data[i + 1]!, data[i + 2]!)) hits += 1;
        }
      }
      if (hits >= (GRID * GRID) / 2) cells[gy * across + gx] = 1;
    }
  }
  const skin = parts(cells, across, down)
    .found.filter((part) => part.size >= SKIN_CELLS)
    .sort((a, b) => b.size - a.size)
    .map((part) => ({ x0: part.x0 * GRID, y0: part.y0 * GRID, x1: (part.x1 + 1) * GRID, y1: (part.y1 + 1) * GRID }));

  return {
    screen: [median(red), median(green), median(blue)],
    corner: screenColour(picture),
    figure,
    headCentre: Number(headCentre(figure.y0, figure.y1, (y) => rows[y] ?? null).toFixed(1)),
    skin,
  };
}

/** Händerna i en mätning: hudområdena som ligger helt inom handbandet, vänster i bild först. */
export function handsOf(measured: Measured, band: { y0: number; y1: number }): Box[] {
  return measured.skin.filter((part) => part.y0 > band.y0 && part.y1 < band.y1).sort((a, b) => a.x0 - b.x0);
}

export type HandMatch = {
  /** Kanternas skillnad mot mallens hand: min kant minus mallens. */
  offset: Box;
  /** Avståndet mellan rutornas mittpunkter, i bildpunkter. */
  distance: number;
  within: boolean;
};

/**
 * Varje hand mot mallens, i samma ordning. `within` är sant när lika många händer hittades som mallen har och alla
 * ligger högst `limit` bildpunkter från mallens. Hittas ett annat antal händer blir listan tom.
 */
export function matchHands(mine: Box[], reference: Box[], limit: number): { hands: HandMatch[]; within: boolean } {
  if (mine.length !== reference.length) return { hands: [], within: false };
  const hands = mine.map((hand, index) => {
    const hers = reference[index]!;
    const distance = Math.hypot((hand.x0 + hand.x1 - hers.x0 - hers.x1) / 2, (hand.y0 + hand.y1 - hers.y0 - hers.y1) / 2);
    return {
      offset: { x0: hand.x0 - hers.x0, y0: hand.y0 - hers.y0, x1: hand.x1 - hers.x1, y1: hand.y1 - hers.y1 },
      distance: Number(distance.toFixed(1)),
      within: distance <= limit,
    };
  });
  return { hands, within: hands.every((hand) => hand.within) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Sammanläggning: REDO på VILA

// Två bildpunkter skiljer sig när någon kanal skiljer mer än DIFFERS. En skillnad som är smalare än 2 × THIN + 1
// bildpunkter är en kant som har flyttat sig en aning och räknas inte. Det som är kvar vidgas med MARGIN, och övergången
// till VILA är mjuk över 2 × SOFT + 1 bildpunkter.
const DIFFERS = 24;
const THIN = 2;
const MARGIN = 8;
const SOFT = 3;

export type Composed = {
  picture: Picture;
  /** Varifrån varje bildpunkt är tagen: vitt ur REDO, svart ur VILA. */
  mask: Picture;
  report: {
    fromRedo: number;
    mixed: number;
    fromVila: number;
    /** Bildpunkter utanför området där REDO skilde sig från VILA på riktigt. De är tagna ur VILA. Noll är bäst. */
    changedOutside: number;
    /** Bildpunkter i den mjuka övergången där bilderna skiljer sig: där kan en skarv synas. Noll är bäst. */
    seam: number;
  };
};

/**
 * Den färdiga REDO-rutan: dealerns VILA, med armen som har flyttat sig tagen ur modellens REDO. Var bilderna skiljer sig
 * avgörs av bilderna själva, inom `region`. Överallt annars är REDO bildpunkt för bildpunkt som VILA, så att ett klipp
 * mellan dem bara rör armen.
 */
export function composeRedo(vila: Picture, redo: Picture, region: Box): Composed {
  sameSize(vila, redo);
  const { width, height } = vila;
  const differs = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 3;
    const most = Math.max(
      Math.abs(vila.data[i]! - redo.data[i]!),
      Math.abs(vila.data[i + 1]! - redo.data[i + 1]!),
      Math.abs(vila.data[i + 2]! - redo.data[i + 2]!),
    );
    if (most > DIFFERS) differs[p] = 1;
  }
  const real = grow(shrink(differs, width, height, THIN), width, height, THIN);
  const inside = (x: number, y: number) => x >= region.x0 && x <= region.x1 && y >= region.y0 && y <= region.y1;
  let changedOutside = 0;
  for (let p = 0; p < width * height; p += 1) {
    if (!real[p] || inside(p % width, Math.floor(p / width))) continue;
    real[p] = 0;
    changedOutside += 1;
  }
  const core = grow(real, width, height, MARGIN);
  for (let p = 0; p < width * height; p += 1) if (core[p] && !inside(p % width, Math.floor(p / width))) core[p] = 0;

  // Mjuk kant: andelen markerade bildpunkter i en kvadrat om 2 × SOFT + 1, räknad rad för rad och sedan kolumn för kolumn.
  const span = 2 * SOFT + 1;
  const across = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -SOFT; x < width; x += 1) {
      if (x + SOFT < width) sum += core[y * width + x + SOFT]!;
      if (x - SOFT - 1 >= 0) sum -= core[y * width + x - SOFT - 1]!;
      if (x >= 0) across[y * width + x] = sum;
    }
  }
  const weight = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -SOFT; y < height; y += 1) {
      if (y + SOFT < height) sum += across[(y + SOFT) * width + x]!;
      if (y - SOFT - 1 >= 0) sum -= across[(y - SOFT - 1) * width + x]!;
      if (y >= 0) weight[y * width + x] = sum;
    }
  }

  const full = span * span;
  const data = Buffer.alloc(vila.data.length);
  const mask = Buffer.alloc(vila.data.length);
  const report = { fromRedo: 0, mixed: 0, fromVila: 0, changedOutside, seam: 0 };
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 3;
    const part = weight[p]! / full;
    if (part === 0) report.fromVila += 1;
    else if (part === 1) report.fromRedo += 1;
    else {
      report.mixed += 1;
      if (differs[p]) report.seam += 1;
    }
    for (let c = 0; c < 3; c += 1) {
      data[i + c] = part === 0 ? vila.data[i + c]! : toByte(part * redo.data[i + c]! + (1 - part) * vila.data[i + c]!);
      mask[i + c] = Math.round(part * 255);
    }
  }
  return { picture: { data, width, height }, mask: { data: mask, width, height }, report };
}

// ---------------------------------------------------------------------------------------------------------------------
// Film

const run = promisify(execFile);

/** Tar bort ljudspåret ur en film utan att koda om bilden. */
export async function stripAudio(source: string, target: string): Promise<void> {
  mkdirSync(dirname(target), { recursive: true });
  await run('ffmpeg', ['-y', '-v', 'error', '-i', source, '-an', '-c:v', 'copy', '-movflags', '+faststart', target]);
}

/** Sparar `count` rutor ur en film, jämnt fördelade från den första till den sista, som PNG i `dir`. */
export async function filmFrames(film: string, dir: string, count: number): Promise<{ frame: number; path: string }[]> {
  const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', film]);
  const total = Number.parseInt(probe.stdout, 10);
  if (!(total > 0)) throw new HelfigurError(`${film}: hittar inga rutor`);
  const wanted = [...new Set(Array.from({ length: count }, (_, index) => Math.round((index * (total - 1)) / Math.max(1, count - 1))))];
  mkdirSync(dir, { recursive: true });
  const select = wanted.map((frame) => `eq(n\\,${frame})`).join('+');
  await run('ffmpeg', ['-y', '-v', 'error', '-i', film, '-vf', `select=${select}`, '-fps_mode', 'passthrough', join(dir, 'ruta-%02d.png')]);
  return wanted.map((frame, index) => ({ frame, path: join(dir, `ruta-${String(index + 1).padStart(2, '0')}.png`) }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Stegen från kommandoraden

/** Arbetsfilerna för en dealer, under output/work/<dealer>/. */
export function workFiles(root: string, dealer: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(dealer)) throw new HelfigurError(`Dealerns id får bara ha små bokstäver, siffror och bindestreck: ${dealer}`);
  const dir = join(root, 'output', 'work', dealer);
  return {
    dir,
    vilaBase: join(dir, 'underlag-vila.png'),
    vila: join(dir, 'vila-helfigur-bord.png'),
    redoBase: join(dir, 'underlag-redo.png'),
    /** Modellens REDO efter efterarbete, före sammanläggningen. */
    redoAlone: join(dir, 'redo-ensam.png'),
    redo: join(dir, 'redo-helfigur-bord.png'),
    redoMask: join(dir, 'redo-mask.png'),
    film: join(dir, 'helfigur-vila-redo.mp4'),
    frames: join(dir, 'rutor'),
  };
}

/** En bild i rutan mätt mot mallens ställning. */
export function measureAgainst(picture: Picture, pose: Pose, template: FigureFrame) {
  const measured = measureFigure(picture);
  const hands = handsOf(measured, template.handBand);
  const match = matchHands(hands, template.poses[pose].hands, template.handLimit.px);
  return {
    screen: measured.screen,
    corner: measured.corner,
    figure: measured.figure,
    headCentre: measured.headCentre,
    hands,
    handMatch: match.hands,
    within: match.within,
    reference: { figure: template.poses[pose].figure, hands: template.poses[pose].hands },
  };
}

async function main(args: string[]): Promise<unknown> {
  const root = process.env.STUDIO_DATA ? resolve(process.env.STUDIO_DATA) : resolve(import.meta.dirname, '..', '..');
  const template = readFigureFrame(root);
  const frame = readScene(JSON.parse(readFileSync(join(root, 'content', 'scene.json'), 'utf8'))).figure.frame;
  const green = template.green.rgb;
  const asset = (file: string) => join(root, 'assets', file);
  const isPose = (text: string | undefined): text is Pose => text === 'vila' || text === 'redo';
  const [step, first, second, third, fourth] = args;

  if (step === 'mat' && isPose(first) && second) {
    return measureAgainst(await loadPicture(second, frame), first, template);
  }
  if (!first) throw new HelfigurError('Säg vilket steg och vilken dealer. Stegen står överst i src/pipeline/helfigur.ts.');
  const files = workFiles(root, first);

  if (step === 'underlag' && second === 'vila') {
    await savePicture(vilaBase(await loadPicture(asset(template.reference.vila), frame), green), files.vilaBase);
    return { out: files.vilaBase, from: template.reference.vila };
  }
  if (step === 'underlag' && second === 'redo') {
    const base = redoBase(await loadPicture(files.vila), await loadPicture(asset(template.reference.redo), frame), template.redoPatch, green);
    await savePicture(base, files.redoBase);
    return { out: files.redoBase, from: [files.vila, template.reference.redo], patch: template.redoPatch };
  }
  if (step === 'fardig' && isPose(second) && third) {
    const { vila } = template.poses;
    const fit = fourth === 'passa' ? { top: vila.figure.y0, bottom: vila.figure.y1, headCentre: vila.headCentre } : undefined;
    const done = await finishFrame(await loadPicture(third), frame, green, fit);
    const out = second === 'vila' ? files.vila : files.redoAlone;
    await savePicture(done.picture, out);
    return { out, ...done.report, measured: measureAgainst(done.picture, second, template) };
  }
  if (step === 'lagg') {
    const done = composeRedo(await loadPicture(files.vila), await loadPicture(files.redoAlone), template.redoRegion);
    await savePicture(done.picture, files.redo);
    await savePicture(done.mask, files.redoMask);
    return { out: files.redo, mask: files.redoMask, ...done.report, measured: measureAgainst(done.picture, 'redo', template) };
  }
  if (step === 'film' && second) {
    await stripAudio(second, files.film);
    const frames = await filmFrames(files.film, files.frames, 5);
    const measured = [];
    for (const { frame: number, path } of frames) {
      const found = measureFigure(await loadPicture(path, frame));
      measured.push({ frame: number, path, screen: found.screen, figure: found.figure, hands: handsOf(found, template.handBand) });
    }
    return { out: files.film, frames: measured };
  }
  throw new HelfigurError('Okänt steg. Stegen står överst i src/pipeline/helfigur.ts.');
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await main(process.argv.slice(2)), null, 1));
  } catch (error) {
    if (!(error instanceof HelfigurError)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  }
}
