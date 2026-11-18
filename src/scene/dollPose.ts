// Dockans ställning i scenen, som ren matematik: var kropp, armar, händernas 21 punkter och kortet är vid en viss tid.
// Inget three och ingen filläsning, så att Node kan pröva allt. Dockan ritas i doll.ts.
//
// Dockan är en vit provdocka som gör en rörelse, så att scenen kan spara en förlaga. Hennes mått står i
// content/doll.json och rörelserna i content/moves/. En rörelse är en koreografi: den är läst ur en film av en verklig
// dealer och hängs upp i två punkter som scenen bestämmer när den spelas.
//   Hämtstället: kortet som står i skons mynning. Ett läge och en riktning, lika för alla platser (pickUpCard).
//   Läggstället: en kortplats på den plats kortet ska till, den första om inget annat sägs (placeOnTable).
// Däremellan bärs hand och kort som de lästes. Så gäller samma rörelse för varje dealer och varje plats (moveFor).
//
// En cykel (content/moves/cykel-*.json) är samma giv i snabbare takt, följd av vägen tillbaka: handen vilar en stund på
// det lagda kortet, släpper det, går i en båge tillbaka till skon och nyper nästa kort. Den börjar och slutar i REDO,
// så att vilken cykel som helst kan följa på vilken som helst. Given i en cykel är den hängda given, omtagen i cykelns
// takt; bara vägen tillbaka räknas här (cycled). Takten och bågen står i cykelns fil.
//
// Förd över ur gamla Dealer (C:/Users/jakem/dev/super-feature-sg/dealer, commit e6c07124c16a9b8d00ab3435895f94e982516ce9):
//   dealer3d/src/body.ts       arm (armen med två ben), solveBody (böjningen från höften), turned, standing
//   dealer3d/src/hand-pose.ts  axesOf (handens egna axlar), shapeBetween (ben med fasta längder)
//   dealer3d/src/capture.ts    moved (given buren till en annan plats), joints (vad en sväng kräver av armen), throughShoe
//   dealer3d/src/stage.ts      hur en avläst giv spelas: rutorna vägs samman och blicken följer kortet
//   src/table-lens.ts          shoeCard (kortet som står i skon)
// Rörelsefilen är tagen ur en äldre commit, den som dockfilm 2 spelades in ur; se `source` i filen.
// Skillnader mot förlagan:
//   Bordet lutar. Händer och kort räknas som på ett olutat bord och flyttas sist dit lutningen lägger dem; kroppen
//   sitter upprätt bakom bordet, och armarna räknas från axlarna till de lutade handlederna.
//   Handen är dockans egen, i naturlig storlek. Förlagans punkter har olika benlängder i varje ruta och är större än en
//   hand; här följer dockans hand de lästa punkternas riktningar med sina egna ben (fitHand), och greppet ligger kvar.
//   Rörelsen börjar vid scenens sko och slutar på scenens kortplats, också för platsen den lästes på. Förlagan flyttade
//   bara läggstället, och bara till andra platser.
//   Svängen till en annan plats räknas mot platsen rörelsen lästes på, så att handen där står som dealern hade den.
//   Förlagan tog den vinkel som krävde minst, också när den skilde sig från den lästa.
//   En flyttad rörelse prövas mot hinder: skon, den vilande handen, bålen och bordet. Svängen väljs så att armen går
//   fri när kortet läggs, bärningen bågar ut mot spelarna där den raka vägen går genom något, och armbågen vrids där
//   armen annars skulle göra det. Förlagan såg bara efter om handen gick genom skon, och hade då ingen rörelse dit.
//   Kroppen är dockans egen i alla rörelser. Ur filmen tas bara hur axlar och huvud flyttar sig från första rutan;
//   därtill böjer hon sig när armen inte når. Armbågarna pekar utåt och nedåt i stället för att läsas ur bilden.
//   Skon är scenens modell, som ett hölje med mått ur content/doll.json, i stället för förlagans kil.

import type { FeltPoint, Marked, SceneDescription, Vec3 } from './description.ts';
import { tilted } from './geometry.ts';

/** Dockans egen vänster och höger. Vänster hand delar; den är till höger i bild. */
export type Side = 'left' | 'right';

/** Dockan så som den står i content/doll.json. Vad varje tal är står i filen. */
export type DollDescription = {
  schemaVersion: number;
  about: string;
  /** Hur hon sitter mot dealerns bordskant: axlarnas plan bakom kanten, höften under filtens höjd, nackens fäste över axlarna. */
  sitting: Marked & { behindEdge: number; hipBelowFelt: number; neckLift: number };
  /** Kroppen i meter: mittens x, axelledernas höjd över filten och halva avståndet mellan dem, huvudets mitt och radie, ögonens höjd. */
  body: Marked & { centreX: number; shoulderHeight: number; shoulderHalfWidth: number; head: { x: number; height: number; radius: number }; eyeHeight: number };
  /** Armens två ben, hur långt den når innan kroppen böjs, och hur långt kroppen som mest böjs och vrids (radianer). */
  arm: Marked & { upper: number; fore: number; reach: number; mostLean: number; mostTwist: number };
  /** Blicken när kortet ligger: en punkt framför huvudet, hur stor del av vägen dit blicken går och på hur lång tid. */
  gaze: Marked & { down: number; ahead: number; share: number; seconds: number };
  /** Hur kroppen ritas: bålens mått som andelar och djup, och lemmarnas radier i meter. */
  shape: Marked & {
    torso: { width: number; height: number; depth: number; centre: number };
    yoke: number;
    neck: [number, number];
    head: { scale: number; skull: Vec3; nose: { radius: number; at: Vec3 }; neckAt: number };
    upperArm: [number, number];
    forearm: [number, number];
    shoulder: number;
    elbow: number;
    wrist: number;
  };
  /**
   * Handen: höger hand liggande på filten, 21 punkter i MediaPipes ordning. x tvärs mot tummens sida, y upp från filten,
   * z mot fingertopparna, origo på filten under handleden. Ur punkterna räknas benens längder. `radius` är ledernas radier.
   */
  hand: Marked & { rest: Vec3[]; radius: { wrist: number; knuckle: number; joint: number; tip: number } };
  /** VILA: handledens avstånd i sidled från kroppens mitt, långfingrets spets framför bordskanten och handens vridning inåt. */
  rest: Marked & { wristFromCentre: number; fingertipsBeforeEdge: number; toeInDeg: number };
  /** Hämtstället i skon. Se pickUpCard. */
  pickUp: Marked & { foot: number; lift: number; leanDeg: number; nextBehind: number };
  /** Skons hölje, som andelar av skons längd. Se throughShoe. */
  shoeEnvelope: Marked & { halfWidth: number; backHeight: number; boxEnd: number; boxHeight: number; noseHeight: number };
};

/**
 * En rörelse så som den står i content/moves/. Spåren har en post per ruta, i meter i scenens mått på ett olutat bord.
 * `seat` är platsen kortet läggs på, och `moments` är rutorna där kortet lämnar skon, står på kant, fälls och ligger.
 */
export type DollMove = Marked & {
  schemaVersion: number;
  about: string;
  id: string;
  from: string;
  to: string;
  grip: string;
  seat: number;
  /** Vilken av platsens kortplatser kortet läggs på: 0 är den första, och den gäller när inget annat sägs. */
  index?: number;
  seconds: number;
  fps: number;
  frameCount: number;
  moments: { leavesShoe: number; edge: [number, number]; folds: number; rests: number };
  /** Hur många grader handen är svängd kring sitt grepp vid läggstället, när rörelsen är flyttad till en annan plats. */
  swingDeg?: number;
  /** Hur långt bärningen bågar ut mot spelarna som mest, i meter, när rörelsen är flyttad till en annan plats. */
  bow?: number;
  /** Finns när rörelsen är en cykel: efter given släpper handen kortet och går tillbaka till REDO. */
  back?: Back;
  tracks: {
    card: { about: string; centre: Vec3[]; long: Vec3[]; face: Vec3[] };
    leftHand: { about: string; points: Vec3[][] };
    rightHand: { about: string; points: Vec3[][] };
    body: { about: string; leftShoulder: Vec3[]; rightShoulder: Vec3[]; head: Vec3[] };
    /** Finns när en flyttad rörelse behöver det: hur vänster armbåge är vriden från sitt vanliga håll, grader per ruta. */
    leftArm?: { about: string; turnDeg: number[] };
  };
};

/**
 * Vägen tillbaka i en cykel, så som den är räknad. Rutorna räknas i cykelns egen takt.
 * - `letsGo`: rutan där handen lämnar det lagda kortet; `home`: rutan där den åter nyper nästa kort i skon, i REDO.
 * - `pace`: hur många av den lästa rörelsens rutor en ruta i cykelns giv svarar mot.
 * - `lift`, `bow`: hur högt över den raka vägen och hur långt ut mot spelarna handen bågar som mest, i meter.
 * - `release`, `look`: andelen av vägen tillbaka då handen har lämnat filten, och då blicken har nått nästa kort.
 */
export type Back = { letsGo: number; home: number; pace: number; lift: number; bow: number; release: number; look: number };

/**
 * En cykel så som den står i content/moves/: given `give` (en rörelse i samma mapp) och vägen tillbaka till REDO.
 * `parts` är takten i sekunder: stilla i REDO (`ready`), given från REDO tills kortet ligger (`deal`), handen kvar på
 * kortet (`onCard`), vägen tillbaka till nästa kort i skon (`back`) och stilla i REDO (`still`). De ska tillsammans
 * vara `seconds`.
 * `back` är bågen tillbaka: `lift` meter över den raka vägen som mest, och andelarna `release` och `look` (se Back).
 */
export type DollCycle = Marked & {
  schemaVersion: number;
  about: string;
  id: string;
  from: string;
  to: string;
  give: string;
  seconds: number;
  parts: { ready: number; deal: number; onCard: number; back: number; still: number };
  back: { lift: number; release: number; look: number };
};

/** En arm: axel, armbåge och handled. `reached` är falskt när handleden ligger längre bort än armen räcker. */
export type Arm = { shoulder: Vec3; elbow: Vec3; wrist: Vec3; reached: boolean };

/**
 * Ett kort i scenen. Hörnen går som i cardCorners: sedda från framsidan med den hållna kortsidan uppåt är de övre
 * vänstra, övre högra, nedre högra, nedre vänstra. `long` pekar mot den hållna kortsidan och `face` dit framsidan ser.
 * `up` är sidan som vetter från filten: gul baksida eller blå framsida.
 */
export type CardPose = { corners: Vec3[]; centre: Vec3; long: Vec3; face: Vec3; up: 'baksida' | 'framsida' };

/** Allt som behövs för att rita dockan vid en tid, i scenens mått med bordets lutning inräknad. */
export type DollPose = {
  hip: Vec3;
  /** Bålens mitt. */
  torso: Vec3;
  neck: Vec3;
  head: Vec3;
  /** Punkten hon ser på. */
  gaze: Vec3;
  arms: { left: Arm; right: Arm };
  /** Händernas 21 punkter i MediaPipes ordning: handled, sedan tumme till lillfinger inifrån och ut. */
  hands: { left: Vec3[]; right: Vec3[] };
  /**
   * Kortet i den givande handen. Null i VILA. I en cykel, när handen har släppt det delade kortet, är det i stället nästa
   * kort i skons mynning, det som handen hämtar: då står det där kortet stod i REDO.
   */
  card: CardPose | null;
  /** Kortet som är givet och släppt, i en cykel från att handen lämnar det. Annars null. */
  laid: CardPose | null;
  /** Nästa kort, som står kvar i skons mynning. */
  shoeCard: CardPose;
};

// ---------------------------------------------------------------------------------------------------------------------
// Vektorer

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const size = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => mul(a, 1 / (size(a) || 1));
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const radians = (degrees: number): number => (degrees * Math.PI) / 180;
const degrees = (value: number): number => (value * 180) / Math.PI;
const angle = (a: Vec3, b: Vec3): number => degrees(Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))));
const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const UP: Vec3 = [0, 1, 0];

/** En vektor vriden kring en enhetsaxel (Rodrigues). */
const turned = (v: Vec3, axis: Vec3, by: number): Vec3 =>
  add(add(mul(v, Math.cos(by)), mul(cross(axis, v), Math.sin(by))), mul(axis, dot(axis, v) * (1 - Math.cos(by))));

/** En vektor vriden kring lodlinjen. En positiv vinkel för +z mot +x, som skons `yawDeg`. */
const round = (v: Vec3, by: number): Vec3 => {
  const c = Math.cos(by);
  const s = Math.sin(by);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};

const mean = (points: Vec3[], which: number[]): Vec3 => mul(which.reduce<Vec3>((sum, k) => add(sum, points[k]!), [0, 0, 0]), 1 / which.length);

// ---------------------------------------------------------------------------------------------------------------------
// Handen

/** Fingrarnas kedjor, tumme till lillfinger, från handflatan och ut. */
export const FINGERS: number[][] = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const ROOTS = [1, 5, 9, 13, 17];
const TIPS = [4, 8, 12, 16, 20];
// Greppet: mitten mellan tummens och pekfingrets spetsar. Där håller givhanden kortet, och den punkten ligger kvar när
// dockans hand passas in. Den vilande handen hålls i stället kvar där dess fyra fingertoppar ligger.
const GRIP = [4, 8];
const RESTING = [8, 12, 16, 20];

type Axes = { forward: Vec3; palm: Vec3; across: Vec3 };

/** En hands egna axlar: längs handen från handled till långfingrets knoge, dit handflatan ser, och tvärs. */
function handAxes(p: Vec3[], side: Side): Axes {
  const forward = unit(sub(p[9]!, p[0]!));
  const raw = mul(unit(cross(sub(p[5]!, p[0]!), sub(p[17]!, p[0]!))), side === 'right' ? 1 : -1);
  const palm = unit(sub(raw, mul(forward, dot(raw, forward))));
  return { forward, palm, across: cross(palm, forward) };
}

/**
 * Dockans hand som skelett: handflatans fem fästen (tummens rot och de fyra knogarna) mot handleden i handens egna
 * axlar, fingerbenens längder och ledernas radier. Handflatan är stel; fingrarna böjs i sina leder.
 */
export type HandSkeleton = { palm: Vec3[]; bones: number[][]; radius: number[] };

const skeletons = new WeakMap<DollDescription, HandSkeleton>();

export function handSkeleton(doll: DollDescription): HandSkeleton {
  const known = skeletons.get(doll);
  if (known) return known;
  const { rest, radius } = doll.hand;
  const axes = handAxes(rest, 'right');
  const palm = ROOTS.map((k): Vec3 => {
    const from = sub(rest[k]!, rest[0]!);
    return [dot(from, axes.forward), dot(from, axes.palm), dot(from, axes.across)];
  });
  const bones = FINGERS.map((chain) => [0, 1, 2].map((j) => size(sub(rest[chain[j + 1]!]!, rest[chain[j]!]!))));
  const radii = rest.map((_, k) => (k === 0 ? radius.wrist : ROOTS.includes(k) ? radius.knuckle : TIPS.includes(k) ? radius.tip : radius.joint));
  const skeleton = { palm, bones, radius: radii };
  skeletons.set(doll, skeleton);
  return skeleton;
}

/**
 * Handens storlek, så som den ses: längden från handleden till långfingrets yttersta spets med handen utsträckt, och
 * bredden över knogarna från pekfingrets utsida till lillfingrets.
 */
export function handSize(doll: DollDescription): { length: number; breadth: number } {
  const { palm, bones } = handSkeleton(doll);
  const { radius } = doll.hand;
  return {
    length: size(palm[2]!) + bones[2]!.reduce((sum, bone) => sum + bone, 0) + radius.tip,
    breadth: size(sub(palm[1]!, palm[4]!)) + 2 * radius.knuckle,
  };
}

/**
 * Dockans hand lagd efter en läst hand. Handflatan ställs med den lästa handens axlar i dess handled, och varje
 * fingerben pekar som det lästa benet men har dockans längd. Sedan flyttas handen så att mitten av punkterna `anchor`
 * ligger där den lästa handen har den: det handen rör vid ligger kvar, och handleden hamnar där dockans mått lägger den.
 */
export function fitHand(skeleton: HandSkeleton, read: Vec3[], side: Side, anchor: number[]): Vec3[] {
  const axes = handAxes(read, side);
  // Vänster hand är högerhandens spegelbild: i handens egna axlar byter måttet tvärs tecken.
  const mirror = side === 'right' ? 1 : -1;
  const out: Vec3[] = read.map(() => [0, 0, 0]);
  out[0] = read[0]!;
  ROOTS.forEach((k, index) => {
    const [along, toward, sideways] = skeleton.palm[index]!;
    out[k] = add(read[0]!, add(add(mul(axes.forward, along), mul(axes.palm, toward)), mul(axes.across, sideways * mirror)));
  });
  FINGERS.forEach((chain, finger) => {
    for (let j = 0; j < 3; j++) {
      const way = unit(sub(read[chain[j + 1]!]!, read[chain[j]!]!));
      out[chain[j + 1]!] = add(out[chain[j]!]!, mul(way, skeleton.bones[finger]![j]!));
    }
  });
  const shift = sub(mean(read, anchor), mean(out, anchor));
  return out.map((point) => add(point, shift));
}

/**
 * Handen mot filten, på ett olutat bord. Ingen led går ned i filten: en hand som ligger för lågt lyfts. En hand som
 * svävar sänks andelen `settle` av vägen ned, så att dess lägsta led vilar på filten när andelen är 1.
 */
function onFelt(points: Vec3[], radius: number[], settle: number): Vec3[] {
  const low = Math.min(...points.map((point, k) => point[1] - radius[k]!));
  const by = low < 0 ? low : low * settle;
  return by === 0 ? points : points.map((point): Vec3 => [point[0], point[1] - by, point[2]]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Skon och korten

/** Mynningens håll på filten, från skons mitt. */
function mouthWay(scene: SceneDescription): Vec3 {
  const yaw = radians(scene.shoe.yawDeg);
  return [Math.sin(yaw), 0, Math.cos(yaw)];
}

/**
 * En punkt på det olutade bordet i skons egna mått: tvärs från skons mittlinje (modellens x), höjd över filten, och
 * längs skon från dess mitt mot mynningen (modellens z).
 */
export function inShoe(scene: SceneDescription, point: Vec3): Vec3 {
  const way = mouthWay(scene);
  const from: Vec3 = [point[0] - scene.shoe.at[0], 0, point[2] - scene.shoe.at[1]];
  return [from[0] * way[2] - from[2] * way[0], point[1], dot(from, way)];
}

type Standing = { centre: Vec3; long: Vec3; face: Vec3 };

/**
 * Hämtstället på ett olutat bord: kortet som står i skons mynning. Detta är standarden för var kort hämtas, och den
 * räknas ur scenens sko (`at`, `yawDeg`, `length`) och fyra tal i content/doll.json (`pickUp`):
 *
 *   m = (sin yawDeg, 0, cos yawDeg)                mynningens håll på filten
 *   fot = at + m · foot · length, på höjden lift   mitten av kortets nedre kortsida, på skons mittlinje
 *   long = (−m · cos leanDeg, sin leanDeg)         kortets långsida, uppåt och bakåt in mot skon
 *   mitt = fot + long · kortets halva höjd
 *   face = (−m · sin leanDeg, −cos leanDeg)        framsidan ser in i skon och nedåt; den gula baksidan ser ut ur mynningen
 *
 * `foot` är en andel av skons längd, så att stället följer med när skon flyttas, vrids eller byter storlek.
 */
function pickUp(scene: SceneDescription, doll: DollDescription): Standing {
  const { foot, lift, leanDeg } = doll.pickUp;
  const way = mouthWay(scene);
  const lean = radians(leanDeg);
  const along = foot * scene.shoe.length;
  const long: Vec3 = [-way[0] * Math.cos(lean), Math.sin(lean), -way[2] * Math.cos(lean)];
  const face: Vec3 = [-way[0] * Math.sin(lean), -Math.cos(lean), -way[2] * Math.sin(lean)];
  const base: Vec3 = [scene.shoe.at[0] + way[0] * along, lift, scene.shoe.at[1] + way[2] * along];
  return { centre: add(base, mul(long, scene.card.height / 2)), long, face };
}

/** Ett kort givet som på ett olutat bord, där bordets lutning ställer det. Ingen del av kortet går ned i filten. */
function cardOnTable(scene: SceneDescription, card: Standing): CardPose {
  const long = unit(card.long);
  const face = unit(sub(card.face, mul(long, dot(card.face, long))));
  const side = cross(long, face);
  const halfWidth = scene.card.width / 2;
  const halfHeight = scene.card.height / 2;
  // Så högt måste mitten ligga för att lägsta hörnet ska nå filten och inte längre.
  const floor = scene.card.thickness / 2 + halfHeight * Math.abs(long[1]) + halfWidth * Math.abs(side[1]);
  const middle: Vec3 = [card.centre[0], Math.max(card.centre[1], floor), card.centre[2]];
  const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b]) =>
    tilted(scene, add(middle, add(mul(side, a! * halfWidth), mul(long, b! * halfHeight)))),
  );
  const centre = tilted(scene, middle);
  const way = (v: Vec3): Vec3 => unit(sub(tilted(scene, add(middle, v)), centre));
  return { corners, centre, long: way(long), face: way(face), up: face[1] > 0 ? 'framsida' : 'baksida' };
}

/** Hämtstället i scenen: kortet som står i skons mynning, där rörelsen tar sitt kort. */
export const pickUpCard = (scene: SceneDescription, doll: DollDescription): CardPose => cardOnTable(scene, pickUp(scene, doll));

/** Nästa kort: står kvar i skon strax innanför det som delas. */
function nextCard(scene: SceneDescription, doll: DollDescription): CardPose {
  const standing = pickUp(scene, doll);
  return cardOnTable(scene, { ...standing, centre: add(standing.centre, mul(standing.face, doll.pickUp.nextBehind)) });
}

/** Kortplatsen `index` på en plats, 0 för den första (content/scene.json, places.seats). */
function cardPlace(scene: SceneDescription, seat: number, index = 0): FeltPoint {
  const place = scene.places.seats.find((entry) => entry.seat === seat)?.cards[index];
  if (!place) throw new Error(index === 0 ? `Scenen har ingen första kortplats för plats ${seat}` : `Scenen har ingen kortplats ${index} för plats ${seat}`);
  return place;
}

// ---------------------------------------------------------------------------------------------------------------------
// Kroppen

type Trunk = { hip: Vec3; left: Vec3; right: Vec3; neck: Vec3; head: Vec3 };

/** Dockan sittande upprätt: lederna i ett plan bakom dealerns bordskant. Kroppen lutar inte med bordet. */
function sittingTrunk(scene: SceneDescription, doll: DollDescription): Trunk {
  const { centreX, shoulderHeight, shoulderHalfWidth, head } = doll.body;
  const z = scene.dealerEdge.z - doll.sitting.behindEdge;
  return {
    hip: [centreX, -doll.sitting.hipBelowFelt, z],
    left: [centreX + shoulderHalfWidth, shoulderHeight, z],
    right: [centreX - shoulderHalfWidth, shoulderHeight, z],
    neck: [centreX, shoulderHeight + doll.sitting.neckLift, z],
    head: [head.x, head.height, z],
  };
}

/** Kroppen med axlar och huvud flyttade så som filmen flyttar dem från sin första ruta. */
function shifted(doll: DollDescription, trunk: Trunk, by: { left: Vec3; right: Vec3; head: Vec3 }): Trunk {
  const left = add(trunk.left, by.left);
  const right = add(trunk.right, by.right);
  return { hip: trunk.hip, left, right, neck: add(mix(left, right, 0.5), [0, doll.sitting.neckLift, 0]), head: add(trunk.head, by.head) };
}

/**
 * Kroppen böjd mot en handled som armen inte når. Hon böjer sig från höften mot handen och för fram den givande axeln
 * i takt med böjningen, så långt som räckvidden kräver och aldrig mer än `mostLean`.
 */
function leaned(doll: DollDescription, trunk: Trunk, wrist: Vec3): Trunk {
  const { reach, mostLean, mostTwist } = doll.arm;
  const toward = sub(wrist, trunk.hip);
  const axis = cross(UP, unit([toward[0], 0, toward[2]]));
  const posed = (point: Vec3, lean: number, twist: number): Vec3 =>
    add(trunk.hip, turned(turned(sub(point, trunk.hip), axis, lean), turned(UP, axis, lean), twist));
  const far = (lean: number, twist: number): number => size(sub(wrist, posed(trunk.left, lean, twist)));
  const twistFor = (lean: number): number => {
    const twist = (mostTwist * lean) / mostLean;
    return far(lean, twist) < far(lean, -twist) ? twist : -twist;
  };
  const short = (lean: number): boolean => far(lean, twistFor(lean)) > reach;
  if (!short(0)) return trunk;
  let low = 0;
  let high = mostLean;
  for (let step = 0; step < 30; step++) {
    const middle = (low + high) / 2;
    if (short(middle)) low = middle;
    else high = middle;
  }
  const twist = twistFor(high);
  return {
    hip: trunk.hip,
    left: posed(trunk.left, high, twist),
    right: posed(trunk.right, high, twist),
    neck: posed(trunk.neck, high, twist),
    head: posed(trunk.head, high * 0.85, twist * 0.5),
  };
}

// Vart armbågen pekar: utåt åt sin egen sida, nedåt och bakåt, som en sittande dealers armbåge hänger.
const POLE: Record<Side, Vec3> = { left: [0.7, -0.6, -0.4], right: [-0.7, -0.6, -0.4] };

/** Samma arm med armbågen vriden kring linjen från axeln till handleden, högervridet sett längs den linjen. Radianer. */
function swung(arm: Arm, turn: number): Arm {
  if (turn === 0) return arm;
  return { ...arm, elbow: add(arm.shoulder, turned(sub(arm.elbow, arm.shoulder), unit(sub(arm.wrist, arm.shoulder)), turn)) };
}

/** Två ben från axel till handled, med armbågen böjd mot `pole`. */
function armTo(doll: DollDescription, shoulder: Vec3, wrist: Vec3, pole: Vec3): Arm {
  const { upper, fore } = doll.arm;
  const far = size(sub(wrist, shoulder));
  const span = Math.max(Math.abs(upper - fore) + 1e-4, Math.min(upper + fore - 1e-4, far));
  const way = unit(sub(wrist, shoulder));
  const along = (upper * upper - fore * fore + span * span) / (2 * span);
  const out = Math.sqrt(Math.max(0, upper * upper - along * along));
  const side = unit(sub(pole, mul(way, dot(pole, way))));
  return { shoulder, elbow: add(add(shoulder, mul(way, along)), mul(side, out)), wrist, reached: far <= upper + fore };
}

// ---------------------------------------------------------------------------------------------------------------------
// Ställningen

type Moment = {
  /** Kortet som delas. */
  card: Standing | null;
  /** I en cykel, när handen har släppt kortet: nästa kort i skons mynning, som handen hämtar. Annars null. */
  fetch: Standing | null;
  /** Hur stor del av vägen blicken har gått från det lagda kortet till nästa kort i skon, när det finns ett sådant. */
  lookBack: number;
  /** Händerna så som de är lästa, på ett olutat bord. */
  left: Vec3[];
  right: Vec3[];
  /** Hur axlar och huvud har flyttat sig från rörelsens första ruta. */
  body: { left: Vec3; right: Vec3; head: Vec3 };
  /** Hur den givande armens armbåge är vriden från sitt vanliga håll, i radianer. Se `swung`. */
  elbowTurn: number;
  /** Hur stor del av vägen ned till filten den givande handen har sänkts: 0 medan den bär kortet, 1 när kortet ligger. */
  settle: number;
  /** Hur stor del av vägen blicken har gått från kortet till punkten framför henne. */
  lookUp: number;
};

const STILL: Moment['body'] = { left: [0, 0, 0], right: [0, 0, 0], head: [0, 0, 0] };

function compose(scene: SceneDescription, doll: DollDescription, moment: Moment): DollPose {
  const skeleton = handSkeleton(doll);
  const onTable = (points: Vec3[], settle: number): Vec3[] => onFelt(points, skeleton.radius, settle).map((point) => tilted(scene, point));
  const left = onTable(fitHand(skeleton, moment.left, 'left', GRIP), moment.settle);
  // Den vilande handen ligger på filten hela tiden.
  const right = onTable(fitHand(skeleton, moment.right, 'right', RESTING), 1);
  const trunk = leaned(doll, shifted(doll, sittingTrunk(scene, doll), moment.body), left[0]!);
  const dealt = moment.card && cardOnTable(scene, moment.card);
  const fetched = moment.fetch && cardOnTable(scene, moment.fetch);
  const ahead: Vec3 = [trunk.head[0], trunk.head[1] - doll.gaze.down, trunk.head[2] + doll.gaze.ahead];
  // Hon ser på kortet hon delar. När hon har släppt det går blicken tillbaka till nästa kort i skon.
  const gaze = fetched && dealt ? mix(dealt.centre, fetched.centre, moment.lookBack) : dealt ? mix(dealt.centre, ahead, moment.lookUp) : ahead;
  return {
    hip: trunk.hip,
    torso: mix(trunk.hip, mix(trunk.left, trunk.right, 0.5), doll.shape.torso.centre),
    neck: trunk.neck,
    head: trunk.head,
    gaze,
    arms: { left: swung(armTo(doll, trunk.left, left[0]!, POLE.left), moment.elbowTurn), right: armTo(doll, trunk.right, right[0]!, POLE.right) },
    hands: { left, right },
    card: fetched ?? dealt,
    laid: fetched ? dealt : null,
    shoeCard: nextCard(scene, doll),
  };
}

/** Högerhanden i VILA på ett olutat bord: liggande på filten med långfingrets spets en bit framför dealerns bordskant. */
function restingHand(scene: SceneDescription, doll: DollDescription): Vec3[] {
  const { wristFromCentre, fingertipsBeforeEdge, toeInDeg } = doll.rest;
  const turn = radians(toeInDeg);
  // Handen pekar mot spelarna, vriden inåt mot kroppens mitt. Tummens sida är till vänster om den riktningen.
  const way: Vec3 = [Math.sin(turn), 0, Math.cos(turn)];
  const thumb = cross(UP, way);
  const tip = doll.hand.rest[12]!;
  const wrist: Vec3 = [
    doll.body.centreX - wristFromCentre,
    0,
    scene.dealerEdge.z + fingertipsBeforeEdge - (thumb[2] * tip[0] + way[2] * tip[2]),
  ];
  return doll.hand.rest.map((point) => add(wrist, add(add(mul(thumb, point[0]), [0, point[1], 0]), mul(way, point[2]))));
}

/**
 * VILA: båda händerna på filten framför dealerns bordskant, inget kort i handen. Vänsterhanden är högerhandens spegelbild
 * i kroppens mitt. Ställningarna för de andra ankarna tas ur rörelsen: REDO är poseAt vid tiden 0 och LAGT n är poseAt
 * vid rörelsens sista sekund (`move.seconds`), för rörelsen till plats n.
 */
export function restPose(scene: SceneDescription, doll: DollDescription): DollPose {
  const right = restingHand(scene, doll);
  const left = right.map((point): Vec3 => [2 * doll.body.centreX - point[0], point[1], point[2]]);
  return compose(scene, doll, { card: null, fetch: null, lookBack: 0, left, right, body: STILL, elbowTurn: 0, settle: 1, lookUp: 1 });
}

// ---------------------------------------------------------------------------------------------------------------------
// Hinder: skon, den vilande handen, bålen och bordet

/** Ett klot kring en punkt i scenen. Lemmar och leder prövas mot hindren som rader av klot. */
type Ball = { at: Vec3; radius: number };

/** En punkt i scenen förd tillbaka till det olutade bordet: motsatsen till `tilted`. */
function untilted(scene: SceneDescription, point: Vec3): Vec3 {
  const by = radians(scene.table.tilt.deg);
  const c = Math.cos(by);
  const s = Math.sin(by);
  const edge = scene.dealerEdge.z;
  return [point[0], c * point[1] + s * (point[2] - edge), edge - s * point[1] + c * (point[2] - edge)];
}

/** Skons tak över filten på ett ställe längs skon, i meter. Höljet står i content/doll.json (`shoeEnvelope`). */
function shoeRoof(scene: SceneDescription, doll: DollDescription, along: number): number {
  const length = scene.shoe.length;
  const { backHeight, boxEnd, boxHeight, noseHeight } = doll.shoeEnvelope;
  const share =
    along <= boxEnd * length
      ? backHeight + ((boxHeight - backHeight) * (along + length / 2)) / (boxEnd * length + length / 2)
      : boxHeight + ((noseHeight - boxHeight) * (along - boxEnd * length)) / (length / 2 - boxEnd * length);
  return share * length;
}

/** Hur djupt ett klot på det olutade bordet går in i skons hölje, i meter. Negativt när det går fritt. */
function intoShoe(scene: SceneDescription, doll: DollDescription, at: Vec3, radius: number): number {
  const [across, lift, along] = inShoe(scene, at);
  const half = scene.shoe.length / 2;
  const roof = shoeRoof(scene, doll, Math.max(-half, Math.min(half, along)));
  return Math.min(doll.shoeEnvelope.halfWidth * scene.shoe.length + radius - Math.abs(across), half + radius - Math.abs(along), roof + radius - lift);
}

/** Klot på rad längs en lem, från andelen `first` av vägen till lemmens slut, med lemmens radie på varje ställe. */
function strung(from: Vec3, to: Vec3, radii: [number, number], first: number, count: number): Ball[] {
  return Array.from({ length: count + 1 }, (_, index) => {
    const share = first + ((1 - first) * index) / count;
    return { at: mix(from, to, share), radius: radii[0] + (radii[1] - radii[0]) * share };
  });
}

/** Den givande armen som klot: underarmen, armbågen och överarmens nedre del. Vid axeln sitter armen i bålen och prövas inte. */
function armBalls(doll: DollDescription, arm: Arm): Ball[] {
  const { forearm, upperArm, elbow } = doll.shape;
  return [...strung(arm.elbow, arm.wrist, forearm, 0, 8), { at: arm.elbow, radius: elbow }, ...strung(arm.shoulder, arm.elbow, upperArm, 0.4, 5)];
}

/** Den givande handen som klot: lederna, handleden och kortets hörn och mitt, medan handen håller kortet. */
function handBalls(doll: DollDescription, pose: DollPose): Ball[] {
  const radius = handSkeleton(doll).radius;
  const held = pose.laid ? null : pose.card;
  const card = held ? [...held.corners, held.centre].map((at): Ball => ({ at, radius: 0 })) : [];
  return [...pose.hands.left.map((at, k): Ball => ({ at, radius: radius[k]! })), { at: pose.arms.left.wrist, radius: doll.shape.wrist }, ...card];
}

/** Den vilande handen som klot: lederna, handleden och underarmen. */
function restingBalls(doll: DollDescription, pose: DollPose): Ball[] {
  const radius = handSkeleton(doll).radius;
  const arm = pose.arms.right;
  return [...pose.hands.right.map((at, k): Ball => ({ at, radius: radius[k]! })), { at: arm.wrist, radius: doll.shape.wrist }, ...strung(arm.elbow, arm.wrist, doll.shape.forearm, 0, 8)];
}

/** Hur djupt ett klot går in i bålen, ungefär, i meter: ägget kring bålens mitt, vänt som axlarna och ryggen. */
function intoTorso(doll: DollDescription, pose: DollPose): (ball: Ball, slack: number) => number {
  const left = pose.arms.left.shoulder;
  const right = pose.arms.right.shoulder;
  const spine = sub(mix(left, right, 0.5), pose.hip);
  const wide = unit(sub(left, right));
  const deep = unit(cross(wide, spine));
  const tall = cross(deep, wide);
  const { width, height, depth } = doll.shape.torso;
  const axes: Vec3 = [size(sub(left, right)) * width, size(spine) * height, depth];
  return (ball, slack) => {
    const from = sub(ball.at, pose.torso);
    const reach = ball.radius + slack;
    const inside = 1 - Math.hypot(dot(from, wide) / (axes[0] + reach), dot(from, tall) / (axes[1] + reach), dot(from, deep) / (axes[2] + reach));
    return inside * (Math.min(...axes) + reach);
  };
}

/** Hur djupt en rad klot går in i varje hinder, i meter. Noll eller mindre betyder att de går fria. */
type Depths = { shoe: number; restingHand: number; torso: number; table: number };

// Ett djup under det här räknas som beröring, inte som att något går in i något.
const TOUCHING = 1e-6;

/**
 * Vad en rad klot går in i, i en ställning, och hur djupt. `slack` är luft som krävs utöver beröring, i meter. Skon
 * prövas bara när `shoeToo` är sant: medan kortet tas är fingrarna i skons mynning. Bordet prövas framför dealerns bordskant.
 */
function depthsOf(scene: SceneDescription, doll: DollDescription, pose: DollPose, balls: Ball[], shoeToo: boolean, slack: number): Depths {
  const resting = restingBalls(doll, pose);
  const torso = intoTorso(doll, pose);
  const depths: Depths = { shoe: -Infinity, restingHand: -Infinity, torso: -Infinity, table: -Infinity };
  for (const ball of balls) {
    const level = untilted(scene, ball.at);
    if (shoeToo) depths.shoe = Math.max(depths.shoe, intoShoe(scene, doll, level, ball.radius + slack));
    for (const other of resting) depths.restingHand = Math.max(depths.restingHand, ball.radius + other.radius + slack - size(sub(ball.at, other.at)));
    depths.torso = Math.max(depths.torso, torso(ball, slack));
    if (level[2] > scene.dealerEdge.z) depths.table = Math.max(depths.table, ball.radius - level[1]);
  }
  return depths;
}

const deepest = (depths: Depths): number => Math.max(depths.shoe, depths.restingHand, depths.torso, depths.table);

// ---------------------------------------------------------------------------------------------------------------------
// Rörelsen hängd i scenens två punkter

// En plats som ligger närmare än så från där spåren lägger kortet är samma plats: då svängs handen inte.
const SAME_PLACE = 0.02;
// Svängarna som prövas när rörelsen flyttas till en annan plats, i grader.
const SWING_MOST = 120;
const SWING_STEP = 5;
// Armen räknas som sträckt när handleden ligger längre bort än så här stor del av armens längd.
const FULL_REACH = 0.985;
// Rutorna närmast efter att kortet har lämnat skon räknas inte mot skon: då är fingrarna i skons mynning.
const CLEAR_AFTER = 8;
// Bågarna som prövas när den raka bärningen går genom något, i meter mot spelarna.
const BOW_MOST = 0.3;
const BOW_STEP = 0.01;
// Vridningarna av armbågen som prövas när armen går genom något, i grader. En sväng av handen väljs så att armbågen
// inte behöver vridas mer än TURN_EASY när kortet ligger. Vridningen börjar och slutar TURN_LEAD rutor före och efter
// att den behövs. AIR är luften som krävs kring armen och handen när vägen väljs, i meter.
const TURN_MOST = 180;
const TURN_STEP = 5;
const TURN_EASY = 90;
const TURN_LEAD = 8;
const AIR = 0.005;
// Så många rutor före framkomsten börjar landningen, där handen ska gå fri utan båge.
const LANDING = 8;

type Tracks = DollMove['tracks'];
/** Det en cykel ändrar i rörelsen utöver spåren: längden och ögonblicken. */
type Timing = Pick<DollMove, 'frameCount' | 'seconds' | 'moments' | 'back'>;
type Placed = { scene: SceneDescription; doll: DollDescription; tracks: Tracks; swingDeg: number; bow: number; timing?: Timing };

/**
 * Om skon prövas i en ruta. Inte medan fingrarna är i skons mynning: från REDO tills kortet har lämnat skon och
 * CLEAR_AFTER rutor till, och i en cykel lika många rutor före REDO på slutet, när nästa kort nyps. CLEAR_AFTER räknas i
 * den lästa rörelsens rutor och förs över i cykelns takt.
 */
function shoeTested(move: DollMove, frame: number): boolean {
  const clear = move.moments.leavesShoe + (move.back ? Math.ceil(CLEAR_AFTER / move.back.pace) : CLEAR_AFTER);
  return frame > clear && (!move.back || frame < move.back.home - clear);
}

/** Minsta ryck: så rör sig en hand som sträcker sig efter något, från stilla till stilla. */
const easeReach = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 - 15 * t + 6 * t * t));

/** Ett spår vid en bråkdel av en ruta: mellan två rutor vägs de samman, en hel ruta tas som den är. */
function sampled<T>(track: T[], at: number, blend: (a: T, b: T, share: number) => T): T {
  const last = track.length - 1;
  const position = Math.max(0, Math.min(last, at));
  const frame = Math.floor(position);
  const share = position - frame;
  return share === 0 || frame >= last ? track[frame]! : blend(track[frame]!, track[frame + 1]!, share);
}
const mixPoints = (a: Vec3[], b: Vec3[], t: number): Vec3[] => a.map((point, k) => mix(point, b[k]!, t));

/** En läst hand i sina egna axlar: greppet, axlarna (längs, handflatan, tvärs) och punkterna räknade från greppet längs dem. */
type Held = { grip: Vec3; axes: Vec3[]; local: Vec3[] };

function heldOf(points: Vec3[]): Held {
  const grip = mean(points, GRIP);
  const { forward, palm, across } = handAxes(points, 'left');
  const local = points.map((point): Vec3 => {
    const from = sub(point, grip);
    return [dot(from, forward), dot(from, palm), dot(from, across)];
  });
  return { grip, axes: [forward, palm, across], local };
}

/** Vridningen som för tre axlar till tre andra, som en enhetsaxel och en vinkel i radianer. Båda trippletterna har samma handhet. */
function rotationBetween(from: Vec3[], to: Vec3[]): { axis: Vec3; angle: number } {
  // R = summan av to_k · from_kᵀ för axlarna k: den matris som för varje from_k till to_k.
  const r = (i: number, j: number): number => from.reduce((sum, _, k) => sum + to[k]![i]! * from[k]![j]!, 0);
  const angle = Math.acos(Math.max(-1, Math.min(1, (r(0, 0) + r(1, 1) + r(2, 2) - 1) / 2)));
  if (angle < 1e-9) return { axis: UP, angle: 0 };
  let axis: Vec3 = [r(2, 1) - r(1, 2), r(0, 2) - r(2, 0), r(1, 0) - r(0, 1)];
  if (size(axis) < 1e-6) {
    // Nära ett halvt varv: axeln är den längsta kolumnen i R + 1.
    const columns = [0, 1, 2].map((j): Vec3 => [r(0, j) + (j === 0 ? 1 : 0), r(1, j) + (j === 1 ? 1 : 0), r(2, j) + (j === 2 ? 1 : 0)]);
    axis = columns.reduce((best, column) => (size(column) > size(best) ? column : best));
  }
  return { axis: unit(axis), angle };
}

/**
 * Given hängd i scenen gjord till en cykel, i cykelns takt. Spåren är på ett olutat bord, som rörelsens.
 *
 * Först står hon stilla i REDO (`ready`). Given och handens vila på kortet är den hängda given omtagen: cykelns ruta f
 * är givens ruta (f − ready) · pace, där pace lägger givens ruta `rests` (kortet ligger) på slutet av cykelns giv. Vilan
 * på kortet fortsätter givens rutor efter `rests`, där handen ligger kvar och kroppen rör sig som den lästes.
 *
 * Vägen tillbaka börjar där handen ligger på kortet och slutar i REDO, så som given började. Greppet (mitten mellan tummens
 * och pekfingrets spetsar) går den raka vägen med minsta ryck, och bågar `lift` meter uppåt och `bow` meter ut mot
 * spelarna, mest halvvägs; uppåt går bågen fortare i början än vägen framåt, så handen lyfter från kortet innan den går.
 * Handen vrids under tiden, i samma takt som vägen, från hur den låg på kortet till hur den nyper i skon, och fingrarna
 * formas om lika fort. Axlar, huvud och den vilande handen går samma takt tillbaka till sina lägen i REDO. Från rutan
 * `home` är allt som i givens första ruta, så att cykeln slutar i samma ställning som den började.
 */
function cycled(move: DollMove, tracks: Tracks, cycle: DollCycle, bow: number): Timing & { tracks: Tracks } {
  const frames = (seconds: number): number => Math.round(seconds * move.fps);
  const ready = frames(cycle.parts.ready);
  const deal = frames(cycle.parts.deal);
  const letsGo = ready + deal + frames(cycle.parts.onCard);
  const home = letsGo + frames(cycle.parts.back);
  const count = home + frames(cycle.parts.still) + 1;
  const pace = move.moments.rests / deal;
  const { lift, release, look } = cycle.back;
  const { card, leftHand, rightHand, body } = tracks;

  // Cykelns ruta som en ruta i den hängda given, fram till att handen lämnar kortet.
  const given = (frame: number): number => Math.max(0, Math.min(frame, letsGo) - ready) * pace;
  const leaving = heldOf(sampled(leftHand.points, given(letsGo), mixPoints));
  const reaching = heldOf(leftHand.points[0]!);
  const turn = rotationBetween(leaving.axes, reaching.axes);

  const out = {
    centre: [] as Vec3[],
    long: [] as Vec3[],
    face: [] as Vec3[],
    left: [] as Vec3[][],
    right: [] as Vec3[][],
    leftShoulder: [] as Vec3[],
    rightShoulder: [] as Vec3[],
    head: [] as Vec3[],
  };
  for (let frame = 0; frame < count; frame++) {
    const at = given(frame);
    // Kortet följer given och ligger sedan kvar där handen släppte det.
    out.centre.push(sampled(card.centre, at, mix));
    out.long.push(sampled(card.long, at, mix));
    out.face.push(sampled(card.face, at, mix));
    if (frame <= letsGo || frame >= home) {
      const from = frame >= home ? 0 : at;
      out.left.push(sampled(leftHand.points, from, mixPoints));
      out.right.push(sampled(rightHand.points, from, mixPoints));
      out.leftShoulder.push(sampled(body.leftShoulder, from, mix));
      out.rightShoulder.push(sampled(body.rightShoulder, from, mix));
      out.head.push(sampled(body.head, from, mix));
      continue;
    }
    const share = (frame - letsGo) / (home - letsGo);
    const way = easeReach(share);
    const arc = Math.sin(Math.PI * share) ** 2;
    const grip = add(mix(leaving.grip, reaching.grip, way), [0, lift * arc, bow * arc]);
    const axes = leaving.axes.map((axis) => turned(axis, turn.axis, turn.angle * way));
    out.left.push(leaving.local.map((point, k) => {
      const shaped = mix(point, reaching.local[k]!, way);
      return add(grip, add(add(mul(axes[0]!, shaped[0]), mul(axes[1]!, shaped[1])), mul(axes[2]!, shaped[2])));
    }));
    const back = <T>(track: T[], blend: (a: T, b: T, t: number) => T): T => blend(sampled(track, at, blend), track[0]!, way);
    out.right.push(back(rightHand.points, mixPoints));
    out.leftShoulder.push(back(body.leftShoulder, mix));
    out.rightShoulder.push(back(body.rightShoulder, mix));
    out.head.push(back(body.head, mix));
  }
  const { leavesShoe, edge, folds } = move.moments;
  const retimed = (frame: number): number => ready + Math.round(frame / pace);
  return {
    frameCount: count,
    seconds: (count - 1) / move.fps,
    moments: { leavesShoe: retimed(leavesShoe), edge: [retimed(edge[0]), retimed(edge[1])], folds: retimed(folds), rests: ready + deal },
    back: { letsGo, home, pace, lift, bow, release, look },
    tracks: {
      card: { ...card, centre: out.centre, long: out.long, face: out.face },
      leftHand: { ...leftHand, points: out.left },
      rightHand: { ...rightHand, points: out.right },
      body: { ...body, leftShoulder: out.leftShoulder, rightShoulder: out.rightShoulder, head: out.head },
    },
  };
}

const yawOf = (long: Vec3): number => Math.atan2(-long[0], -long[2]);
const within = (value: number): number => Math.atan2(Math.sin(value), Math.cos(value));

/** Bildrutan där handen har burit kortet hela vägen till platsen: halvvägs mellan kantläget och att kortet ligger. */
const arrival = (move: DollMove): number => Math.round(move.moments.edge[1] + (move.moments.rests - move.moments.edge[1]) * 0.5);

/**
 * Rörelsens spår hängda i scenen, för kort till `seat`.
 *
 * Vid skon flyttas och vrids hand och kort som ett stycke, så att kortet står på hämtstället. Vid platsen flyttas de så
 * att kortet ligger på kortplatsen. Däremellan går förflyttningen jämnt från den ena till den andra, från rutan där
 * kortet lämnar skon till rutan där handen är framme. Kortet vänds som det lästes och ligger rakt på platsen.
 *
 * En hand som sträcks åt ett annat håll kommer in från en annan sida. Därför svängs handen kring en lodlinje genom sitt
 * grepp, med kortet kvar mellan fingrarna. Svängen är skillnaden mellan den vinkel som kräver minst av handled och
 * underarm vid den nya platsen och samma vinkel vid platsen rörelsen lästes på: där står handen som dealern hade den,
 * och åt sidorna ändras den i samma mån som armens väg ändras. Intill skon räcker inte det: där ligger handen med
 * den svängen så nära skon att armen inte kommer fram. Då tas den närmaste sväng med vilken handen går fri när den
 * kommer fram och armen når den utan att armbågen vrids mer än TURN_EASY. Samma plats som spåren redan lägger kortet på
 * ger ingen sväng.
 *
 * Den raka vägen till en annan plats kan gå genom något: skons mynning på väg till platserna på skons sida, den vilande
 * handen på väg till platserna längst bort. Då bågar bärningen ut mot spelarna, mest halvvägs och ingenting vid skon och
 * vid platsen, med den minsta båge som för hand och kort fria (`bow`): handen lyfter kortet ur skon, bär det i en båge
 * över skons nos eller framför den vilande handen och kommer ned på platsen. Armen prövas sedan för sig: där underarmen,
 * armbågen eller överarmen skulle gå genom skon, den vilande handen, bålen eller bordet vrids armbågen kring linjen
 * från axeln till handleden, så litet som räcker (`leftArm.turnDeg`). Rörelsen till platsen den lästes på får varken
 * båge eller vridning: den spelas som den lästes.
 */
function place(scene: SceneDescription, doll: DollDescription, move: DollMove, seat: number, index = 0, cycle?: DollCycle): Placed {
  const { card, leftHand } = move.tracks;
  const count = move.frameCount;
  const target = cardPlace(scene, seat, index);
  const start = pickUp(scene, doll);
  const startTurn = within(yawOf(start.long) - yawOf(card.long[0]!));
  const grip = (frame: number): Vec3 => mean(leftHand.points[frame]!, GRIP);
  // Förflyttningen räknas från greppet. Vid skon ska kortets mitt hamna på hämtstället med kortet vridet som skon.
  const atShoe = add(sub(start.centre, grip(0)), round(sub(grip(0), card.centre[0]!), startTurn));
  const last = card.centre[count - 1]!;
  const reach = (to: FeltPoint): Vec3 => [to[0] - last[0], 0, to[1] - last[2]];
  const leaves = move.moments.leavesShoe;
  const arrive = arrival(move);

  const build = (atPlace: Vec3, swing: number, bow: number): Tracks => {
    const centre: Vec3[] = [];
    const long: Vec3[] = [];
    const face: Vec3[] = [];
    const points: Vec3[][] = [];
    for (let frame = 0; frame < count; frame++) {
      const share = smooth((frame - leaves) / (arrive - leaves));
      const cardTurn = startTurn * (1 - share);
      const handTurn = cardTurn + swing * share;
      const from = grip(frame);
      const carried = mix(atShoe, atPlace, share);
      // Bågen: mot spelarna, mjukt upp till sitt största halvvägs och mjukt ned igen.
      const part = Math.max(0, Math.min(1, (frame - leaves) / (arrive - leaves)));
      const to = add(from, bow === 0 ? carried : add(carried, [0, 0, bow * Math.sin(Math.PI * part) ** 2]));
      centre.push(add(to, round(sub(card.centre[frame]!, from), cardTurn)));
      long.push(round(card.long[frame]!, cardTurn));
      face.push(round(card.face[frame]!, cardTurn));
      points.push(leftHand.points[frame]!.map((point) => add(to, round(sub(point, from), handTurn))));
    }
    return { ...move.tracks, card: { ...card, centre, long, face }, leftHand: { ...leftHand, points } };
  };
  const poseIn = (shape: DollMove, tracks: Tracks, frame: number): DollPose => compose(scene, doll, momentOf(shape, tracks, frame, frame, 0, 0));
  const poseOf = (tracks: Tracks, frame: number): DollPose => poseIn(move, tracks, frame);

  // Vad en sväng kräver av den givande armen: handledens största böjning, halva underarmens vridning från ände till
  // ände, och ett högt pris för varje del armen måste sträckas utöver sin längd.
  const asks = (tracks: Tracks): number => {
    let wristMost = 0;
    let stretchMost = 1;
    const twists: number[] = [];
    for (let frame = 0; frame < count; frame++) {
      const pose = poseOf(tracks, frame);
      const { shoulder, elbow, wrist } = pose.arms.left;
      const hand = pose.hands.left;
      const upper = sub(elbow, shoulder);
      const fore = sub(wrist, elbow);
      wristMost = Math.max(wristMost, angle(fore, sub(hand[9]!, hand[0]!)));
      stretchMost = Math.max(stretchMost, size(sub(wrist, shoulder)) / ((doll.arm.upper + doll.arm.fore) * FULL_REACH));
      if (angle(upper, fore) < 15) continue;
      // Underarmens vridning: handflatans håll mot armbågens eget gångjärn, sett längs underarmen.
      const along = unit(fore);
      const across = (v: Vec3): Vec3 => sub(v, mul(along, dot(v, along)));
      const hinge = across(cross(upper, fore));
      const palm = across(mul(unit(cross(sub(hand[5]!, hand[0]!), sub(hand[17]!, hand[0]!))), -1));
      let twist = degrees(Math.atan2(dot(cross(hinge, palm), along), dot(hinge, palm)));
      const before = twists[twists.length - 1];
      if (before !== undefined) {
        while (twist - before > 180) twist -= 360;
        while (twist - before < -180) twist += 360;
      }
      twists.push(twist);
    }
    const span = twists.length ? Math.max(...twists) - Math.min(...twists) : 0;
    return wristMost + 0.5 * span + 200 * (stretchMost - 1);
  };

  /** Svängen som kräver minst när kortet läggs på en viss kortplats, i grader. */
  const easiest = (atPlace: Vec3): number => {
    let best = 0;
    let least = Infinity;
    for (let tried = -SWING_MOST; tried <= SWING_MOST; tried += SWING_STEP) {
      const cost = asks(build(atPlace, radians(tried), 0));
      if (cost < least) {
        least = cost;
        best = tried;
      }
    }
    return best;
  };

  const atPlace = reach(target);
  const same = Math.hypot(atPlace[0], atPlace[2]) <= SAME_PLACE;
  if (same && !cycle) return { scene, doll, tracks: build(atPlace, 0, 0), swingDeg: 0, bow: 0 };

  /** Hur djupt handen och kortet går in i skon eller den vilande handen. */
  const handDepth = (pose: DollPose, frame: number, shape: DollMove = move): number => {
    const depths = depthsOf(scene, doll, pose, handBalls(doll, pose), shoeTested(shape, frame), AIR);
    return Math.max(depths.shoe, depths.restingHand);
  };
  /** Hur djupt armen går in i något, med armbågen vriden `turn` grader. `shape` är rörelsen rutan hör till. */
  const armDepth = (pose: DollPose, frame: number, turn: number, shape: DollMove): number =>
    deepest(depthsOf(scene, doll, pose, armBalls(doll, swung(pose.arms.left, radians(turn))), shoeTested(shape, frame), AIR));
  /** Den minsta vridning av armbågen åt ett håll som för armen fri, och den som går minst djupt om ingen gör det. */
  const leastTurn = (pose: DollPose, frame: number, sign: number, shape: DollMove = move): { turn: number; free: boolean } => {
    let best = 0;
    let least = Infinity;
    for (let turn = 0; turn <= TURN_MOST; turn += TURN_STEP) {
      const depth = armDepth(pose, frame, sign * turn, shape);
      if (depth <= TOUCHING) return { turn: sign * turn, free: true };
      if (depth < least) {
        least = depth;
        best = sign * turn;
      }
    }
    return { turn: best, free: false };
  };

  // Svängen: den som kräver minst av armen, om handen då går fri när den kommer fram och kortet läggs, och armen går
  // fri utan att armbågen vrids mer än TURN_EASY. Annars den närmaste sväng som ger det. Rutorna som prövas är de sista
  // före framkomsten, där bågen inte längre hjälper, och sedan varannan till slutet.
  const landing = Array.from({ length: count }, (_, frame) => frame).filter((frame) => frame >= arrive - LANDING && (frame % 2 === 0 || frame === count - 1));
  const settledWell = (swing: number): boolean => {
    const tracks = build(atPlace, radians(swing), 0);
    return landing.every((frame) => {
      const pose = poseOf(tracks, frame);
      if (handDepth(pose, frame) > TOUCHING) return false;
      return [1, -1].some((sign) => {
        const { turn, free } = leastTurn(pose, frame, sign);
        return free && Math.abs(turn) <= TURN_EASY;
      });
    });
  };
  // Bågen: den minsta som för handen och kortet fria från skon och den vilande handen i varje ruta efter att kortet är taget.
  const blocked = (tracks: Tracks): number => {
    let frames = 0;
    for (let frame = leaves + 1; frame < count; frame++) if (handDepth(poseOf(tracks, frame), frame) > TOUCHING) frames++;
    return frames;
  };

  let swingDeg = 0;
  let bow = 0;
  let tracks = build(atPlace, 0, 0);
  if (!same) {
    const wanted = easiest(atPlace) - easiest(reach(cardPlace(scene, move.seat)));
    swingDeg = wanted;
    for (let off = 0; off <= 2 * SWING_MOST; off += SWING_STEP) {
      const near = [wanted + off, wanted - off].find((swing) => Math.abs(swing) <= SWING_MOST && settledWell(swing));
      if (near !== undefined) {
        swingDeg = near;
        break;
      }
    }
    tracks = build(atPlace, radians(swingDeg), 0);
    let fewest = blocked(tracks);
    for (let tried = BOW_STEP; fewest > 0 && tried <= BOW_MOST + 1e-9; tried += BOW_STEP) {
      const bowed = build(atPlace, radians(swingDeg), tried);
      const frames = blocked(bowed);
      if (frames < fewest) {
        fewest = frames;
        bow = Math.round(tried * 100) / 100;
        tracks = bowed;
      }
    }
  }

  // En cykel: given i cykelns takt och vägen tillbaka. Handen går tillbaka i samma båge ut mot spelarna som den bar
  // kortet, framför den vilande handen och runt skons nos; räcker inte den bågen för att handen ska gå fri från skon och
  // den vilande handen, tas den minsta större som gör det. Armbågen räknas sedan för hela cykeln.
  let timing: Timing | undefined;
  if (cycle) {
    const given = tracks;
    const shaped = (backBow: number): DollMove => {
      const { tracks: round, ...rest } = cycled(move, given, cycle, backBow);
      return { ...move, ...rest, tracks: round };
    };
    const blockedBack = (shape: DollMove): number => {
      let frames = 0;
      for (let frame = shape.back!.letsGo + 1; frame < shape.back!.home; frame++) {
        if (handDepth(poseIn(shape, shape.tracks, frame), frame, shape) > TOUCHING) frames++;
      }
      return frames;
    };
    let round = shaped(bow);
    let fewest = blockedBack(round);
    for (let tried = bow + BOW_STEP; fewest > 0 && tried <= BOW_MOST + 1e-9; tried += BOW_STEP) {
      const bowed = shaped(Math.round(tried * 100) / 100);
      const frames = blockedBack(bowed);
      if (frames < fewest) {
        fewest = frames;
        round = bowed;
      }
    }
    const { tracks: back, frameCount, seconds, moments } = round;
    tracks = back;
    timing = { frameCount, seconds, moments, back: round.back };
  }
  const shape: DollMove = timing ? { ...move, ...timing } : move;
  const span = shape.frameCount;

  // Armbågen: per ruta den minsta vridning som för armen fri, åt det håll som kräver minst över hela rörelsen.
  const needed = (sign: number): { turns: number[]; stuck: number } => {
    const turns = Array.from({ length: span }, () => 0);
    let stuck = 0;
    for (let frame = shape.moments.leavesShoe + 1; frame < span; frame++) {
      const { turn, free } = leastTurn(poseIn(shape, tracks, frame), frame, sign, shape);
      turns[frame] = turn;
      if (!free) stuck++;
    }
    return { turns, stuck };
  };
  const cost = (plan: { turns: number[]; stuck: number }): number => plan.stuck * 1e6 + plan.turns.reduce((sum, turn) => sum + Math.abs(turn), 0);
  const [up, down] = [needed(1), needed(-1)];
  const { turns } = cost(up) <= cost(down) ? up : down;
  if (turns.some((turn) => turn !== 0)) {
    // Vridningen börjar i god tid och släpper mjukt: först den största inom några rutor, sedan medelvärdet över lika många.
    const widest = turns.map((_, frame) => {
      const near = turns.slice(Math.max(0, frame - TURN_LEAD), frame + TURN_LEAD + 1);
      return near.reduce((most, turn) => (Math.abs(turn) > Math.abs(most) ? turn : most), 0);
    });
    const turnDeg = widest.map((_, frame) => {
      const near = widest.slice(Math.max(0, frame - TURN_LEAD + 1), frame + TURN_LEAD);
      return Math.round((near.reduce((sum, turn) => sum + turn, 0) / near.length) * 10) / 10;
    });
    tracks = {
      ...tracks,
      leftArm: {
        about: 'Vänster armbåge: hur många grader den är vriden kring linjen från axeln till handleden från sitt vanliga håll, per ruta, för att armen ska gå fri från skon, den vilande handen, bålen och bordet. Räknad när rörelsen flyttades till platsen.',
        turnDeg,
      },
    };
  }
  return { scene, doll, tracks, swingDeg, bow, ...(timing ? { timing } : {}) };
}

const placements = new WeakMap<DollMove, Placed>();

/** Spåren hängda i scenen. Räknas en gång per rörelse; en rörelse som redan är hängd i samma scen ändras inte. */
function placed(scene: SceneDescription, doll: DollDescription, move: DollMove): Placed {
  const known = placements.get(move);
  if (known && known.scene === scene && known.doll === doll) return known;
  const made = place(scene, doll, move, move.seat, move.index ?? 0);
  placements.set(move, made);
  return made;
}

/**
 * Samma rörelse till en annan plats: hämtad vid scenens sko och lagd på platsens kortplats `index` (den första om inget
 * annat sägs). `base` är rörelsen så som den lästes. Hand och kort är de lästa, burna i sidled och svängda; arm och kropp
 * räknas om av dockan själv. Med `cycle` blir den en cykel: given i cykelns takt, och tillbaka till REDO (se cycled).
 */
export function moveFor(scene: SceneDescription, doll: DollDescription, base: DollMove, seat: number, options: { index?: number; cycle?: DollCycle } = {}): DollMove {
  const { index = 0, cycle } = options;
  const made = place(scene, doll, base, seat, index, cycle);
  const same = seat === base.seat && index === 0;
  const card = index === 0 ? '' : `-kort-${index}`;
  const move: DollMove = {
    ...base,
    ...made.timing,
    ...(cycle
      ? { about: cycle.about, id: `${cycle.id}-plats-${seat}-kort-${index}`, from: cycle.from, to: cycle.to }
      : { id: same ? base.id : `${base.id}-till-plats-${seat}${card}`, to: same ? base.to : `LAGT ${seat}` }),
    seat,
    ...(index === 0 ? {} : { index }),
    swingDeg: made.swingDeg,
    bow: made.bow,
    tracks: made.tracks,
  };
  placements.set(move, made);
  return move;
}

/** Ögonblicket mellan två rutor av spåren. `share` är hur långt från den första mot den andra. */
function momentOf(move: DollMove, tracks: Tracks, frame: number, next: number, share: number, lookUp: number): Moment {
  const between = (track: Vec3[]): Vec3 => mix(track[frame]!, track[next]!, share);
  const hand = (track: Vec3[][]): Vec3[] => track[frame]!.map((point, k) => mix(point, track[next]![k]!, share));
  const from = (track: Vec3[]): Vec3 => sub(between(track), track[0]!);
  const { card, leftHand, rightHand, body, leftArm } = tracks;
  const at = frame + share;
  // I en cykel: hur stor del av vägen tillbaka handen har gått, från att den lämnar kortet.
  const back = move.back;
  const away = back && at > back.letsGo ? Math.min(1, (at - back.letsGo) / (back.home - back.letsGo)) : null;
  return {
    card: { centre: between(card.centre), long: between(card.long), face: between(card.face) },
    // Nästa kort står där kortet stod i rörelsens första ruta.
    fetch: away === null ? null : { centre: card.centre[0]!, long: card.long[0]!, face: card.face[0]! },
    lookBack: away === null ? 0 : smooth(away / back!.look),
    left: hand(leftHand.points),
    right: hand(rightHand.points),
    body: { left: from(body.leftShoulder), right: from(body.rightShoulder), head: from(body.head) },
    elbowTurn: leftArm ? radians(leftArm.turnDeg[frame]! + (leftArm.turnDeg[next]! - leftArm.turnDeg[frame]!) * share) : 0,
    // Handen sänks mot filten medan kortet fälls ned, och vilar på den när kortet ligger. I en cykel lättar den när den
    // lämnar kortet, så att bågen lyfter den.
    settle: away === null ? smooth((at - move.moments.folds) / (move.moments.rests - move.moments.folds)) : 1 - smooth(away / back!.release),
    lookUp,
  };
}

/**
 * Dockans ställning `time` sekunder in i rörelsen, i scenen. Rörelsen hängs i scenens sko och i rörelsens kortplats
 * (`move.seat`, `move.index`). Tiden hålls inom rörelsen: före början gäller första rutan, efter slutet den sista.
 */
export function poseAt(scene: SceneDescription, doll: DollDescription, move: DollMove, time: number): DollPose {
  const { tracks } = placed(scene, doll, move);
  const at = Math.max(0, Math.min(move.seconds, time)) * move.fps;
  const frame = Math.min(move.frameCount - 2, Math.floor(at));
  // Hon ser på kortet från skon tills det ligger, genom hela vändningen. Sedan lyfter hon blicken mot spelarna; i en
  // cykel ser hon i stället på kortet tills handen lämnar det, och sedan på nästa kort i skon (momentOf).
  const since = (at - move.moments.rests) / move.fps;
  const lookUp = move.back ? 0 : doll.gaze.share * smooth(since / doll.gaze.seconds);
  return compose(scene, doll, momentOf(move, tracks, frame, frame + 1, Math.min(1, at - frame), lookUp));
}

// En punkt räknas som inne i skon först så här långt innanför höljet, i meter.
const SHOE_MARGIN = 0.005;

/**
 * Rutorna där en punkt i den givande handen, eller kortets mitt, är inne i skon. Skon är ett hölje kring scenens modell
 * (`shoeEnvelope` i content/doll.json): en låda vars tak sluttar från bakänden fram till `boxEnd`, och därifrån mynningens
 * kil ned till nosen. En rörelse flyttad till en plats på skons sida kan bära handen rakt genom skon, och det märker
 * ingen led. En tom lista betyder att handen går fri.
 */
export function throughShoe(scene: SceneDescription, doll: DollDescription, move: DollMove): number[] {
  const { tracks } = placed(scene, doll, move);
  const skeleton = handSkeleton(doll);
  const frames: number[] = [];
  for (let frame = 0; frame < move.frameCount; frame++) {
    if (!shoeTested(move, frame)) continue;
    const hand = onFelt(fitHand(skeleton, tracks.leftHand.points[frame]!, 'left', GRIP), skeleton.radius, 0);
    if ([tracks.card.centre[frame]!, ...hand].some((point) => intoShoe(scene, doll, point, -SHOE_MARGIN) > 0)) frames.push(frame);
  }
  return frames;
}

/**
 * Rutorna där den givande armen, handen eller kortet går in i något, hinder för hinder: skon, den vilande handen med sin
 * handled och underarm, bålen, och bordet framför dealerns bordskant. Lemmarna prövas med sina radier, som de ritas.
 * Skon prövas från att kortet är taget, och i en cykel tills handen nyper nästa kort; medan kortet tas och nästa nyps är
 * fingrarna i mynningen (shoeTested). Tomma listor betyder att armen går fri.
 */
export function armHits(scene: SceneDescription, doll: DollDescription, move: DollMove): { shoe: number[]; restingHand: number[]; torso: number[]; table: number[] } {
  const found = { shoe: [] as number[], restingHand: [] as number[], torso: [] as number[], table: [] as number[] };
  for (let frame = 0; frame < move.frameCount; frame++) {
    const pose = poseAt(scene, doll, move, frame / move.fps);
    const taken = shoeTested(move, frame);
    const arm = depthsOf(scene, doll, pose, armBalls(doll, pose.arms.left), taken, 0);
    const hand = depthsOf(scene, doll, pose, handBalls(doll, pose), taken, 0);
    if (Math.max(arm.shoe, hand.shoe) > TOUCHING) found.shoe.push(frame);
    if (Math.max(arm.restingHand, hand.restingHand) > TOUCHING) found.restingHand.push(frame);
    if (Math.max(arm.torso, hand.torso) > TOUCHING) found.torso.push(frame);
    if (arm.table > TOUCHING) found.table.push(frame);
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------
// Läsning

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isPoint = (value: unknown): boolean => Array.isArray(value) && value.length === 3 && value.every(isNumber);
const isPair = (value: unknown): boolean => Array.isArray(value) && value.length === 2 && value.every(isNumber);
const isMarked = (group: Partial<Marked> | undefined): boolean =>
  (group?.basis === 'mätt' || group?.basis === 'antaget') && typeof group?.source === 'string' && group.source !== '';

/**
 * Tar emot innehållet i content/doll.json och säger på svenska vad som saknas eller inte är ett tal.
 * En docka med ett hål i ska inte ritas: den skulle se rimlig ut och vara fel.
 */
export function readDoll(value: unknown): DollDescription {
  const doll = value as Partial<DollDescription> | null;
  const wrong: string[] = [];
  const need = (ok: boolean, what: string) => {
    if (!ok) wrong.push(what);
  };
  const positive = (...values: unknown[]): boolean => values.every((entry) => isNumber(entry) && entry > 0);
  const marked = (group: Partial<Marked> | undefined, what: string) => need(isMarked(group), `${what}: basis och source`);

  const { sitting, body, arm, gaze, shape, hand, rest, pickUp: fetch, shoeEnvelope } = doll ?? {};
  need(positive(sitting?.behindEdge, sitting?.hipBelowFelt) && isNumber(sitting?.neckLift), 'sitting.behindEdge, sitting.hipBelowFelt och sitting.neckLift');
  marked(sitting, 'sitting');
  need(isNumber(body?.centreX) && positive(body?.shoulderHeight, body?.shoulderHalfWidth, body?.eyeHeight), 'body.centreX, body.shoulderHeight, body.shoulderHalfWidth och body.eyeHeight');
  need(isNumber(body?.head?.x) && positive(body?.head?.height, body?.head?.radius), 'body.head');
  marked(body, 'body');
  need(positive(arm?.upper, arm?.fore, arm?.reach, arm?.mostLean, arm?.mostTwist), 'arm');
  need(positive(arm?.upper, arm?.fore, arm?.reach) && arm!.reach < arm!.upper + arm!.fore, 'arm.reach ska vara kortare än armens två ben');
  marked(arm, 'arm');
  need([gaze?.down, gaze?.ahead, gaze?.share].every(isNumber) && positive(gaze?.seconds), 'gaze');
  marked(gaze, 'gaze');
  need(positive(shape?.torso?.width, shape?.torso?.height, shape?.torso?.depth, shape?.torso?.centre), 'shape.torso');
  need(positive(shape?.yoke, shape?.shoulder, shape?.elbow, shape?.wrist), 'shape.yoke, shape.shoulder, shape.elbow och shape.wrist');
  need([shape?.neck, shape?.upperArm, shape?.forearm].every(isPair), 'shape.neck, shape.upperArm och shape.forearm');
  need(positive(shape?.head?.scale, shape?.head?.nose?.radius, shape?.head?.neckAt) && isPoint(shape?.head?.skull) && isPoint(shape?.head?.nose?.at), 'shape.head');
  marked(shape, 'shape');
  need(Array.isArray(hand?.rest) && hand.rest.length === 21 && hand.rest.every(isPoint), 'hand.rest ska ha 21 punkter');
  need(positive(hand?.radius?.wrist, hand?.radius?.knuckle, hand?.radius?.joint, hand?.radius?.tip), 'hand.radius');
  marked(hand, 'hand');
  need(positive(rest?.wristFromCentre, rest?.fingertipsBeforeEdge) && isNumber(rest?.toeInDeg), 'rest');
  marked(rest, 'rest');
  need(isNumber(fetch?.foot) && positive(fetch?.lift, fetch?.leanDeg) && isNumber(fetch?.nextBehind), 'pickUp');
  marked(fetch, 'pickUp');
  need(positive(shoeEnvelope?.halfWidth, shoeEnvelope?.backHeight, shoeEnvelope?.boxHeight, shoeEnvelope?.noseHeight) && isNumber(shoeEnvelope?.boxEnd), 'shoeEnvelope');
  marked(shoeEnvelope, 'shoeEnvelope');

  if (wrong.length > 0) throw new Error(`Dockans beskrivning går inte att använda: ${wrong.join('; ')}`);
  return doll as DollDescription;
}

/** Tar emot en rörelse ur content/moves/ och säger på svenska vad som saknas, inte är ett tal eller har fel antal rutor. */
export function readMove(value: unknown): DollMove {
  const move = value as Partial<DollMove> | null;
  const wrong: string[] = [];
  const need = (ok: boolean, what: string) => {
    if (!ok) wrong.push(what);
  };
  const count = move?.frameCount;
  const frames = isNumber(count) && Number.isInteger(count) && count >= 2;
  const isTrack = (track: unknown): boolean => Array.isArray(track) && track.length === count && track.every(isPoint);
  const isHand = (track: unknown): boolean =>
    Array.isArray(track) && track.length === count && track.every((points) => Array.isArray(points) && points.length === 21 && points.every(isPoint));
  const isFrame = (frame: unknown): boolean => isNumber(frame) && Number.isInteger(frame) && frame >= 0 && frames && frame < count!;

  need([move?.id, move?.from, move?.to, move?.grip].every((text) => typeof text === 'string' && text !== ''), 'id, from, to och grip');
  need(isNumber(move?.seat), 'seat');
  need(frames, 'frameCount ska vara minst 2');
  need(isNumber(move?.fps) && move.fps > 0, 'fps');
  need(isNumber(move?.seconds) && frames && isNumber(move?.fps) && Math.abs(move.seconds - (count! - 1) / move.fps) < 1e-3, 'seconds ska vara (frameCount − 1) / fps');
  need(isMarked(move ?? undefined), 'basis och source');
  const { leavesShoe, edge, folds, rests } = move?.moments ?? {};
  need(
    [leavesShoe, folds, rests].every(isFrame) && Array.isArray(edge) && edge.length === 2 && edge.every(isFrame) && leavesShoe! < edge[0] && edge[0] <= edge[1] && edge[1] < rests!,
    'moments: leavesShoe, edge, folds och rests ska vara rutor i den ordningen',
  );
  const { card, leftHand, rightHand, body, leftArm } = move?.tracks ?? {};
  need(isTrack(card?.centre) && isTrack(card?.long) && isTrack(card?.face), `tracks.card ska ha ${count} rutor`);
  need(isHand(leftHand?.points), `tracks.leftHand ska ha ${count} rutor med 21 punkter`);
  need(isHand(rightHand?.points), `tracks.rightHand ska ha ${count} rutor med 21 punkter`);
  need(isTrack(body?.leftShoulder) && isTrack(body?.rightShoulder) && isTrack(body?.head), `tracks.body ska ha ${count} rutor`);
  need(leftArm === undefined || (Array.isArray(leftArm.turnDeg) && leftArm.turnDeg.length === count && leftArm.turnDeg.every(isNumber)), `tracks.leftArm ska ha ${count} rutor`);
  need([card?.about, leftHand?.about, rightHand?.about, body?.about, leftArm ? leftArm.about : '-'].every((text) => typeof text === 'string' && text !== ''), 'tracks: varje spår ska säga vad det är (about)');
  need(move?.index === undefined || (Number.isInteger(move.index) && move.index >= 0), 'index ska vara ett heltal från 0');
  const back = move?.back;
  need(
    back === undefined ||
      ([back.letsGo, back.home].every(isFrame) && rests !== undefined && rests <= back.letsGo && back.letsGo < back.home &&
        [back.pace, back.release, back.look].every((value) => isNumber(value) && value > 0) && [back.lift, back.bow].every(isNumber)),
    'back: letsGo och home ska vara rutor efter rests, och pace, lift, bow, release och look tal',
  );

  if (wrong.length > 0) throw new Error(`Rörelsen går inte att använda: ${wrong.join('; ')}`);
  return move as DollMove;
}

/** Om en fil ur content/moves/ är en cykel och inte en rörelse: en cykel pekar ut sin giv (`give`). */
export const isCycle = (value: unknown): boolean => typeof (value as { give?: unknown } | null)?.give === 'string';

/** Tar emot en cykel ur content/moves/ och säger på svenska vad som saknas eller inte går ihop. */
export function readCycle(value: unknown): DollCycle {
  const cycle = value as Partial<DollCycle> | null;
  const wrong: string[] = [];
  const need = (ok: boolean, what: string) => {
    if (!ok) wrong.push(what);
  };
  need([cycle?.id, cycle?.from, cycle?.to, cycle?.give, cycle?.about].every((text) => typeof text === 'string' && text !== ''), 'id, from, to, give och about');
  need(cycle?.from === cycle?.to, 'en cykel slutar där den börjar: from och to ska vara samma');
  const parts = cycle?.parts;
  const lengths = [parts?.ready, parts?.deal, parts?.onCard, parts?.back, parts?.still];
  need(isNumber(parts?.deal) && isNumber(parts?.back) && parts.deal > 0 && parts.back > 0 && lengths.every((part) => isNumber(part) && part >= 0), 'parts: deal och back över 0, ready, onCard och still från 0');
  need(isNumber(cycle?.seconds) && lengths.every(isNumber) && Math.abs(lengths.reduce((sum: number, part) => sum + part!, 0) - cycle.seconds) < 1e-6, 'seconds ska vara summan av parts');
  const back = cycle?.back;
  need(isNumber(back?.lift) && back.lift >= 0 && [back?.release, back?.look].every((share) => isNumber(share) && share > 0 && share <= 1), 'back: lift från 0, release och look andelar över 0 och högst 1');
  need(isMarked(cycle ?? undefined), 'basis och source');
  if (wrong.length > 0) throw new Error(`Cykeln går inte att använda: ${wrong.join('; ')}`);
  return cycle as DollCycle;
}
