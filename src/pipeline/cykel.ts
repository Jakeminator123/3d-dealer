// Underlag för en cykel ur en vys närbild: var det lagda kortet ligger i bild, och sista bilden för filmbeställningen.
// En cykel (content/moves/cykel-*.json) börjar och slutar i REDO; sista bilden är REDO-ankaret med märkkortet lagt på
// kortplatsen. Kortets hörn räknas ur dockan och scenen (dollPose.ts, geometry.ts), aldrig ur bilden.
//
// Det här är ett bibliotek. Kommandot är src/pipeline/tagning.ts, som gör sista bilden (lastPicture) när en tagning
// förbereds och mäter klippet mot kortets hörn (cornersIn) när den tas emot.
//
// Vyn är `spelaren` eller `plats-N`, och alltid dess närbild. Kort är kortplatsens nummer på platsen, 0 för den första.
// Ingenting här avgör något i spelet: det räknar var dockan lägger kortet och målar det där.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import type { Rgb } from '../scene/dealer.ts';
import { readScene, type SceneDescription } from '../scene/description.ts';
import { MARK_BACK, MARK_FACE } from '../scene/doll.ts';
import { moveFor, poseAt, readCycle, readDoll, readMove, type CardPose, type DollCycle, type DollDescription, type DollMove } from '../scene/dollPose.ts';
import { framed, see, viewEye, type Eye, type Pixel, type SeatView } from '../scene/geometry.ts';

export class CycleError extends Error {}

const root = resolve(import.meta.dirname, '..', '..');

/** Det som behövs för att räkna en cykel: scenen, dockan, cykeln och dess giv, lästa ur content/. */
export type CycleParts = { scene: SceneDescription; doll: DollDescription; cycle: DollCycle; base: DollMove };

export function readCycleParts(name: string, from = root): CycleParts {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(name)) throw new CycleError(`Ogiltigt namn på cykeln: ${name}`);
  const json = (file: string): unknown => JSON.parse(readFileSync(join(from, 'content', file), 'utf8'));
  const cycle = readCycle(json(`moves/${name}.json`));
  return { scene: readScene(json('scene.json')), doll: readDoll(json('doll.json')), cycle, base: readMove(json(`moves/${cycle.give}.json`)) };
}

/** Vyn ur ett ord: `spelaren` eller `plats-N`, alltid närbilden. */
export function closeView(word = 'spelaren'): SeatView {
  if (word === 'spelaren') return { kind: 'spelaren', close: true };
  const seat = /^plats-(\d+)$/.exec(word)?.[1];
  if (!seat) throw new CycleError(`Okänd vy: ${word}. Skriv spelaren eller plats-N.`);
  return { kind: 'plats', seat: Number(seat), close: true };
}

/** Ögat en förlaga ur vyn ritas genom: vyns öga i förlagans ruta, som scenen tar det (build.ts, shoot). */
export const forlagaEye = (scene: SceneDescription, view: SeatView): Eye => framed(viewEye(scene, view), scene.forlaga.frame);

/** Det lagda kortet när cykeln till plats `seat` och kortplats `index` är slut. */
export function laidCard(parts: CycleParts, seat: number, index: number): CardPose {
  const { scene, doll, cycle, base } = parts;
  const move = moveFor(scene, doll, base, seat, { index, cycle });
  const laid = poseAt(scene, doll, move, move.seconds).laid;
  if (!laid) throw new CycleError(`Cykeln till plats ${seat}, kort ${index}, slutar utan lagt kort`);
  return laid;
}

/** Ett korts hörn i bild, i hörnens ordning (se CardPose). */
export function cornersIn(eye: Eye, card: CardPose): Pixel[] {
  return card.corners.map((corner) => {
    const pixel = see(eye, corner);
    if (!pixel) throw new CycleError('Kortet ligger bakom ögat');
    return pixel;
  });
}

const rgbOf = (colour: number): Rgb => [(colour >> 16) & 255, (colour >> 8) & 255, colour & 255];

/** Märkkortets färg för sidan som är upp: gul baksida eller blå framsida, som dockan ritar dem (doll.ts). */
export const markColour = (card: CardPose): Rgb => rgbOf(card.up === 'framsida' ? MARK_FACE : MARK_BACK);

/**
 * Hud: rödare än grön och blå. Samma gräns som när märkkortet målades i ankarna till given (output/work/giv-4/mala-kort.ts),
 * och som tagningens mätningar letar givhanden med (matning.ts). Dealerns krämvita blus räknas också som hud.
 */
export const isSkin = (r: number, g: number, b: number): boolean => r > 105 && r > g + 8 && g >= b - 6 && r - b > 22;

/**
 * Målar en fyrhörning enfärgad i en bild (RGB, tre kanaler, rad för rad). Hörnen är bildpunkternas mitt och går runt åt
 * ett håll. Kanten täcks i den mån bildpunkten ligger inom fyrhörningen, så att den blir jämn. Hud lämnas: en hand som
 * ligger över kortet ska synas över det. Svaret säger hur många bildpunkter som målades och hur många som lämnades.
 */
export function paintQuad(data: Buffer, width: number, height: number, quad: Pixel[], colour: Rgb): { painted: number; spared: number } {
  if (data.length !== width * height * 3) throw new CycleError('Bilden ska ha tre kanaler');
  const centre = { x: quad.reduce((sum, p) => sum + p.x, 0) / quad.length, y: quad.reduce((sum, p) => sum + p.y, 0) / quad.length };
  // Hur långt in i fyrhörningen en punkt ligger, i bildpunkter: positivt inne, negativt ute.
  const inside = (x: number, y: number): number => {
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
  };
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  let painted = 0;
  let spared = 0;
  for (let y = Math.max(0, Math.floor(Math.min(...ys)) - 1); y <= Math.min(height - 1, Math.ceil(Math.max(...ys)) + 1); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs)) - 1); x <= Math.min(width - 1, Math.ceil(Math.max(...xs)) + 1); x++) {
      const cover = Math.max(0, Math.min(1, inside(x, y) + 0.5));
      if (cover === 0) continue;
      const p = (y * width + x) * 3;
      if (isSkin(data[p]!, data[p + 1]!, data[p + 2]!)) {
        spared++;
        continue;
      }
      for (let c = 0; c < 3; c++) data[p + c] = Math.round(colour[c]! * cover + data[p + c]! * (1 - cover));
      painted++;
    }
  }
  return { painted, spared };
}

/** Sista bilden: ankaret med märkkortet målat där cykeln lägger det, sett genom vyns närbild. */
export async function lastPicture(parts: CycleParts, anchor: string, seat: number, index: number, out: string, view: SeatView) {
  const eye = forlagaEye(parts.scene, view);
  const { width, height } = eye.frame;
  const card = laidCard(parts, seat, index);
  const quad = cornersIn(eye, card);
  const image = sharp(anchor);
  const meta = await image.metadata();
  if (meta.width !== width || meta.height !== height) throw new CycleError(`Ankaret är ${meta.width} × ${meta.height}; vyns ruta är ${width} × ${height}`);
  const data = await image.removeAlpha().raw().toBuffer();
  const colour = markColour(card);
  const { painted, spared } = paintQuad(data, width, height, quad, colour);
  await sharp(data, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 9 }).toFile(out);
  return { seat, index, corners: quad.map((p) => [round(p.x), round(p.y)]), side: card.up, colour, painted, spared };
}

const round = (value: number): number => Math.round(value * 100) / 100;

