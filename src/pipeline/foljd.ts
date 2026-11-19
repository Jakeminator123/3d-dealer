// Följden: en tagning där dealern lägger flera kort i rad och står i REDO mellan givarna (tagning.ts forbered med fler
// kort, utan referensfilm). Här mäts den: första och sista rutan mot bilderna, när varje kort läggs där det sedan ligger
// och hur många stunder det blå ligger på platsen, rutan närmast REDO mellan två läggningar mot REDO med de kort som då ligger (första bilden med de
// lagda kortens rutor ur sista bilden), det gröna, givhanden i REDO, och om tagningen går att klippa vid REDO i bitar som
// kedjar i vilken ordning som helst. Korten följs i den ordning filmen lägger dem, som kan skilja från den givna. Bitarna
// skrivs som filmer i paketet, och rörelsen mäts i var och en (rorelse.ts), eftersom var och en är en cykel REDO →
// kortet lagt → REDO.
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
  clipBox,
  parts,
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
  /** Första bilden (REDO) och sista bilden (alla kort). REDO mellan givarna sätts ihop ur dem efter de kort som då ligger. */
  images: { first: Picture; last: Picture };
  key: Rgb;
  measure: Measure;
  motion: MotionMeasure;
  screen: Screen;
  limits: Record<string, Limit>;
  say: (text: string) => void;
};

/**
 * Ett kort i följden: när det läggs där det sedan ligger (`laid`, `laidFrame`; settledFrame), hur många stunder det
 * blå ligger på platsen (`stays`; 1 när kortet läggs en gång och ligger kvar), när det ligger kvar där till slutet utan
 * att täckas (`lands`, `frame`), när det är helt synligt, och hur väl och hur stilla det ligger.
 */
export type SequenceCardRead = { laid: number | null; laidFrame: number | null; stays: number; lands: number | null; frame: number | null; visible: number | null; least: number | null; overlap: number | null; centre: number | null; still: number | null };
export type SequenceRead = {
  values: Values;
  judged: Judged[];
  cards: SequenceCardRead[];
  /** Korten (deras nummer i given ordning, från 0) i den ordning de läggs där de sedan ligger. */
  order: number[];
  /**
   * Rutan närmast REDO mellan två läggningar i tidsordning, med PSNR mot REDO med de kort som då ligger (första bilden
   * med de lagda kortens rutor ur sista bilden), och vilket kort som lades före.
   */
  middles: { frame: number; at: number; psnr: number; after: number }[];
  /** Bitarnas första och sista ruta, kortet biten lägger (nummer i given ordning; null när filmen inget lägger) och filerna i paketet. */
  pieces: { from: number; to: number; card: number | null; file: string }[];
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

/**
 * Stunderna kortet ligger på sin plats (minst `least` blå bildpunkter där), med uppehåll på högst `gap` rutor räknade
 * som samma stund (en hand som går över kortet). Varje stund är [första, sista] ruta.
 */
export function staysOf(inside: number[], least: number, gap: number): [number, number][] {
  const stays: [number, number][] = [];
  for (const [k, n] of inside.entries()) {
    if (n < least) continue;
    const latest = stays.at(-1);
    if (latest && k - latest[1] - 1 <= gap) latest[1] = k;
    else stays.push([k, k]);
  }
  return stays;
}

/**
 * Rutan kortet läggs där det sedan ligger: början på den sista stunden det ligger på sin plats, när den räcker till
 * slutet (staysOf). Null när kortet inte ligger där i slutet.
 */
export function settledFrame(inside: number[], least: number, gap: number): number | null {
  const latest = staysOf(inside, least, gap).at(-1);
  return latest && latest[1] === inside.length - 1 ? latest[0] : null;
}

/**
 * Var bitarna börjar och slutar när tagningen klipps vid rutorna `cuts`: bit j går från sin första ruta till och med
 * nästa bits första, så att varje bit börjar och slutar i REDO, som ett vanligt klipp.
 */
export function piecesOf(frames: number, cuts: number[]): { from: number; to: number }[] {
  const bounds = [0, ...cuts, frames - 1];
  return bounds.slice(0, -1).map((from, j) => ({ from, to: bounds[j + 1]! }));
}

/** Korten (nummer från 0) i den ordning de läggs (rutorna `laid`); ett kort som inte läggs (null) står inte med. */
export function layingOrder(laid: (number | null)[]): number[] {
  return laid.map((frame, c) => ({ frame, c })).filter((one): one is { frame: number; c: number } => one.frame !== null).sort((a, b) => a.frame - b.frame || a.c - b.c).map((one) => one.c);
}

/** Första bilden med rutorna `boxes` ur sista bilden: REDO med de kort som då ligger. */
export function withCards(first: Picture, last: Picture, boxes: Box[]): Picture {
  const out: Picture = { data: Buffer.from(first.data), width: first.width, height: first.height };
  for (const box of boxes) {
    for (let y = Math.max(0, box.y0); y < Math.min(first.height, box.y1); y++) {
      const from = (y * first.width + Math.max(0, box.x0)) * 3;
      const to = (y * first.width + Math.min(first.width, box.x1)) * 3;
      last.data.copy(out.data, from, from, to);
    }
  }
  return out;
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

  // Första genomgången: det blå på varje kortplats, lösa blå kort och det gröna.
  const inside: number[][] = layouts.map(() => []);
  const centres: ({ x: number; y: number } | null)[][] = layouts.map(() => []);
  let green = 0;
  let firstPsnr: number | null = null;
  let lastPicture: Picture | null = null;
  // Blå kort utanför alla kortplatser i varje ruta, på bordet under axlarna: kortet som bärs (när det har vänts) och ett
  // kort som har dubblerats eller flyttat från sin plats.
  const table = clipBox({ x0: 0, y0: Math.min(...layouts.map((layout) => layout.low.y0)), x1: frame.width, y1: frame.height }, frame);
  const loose: number[] = [];
  const count = await eachFrame(clip, frame, (picture, k) => {
    loose.push(parts(picture, table, isBlue, measure.cardPart).filter((part) => !places.some((place) => inQuad(place.quad, part.c.x, part.c.y, measure.placeGrow + 6))).length);
    if (k === 0) firstPsnr = difference(picture, images.first).psnr;
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
    const least = measure.coverShare * place.area;
    const at = landingFrame(inside[c]!, least);
    // När kortet läggs där det sedan ligger: början på den sista stunden det ligger på platsen, med en hand som går över
    // det högst coveredLongest s (då flyttas `lands`, men inte läggningen). Ett blått kort som ligger där en stund och
    // flyttas därifrån räknas i `stays`: en plats där kort vänds, eller ett kort som flyttas efter att det lagts.
    const gap = Math.round(measure.coveredLongest * film.fps);
    const laid = settledFrame(inside[c]!, least, gap);
    const stays = staysOf(inside[c]!, least, gap).length;
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
    // Den minsta andelen av kortets blå i sista rutan som syns från att det är helt synligt till slutet: under 1 när något
    // täcker kortet eller det försvinner en stund.
    const final = inside[c]!.at(-1) ?? 0;
    const shown = visible !== null && final > 0 ? Math.min(...inside[c]!.slice(visible).map((n) => n / final)) : null;
    return {
      laid: laid === null ? null : round(laid / film.fps, 3),
      laidFrame: laid,
      stays,
      lands: at === null ? null : round(at / film.fps, 3),
      frame: at,
      visible: visible === null ? null : round(visible / film.fps, 3),
      least: shown === null ? null : round(shown, 3),
      overlap: blueOverlap(last, images.last, place.box),
      centre: painted && seen ? round(Math.hypot(painted.x - seen.x, painted.y - seen.y), 1) : null,
      still: still === null ? null : round(still, 1),
    };
  });

  // Korten i den ordning de läggs, som filmen visar den (den kan skilja från den givna). Ett kort som aldrig läggs har
  // ingen bit.
  const order = layingOrder(cards.map((card) => card.laidFrame));
  // REDO mellan två läggningar: rutan mellan dem som ligger närmast REDO med de kort som då ligger, i en andra genomgång.
  const expected = order.slice(0, -1).map((_, g) => withCards(images.first, images.last, order.slice(0, g + 1).map((c) => places[c]!.box)));
  const windows = order.slice(0, -1).map((c, g) => ({ from: cards[c]!.laidFrame!, to: cards[order[g + 1]!]!.laidFrame! - 1 }));
  const best: ({ frame: number; score: number } | null)[] = windows.map(() => null);
  await eachFrame(clip, frame, (picture, k) => {
    windows.forEach((window, g) => {
      if (k < window.from || k > window.to) return;
      const score = difference(picture, expected[g]!).psnr;
      if (!best[g] || score > best[g]!.score) best[g] = { frame: k, score };
    });
  });
  const middles = best.map((found, g) => {
    const chosen = found ?? { frame: windows[g]!.from, score: 0 };
    return { frame: chosen.frame, at: round(chosen.frame / film.fps, 3), psnr: chosen.score, after: order[g]! };
  });

  // Bitarna och rutorna intill deras ändar, i en tredje genomgång. Bit j lägger kort order[j]; lägger filmen inget kort
  // är hela tagningen en bit utan kort.
  const pieces = piecesOf(count, middles.map((middle) => middle.frame)).map((piece, j) => ({ ...piece, card: order[j] ?? null }));
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
    named(`mittRutan${j + 1}`, 'forstaRutan', middle.psnr, `rutan närmast REDO efter läggning ${j + 1} (kort ${middle.after + 1}; ruta ${middle.frame}, ${String(middle.at).replace('.', ',')} s) mot första bilden med de ${j + 1} kort som då ligger ur sista bilden, hela rutan`);
    values[`mittRutan${j + 1}Ruta`] = middle.frame;
  });
  values.lagdOrdning = order.map((c) => c + 1).join(' ');
  cards.forEach((card, c) => {
    values[`kort${c + 1}Lagd`] = card.laid;
    values[`kort${c + 1}Stunder`] = card.stays;
    values[`kort${c + 1}Ligger`] = card.lands;
    values[`kort${c + 1}Synligt`] = card.visible;
    values[`kort${c + 1}Minst`] = card.least;
    named(`kort${c + 1}Overlapp`, 'kortetsOverlapp', card.overlap, `kort ${c + 1}: det blå i sista rutan mot märkkortet i sista bilden (IoU)`);
    named(`kort${c + 1}Mitt`, 'kortetsMitt', card.centre, `kort ${c + 1}: det blås tyngdpunkt i sista rutan mot märkkortets i sista bilden`);
    named(`kort${c + 1}Rorelse`, 'kortetsRorelse', card.still, `kort ${c + 1}: det blås tyngdpunkt från att kortet är helt synligt till slutet, längst från sista rutans`);
  });
  // Lösa blå kort: flest i en ruta (1 är kortet som bärs), och kvar i sista rutan (0: inget kort utanför sin plats).
  values.losaBlaFlest = loose.length ? Math.max(...loose) : null;
  values.losaBlaSist = loose.at(-1) ?? null;
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
  return { values, judged, cards, order, middles, pieces: files, seams, chain };
}
