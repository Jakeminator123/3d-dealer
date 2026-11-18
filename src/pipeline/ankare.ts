// Ankaret: ett REDO-ankare för en dealer ur en vy, från dockans underlag till posten i registret, på ett och samma sätt
// för varje dealer och vy. Runways MCP-server kan bara en agent anropa: koden förbereder allt före anropen och gör allt
// efter. Receptet står i docs/production.md (Ankaret), talen och texterna i content/ankare.json.
//
//   node src/pipeline/ankare.ts förbered <dealer> <vy> [--underlag <png>]
//     Sparar dockans REDO ur vyns närbild i ateljén (underlaget; med --underlag en som redan finns, med sin .json),
//     samlar identitetsbilderna (dealerns fil, content/dealers/<dealer>.json) förminskade, skriver texterna för de två
//     bildstegen (ställning, sedan likhet) ur content/ankare.json och dealerns ord, och skriver paketet
//     output/ankare/<dealer>_<vy>_redo-<n>/ med bestallning.json: allt agenten behöver för anropen. Dockans punkter i
//     bild (grepp, kort, händer, bordskant) räknas här, genom underlagets öga, och står i paketet.
//   node src/pipeline/ankare.ts ta-emot <id> [<ställning> <likhet>]
//     Tar bildmodellernas bilder (eller de som kvitto.json i paketet pekar ut) och gör de lokala stegen
//     (src/pipeline/ankarbild.ts): huvudet ur likheten på ställningen om likheten flyttade sko eller bordskant, händerna
//     krympta till dockans storlek, det gula kortet målat där dockans står, allt som inte är dealer, sko eller kort
//     plattat till skärmens gröna, kläderna ned till bordskanten och det minsta rent. Mäter bilden mot underlaget med
//     gränserna i content/ankare.json, gör arket, och för in ankaret (att granska, med ögat och skons läge), de två
//     beställningarna ur kvitto.json och måtten i registret.
//   node src/pipeline/ankare.ts använd <dealer> <vy> <fil>
//     Pekar ut ett godkänt ankare som vyns REDO i dealerns fil (anchors.redo), som tagning.ts forbered sedan läser.
//
// Vyn är `spelaren` eller `plats-N`. STUDIO_DATA pekar ut en annan mapp med content/, assets/ och registret.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import type { FilmEye } from '../scene/dealer.ts';
import { MARK_BACK } from '../scene/doll.ts';
import { poseAt } from '../scene/dollPose.ts';
import { see, type Eye, type Pixel, type SeatView } from '../scene/geometry.ts';
import * as bild from './ankarbild.ts';
import { closeView, cornersIn, cycleEye, cycleMove, readCycleParts, type CycleCard, type CycleParts } from './cykel.ts';
import { DealerError, dealerFile, fillParagraphs, placeholdersOf, readDealer, readMall, roleFile, wordKeys, wordsOf, writeDealer, type Dealer, type Words } from './dealer.ts';
import { clipBox, edgeRow, gapIn, greenOff, grow, isYellow, judgeOne, layoutFor, parts as partsIn, union, type Box, type Judged, type Limit, type Picture, type Rgb } from './matning.ts';
import { addMeasurement, addOrder, addUpload, getEntry, importAsset, readRegistry, sha256Of, stamp, studioRoot, type Order, type Post } from './registry.ts';
import { shootAll } from './shoot.ts';
import { readTagning } from './tagning.ts';

export class AnkareError extends Error {}

const CODE = resolve(import.meta.dirname, '..', '..');
const WHO = 'src/pipeline/ankare.ts';
/** Var paketen ligger, räknat från projektmappen. */
export const PACKAGES = 'output/ankare';

// ---------------------------------------------------------------------------------------------------------------------
// content/ankare.json

export type ImageStep = {
  step: 'ställning' | 'likhet';
  tool: string;
  model: string;
  sideModel?: string;
  imageSize: string;
  ratio: string;
  outputFormat?: string;
  credits: number;
  references: { tag: string; from: string }[];
  text: string[];
};
export type AnkareContent = {
  underlag: { move: string; seat: number; index: number };
  steps: ImageStep[];
  words: Record<string, string>;
  order: { reference: number };
  local: {
    flatten: bild.FlattenOptions & { sample: [number, number, number, number] };
    hands: bild.HandOptions & { area: number; least: number; most: number; keep: number };
    head: { collar: number; reach: number };
    waist: bild.WaistOptions;
    clean: { holeMost: number; spotMost: number; keepLeast: number; holeSmall: number };
    edges: { every: number; rows: number; least: number; most: number };
  };
  limits: Record<string, Limit>;
};

const ANKARE_WORDS = ['grid', 'gaze'];

export function readAnkare(root = studioRoot()): AnkareContent {
  const read = JSON.parse(readFileSync(join(root, 'content', 'ankare.json'), 'utf8')) as AnkareContent & Record<string, { basis?: unknown; source?: unknown }>;
  const wrong: string[] = [];
  for (const group of ['underlag', 'words', 'order', 'local', 'limits'] as const) {
    const marked = read[group] as { basis?: unknown; source?: unknown } | undefined;
    if (!((marked?.basis === 'mätt' || marked?.basis === 'antaget') && typeof marked?.source === 'string')) wrong.push(`${group}: basis och source`);
  }
  const mall = readMall(root);
  const known = [...wordKeys(mall), ...ANKARE_WORDS];
  const names = read.steps?.map((step) => step.step) ?? [];
  if (names.join(',') !== 'ställning,likhet') wrong.push('steps: ställning, sedan likhet');
  for (const step of read.steps ?? []) {
    for (const reference of step.references) {
      if (reference.from !== 'underlag' && reference.from !== 'ställning' && !mall.roles[reference.from]?.need) wrong.push(`steps.${step.step}: referensen ${reference.tag} är ur ${reference.from}, varken underlaget, ställningen eller ett slag linjen behöver`);
    }
    const unknown = placeholdersOf(step.text.join(' ')).filter((key) => !known.includes(key));
    if (unknown.length > 0) wrong.push(`steps.${step.step}: okända ord ${unknown.join(', ')}`);
  }
  const limits = Object.fromEntries(Object.entries(read.limits ?? {}).filter(([key]) => key !== 'basis' && key !== 'source')) as Record<string, Limit>;
  for (const [key, limit] of Object.entries(limits)) if (typeof limit.what !== 'string' || typeof limit.source !== 'string') wrong.push(`limits.${key}: what och source`);
  if (wrong.length > 0) throw new AnkareError(`content/ankare.json går inte att använda: ${wrong.join('; ')}`);
  const words = Object.fromEntries(Object.entries(read.words).filter(([key]) => key !== 'basis' && key !== 'source')) as Record<string, string>;
  return { ...read, words, limits };
}

/** Texten för ett bildsteg, fylld med dealerns ord och ankarets egna (rutnätets steg, blicken i REDO). */
export function stepText(content: AnkareContent, step: ImageStep, words: Words, gridMetres: number): string {
  const own: Words = { grid: `${Math.round(gridMetres * 100)} cm` };
  const base = { ...words, ...own };
  for (const [key, text] of Object.entries(content.words)) own[key] = fillParagraphs(text, base);
  return fillParagraphs(step.text, { ...words, ...own });
}

/** Modellen för ett steg ur vyn: från sidan (plats N utom 4) sideModel, när steget har en. */
export const modelFor = (step: ImageStep, view: SeatView): string => (view.kind === 'plats' && view.seat !== 4 && step.sideModel ? step.sideModel : step.model);

// ---------------------------------------------------------------------------------------------------------------------
// Namnen

const VIEW = /^(spelaren|plats-[1-9])$/;
/** Ankarets filnamn: <vy>-redo.png för det första, sedan <vy>-redo-2.png och framåt. */
export const anchorName = (view: string, n: number): string => (n === 1 ? `${view}-redo.png` : `${view}-redo-${n}.png`);
export const anchorFileOf = (dealer: string, view: string, n: number): string => `dealers/${dealer}/anchors/${anchorName(view, n)}`;
export const packageIdOf = (dealer: string, view: string, n: number): string => `${dealer}_${view}_redo-${n}`;

/** Nästa nummer: ett mer än det högsta som har en post, en fil eller ett paket. */
export function nextNumber(root: string, dealer: string, view: string, out = join(root, PACKAGES)): number {
  const pattern = new RegExp(`^${view}-redo(?:-(\\d+))?\\.png$`);
  const taken: number[] = [];
  const mark = (name: string) => {
    const match = pattern.exec(name);
    if (match) taken.push(match[1] ? Number(match[1]) : 1);
  };
  if (existsSync(join(root, 'content', 'register.db'))) for (const entry of readRegistry(root).assets) if (entry.file.startsWith(`dealers/${dealer}/anchors/`)) mark(entry.file.split('/').at(-1)!);
  const dir = join(root, 'assets', 'dealers', dealer, 'anchors');
  if (existsSync(dir)) for (const name of readdirSync(dir)) mark(name);
  if (existsSync(out)) for (const name of readdirSync(out)) {
    const match = new RegExp(`^${dealer}_${view}_redo-(\\d+)$`).exec(name);
    if (match) taken.push(Number(match[1]));
  }
  return taken.length ? Math.max(...taken) + 1 : 1;
}

// ---------------------------------------------------------------------------------------------------------------------
// Dockan i bild

/** Dockans punkter i REDO, sedda genom underlagets öga: det de lokala stegen och måtten behöver. Står i paketet. */
export type DollPoints = {
  grip: Pixel;
  mouth: Pixel;
  card: Pixel[];
  give: { hand: Pixel; wrist: Pixel; along: Pixel };
  rest: { hand: Pixel; wrist: Pixel; along: Pixel };
  head: { x: number; y: number; radius: number };
  edge: [Pixel, Pixel];
  dealer: Box;
  mouthBox: Box;
  shoe: Box;
  waist: [number, number];
};

const mean = (points: Pixel[]): Pixel => ({ x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length });
const roundPixel = (p: Pixel): Pixel => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });

export function dollPoints(parts: CycleParts, view: SeatView, content: AnkareContent, root: string): DollPoints {
  const card: CycleCard = { seat: content.underlag.seat, index: content.underlag.index, action: 'deal' };
  const measure = readTagning(root).measure;
  const layout = layoutFor(parts, view, card, measure);
  const eye = cycleEye(parts, view);
  const redo = poseAt(parts.scene, parts.doll, cycleMove(parts, card), 0);
  const at = (point: readonly number[]): Pixel => {
    const pixel = see(eye, point as [number, number, number]);
    if (!pixel) throw new AnkareError('En av dockans punkter ligger bakom ögat');
    return pixel;
  };
  const arm = (side: 'left' | 'right') => {
    const wrist = at(redo.arms[side].wrist);
    const elbow = at(redo.arms[side].elbow);
    const length = Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y) || 1;
    return { hand: roundPixel(mean(redo.hands[side].map(at))), wrist: roundPixel(wrist), along: { x: (wrist.x - elbow.x) / length, y: (wrist.y - elbow.y) / length } };
  };
  const head = at(redo.head);
  const depth = Math.hypot(redo.head[0] - eye.position[0], redo.head[1] - eye.position[1], redo.head[2] - eye.position[2]);
  if (!redo.card) throw new AnkareError('Dockan håller inget kort i REDO');
  return {
    grip: roundPixel(layout.grip),
    mouth: roundPixel(layout.mouth),
    card: cornersIn(eye, redo.card).map(roundPixel),
    give: arm('left'),
    rest: arm('right'),
    head: { x: Math.round(head.x), y: Math.round(head.y), radius: Math.round((eye.focalPx * parts.doll.body.head.radius) / depth) },
    edge: [roundPixel(layout.edge[0]), roundPixel(layout.edge[1])],
    dealer: layout.dealer,
    mouthBox: layout.regions.mouth,
    shoe: clipBox(grow(union(layout.regions.shoe, layout.regions.mouth), 40), layout.frame),
    waist: [Math.round(layout.waist[0]), Math.round(layout.waist[1])],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// förbered

type GuideJson = { eye: Omit<Eye, 'frame'>; frame: Eye['frame']; savedAt?: string; dealer?: unknown };
const posix = (path: string): string => path.replaceAll('\\', '/');
const write = (path: string, value: unknown): void => writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);
const viewOf = (word: string): SeatView => {
  if (!VIEW.test(word)) throw new AnkareError(`Okänd vy: ${word}. Skriv spelaren eller plats-N.`);
  const view = closeView(word);
  return view.kind === 'plats' ? { kind: 'plats', seat: view.seat } : { kind: 'spelaren' };
};
const eyeOf = (guide: GuideJson): FilmEye => ({ position: [...guide.eye.position] as [number, number, number], forward: [...guide.eye.forward] as [number, number, number], focalPx: guide.eye.focalPx, frame: { width: guide.frame.width, height: guide.frame.height } });

export type PrepareOptions = { root?: string; out?: string; underlag?: string; say?: (text: string) => void };
export type Prepared = { id: string; dir: string; order: Record<string, unknown> };

/** Dockans REDO ur vyns närbild i ateljén, sparad av scenen (shoot.ts). Svaret är bilden, räknad från `root`. */
async function shootGuide(root: string, content: AnkareContent, view: SeatView, label: string, say: (text: string) => void): Promise<string> {
  const scene = JSON.parse(readFileSync(join(root, 'content', 'scene.json'), 'utf8')) as { studio: { colours: unknown } };
  const order = {
    view: { ...view, close: true },
    dealer: { kind: 'docka', move: content.underlag.move, pose: 'giv', seat: content.underlag.seat, index: content.underlag.index },
    background: null,
    studio: scene.studio.colours,
    shoe: true,
    still: true,
    time: 0,
    label,
  };
  const [result] = await shootAll([order], say, resolve(root) === CODE ? {} : { data: root });
  if (!result?.ok) throw new AnkareError(`Underlaget gick inte att spara: ${result && !result.ok ? result.error : 'inget svar'}`);
  return result.saved.file;
}

/** Gör paketet för ett ankare. Se överst i filen. */
export async function forbered(dealerId: string, viewWord: string, options: PrepareOptions = {}): Promise<Prepared> {
  const root = options.root ?? studioRoot();
  const out = options.out ?? join(root, PACKAGES);
  const say = options.say ?? ((text: string) => console.log(text));
  const content = readAnkare(root);
  const mall = readMall(root);
  const dealer = readDealer(root, dealerId, mall);
  const view = viewOf(viewWord);
  // Identitetsbilderna som stegen behöver, ur dealerns fil.
  const roles = [...new Set(content.steps.flatMap((step) => step.references.map((reference) => reference.from)).filter((from) => from !== 'underlag' && from !== 'ställning'))];
  const identity = Object.fromEntries(roles.map((role) => [role, roleFile(dealer, role)])) as Record<string, string | null>;
  const lacking = roles.filter((role) => !identity[role] || !existsSync(join(root, 'assets', identity[role]!)));
  if (lacking.length > 0) throw new AnkareError(`${dealerFile(dealerId)} har ingen identitetsbild för ${lacking.join(', ')} i assets/. Gör dem först: node src/pipeline/identitet.ts förbered ${dealerId}`);
  const unjudged = roles.filter((role) => getEntry(root, identity[role]!)?.status !== 'godkänd');

  const n = nextNumber(root, dealerId, viewWord, out);
  const id = packageIdOf(dealerId, viewWord, n);
  const dir = join(out, id);
  if (existsSync(dir)) throw new AnkareError(`${posix(relative(root, dir))} finns redan`);
  mkdirSync(join(dir, 'ref'), { recursive: true });
  const at = (file: string) => join(dir, file);

  // Underlaget och dess öga.
  let guide = options.underlag ? resolve(root, options.underlag) : '';
  if (!guide) {
    say(`Dockans REDO ur ${viewWord}s närbild sparas i ateljén …`);
    guide = join(root, await shootGuide(root, content, view, `ankare-${dealerId}-${n}`, say));
  }
  const guideJsonPath = guide.replace(/\.png$/, '.json');
  if (!existsSync(guide) || !existsSync(guideJsonPath)) throw new AnkareError(`Underlaget ${guide} och dess .json (ögat) ska finnas`);
  copyFileSync(guide, at('underlag.png'));
  copyFileSync(guideJsonPath, at('underlag.json'));
  const guideJson = JSON.parse(readFileSync(guideJsonPath, 'utf8')) as GuideJson;
  const eye = eyeOf(guideJson);
  const parts = { ...readCycleParts(content.underlag.move, root), eye: { ...eye } };
  const doll = dollPoints(parts, view, content, root);

  // Referensbilderna, förminskade.
  const refs: Record<string, string> = {};
  for (const role of roles) {
    const name = `ref/${role === 'händer' ? 'hander' : role}.jpg`;
    await sharp(join(root, 'assets', identity[role]!)).resize(content.order.reference, content.order.reference, { fit: 'inside', withoutEnlargement: true }).removeAlpha().jpeg({ quality: 93 }).toFile(at(name));
    refs[role] = name;
  }

  // Texterna och stegen.
  const words = wordsOf(dealer, mall);
  const pkg = posix(relative(root, dir));
  const steps = content.steps.map((step) => {
    const text = stepText(content, step, words, parts.scene.studio.grid.step);
    const file = `text-${step.step === 'ställning' ? 'stallning' : 'likhet'}.txt`;
    writeFileSync(at(file), text);
    return {
      step: step.step,
      tool: step.tool,
      model: modelFor(step, view),
      imageSize: step.imageSize,
      ratio: step.ratio,
      ...(step.outputFormat ? { outputFormat: step.outputFormat } : {}),
      credits: step.credits,
      referenceImages: step.references.map((reference) =>
        reference.from === 'ställning'
          ? { tag: reference.tag, taskId: '<ställningens taskId>', from: 'ställning' }
          : reference.from === 'underlag'
            ? { tag: reference.tag, file: `${pkg}/underlag.png`, upload: true }
            : { tag: reference.tag, file: `${pkg}/${refs[reference.from]}`, upload: true, identity: identity[reference.from] },
      ),
      promptFile: `${pkg}/${file}`,
      promptText: text,
    };
  });
  const anchor = anchorFileOf(dealerId, viewWord, n);
  const order = {
    about: 'Beställningen av ett REDO-ankare, gjord av src/pipeline/ankare.ts förbered. Två generate_image i tur och ordning genom Runways MCP-server: ställningen med underlaget och identitetsbilderna, sedan likheten med ställningens bild (taskId) och ansiktet. Filerna att ladda upp ligger i paketet; doll är dockans punkter genom underlagets öga, som ta-emot gör de lokala stegen efter.',
    id,
    made: stamp(),
    dealer: dealerId,
    view,
    viewWord,
    number: n,
    anchor,
    underlag: { file: `${pkg}/underlag.png`, json: `${pkg}/underlag.json`, from: posix(relative(root, guide)), savedAt: guideJson.savedAt ?? null, move: content.underlag.move },
    eye,
    shoe: { at: [...parts.scene.shoe.at], yawDeg: parts.scene.shoe.yawDeg, length: parts.scene.shoe.length },
    doll,
    identity,
    unjudged,
    steps,
    receipts: `${pkg}/kvitto.json: [{ "step": "ställning" | "likhet", "file": "<nedladdad bild>", "taskId": "<id>", "credits": <n>, "before": <saldo före>, "after": <saldo efter>, "at": "ÅÅÅÅ-MM-DD TT:MM" }]`,
    uploads: `${pkg}/uppladdat.json: [{ "file": "<filen i paketet>", "url": "<adressen>", "assetId": "<id>", "at": "ÅÅÅÅ-MM-DD TT:MM" }]`,
  };
  write(at('bestallning.json'), order);

  say(`Paket: ${pkg}`);
  say(`  underlag      underlag.png (${posix(relative(root, guide))}), ögat i underlag.json`);
  for (const role of roles) say(`  ${role.padEnd(13)} ${refs[role]} (${identity[role]}${unjudged.includes(role) ? ', inte godkänd' : ''})`);
  for (const step of steps) say(`  ${step.step.padEnd(13)} ${step.model}, ${step.imageSize}, ${step.ratio}: ${step.referenceImages.map((ref) => `@${ref.tag}`).join(' ')}; texten i ${step.promptFile.split('/').at(-1)}`);
  if (unjudged.length > 0) say(`Obs: ${unjudged.join(', ')} är inte godkända än.`);
  say('Härnäst, för agenten:');
  say('  1. Läs saldot (whoami). Ladda upp underlag.png och ref/*.jpg (init_upload, curl, complete_upload); skriv adresserna i uppladdat.json.');
  say(`  2. generate_image för ställningen som bestallning.json säger (steps[0]); se på bilden, läs saldot, ladda ned den.`);
  say(`  3. generate_image för likheten med ställningens taskId som @base (steps[1]); läs saldot, ladda ned den.`);
  say(`  4. Skriv ${pkg}/kvitto.json (formen står i bestallning.json, receipts). Sedan:`);
  say(`     node src/pipeline/ankare.ts ta-emot ${id}`);
  return { id, dir, order };
}

// ---------------------------------------------------------------------------------------------------------------------
// ta-emot: de lokala stegen och måtten

type Ordered = {
  id: string; dealer: string; view: SeatView; viewWord: string; number: number; anchor: string; made: string;
  underlag: { file: string; json: string; from: string; savedAt: string | null; move: string };
  eye: FilmEye; shoe: { at: [number, number]; yawDeg: number; length: number }; doll: DollPoints;
  identity: Record<string, string | null>; unjudged: string[];
  steps: { step: string; model: string; imageSize: string; ratio: string; outputFormat?: string; referenceImages: { tag: string; file?: string; taskId?: string; identity?: string | null }[]; promptText: string }[];
};
export type Receipt = { step: string; file: string; taskId: string; credits: number; before: number; after: number; at?: string };
export type Made = { picture: Picture; values: Record<string, number | null>; shown: Record<string, unknown>; judged: Judged[]; steps: string[] };

/** Handens ände mot underarmen: medelpunkten av det i handen som ligger högst 6 bp från dess bakersta punkt längs `along`. */
function handEnd(hand: bild.Hand, width: number, along: Pixel): Pixel {
  let least = Infinity;
  for (let y = hand.box.y0; y < hand.box.y1; y++) for (let x = hand.box.x0; x < hand.box.x1; x++) if (hand.mask[y * width + x]) least = Math.min(least, x * along.x + y * along.y);
  const near: Pixel[] = [];
  for (let y = hand.box.y0; y < hand.box.y1; y++) for (let x = hand.box.x0; x < hand.box.x1; x++) if (hand.mask[y * width + x] && x * along.x + y * along.y <= least + 6) near.push({ x, y });
  return mean(near);
}

/**
 * Handen bortom handleden mot dockans, som yta: handleden är dockans, flyttad lika långt som handens ände mot underarmen
 * ligger från dockans (en hand som ligger en bit från dockans mäts från sin egen handled). Null när handen inte hittas.
 */
function handRatio(picture: Picture, guide: Picture, side: DollPoints['give'], options: bild.HandOptions): number | null {
  const own = bild.handAt(picture, side.hand, options);
  const doll = bild.handAt(guide, side.hand, options);
  if (!own || !doll) return null;
  const a = handEnd(own, picture.width, side.along);
  const b = handEnd(doll, guide.width, side.along);
  const wrist = { x: side.wrist.x + a.x - b.x, y: side.wrist.y + a.y - b.y };
  const mine = bild.beyondWrist(own, picture.width, wrist, side.along).area;
  const theirs = bild.beyondWrist(doll, guide.width, side.wrist, side.along).area;
  return theirs > 0 ? Math.round((mine / theirs) * 100) / 100 : null;
}

/** Det gula kortet i mynningen: delen närmast dockans kort, som ruta, eller null. */
function yellowCard(picture: Picture, doll: DollPoints): Box | null {
  const found = partsIn(picture, doll.mouthBox, isYellow, 40).sort((a, b) => Math.hypot(a.c.x - doll.mouth.x, a.c.y - doll.mouth.y) - Math.hypot(b.c.x - doll.mouth.x, b.c.y - doll.mouth.y));
  return found[0]?.box ?? null;
}

/** Kolumnerna bordskanten mäts i: var `every`:e utanför dealern och skon. */
function edgeColumns(doll: DollPoints, width: number, every: number): number[] {
  const inside = (x: number, box: Box) => x >= box.x0 - 10 && x <= box.x1 + 10;
  const columns: number[] = [];
  for (let x = every; x < width - every / 2; x += every) if (!inside(x, doll.dealer) && !inside(x, doll.shoe)) columns.push(x);
  return columns;
}

/** Bordskanten i en bild mot underlagets: värsta kolumnen, och raderna. */
function edgeOffset(picture: Picture, guide: Picture, doll: DollPoints, options: AnkareContent['local']['edges']): { most: number | null; rows: Record<number, [number | null, number | null]> } {
  const rows: Record<number, [number | null, number | null]> = {};
  let most: number | null = null;
  for (const x of edgeColumns(doll, picture.width, options.every)) {
    const expected = edgeRow(doll, x);
    const range: [number, number] = [expected - options.rows, expected + options.rows];
    const mine = bild.tableEdge(picture, x, range, options.least);
    const theirs = bild.tableEdge(guide, x, range, options.least);
    rows[x] = [mine, theirs];
    if (mine !== null && theirs !== null) most = Math.max(most ?? 0, Math.abs(mine - theirs));
  }
  return { most, rows };
}

const rgbOf = (colour: number): Rgb => [(colour >> 16) & 255, (colour >> 8) & 255, colour & 255];

/**
 * De lokala stegen på bildmodellernas två bilder, i den ordning skripten gjorde dem för spelaren-redo-2, och måtten mot
 * underlaget. `key` är skärmens gröna (scene.json, studio.colours.screen). Inga tal här gäller en viss bild: punkterna
 * är dockans (`doll`), talen content/ankare.json.
 */
export function makeAnchor(guide: Picture, stallning: Picture, likhet: Picture, doll: DollPoints, content: AnkareContent, key: Rgb, gap: { rows: number; least: number }): Made {
  const local = content.local;
  const steps: string[] = [];
  const shown: Record<string, unknown> = {};
  const { width, height } = guide;
  const darkOf = (picture: Picture) => bild.darkBox(picture, doll.shoe, 400);
  const guideShoe = darkOf(guide);
  const shoeOff = (picture: Picture) => {
    const box = darkOf(picture);
    return box && guideShoe ? bild.boxOffset(box, guideShoe) : null;
  };
  // 1. Geometrin: håller likheten sko och bordskant? Annars läggs bara dess huvud på ställningen.
  const geometry = {
    ställning: { skon: shoeOff(stallning), bordskant: edgeOffset(stallning, guide, doll, local.edges).most },
    likhet: { skon: shoeOff(likhet), bordskant: edgeOffset(likhet, guide, doll, local.edges).most },
  };
  shown.geometri = geometry;
  const holds = (g: { skon: number | null; bordskant: number | null }) => (g.skon ?? Infinity) <= local.edges.most && (g.bordskant ?? 0) <= local.edges.most;
  const headOnly = !holds(geometry.likhet) && holds(geometry.ställning);
  const picture = bild.copyOf(headOnly ? stallning : likhet);
  steps.push(headOnly ? `bas: ställningen, eftersom likheten flyttade skon ${geometry.likhet.skon} bp och bordskanten ${geometry.likhet.bordskant} bp` : 'bas: likheten');
  const edges = edgeOffset(picture, guide, doll, local.edges);

  // 2. Händerna: krympta till dockans hudyta, givhanden lagd där dockans fingrar rör kortet.
  const hands: Record<string, unknown> = {};
  let giveCover: Uint8Array | null = null;
  for (const side of ['give', 'rest'] as const) {
    const point = doll[side];
    const hand = bild.handAt(picture, side === 'give' ? doll.grip : point.hand, local.hands);
    const dollHand = bild.handAt(guide, side === 'give' ? doll.grip : point.hand, local.hands);
    if (!hand || !dollHand) {
      steps.push(`${side === 'give' ? 'givhanden' : 'vilande handen'}: hittades inte, står kvar`);
      continue;
    }
    const raw = Math.sqrt((local.hands.area * dollHand.area) / hand.area);
    const scale = Math.round(Math.min(local.hands.most, Math.max(local.hands.least, raw)) * 1000) / 1000;
    const fixed = side === 'give' ? (bild.rimPoint(picture, hand, bild.isCard) ?? hand.start) : handEnd(hand, width, point.along);
    const target = side === 'give' ? (bild.rimPoint(guide, dollHand, bild.isCard) ?? dollHand.start) : fixed;
    hands[side] = { yta: hand.area, dockans: dollHand.area, skala: scale, fast: roundPixel(fixed), till: roundPixel(target) };
    if (scale >= local.hands.keep && side === 'rest') continue;
    const moved = bild.moveHand(picture, hand, scale, fixed, target, side === 'give');
    if (side === 'give') giveCover = moved.cover;
    steps.push(`${side === 'give' ? 'givhanden' : 'vilande handen'}: ${scale} kring (${Math.round(fixed.x)}, ${Math.round(fixed.y)}), lagd på (${Math.round(target.x)}, ${Math.round(target.y)})${moved.removedYellow ? `, bildmodellens kort borttaget (${moved.removedYellow} bp)` : ''}`);
  }
  shown.händer = hands;

  // 3. Märkkortet där dockans står, utom under fingrarna.
  const card = bild.paintShoeCard(picture, guide, giveCover, doll.card, rgbOf(MARK_BACK));
  steps.push(`kortet: ${card.painted} bp målade gula inom dockans korthörn, ${card.spared} under fingrarna`);

  // 4. Skärmen: allt grönt, skuggorna med, en enda grön.
  const sample = local.flatten.sample;
  const flat = bild.flattenScreen(picture, key, { x0: sample[0] * width, y0: sample[1] * height, x1: sample[2] * width, y1: sample[3] * height }, local.flatten);
  steps.push(`skärmen: ${flat.flattened} bp satta till (${key.join(', ')})`);

  // 5. Huvudet ur likheten, när basen är ställningen.
  if (headOnly) {
    const head = bild.copyOf(likhet);
    bild.flattenScreen(head, key, { x0: sample[0] * width, y0: sample[1] * height, x1: sample[2] * width, y1: sample[3] * height }, local.flatten);
    const r = doll.head.radius;
    const pasted = bild.pasteHead(picture, head, key, { x0: doll.head.x - 2 * r, y0: 0, x1: doll.head.x + 2 * r, y1: doll.head.y + 2 * r }, () => doll.head.y + local.head.collar * r, local.head.reach);
    steps.push(`huvudet ur likheten: förskjutet (${pasted.dx}, ${pasted.dy}), ${pasted.placed} bp`);
  }

  // 6. Kläderna ned till bordskanten, och 7. det minsta rent.
  const waist = bild.fillWaist(picture, key, (x) => edgeRow(doll, x), [doll.dealer.x0, doll.dealer.x1], local.waist);
  steps.push(`midjan: ${waist.cols} kolumner förda ned till bordskanten (störst ${waist.most} bp)`);
  const clean = bild.cleanScreen(picture, key, local.clean.holeMost, local.clean.spotMost);
  steps.push(`rent: ${clean.holesFilled} bp i små hål fyllda, ${clean.spotsRemoved} bp lösa fläckar gjorda till skärm`);

  const measured = measureAnchor(picture, guide, doll, content, key, gap, edges.most);
  Object.assign(shown, measured.shown, { bordskantRader: edges.rows });
  return { picture, values: measured.values, shown, judged: measured.judged, steps };
}

/**
 * Ett ankare mätt mot underlaget med gränserna i content/ankare.json: sko, kort, händernas hudyta bortom handleden mot
 * dockans, det gröna, glipan vid bordskanten, hål och fläckar. `edges` är bordskantens värsta avvikelse i bildmodellens
 * bild (före plattningen), eller null när den inte är mätt.
 */
export function measureAnchor(picture: Picture, guide: Picture, doll: DollPoints, content: AnkareContent, key: Rgb, gap: { rows: number; least: number }, edges: number | null): { values: Record<string, number | null>; shown: Record<string, unknown>; judged: Judged[] } {
  const local = content.local;
  const shoe = bild.darkBox(picture, doll.shoe, 400);
  const guideShoe = bild.darkBox(guide, doll.shoe, 400);
  const guideCard = yellowCard(guide, doll);
  const madeCard = yellowCard(picture, doll);
  const report = bild.screenReport(picture, key, local.clean.keepLeast);
  const values: Record<string, number | null> = {
    skon: shoe && guideShoe ? bild.boxOffset(shoe, guideShoe) : null,
    skonOverlapp: bild.silhouetteOverlap(picture, guide, doll.shoe, doll.mouthBox),
    kortet: madeCard && guideCard ? bild.boxOffset(madeCard, guideCard) : null,
    bordskant: edges,
    givhanden: handRatio(picture, guide, { ...doll.give, hand: doll.grip }, local.hands),
    vilandeHanden: handRatio(picture, guide, doll.rest, local.hands),
    gront: greenOff(picture, key, 8, 12),
    glipa: gapIn(picture, key, doll.waist, (x) => edgeRow(doll, x), gap.rows, gap.least).cols,
    hal: report.holes.filter((part) => part.n < local.clean.holeSmall).length,
    flackar: report.spots.length,
    delvisInne: report.partial,
  };
  const shown = {
    skarmExakt: bild.exactScreen(picture, key),
    skonsRuta: shoe,
    underlagetsSko: guideShoe,
    kortetsRuta: madeCard,
    underlagetsKort: guideCard,
    halen: report.holes.slice(0, 8).map((part) => `${part.n} bp ${part.box.x0},${part.box.y0}–${part.box.x1},${part.box.y1}`),
    flackarna: report.spots.slice(0, 8).map((part) => `${part.n} bp ${part.box.x0},${part.box.y0}–${part.box.x1},${part.box.y1}`),
  };
  const judged = Object.entries(content.limits).filter(([name]) => name in values).map(([name, limit]) => judgeOne(name, values[name], limit));
  return { values, shown, judged };
}

/** Arket: underlaget, bildmodellernas bilder och ankaret, och händerna och kortet närmare, dockan bredvid ankaret. */
async function anchorSheet(out: string, guide: Picture, stallning: Picture, likhet: Picture, made: Picture, doll: DollPoints): Promise<void> {
  const W = 480;
  const H = 270;
  const raw = (p: Picture) => sharp(p.data, { raw: { width: p.width, height: p.height, channels: 3 } });
  const whole = async (p: Picture) => raw(p).resize(W, H).png().toBuffer();
  const pair = async (centre: Pixel, reach: number) => {
    const box = clipBox({ x0: centre.x - reach, y0: centre.y - reach * 0.75, x1: centre.x + reach, y1: centre.y + reach * 0.75 }, made);
    const part = async (p: Picture) => raw(p).extract({ left: box.x0, top: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 }).resize(W / 2, H, { fit: 'contain', background: '#2f3337' }).png().toBuffer();
    return sharp({ create: { width: W, height: H, channels: 3, background: '#2f3337' } }).composite([{ input: await part(guide), left: 0, top: 0 }, { input: await part(made), left: W / 2, top: 0 }]).png().toBuffer();
  };
  const tiles: [Buffer, string][] = [
    [await whole(guide), 'underlaget (dockan)'],
    [await whole(stallning), 'ställningen'],
    [await whole(likhet), 'likheten'],
    [await whole(made), 'ankaret'],
    [await pair(doll.grip, 110), 'givhanden och kortet: dockan | ankaret'],
    [await pair(doll.rest.hand, 130), 'vilande handen: dockan | ankaret'],
  ];
  const label = 22;
  await sharp({ create: { width: 3 * W, height: 2 * (H + label), channels: 3, background: '#2f3337' } })
    .composite(
      tiles.flatMap(([image, text], k) => {
        const left = (k % 3) * W;
        const top = Math.floor(k / 3) * (H + label);
        const svg = Buffer.from(`<svg width="${W}" height="${label}"><text x="6" y="16" font-size="14" font-family="sans-serif" fill="#ffffff">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);
        return [{ input: svg, left, top }, { input: image, left, top: top + label }];
      }),
    )
    .jpeg({ quality: 85 })
    .toFile(out);
}

export type ReceiveOptions = { root?: string; out?: string; register?: boolean; say?: (text: string) => void };

const fileOf = (root: string, given: string): string => (isAbsolute(given) ? given : resolve(root, given));

/** Tar emot bildmodellernas bilder till ett paket. Se överst i filen. */
export async function taEmot(id: string, files: { stallning?: string; likhet?: string } = {}, options: ReceiveOptions = {}): Promise<{ made: Made; post: Post; registered: string[] }> {
  const root = options.root ?? studioRoot();
  const out = options.out ?? join(root, PACKAGES);
  const say = options.say ?? ((text: string) => console.log(text));
  const dir = join(out, id);
  const at = (file: string) => join(dir, file);
  if (!existsSync(at('bestallning.json'))) throw new AnkareError(`Paketet ${id} finns inte i ${posix(relative(root, out))}: kör förbered först`);
  const ordered = JSON.parse(readFileSync(at('bestallning.json'), 'utf8')) as Ordered;
  const receipts: Receipt[] = existsSync(at('kvitto.json')) ? (JSON.parse(readFileSync(at('kvitto.json'), 'utf8')) as Receipt[]) : [];
  const receiptOf = (step: string) => receipts.find((receipt) => receipt.step === step);
  const stallningFile = files.stallning ?? receiptOf('ställning')?.file;
  const likhetFile = files.likhet ?? receiptOf('likhet')?.file;
  if (!stallningFile || !likhetFile) throw new AnkareError(`Bilderna saknas: ge ställningens och likhetens bild, eller skriv dem i ${posix(relative(root, at('kvitto.json')))}`);
  const content = readAnkare(root);
  const tagning = readTagning(root);
  const scene = JSON.parse(readFileSync(join(root, 'content', 'scene.json'), 'utf8')) as { studio: { colours: { screen: Rgb } } };
  const key = scene.studio.colours.screen;
  const { width, height } = ordered.eye.frame;

  const guide = await bild.readFitted(at('underlag.png'), width, height);
  const stallning = await bild.readFitted(fileOf(root, stallningFile), width, height);
  const likhet = await bild.readFitted(fileOf(root, likhetFile), width, height);
  await bild.savePicture(stallning, at('stallning.png'));
  await bild.savePicture(likhet, at('likhet.png'));
  const made = makeAnchor(guide, stallning, likhet, ordered.doll, content, key, { rows: tagning.measure.gapRows, least: tagning.measure.gapLeast });
  await bild.savePicture(made.picture, at('ankare.png'));
  await anchorSheet(at('ark.jpg'), guide, stallning, likhet, made.picture, ordered.doll);
  const outside = made.judged.filter((entry) => entry.verdict !== 'inom');
  const summary = outside.length === 0 ? `alla ${made.judged.length} mått inom gränserna` : `${made.judged.length - outside.length} av ${made.judged.length} mått inom gränserna; ${outside.map((entry) => `${entry.key} ${String(entry.value).replace('.', ',')} (${entry.verdict})`).join(', ')}`;
  const pkg = posix(relative(root, dir));
  write(at('matning.json'), {
    about: 'Ankaret mätt av src/pipeline/ankare.ts ta-emot mot underlaget (gränserna i content/ankare.json). judged är varje mått mot sin gräns; shown är det som bara visas. Bildpunkter i vyns ruta.',
    measured: stamp(),
    sizes: { ställning: stallning.own, likhet: likhet.own },
    steps: made.steps,
    values: made.values,
    judged: made.judged,
    shown: made.shown,
  });

  const credits = receipts.reduce((sum, receipt) => sum + (receipt.credits ?? 0), 0);
  const viewText = ordered.view.kind === 'plats' ? `Plats ${ordered.view.seat}` : 'Spelaren';
  const post: Post = {
    from: posix(relative(root, at('ankare.png'))),
    file: ordered.anchor,
    group: 'anchors',
    dealer: ordered.dealer,
    title: `REDO ur ${viewText}, på grönt`,
    status: 'att granska',
    note: `Gjord ${stamp()} genom src/pipeline/ankare.ts (paketet ${pkg}): dealern på enfärgad grön skärm i ${viewText}s närbild (underlagets öga), i dockans ställning REDO. Mätt: ${summary}. Inte dömd: gjord av en agent och väntar på en oberoende granskare.`,
    pose: 'redo',
    grip: 'nyp',
    licence: 'Ingen tredjepartslicens: genererad på Jakobs Runway-konto',
    use: 'dealerfilm',
    view: ordered.view,
    eye: ordered.eye,
    shoe: ordered.shoe,
    source: {
      from: 'runway',
      taskId: receiptOf('likhet')?.taskId ?? null,
      model: ordered.steps.find((step) => step.step === 'likhet')?.model ?? null,
      imageSize: ordered.steps[0]?.imageSize ?? null,
      ratio: ordered.steps[0]?.ratio ?? null,
      credits,
      package: pkg,
      eyeFrom: `${ordered.underlag.json}: underlagets öga (${ordered.underlag.from}, sparat ${ordered.underlag.savedAt ?? '?'}); shoe ur content/scene.json när paketet gjordes`,
      steps: [
        { step: 'underlag', what: `Dockans REDO (content/moves/${ordered.underlag.move}.json, tid 0) ur ${viewText}s närbild i ateljén: ${ordered.underlag.from}.` },
        ...ordered.steps.map((step) => ({ step: step.step, model: step.model, taskId: receiptOf(step.step)?.taskId ?? null, references: step.referenceImages.map((ref) => ({ tag: ref.tag, what: ref.identity ?? ref.file ?? ref.taskId ?? '' })), prompt: step.promptText })),
        ...made.steps.map((what) => ({ step: 'lokalt', what: `src/pipeline/ankarbild.ts: ${what}` })),
      ],
      measured: Object.fromEntries(made.judged.map((entry) => [entry.key, entry.value])),
    },
  };
  write(at('post.json'), post);
  say(`Ankaret: ${pkg}/ankare.png; arket ${pkg}/ark.jpg`);
  for (const step of made.steps) say(`  ${step}`);
  say(`Mätt: ${summary}`);
  for (const entry of made.judged) say(`  ${entry.verdict.padEnd(8)} ${entry.key.padEnd(14)} ${String(entry.value ?? '–').replace('.', ',').padStart(8)} ${entry.unit.padEnd(8)} ${entry.limit}`);

  const registered: string[] = [];
  if (options.register !== false) {
    if (ordered.steps.some((step) => !receiptOf(step.step))) throw new AnkareError(`kvitto.json saknar ${ordered.steps.filter((step) => !receiptOf(step.step)).map((step) => step.step).join(' och ')}: utan kvittot förs ankaret inte in`);
    const entry = await importAsset(root, post);
    registered.push(`Registret: ${entry.file} införd, ${entry.status}.`);
    for (const step of ordered.steps) {
      const receipt = receiptOf(step.step)!;
      const order: Order = {
        at: receipt.at ?? stamp(),
        model: step.model,
        kind: 'bild',
        purpose: `${step.step}: REDO ur ${viewText} för ${ordered.dealer} (${ordered.anchor})`,
        inputs: JSON.stringify({ imageSize: step.imageSize, ratio: step.ratio, ...(step.outputFormat ? { outputFormat: step.outputFormat } : {}), references: step.referenceImages.map((ref) => ({ tag: ref.tag, what: ref.identity ?? ref.file ?? ref.taskId })) }),
        prompt: step.promptText,
        taskId: receipt.taskId,
        credits: receipt.credits,
        balanceBefore: receipt.before,
        balanceAfter: receipt.after,
        basis: receipt.credits === receipt.before - receipt.after ? 'mätt' : 'antaget',
        outcome: step.step === 'likhet' ? `mätt efter de lokala stegen: ${summary}` : `bas för likheten; ${step.step} mätt i ${pkg}/matning.json (geometri)`,
        result: ordered.anchor,
        note: `bilden: ${posix(relative(root, fileOf(root, receipt.file)))}`,
      };
      registered.push(`Registret: beställningen ${receipt.taskId} införd (rad ${addOrder(root, order)}).`);
    }
    for (const entry of made.judged) addMeasurement(root, { file: ordered.anchor, what: `${entry.key}: ${entry.what}`, value: { value: entry.value, unit: entry.unit, limit: entry.limit, verdict: entry.verdict }, who: WHO, basis: 'mätt', note: `gränsen: ${entry.source}` });
    registered.push(`Registret: ${made.judged.length} mått införda.`);
    if (existsSync(at('uppladdat.json'))) {
      for (const upload of JSON.parse(readFileSync(at('uppladdat.json'), 'utf8')) as { file: string; url: string; assetId?: string; at?: string }[]) {
        addUpload(root, { file: upload.file.startsWith('output/') ? upload.file : `${pkg}/${upload.file}`, url: upload.url, assetId: upload.assetId ?? null, at: upload.at ?? null });
      }
      registered.push('Registret: uppladdningarna införda.');
    }
    write(at('mottaget.json'), { at: stamp(), anchor: ordered.anchor, registered });
  }
  for (const line of registered) say(line);
  if (options.register !== false) say(`Härnäst: en oberoende granskare dömer ${ordered.anchor} i full storlek (npm run reg -- status). Godkänt: node src/pipeline/ankare.ts använd ${ordered.dealer} ${ordered.viewWord} ${ordered.anchor}`);
  return { made, post, registered };
}

// ---------------------------------------------------------------------------------------------------------------------
// använd

/** Pekar ut ett godkänt ankare som vyns REDO i dealerns fil. */
export function anvand(dealerId: string, viewWord: string, file: string, root = studioRoot()): Dealer {
  if (!VIEW.test(viewWord)) throw new AnkareError(`Okänd vy: ${viewWord}`);
  const entry = getEntry(root, file);
  if (!entry) throw new AnkareError(`${file} står inte i registret`);
  if (entry.dealer !== dealerId || entry.group !== 'anchors') throw new AnkareError(`${file} är inget ankare för ${dealerId}`);
  if (entry.status !== 'godkänd') throw new AnkareError(`${file} är ${entry.status}, inte godkänd: låt en oberoende granskare döma det först`);
  const dealer = readDealer(root, dealerId);
  const next: Dealer = { ...dealer, anchors: { ...dealer.anchors, redo: { ...dealer.anchors.redo, [viewWord]: file }, source: `${dealer.anchors.source} ${viewWord}: ${file}, utpekat ${stamp()} (ankare.ts använd).` } };
  writeDealer(root, next);
  return next;
}

// ---------------------------------------------------------------------------------------------------------------------
// Kommandoraden

const USAGE = `Använd:
  node src/pipeline/ankare.ts förbered <dealer> <vy> [--underlag <png>]
  node src/pipeline/ankare.ts ta-emot <id> [<ställning> <likhet>]
  node src/pipeline/ankare.ts använd <dealer> <vy> <fil>
Vyn är spelaren eller plats-N. Receptet: docs/production.md, Ankaret.`;

if (import.meta.main) {
  const [word, ...args] = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const words = args.filter((arg, k) => !arg.startsWith('--') && !args[k - 1]?.startsWith('--'));
  try {
    if ((word === 'förbered' || word === 'forbered') && words.length === 2) await forbered(words[0]!, words[1]!, { underlag: flag('--underlag') });
    else if (word === 'ta-emot' && (words.length === 1 || words.length === 3)) await taEmot(words[0]!, words.length === 3 ? { stallning: words[1], likhet: words[2] } : {});
    else if ((word === 'använd' || word === 'anvand') && words.length === 3) {
      anvand(words[0]!, words[1]!, words[2]!);
      console.log(`${dealerFile(words[0]!)}: ${words[1]} är nu ${words[2]}`);
    } else {
      console.error(USAGE);
      process.exitCode = 2;
    }
  } catch (error) {
    if (!(error instanceof AnkareError || error instanceof DealerError || error instanceof Error)) throw error;
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
