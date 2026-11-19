// Följden: en tagning där dealern lägger flera kort i rad och står i REDO mellan givarna (tagning.ts forbered med fler
// kort, utan referensfilm). Här mäts den: första och sista rutan mot bilderna, rutan närmast REDO mellan givarna mot
// REDO med de kort som då ligger (mitt-k.png), när och var varje kort landar, det gröna, givhanden i REDO, och om
// tagningen går att klippa vid REDO i bitar som kedjar i vilken ordning som helst. Bitarna skrivs som filmer i paketet,
// och rörelsen mäts i var och en (rorelse.ts), eftersom var och en är en cykel REDO → kortet lagt → REDO.
//
// Skarven mellan två bitar mäts som skarven i en vanlig tagning (matning.ts, seamSteps): steget från den ena bitens sista
// ruta till den andras första mot stegen intill, i huvud, bål, vilande hand, mynning och sko. Korten på bordet räknas
// inte där: de läggs av scenen.

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  blueOverlap,
  difference,
  eachFrame,
  greenOff,
  grow,
  handIn,
  inQuad,
  isBlue,
  judgeOne,
  otherSkin,
  quadArea,
  seamSteps,
  union,
  type Box,
  type Judged,
  type Layout,
  type Limit,
  type Measure,
  type Picture,
  type Probe,
  type Rgb,
  type Values,
} from './matning.ts';
import { filmMotion, MotionError, motionNumbers, type MotionMeasure, type Screen } from './rorelse.ts';

const run = promisify(execFile);
const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

/** Det följden mäts med: rutorna för varje kort, bilderna, skärmens färg och måttens tal och gränser. */
export type SequenceInput = {
  clip: string;
  dir: string;
  film: Probe;
  /** En layout per kort, i given ordning (matning.ts, layoutFor). Regionerna är desamma för alla. */
  layouts: Layout[];
  /** Första bilden (REDO), bilderna mellan givarna (REDO med de k första korten) och sista bilden (alla kort). */
  images: { first: Picture; middles: Picture[]; last: Picture };
  key: Rgb;
  measure: Measure;
  motion: MotionMeasure;
  screen: Screen;
  limits: Record<string, Limit>;
  say: (text: string) => void;
};

export type SequenceCardRead = { lands: number | null; frame: number | null; visible: number | null; overlap: number | null; centre: number | null; still: number | null };
export type SequenceRead = {
  values: Values;
  judged: Judged[];
  cards: SequenceCardRead[];
  /** Rutan närmast REDO mellan givarna, en per mellanrum, med PSNR mot mitt-k.png. */
  middles: { frame: number; at: number; psnr: number }[];
  /** Bitarnas första och sista ruta, och filerna i paketet. */
  pieces: { from: number; to: number; file: string }[];
  /** Skarven när bit `from` följs av bit `to`, i huvudet, bålen, den vilande handen, mynningen och skon: den värsta. */
  seams: { from: number; to: number; beyond: number; region: string }[];
  chain: string;
};

/**
 * Första rutan från vilken kortet ligger på sin plats till slutet: minst `least` blå bildpunkter inom kortplatsen i
 * varje ruta därifrån. Null när kortet aldrig ligger kvar.
 */
export function landingFrame(inside: number[], least: number): number | null {
  let at: number | null = null;
  for (let k = inside.length - 1; k >= 0; k--) {
    if (inside[k]! < least) break;
    at = k;
  }
  return at;
}

/** Rutan med störst värde mellan `from` och `to` (båda med), eller null när fönstret är tomt. */
export function bestIn(scores: number[], from: number, to: number): { frame: number; score: number } | null {
  let best: { frame: number; score: number } | null = null;
  for (let k = Math.max(0, from); k <= Math.min(scores.length - 1, to); k++) if (!best || scores[k]! > best.score) best = { frame: k, score: scores[k]! };
  return best;
}

/**
 * Var bitarna börjar och slutar när tagningen klipps vid rutorna `cuts`: bit j går från sin första ruta till och med
 * nästa bits första, så att varje bit börjar och slutar i REDO, som ett vanligt klipp.
 */
export function piecesOf(frames: number, cuts: number[]): { from: number; to: number }[] {
  const bounds = [0, ...cuts, frames - 1];
  return bounds.slice(0, -1).map((from, j) => ({ from, to: bounds[j + 1]! }));
}

const REGIONS = ['head', 'torso', 'rest', 'mouth', 'shoe'] as const;
const REGION_WORDS: Record<(typeof REGIONS)[number], string> = { head: 'huvud', torso: 'bål', rest: 'vilande hand', mouth: 'mynning', shoe: 'sko' };

/** Mäter följden. Se överst i filen. */
export async function measureSequence(input: SequenceInput): Promise<SequenceRead> {
  const { clip, dir, film, layouts, images, key, measure, limits, say } = input;
  const frame = layouts[0]!.frame;
  if (film.width !== frame.width || film.height !== frame.height) throw new MotionError(`Klippet är ${film.width} × ${film.height}; rutan är ${frame.width} × ${frame.height}`);
  const regions = layouts[0]!.regions;
  const boxes = REGIONS.map((name) => regions[name]);
  // Kortens rutor räknas inte i skarven: där ligger olika många kort i bitarnas ändar, och scenen lägger dem.
  const cardsBox = grow(union(...layouts.map((layout) => layout.cardBox)), 12);
  const places = layouts.map((layout) => ({ quad: layout.corners, box: grow(layout.cardBox, measure.placeGrow + 2), area: quadArea(layout.corners) }));

  // Första genomgången: varje ruta mot bilderna mellan givarna, det blå på varje kortplats och det gröna.
  const toMiddle: number[][] = images.middles.map(() => []);
  const inside: number[][] = layouts.map(() => []);
  const centres: ({ x: number; y: number } | null)[][] = layouts.map(() => []);
  let green = 0;
  let firstPsnr: number | null = null;
  let lastPicture: Picture | null = null;
  const count = await eachFrame(clip, frame, (picture, k) => {
    if (k === 0) firstPsnr = difference(picture, images.first).psnr;
    images.middles.forEach((middle, j) => toMiddle[j]!.push(difference(picture, middle).psnr));
    places.forEach((place, c) => {
      let n = 0;
      let sx = 0;
      let sy = 0;
      for (let y = Math.max(0, place.box.y0); y < Math.min(frame.height, place.box.y1); y++) {
        for (let x = Math.max(0, place.box.x0); x < Math.min(frame.width, place.box.x1); x++) {
          const i = (y * frame.width + x) * 3;
          if (!isBlue(picture.data[i]!, picture.data[i + 1]!, picture.data[i + 2]!) || !inQuad(place.quad, x, y, measure.placeGrow)) continue;
          n++;
          sx += x;
          sy += y;
        }
      }
      inside[c]!.push(n);
      centres[c]!.push(n ? { x: sx / n, y: sy / n } : null);
    });
    if (k % measure.greenEvery === 0) green = Math.max(green, greenOff(picture, key, measure.greenInner, measure.greenOff));
    lastPicture = picture;
  });
  const last = lastPicture as Picture | null;
  if (!last) throw new MotionError(`${clip} har inga rutor`);
  green = Math.max(green, greenOff(last, key, measure.greenInner, measure.greenOff));

  // Korten: när vart och ett ligger kvar på sin plats till slutet (minst coverShare av kortets yta blått), hur väl det
  // ligger där sista bilden visar det, och hur stilla det ligger därefter.
  const lastCentre = (picture: Picture, c: number): { x: number; y: number } | null => {
    const place = places[c]!;
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (let y = place.box.y0; y < place.box.y1; y++) {
      for (let x = place.box.x0; x < place.box.x1; x++) {
        const i = (y * picture.width + x) * 3;
        if (isBlue(picture.data[i]!, picture.data[i + 1]!, picture.data[i + 2]!) && inQuad(place.quad, x, y, measure.placeGrow)) {
          n++;
          sx += x;
          sy += y;
        }
      }
    }
    return n ? { x: sx / n, y: sy / n } : null;
  };
  const cards: SequenceCardRead[] = places.map((place, c) => {
    const at = landingFrame(inside[c]!, measure.coverShare * place.area);
    // Hur stilla kortet ligger mäts som i en vanlig tagning från att det är helt synligt (measure.visibleShare av det blå i
    // sista rutan, och så till slutet): fingrar som knuffar kortet flyttar det blås tyngdpunkt.
    const visible = landingFrame(inside[c]!, measure.visibleShare * (inside[c]!.at(-1) ?? 0));
    const painted = lastCentre(images.last, c);
    const seen = centres[c]!.at(-1) ?? null;
    let still: number | null = null;
    if (visible !== null && seen) for (let k = visible; k < count; k++) {
      const point = centres[c]![k];
      if (point) still = Math.max(still ?? 0, Math.hypot(point.x - seen.x, point.y - seen.y));
    }
    return {
      lands: at === null ? null : round(at / film.fps, 3),
      frame: at,
      visible: visible === null ? null : round(visible / film.fps, 3),
      overlap: blueOverlap(last, images.last, place.box),
      centre: painted && seen ? round(Math.hypot(painted.x - seen.x, painted.y - seen.y), 1) : null,
      still: still === null ? null : round(still, 1),
    };
  });

  // Rutan närmast REDO mellan givarna: mellan att kort k och kort k + 1 landar, eller i sin del av tagningen när ett
  // kort inte landar.
  const share = count / layouts.length;
  const middles = images.middles.map((_, j) => {
    const from = cards[j]!.frame ?? Math.round(share * (j + 0.5));
    const to = (cards[j + 1]!.frame ?? Math.round(share * (j + 1.5))) - 1;
    const best = bestIn(toMiddle[j]!, from, to) ?? bestIn(toMiddle[j]!, 1, count - 2)!;
    return { frame: best.frame, at: round(best.frame / film.fps, 3), psnr: best.score };
  });

  // Bitarna och rutorna intill deras ändar, i en andra genomgång.
  const pieces = piecesOf(count, middles.map((middle) => middle.frame));
  const wanted = new Set(pieces.flatMap((piece) => [piece.from, piece.from + 1, piece.to - 1, piece.to]));
  const kept = new Map<number, Picture>();
  await eachFrame(clip, frame, (picture, k) => {
    if (wanted.has(k)) kept.set(k, picture);
  });
  const pic = (k: number): Picture => kept.get(k)!;

  // Skarven när bit a följs av bit b, för varje ordning utom den som tagningen själv har (bit j följd av bit j + 1).
  const seams: SequenceRead['seams'] = [];
  for (const [a, from] of pieces.entries()) {
    for (const [b, to] of pieces.entries()) {
      if (b === a + 1) continue;
      const steps = seamSteps({ last: pic(from.to), beforeLast: pic(from.to - 1), first: pic(to.from), second: pic(to.from + 1) }, boxes, cardsBox);
      const worst = steps.reduce((most, step, k) => (step.beyond > most.beyond ? { beyond: step.beyond, k } : most), { beyond: -1, k: 0 });
      seams.push({ from: a + 1, to: b + 1, beyond: round(worst.beyond), region: REGION_WORDS[REGIONS[worst.k]!] });
    }
  }

  // Givhanden i REDO: i början, mellan givarna och i slutet, mot första bildens.
  const layout = layouts[0]!;
  const other = otherSkin(images.first, layout.grip, measure.maskGrow, measure.cardPart);
  const base = handIn(images.first, layout.handBox, other, measure.cardPart);
  const redoFrames = [0, ...middles.map((middle) => middle.frame), count - 1];
  const handRatios = base ? redoFrames.map((k) => handIn(pic(k), layout.handBox, other, measure.cardPart)).map((hand) => (hand ? hand.w / base.w : null)) : [];
  const knownRatios = handRatios.filter((ratio): ratio is number => ratio !== null);
  const handIRedo = knownRatios.length ? round(knownRatios.reduce((most, ratio) => (Math.abs(ratio - 1) > Math.abs(most - 1) ? ratio : most), 1), 3) : null;

  // Bitarna som filmer, och bit 2 följd av bit 1 (och så vidare baklänges) som en film att se skarven i.
  const files: SequenceRead['pieces'] = [];
  for (const [j, piece] of pieces.entries()) {
    const file = `bit-${j + 1}.mp4`;
    await run('ffmpeg', ['-v', 'error', '-y', '-i', clip, '-vf', `select=between(n\\,${piece.from}\\,${piece.to}),setpts=N/${film.fps}/TB`, '-an', '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', join(dir, file)]);
    files.push({ ...piece, file });
  }
  const chain = 'baklanges.mp4';
  const backwards = [...files].reverse();
  await run('ffmpeg', ['-v', 'error', '-y', ...backwards.flatMap((piece) => ['-i', join(dir, piece.file)]), '-filter_complex', `${backwards.map((_, k) => `[${k}:v]`).join('')}concat=n=${backwards.length}:v=1:a=0[v]`, '-map', '[v]', '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', join(dir, chain)]);

  // Rörelsen i varje bit, som i en vanlig tagning (rorelse.ts).
  const values: Values = { forstaRutan: firstPsnr, sistaRutan: difference(last, images.last).psnr, gront: green, handIRedo };
  const judged: Judged[] = [];
  const named = (key: string, limitKey: string, value: number | null, what: string): void => {
    values[key] = value;
    const limit = limits[limitKey];
    if (limit) judged.push({ ...judgeOne(limitKey, value, limit), key, what });
  };
  for (const name of ['forstaRutan', 'sistaRutan', 'gront', 'handIRedo'] as const) if (limits[name]) judged.push(judgeOne(name, values[name] as number | null, limits[name]!));
  middles.forEach((middle, j) => {
    named(`mittRutan${j + 1}`, 'forstaRutan', middle.psnr, `rutan närmast REDO efter kort ${j + 1} (ruta ${middle.frame}, ${String(middle.at).replace('.', ',')} s) mot REDO med de kort som då ligger (mitt-${j + 1}.png), hela rutan`);
    values[`mittRutan${j + 1}Ruta`] = middle.frame;
  });
  cards.forEach((card, c) => {
    values[`kort${c + 1}Ligger`] = card.lands;
    values[`kort${c + 1}Synligt`] = card.visible;
    named(`kort${c + 1}Overlapp`, 'kortetsOverlapp', card.overlap, `kort ${c + 1}: det blå i sista rutan mot märkkortet i sista bilden (IoU)`);
    named(`kort${c + 1}Mitt`, 'kortetsMitt', card.centre, `kort ${c + 1}: det blås tyngdpunkt i sista rutan mot märkkortets i sista bilden`);
    named(`kort${c + 1}Rorelse`, 'kortetsRorelse', card.still, `kort ${c + 1}: det blås tyngdpunkt från att kortet är helt synligt till slutet, längst från sista rutans`);
  });
  for (const seam of seams) named(`skarvBit${seam.from}Bit${seam.to}`, 'skarvRegion', seam.beyond, `skarven när bit ${seam.from} följs av bit ${seam.to}: steget utöver grannstegen, värsta region (${seam.region})`);
  for (const [j, piece] of files.entries()) {
    try {
      const motion = motionNumbers((await filmMotion(join(dir, piece.file), input.motion, input.screen, true, true)).values);
      for (const [name, value] of Object.entries(motion)) if (value !== null) named(`${name}Bit${j + 1}`, name, value, `bit ${j + 1}: ${limits[name]?.what ?? name}`);
    } catch (error) {
      if (!(error instanceof MotionError)) throw error;
      say(`Rörelsen i bit ${j + 1} gick inte att mäta: ${error.message}`);
    }
  }
  return { values, judged, cards, middles, pieces: files, seams, chain };
}
