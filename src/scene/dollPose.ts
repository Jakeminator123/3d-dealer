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
  /**
   * Blicken när kortet ligger: en punkt framför huvudet, hur stor del av vägen dit blicken går och på hur lång tid. `ready`
   * är kortplatsen hon ser på i REDO, mitt på bordet (readyGaze); den är gemensam för alla cykler.
   */
  gaze: Marked & { down: number; ahead: number; share: number; seconds: number; ready: { seat: Seat; index: number } };
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

/** Platsen ett kort läggs på: en spelarplats 1–7, eller `D` för dealern (content/scene.json, places). */
export type Seat = number | 'D';

/**
 * Vad en cykel gör med kortet, med samma ord som registrets `action`: `deal` lägger ett kort med framsidan upp, `hole`
 * lägger hålkortet med baksidan upp, utan att vända det, och `flip` vänder hålkortet där det ligger, utan att dra något
 * kort. Spelkärnan säger samma sak som deal med faceDown och reveal (src/engine/presentation.ts, filmedDealTarget).
 * `wait` delar inget kort: hon väntar i REDO medan spelaren bestämmer sig, med handen vid kortet i skon (waited).
 */
export type Action = 'deal' | 'hole' | 'flip' | 'wait';
export const ACTIONS: readonly Action[] = ['deal', 'hole', 'flip', 'wait'];

/**
 * En rörelse så som den står i content/moves/. Spåren har en post per ruta, i meter i scenens mått på ett olutat bord.
 * `seat` är platsen kortet läggs på, och `moments` är rutorna där kortet lämnar skon, står på kant, fälls och ligger.
 * `action` är vad en cykel gör med kortet; utan den lägger den det med framsidan upp.
 */
export type DollMove = Marked & {
  schemaVersion: number;
  about: string;
  id: string;
  from: string;
  to: string;
  grip: string;
  seat: Seat;
  action?: Action;
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
  /** Finns när rörelsen är en cykel: blick, huvud, bål och andning (Life). */
  life?: Life;
  tracks: {
    card: { about: string; centre: Vec3[]; long: Vec3[]; face: Vec3[] };
    /**
     * Finns i en vändning: nästa kort i skons mynning, som handen nyper i REDO. I en giv är det kortets första läge, men i
     * en vändning är kortet i spåren hålkortet på bordet.
     */
    next?: { about: string; centre: Vec3; long: Vec3; face: Vec3 };
    /** `settle` finns i en vändning: hur stor del av vägen ned mot filten givhanden är sänkt i varje ruta (se Moment). */
    leftHand: { about: string; points: Vec3[][]; settle?: number[] };
    rightHand: { about: string; points: Vec3[][] };
    body: { about: string; leftShoulder: Vec3[]; rightShoulder: Vec3[]; head: Vec3[] };
    /** Finns när en flyttad rörelse behöver det: hur vänster armbåge är vriden från sitt vanliga håll, grader per ruta. */
    leftArm?: { about: string; turnDeg: number[] };
    /** Finns i en cykel: bålens planerade lutning (Lean). Utan den lutar hon sig bara där armen inte når. */
    lean?: Lean;
    /** Finns i en väntan: hur stor del av vägen blicken har gått från kortet i skon upp mot spelarna, per ruta (waited). */
    lookUp?: { about: string; share: number[] };
  };
};

/**
 * Vägen tillbaka i en cykel, så som den är räknad. Rutorna räknas i cykelns egen takt.
 * - `letsGo`: rutan där handen lämnar det lagda kortet; `home`: rutan där den åter nyper nästa kort i skon, i REDO.
 * - `pace`: hur många av den lästa rörelsens rutor en ruta i cykelns giv svarar mot.
 * - `lift`, `bow`: hur högt över den raka vägen och hur långt ut mot spelarna handen bågar som mest, i meter.
 * - `release`, `look`: andelen av vägen tillbaka då handen har lämnat filten, och då blicken har nått nästa kort.
 * - `out`, bara i en vändning: rutorna där handen lämnar REDO och där den når hålkortet på bordet. Dit går den samma väg
 *   som tillbaka, baklänges, och nästa kort står kvar i skon.
 */
export type Back = { letsGo: number; home: number; pace: number; lift: number; bow: number; release: number; look: number; out?: [number, number]; clear?: number };

/**
 * Det som gör en cykel levande i stället för stel (content/moves/cykel-*.json, `life`). Tider i sekunder.
 * - `gazeLead`: blicken ligger så långt före kortet: den ser dit kortet är om så lång tid. Den växer in från REDO.
 * - `headLag`, `headShare`, `headSpan`: huvudets riktning släpar så långt efter blicken och vrids den andelen av vägen
 *   från REDO mot dit blicken ser; ögonen tar resten. Blicken vägs över `headSpan` sekunder, så att huvudet vrids jämnt.
 * - `trunkLead`, `trunkLag`: bålens lutning mot kortplatsen börjar så långt före handen lämnar REDO, och går tillbaka
 *   från så långt efter att handen lämnat kortet till cykelns slut. `leanLeast`: minsta lutning (radianer), också där
 *   armen når utan den.
 * - `effort`: handens väg i given räknas som greppets väg plus så många meter per radian kortet vrids, och spelas med
 *   minsta ryck längs den vägen.
 * - `breath`: andning och sväng, noll i REDO: axlarna lyfts `rise` meter och huvudet `head`, `cycles` gånger per cykel,
 *   huvudet svänger `sway` meter i sidled en gång per cykel och vrids `turn` grader fram och tillbaka, och den vilande
 *   handens pek- och långfinger lyfts `fingers` meter två gånger per cykel.
 * - `touch`: hur mycket handen lägger kortet och lämnar det i samma rörelse (0 till 1): med 0 stannar den med minsta ryck
 *   vid kortet, med 1 bromsar den in till kortet och lyfter genast, som när man lägger ned något och tar handen till sig.
 * - `calm`: hur många gånger givens lästa spår jämnas ut innan de spelas fortare: handen och kortet `hand`, kroppen och
 *   den vilande handen `body` (calmed).
 * - `breath.still`: andningen och svängen vägs med (1 − cos)/2 över cykeln, så att de börjar och slutar med farten noll i
 *   REDO och klippet kan följa på en cykel utan andning, och den på det.
 * - `look`: vart blicken går under given. `card` (när inget sägs): blicken följer kortet från skon, går tillbaka till nästa
 *   kort i skon, och går från och till REDO:s punkt (readyGaze) på `doll.gaze.seconds` sekunder. `place`: blicken går från
 *   REDO:s punkt till kortplatsen och tillbaka, aldrig mot skon; den är framme när kortet ligger (i en vändning när handen
 *   når hålkortet), ligger kvar tills handen lämnar kortet och är tillbaka vid cykelns slut (lookShare); huvudet kommer
 *   då hem med bålen.
 * - `nod`: en liten nick när kortet läggs, i grader: huvudet sänks och lyfts igen från `gazeLead` före kortet ligger
 *   tills handen lämnar det. Saknas den nickar hon inte.
 */
export type Life = {
  gazeLead: number;
  headLag: number;
  headShare: number;
  headSpan: number;
  trunkLead: number;
  trunkLag: number;
  leanLeast: number;
  effort: number;
  breath: { rise: number; head: number; sway: number; turn: number; fingers: number; cycles: number; still?: boolean };
  touch: number;
  calm: { hand: number; body: number };
  look?: 'card' | 'place';
  nod?: number;
};

/** Bålens planerade lutning i en cykel: radianer per ruta, mot en punkt, med vridningen åt `sign`. */
export type Lean = { about: string; amount: number[]; toward: Vec3; sign: number };

/**
 * En cykel så som den står i content/moves/: given `give` (en rörelse i samma mapp) och vägen tillbaka till REDO.
 * `parts` är takten i sekunder: stilla i REDO (`ready`), given från REDO tills kortet ligger (`deal`), handen kvar på
 * kortet (`onCard`), vägen tillbaka till nästa kort i skon (`back`) och stilla i REDO (`still`). De ska tillsammans
 * vara `seconds`.
 * `back` är bågen tillbaka: `lift` meter över den raka vägen som mest, och andelarna `release` och `look` (se Back).
 * Handen är avslappnad på vägen tillbaka: fingrarna öppnar sig ur greppet till dockans vilande hand tills andelen `open`
 * av vägen är gången, och sluter sig till nypet från andelen `close` tills handen är i skon.
 * `flip` är vändningen av hålkortet, inom samma `deal`: handen går ut till hålkortet på `reach` sekunder, lyfter det på
 * `pickUp` sekunder, och vänder och lägger det på resten av `deal`. `from` är givens ruta där lyftet vänder: där håller
 * handen kortet ovanför bordet strax före givens egen vändning (se cycled).
 * `push` är knuffen på kortet (saknas den, ingen knuff): kortet landar `reach` meter närmare dealern än sin plats, och
 * fingrarna skjuter det dit mot spelaren (hålkortet som förs plant: längs sin väg), från sekunden `from` till `to` räknat från
 * att kortet ligger (from negativt: knuffen börjar medan kortet läggs, så att det glider in), med minsta ryck och högst till
 * att handen lämnar kortet (`parts.onCard`). I en vändning knuffas kortet när det har vänts och lagts.
 * `hole` är hur hålkortet läggs: `given` (när inget sägs) är givens rörelse utan vändningen (unturned); `flat` för det
 * plant ur skon längs filten till sin plats, baksidan upp, utan lyft och vändning (slid).
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
  back: { lift: number; release: number; look: number; open: number; close: number };
  flip: { reach: number; pickUp: number; from: number };
  life: Life;
  push?: { reach: number; from: number; to: number };
  hole?: 'given' | 'flat';
  /**
   * Väntan (handlingen wait): blicken går andelen `look` av vägen från REDO:s punkt (readyGaze) upp mot spelarna
   * (doll.gaze), upp mellan sekunderna `up` och ned igen mellan `down`, med minsta ryck. Finns den inte görs ingen väntan.
   * `seconds` är väntans längd (annars cykelns), och `breath` dess andning (annars cykelns, life.breath).
   */
  wait?: { look: number; up: [number, number]; down: [number, number]; seconds?: number; breath?: Life['breath'] };
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
  /** Punkten huvudet är vänt mot: i en cykel släpar huvudet efter blicken och vrids inte hela vägen; annars blicken. */
  face: Vec3;
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

/**
 * Kortplatsen `index` på en plats, 0 för den första: en spelarplats i places.seats, eller dealerns i places.dealer
 * (content/scene.json). Dealerns kort 0 är det öppna kortet och kort 1 hålkortet.
 */
export function cardPlace(scene: SceneDescription, seat: Seat, index = 0): FeltPoint {
  const cards = seat === 'D' ? scene.places.dealer : scene.places.seats.find((entry) => entry.seat === seat)?.cards;
  const place = Number.isInteger(index) && index >= 0 ? cards?.[index] : undefined;
  const where = seat === 'D' ? 'dealern' : `plats ${seat}`;
  if (!place) throw new Error(index === 0 ? `Scenen har ingen första kortplats för ${where}` : `Scenen har ingen kortplats ${index} för ${where}`);
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
  const { mostLean, mostTwist } = doll.arm;
  const axis = leanAxis(trunk, wrist);
  const far = (lean: number, twist: number): number => size(sub(wrist, bent(trunk, axis, lean, twist).left));
  const twistFor = (lean: number): number => {
    const twist = (mostTwist * lean) / mostLean;
    return far(lean, twist) < far(lean, -twist) ? twist : -twist;
  };
  const lean = leastLean(doll, (lean) => far(lean, twistFor(lean)));
  return lean === 0 ? trunk : bent(trunk, axis, lean, twistFor(lean));
}

/** Axeln hon böjer sig kring för att luta sig mot en punkt: vågrät, tvärs riktningen från höften dit. */
function leanAxis(trunk: Trunk, toward: Vec3): Vec3 {
  const way = sub(toward, trunk.hip);
  return cross(UP, unit([way[0], 0, way[2]]));
}

/** Kroppen böjd `lean` radianer från höften kring `axis` och vriden `twist` kring sin egen lodlinje; huvudet något mindre. */
function bent(trunk: Trunk, axis: Vec3, lean: number, twist: number): Trunk {
  if (lean === 0 && twist === 0) return trunk;
  const posed = (point: Vec3, by: number, turn: number): Vec3 => add(trunk.hip, turned(turned(sub(point, trunk.hip), axis, by), turned(UP, axis, by), turn));
  return {
    hip: trunk.hip,
    left: posed(trunk.left, lean, twist),
    right: posed(trunk.right, lean, twist),
    neck: posed(trunk.neck, lean, twist),
    head: posed(trunk.head, lean * 0.85, twist * 0.5),
  };
}

/** Den minsta lutning (radianer, högst mostLean) där axeln når handleden, när `far` säger avståndet vid en lutning. */
function leastLean(doll: DollDescription, far: (lean: number) => number): number {
  const { reach, mostLean } = doll.arm;
  if (far(0) <= reach) return 0;
  let low = 0;
  let high = mostLean;
  for (let step = 0; step < 30; step++) {
    const middle = (low + high) / 2;
    if (far(middle) > reach) low = middle;
    else high = middle;
  }
  return high;
}

/** Vridningen som hör till en lutning mot kortplatsen, åt hållet `sign`. */
const twistOf = (doll: DollDescription, lean: number, sign: number): number => (sign * doll.arm.mostTwist * lean) / doll.arm.mostLean;

/** Kroppen lutad som en cykel planerat: `amount` radianer mot punkten `toward`, med vridningen åt `sign` (Lean). */
function leanedTo(doll: DollDescription, trunk: Trunk, amount: number, toward: Vec3, sign: number): Trunk {
  return bent(trunk, leanAxis(trunk, toward), amount, twistOf(doll, amount, sign));
}

/** Den minsta lutning mot `toward` som gör att axeln når handleden. */
function leanNeeded(doll: DollDescription, trunk: Trunk, wrist: Vec3, toward: Vec3, sign: number): number {
  const axis = leanAxis(trunk, toward);
  return leastLean(doll, (lean) => size(sub(wrist, bent(trunk, axis, lean, twistOf(doll, lean, sign)).left)));
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
  /** I en cykel: bålens planerade lutning just då (Lean). Annars null, och hon lutar sig bara där armen inte når. */
  lean: { amount: number; toward: Vec3; sign: number } | null;
};

const STILL: Moment['body'] = { left: [0, 0, 0], right: [0, 0, 0], head: [0, 0, 0] };

/** Händerna i scenen och kroppen innan den lutar sig: det ställningen och lutningen räknas ur. */
function reachOf(scene: SceneDescription, doll: DollDescription, moment: Moment): { left: Vec3[]; right: Vec3[]; upright: Trunk } {
  const skeleton = handSkeleton(doll);
  const onTable = (points: Vec3[], settle: number): Vec3[] => onFelt(points, skeleton.radius, settle).map((point) => tilted(scene, point));
  const left = onTable(fitHand(skeleton, moment.left, 'left', GRIP), moment.settle);
  // Den vilande handen ligger på filten hela tiden.
  const right = onTable(fitHand(skeleton, moment.right, 'right', RESTING), 1);
  return { left, right, upright: shifted(doll, sittingTrunk(scene, doll), moment.body) };
}

/** Punkten framför henne som hon ser på i VILA och mot spelarna (content/doll.json, gaze). */
const aheadOf = (doll: DollDescription, head: Vec3): Vec3 => [head[0], head[1] - doll.gaze.down, head[2] + doll.gaze.ahead];

/**
 * Punkten hon ser på i REDO: kortplatsen `gaze.ready` (content/doll.json) på den lutade filten, mitt på bordet. Hon ser
 * inte på skon: handen nyper kortet i mynningen utan att hon ser dit. Gemensam för alla cykler, som REDO är.
 */
export function readyGaze(scene: SceneDescription, doll: DollDescription): Vec3 {
  const [x, z] = cardPlace(scene, doll.gaze.ready.seat, doll.gaze.ready.index);
  return tilted(scene, [x, 0, z]);
}

/** Punkten hon ser på: kortet hon delar, och när hon har släppt det nästa kort i skon. Utan kort framför sig. */
function lookOf(scene: SceneDescription, doll: DollDescription, moment: Moment, head: Vec3): Vec3 {
  const dealt = moment.card && cardOnTable(scene, moment.card);
  const fetched = moment.fetch && cardOnTable(scene, moment.fetch);
  const ahead = aheadOf(doll, head);
  return fetched && dealt ? mix(dealt.centre, fetched.centre, moment.lookBack) : dealt ? mix(dealt.centre, ahead, moment.lookUp) : ahead;
}

function compose(scene: SceneDescription, doll: DollDescription, moment: Moment): DollPose {
  const { left, right, upright } = reachOf(scene, doll, moment);
  const trunk = moment.lean ? leanedTo(doll, upright, moment.lean.amount, moment.lean.toward, moment.lean.sign) : leaned(doll, upright, left[0]!);
  const dealt = moment.card && cardOnTable(scene, moment.card);
  const fetched = moment.fetch && cardOnTable(scene, moment.fetch);
  // Hon ser på kortet hon delar. När hon har släppt det går blicken tillbaka till nästa kort i skon.
  const gaze = lookOf(scene, doll, moment, trunk.head);
  return {
    hip: trunk.hip,
    torso: mix(trunk.hip, mix(trunk.left, trunk.right, 0.5), doll.shape.torso.centre),
    neck: trunk.neck,
    head: trunk.head,
    gaze,
    face: gaze,
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
  return compose(scene, doll, { card: null, fetch: null, lookBack: 0, left, right, body: STILL, elbowTurn: 0, settle: 1, lookUp: 1, lean: null });
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
type Timing = Pick<DollMove, 'frameCount' | 'seconds' | 'moments' | 'back' | 'life'>;
type Placed = { scene: SceneDescription; doll: DollDescription; tracks: Tracks; swingDeg: number; bow: number; timing?: Timing };

/**
 * Om skon prövas i en ruta. Inte medan fingrarna är i skons mynning: från REDO tills kortet har lämnat skon och
 * CLEAR_AFTER rutor till, och i en cykel lika många rutor före REDO på slutet, när nästa kort nyps. CLEAR_AFTER räknas i
 * den lästa rörelsens rutor och förs över i cykelns takt.
 */
function shoeTested(move: DollMove, frame: number): boolean {
  const clear = move.moments.leavesShoe + (move.back ? (move.back.clear ?? Math.ceil(CLEAR_AFTER / move.back.pace)) : CLEAR_AFTER);
  return frame > clear && (!move.back || frame < move.back.home - clear);
}

/** Minsta ryck: så rör sig en hand som sträcker sig efter något, från stilla till stilla. */
const easeReach = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 - 15 * t + 6 * t * t));

/**
 * Fram till kortet och från det, med `touch` (Life): mjuk start och en inbromsning som slutar utan att dröja (4t³ − 3t⁴,
 * farten under en tiondel bara de sista 1,5 % av tiden mot 7,5 % med minsta ryck), och samma baklänges från kortet.
 */
const toCard = (t: number, touch: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : (1 - touch) * easeReach(t) + touch * (4 * t ** 3 - 3 * t ** 4));
const fromCard = (t: number, touch: number): number => 1 - toCard(1 - t, touch);

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

/**
 * En avslappnad vänsterhand: dockans vilande högerhand (content/doll.json, hand.rest) spegelvänd, som i VILA. Fingrarna är
 * lätt krökta och skilda åt, utan grepp. Den är formen handen har mitt på vägen tillbaka i en cykel.
 */
export const relaxedLeft = (doll: DollDescription): Vec3[] => doll.hand.rest.map((point): Vec3 => [-point[0], point[1], point[2]]);

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

// Rutorna före och efter givens kantläge (moments.edge) där kortet vänds i den lästa given.
const TURN_AROUND = 3;

/** Hur mycket ett korts framsida vrids kring långsidan mellan två rutor av ett kortspår, med tecken, i radianer. */
function rollBetween(card: Tracks['card'], a: number, b: number): number {
  const from = unit(card.long[a]!);
  const to = unit(card.long[b]!);
  // Framsidan förs först med den kortaste vridning som för långsidan dit den är i nästa ruta; det som återstår är vridningen kring den.
  const axis = cross(from, to);
  const carried = size(axis) > 1e-9 ? turned(card.face[a]!, unit(axis), Math.atan2(size(axis), dot(from, to))) : card.face[a]!;
  const flat = (v: Vec3): Vec3 => sub(v, mul(to, dot(v, to)));
  const was = flat(carried);
  const is = flat(card.face[b]!);
  return Math.atan2(dot(cross(was, is), to), dot(was, is));
}

/**
 * Givens kort utan vändningen: hålkortet, som läggs med baksidan upp. Kortet har givens läge och yta i varje ruta, men
 * kring kantläget, där given vänder kortet (moments.edge och TURN_AROUND rutor åt varje håll), vrids det tillbaka kring
 * sin långsida i takt med givens egen vridning, ett halvt varv i allt. Därefter är det givens kort med framsidan nedåt.
 * Handen rörs inte: den håller samma yta på samma ställe, och bara vilken sida som är upp skiljer.
 */
export function unturned(card: Tracks['card'], moments: DollMove['moments']): Tracks['card'] {
  const from = Math.max(0, moments.edge[0] - TURN_AROUND);
  const to = Math.min(card.face.length - 1, moments.edge[1] + TURN_AROUND);
  const rolled = [0];
  for (let frame = from + 1; frame <= to; frame++) rolled.push(rolled.at(-1)! + rollBetween(card, frame - 1, frame));
  const whole = rolled.at(-1)!;
  if (Math.abs(whole) < Math.PI / 2) throw new Error(`Given vänder inte kortet vid kantläget: det vrids ${Math.round(degrees(whole))} grader kring långsidan`);
  const face = card.face.map((face, frame) => {
    const by = frame < from ? 0 : frame > to ? Math.PI : (-Math.PI * rolled[frame - from]!) / Math.abs(whole);
    return by === 0 ? face : turned(face, unit(card.long[frame]!), by);
  });
  return { ...card, about: `${card.about} Hålkortet: samma kort utan vändningen, med baksidan upp när det ligger (dollPose.ts, unturned).`, face };
}

/** Den andel s av vägen där `ease(s)` är `value`, för en växande kurva från 0 till 1. */
function inverseOf(ease: (t: number) => number, value: number): number {
  let low = 0;
  let high = 1;
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;
    if (ease(middle) < value) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** Den andel s av vägen där smooth(s) är `value`. */
const smoothInverse = (value: number): number => inverseOf(smooth, value);

/**
 * Givens rutor som en väg: hur långt hand och kort har gått från första rutan till ruta k, för k = 0 … `last`. Vägen är
 * greppets sträcka plus `effort` meter per radian kortet vrids, så att en vändning eller fällning tar tid också där
 * handen nästan står still. Med `upright` räknas bara greppets höjd: i en vändning står handen över platsen i sidled.
 */
function pathOf(tracks: Tracks, last: number, effort: number, upright = false): number[] {
  const { card, leftHand } = tracks;
  const axesOf = (k: number): Vec3[] => {
    const long = unit(card.long[k]!);
    const face = unit(card.face[k]!);
    return [long, face, cross(long, face)];
  };
  const out = [0];
  for (let k = 1; k <= last; k++) {
    const move = sub(mean(leftHand.points[k]!, GRIP), mean(leftHand.points[k - 1]!, GRIP));
    const step = upright ? Math.abs(move[1]) : size(move);
    out.push(out[k - 1]! + step + effort * rotationBetween(axesOf(k - 1), axesOf(k)).angle);
  }
  return out;
}

/**
 * Ett läst spår lugnat: utjämnat med (1 2 1)/4 `passes` gånger, med första rutan och rutorna från `last` orörda. Det
 * lästa bruset blir annars ryck när given spelas fortare än den lästes.
 */
function calmTrack<T>(track: T[], last: number, passes: number, blend: (a: T, b: T, t: number) => T): T[] {
  let out = track;
  for (let pass = 0; pass < passes; pass++) {
    const was = out;
    out = was.map((value, k) => (k === 0 || k >= last || k === was.length - 1 ? value : blend(blend(was[k - 1]!, was[k + 1]!, 0.5), value, 0.5)));
  }
  return out;
}

/**
 * Givens spår lugnade för en cykel (Life.calm): handen och kortet `hand` gånger och kroppen och den vilande handen
 * `body` gånger, fram till att kortet ligger. REDO och allt från att kortet ligger är som det lästes.
 */
function calmed(tracks: Tracks, last: number, calm: Life['calm']): Tracks {
  const { card, leftHand, rightHand, body } = tracks;
  return {
    ...tracks,
    card: { ...card, centre: calmTrack(card.centre, last, calm.hand, mix), long: calmTrack(card.long, last, calm.hand, mix), face: calmTrack(card.face, last, calm.hand, mix) },
    leftHand: { ...leftHand, points: calmTrack(leftHand.points, last, calm.hand, mixPoints) },
    rightHand: { ...rightHand, points: calmTrack(rightHand.points, rightHand.points.length, calm.body, mixPoints) },
    body: {
      ...body,
      leftShoulder: calmTrack(body.leftShoulder, body.leftShoulder.length, calm.body, mix),
      rightShoulder: calmTrack(body.rightShoulder, body.rightShoulder.length, calm.body, mix),
      head: calmTrack(body.head, body.head.length, calm.body, mix),
    },
  };
}

// Hålkortet plant ur skon (slid): så långt utanför nosens spets kortets bakre kortsida är när det ligger plant, i meter,
// och hur många prov vägen delas i när den mäts.
const SLIDE_CLEAR = 0.02;
const SLIDE_SAMPLES = 200;

/** Ett korts axlar: långsidan, framsidan och tvärs. */
const cardAxes = (card: Standing): Vec3[] => {
  const long = unit(card.long);
  const face = unit(sub(card.face, mul(long, dot(card.face, long))));
  return [long, face, cross(long, face)];
};

/**
 * Hålkortet fört plant ur skon längs filten till sin plats (DollCycle.hole `flat`), som en verklig dealer gör: det lyfts
 * aldrig och vänds inte. Kortet `from` står i mynningen som i REDO; det fälls bakåt tills det ligger plant med baksidan
 * upp (dess nedre kortsida glider ut ur mynningen), förs ut längs skons mittlinje tills det är SLIDE_CLEAR utanför nosens
 * spets, och glider vidare på filten till `to`, där det ligger som hålkortet i given när det har lagts. Vägen är en
 * jämn båge genom de tre lägena, delad efter sin längd. Kortet är plant när andelen `tipped` av vägen är gången (dubbelt så
 * långt som till läget utanför nosen), och
 * vrids under resten till sin riktning på platsen. Handen följer kortet: dess punkter räknade i kortets axlar går från
 * nypet i REDO (`hand0`) till handen på kortet när det ligger (`hand1`), och den sänks mot filten medan kortet fälls.
 */
function slid(scene: SceneDescription, from: Standing, hand0: Vec3[], to: Standing, hand1: Vec3[]): { at: (share: number) => { card: Standing; hand: Vec3[]; settle: number }; tipped: number } {
  const way = mouthWay(scene);
  const out = scene.shoe.length / 2 + scene.card.height / 2 + SLIDE_CLEAR;
  const middle: Vec3 = [scene.shoe.at[0] + way[0] * out, 0, scene.shoe.at[1] + way[2] * out];
  const start = from.centre;
  const end: Vec3 = [to.centre[0], 0, to.centre[2]];
  // Bågen (andra gradens Bézier) genom mitten: kontrollpunkten så att bågen når mitten halvvägs.
  const control = sub(mul(middle, 2), mul(add(start, end), 0.5));
  const bezier = (u: number): Vec3 => add(add(mul(start, (1 - u) ** 2), mul(control, 2 * u * (1 - u))), mul(end, u * u));
  const lengths = [0];
  for (let k = 1; k <= SLIDE_SAMPLES; k++) lengths.push(lengths[k - 1]! + size(sub(bezier(k / SLIDE_SAMPLES), bezier((k - 1) / SLIDE_SAMPLES))));
  const total = lengths.at(-1)!;
  const curveAt = (share: number): number => frameAlong(lengths, share * total) / SLIDE_SAMPLES;
  // Kortet fälls tills det har gått dubbelt så långt som till mitten (utanför nosen), så att fällningen inte går fort.
  const tipped = Math.min(1, (2 * lengths[SLIDE_SAMPLES / 2]!) / total);
  const axes0 = cardAxes(from);
  const flatLong = unit([axes0[0]![0], 0, axes0[0]![2]]);
  const flatAxes = [flatLong, [0, -1, 0] as Vec3, cross(flatLong, [0, -1, 0])];
  const axes1 = cardAxes(to);
  const tip = rotationBetween(axes0, flatAxes);
  const swing = rotationBetween(flatAxes, axes1);
  const localOf = (points: Vec3[], card: Standing, axes: Vec3[]): Vec3[] => points.map((point) => {
    const offset = sub(point, card.centre);
    return [dot(offset, axes[0]!), dot(offset, axes[1]!), dot(offset, axes[2]!)];
  });
  const local0 = localOf(hand0, from, axes0);
  const local1 = localOf(hand1, to, axes1);
  return {
    tipped,
    at: (share) => {
      const s = Math.max(0, Math.min(1, share));
      const tipShare = smooth(s / tipped);
      const swingShare = smooth(s);
      const axes = axes0.map((axis) => turned(turned(axis, tip.axis, tip.angle * tipShare), swing.axis, swing.angle * swingShare));
      const centre = bezier(curveAt(s));
      // Kortet lyfts av cardOnTable så att inget hörn går ned i filten; i mynningen står det på sin höjd.
      const lifted: Vec3 = [centre[0], from.centre[1] * (1 - tipShare), centre[2]];
      const shape = tipShare;
      const hand = local0.map((point, k) => {
        const local = mix(point, local1[k]!, shape);
        return add(lifted, add(add(mul(axes[0]!, local[0]), mul(axes[1]!, local[1])), mul(axes[2]!, local[2])));
      });
      return { card: { centre: lifted, long: axes[0]!, face: axes[1]! }, hand, settle: tipShare };
    },
  };
}

/** Givens ruta (med bråkdel) där vägen `path` har nått `along`. */
function frameAlong(path: number[], along: number): number {
  if (along <= 0) return 0;
  const last = path.length - 1;
  if (along >= path[last]!) return last;
  let k = 0;
  while (path[k + 1]! < along) k++;
  const step = path[k + 1]! - path[k]!;
  return k + (step > 0 ? (along - path[k]!) / step : 0);
}

/**
 * Given hängd i scenen gjord till en cykel, i cykelns takt. Spåren är på ett olutat bord, som rörelsens.
 *
 * Handen står i REDO medan blick och huvud börjar (`ready`), och går sedan givens väg från skon till kortplatsen på
 * `deal` sekunder, med minsta ryck längs vägen: vägen är greppets sträcka plus kortets vridning (pathOf, `life.effort`),
 * så att farten blir en klocka utan givens egna knyckar, och vändningen och fällningen får sin tid. Vilan på kortet
 * fortsätter givens rutor efter `rests` i givens egen takt gånger pace (givens rutor till kortet ligger delat med
 * cykelns), där handen ligger kvar och kroppen rör sig som den lästes.
 *
 * Vägen tillbaka börjar där handen ligger på kortet och slutar i REDO, så som given började. Greppet (mitten mellan tummens
 * och pekfingrets spetsar) går den raka vägen med minsta ryck, och bågar `lift` meter uppåt och `bow` meter ut mot
 * spelarna, mest halvvägs; uppåt går bågen fortare i början än vägen framåt, så handen lyfter från kortet innan den går.
 * Handen vrids under tiden, i samma takt som vägen, från hur den låg på kortet till hur den nyper i skon. Fingrarna
 * släpper greppet och öppnar sig till en avslappnad hand (dockans vilande hand, relaxedLeft), och sluter sig till nypet
 * först mot slutet, när handen når skon (`back.open`, `back.close` i cykeln). Från rutan `home` står handen i REDO.
 *
 * Kroppen går tillbaka på egna klockor, inte i takt med handen: huvudet börjar `life.gazeLead` före handen lämnar kortet
 * och är framme när handen är i skon; den vilande handen följer handen; axlarna börjar `life.trunkLag` efter handen och
 * är framme först i cykelns sista ruta. Sista rutan är som givens första, så att cykeln slutar i samma ställning som den
 * började. Bålens lutning räknas för sig (planLean), blicken och huvudets riktning när ställningen tas (poseAt).
 *
 * Handlingen (`action`) säger vad som görs med kortet. `deal` är det ovan. `hole` är samma rörelse med hålkortet `hole`
 * (unturned) i stället för givens kort: det vänds inte och ligger med baksidan upp. `flip` vänder hålkortet där det ligger,
 * inom samma takt: handen går ut till hålkortet på bordet samma väg som tillbaka, baklänges, på `flip.reach` sekunder,
 * och nästa kort står kvar i skon. Där lyfter den hålkortet: givens sista del, från att kortet ligger till givens ruta
 * `flip.from`, spelad baklänges på `flip.pickUp` sekunder med hålkortet. Sedan samma del framlänges med givens kort, som
 * vänds som i given och läggs med framsidan upp. Under lyftet och läggningen står handen över platsen: hand och kort
 * flyttas tillsammans i sidled, så att greppet står där det står när kortet ligger. Handens höjd och vridning och kortet i
 * handen är givens, så att kortet lyfts i sin ände, pekar mot skon och vänds tillbaka i fingrarna som i given (givens kort
 * vrids också på bordet när det vänds; att vrida bort det gav handen ett ryck, för att kortets riktning hoppar i den lästa
 * vändningen). Både lyftet och läggningen börjar och slutar stilla, med minsta ryck. Kroppen står under tiden som när kortet ligger. Därefter är allt som i given: vilan på
 * kortet, vägen tillbaka och REDO.
 */
function cycled(scene: SceneDescription, doll: DollDescription, move: DollMove, read: Tracks, cycle: DollCycle, bow: number, action: Action = 'deal', hole: Tracks['card'] | null = null): Timing & { tracks: Tracks } {
  const tracks = calmed(read, move.moments.rests, cycle.life.calm);
  if (hole) hole = calmed({ ...read, card: hole }, move.moments.rests, cycle.life.calm).card;
  const frames = (seconds: number): number => Math.round(seconds * move.fps);
  const ready = frames(cycle.parts.ready);
  const deal = frames(cycle.parts.deal);
  const rests = ready + deal;
  const letsGo = rests + frames(cycle.parts.onCard);
  const home = letsGo + frames(cycle.parts.back);
  const count = home + frames(cycle.parts.still) + 1;
  const end = count - 1;
  const pace = move.moments.rests / deal;
  const { lift, release, look } = cycle.back;
  const { life } = cycle;
  const { card, leftHand, rightHand, body } = tracks;
  if (action !== 'deal' && !hole) throw new Error(`Cykeln ${action} behöver hålkortet`);
  const flip = action === 'flip';
  // I en vändning: rutan där handen når hålkortet, och rutan där den har lyft det och vänder det.
  const arrives = ready + frames(cycle.flip.reach);
  const lifts = arrives + frames(cycle.flip.pickUp);
  const laid = move.moments.rests;
  const top = cycle.flip.from;
  if (flip && !(top >= 0 && top <= move.moments.edge[0] - TURN_AROUND && lifts < rests)) {
    throw new Error(`Vändningen går inte ihop med given: flip.from ${top} ska ligga före givens vändning (ruta ${move.moments.edge[0] - TURN_AROUND}), och reach och pickUp ska rymmas i deal`);
  }

  // Givens väg till kortet ligger, och var på den handen är: minsta ryck längs vägen från REDO tills kortet ligger.
  const path = pathOf(tracks, laid, life.effort);
  // I en vändning lyfts och läggs kortet över sin plats (overPlace): där är vägen greppets höjd och kortets vridning.
  const lifting = flip ? pathOf(tracks, laid, life.effort, true) : path;
  const lifted = (along: number): number => Math.max(top, frameAlong(lifting, along));
  const along = (share: number): number => frameAlong(path, toCard(share, life.touch) * path[laid]!);
  // Cykelns ruta som en ruta i den hängda given, fram till att handen lämnar kortet.
  const given = (frame: number): number => {
    if (!flip) {
      if (frame <= ready) return 0;
      if (frame <= rests) return along((frame - ready) / deal);
      return laid + (Math.min(frame, letsGo) - rests) * pace;
    }
    if (frame >= rests) return laid + (Math.min(frame, letsGo) - rests) * pace;
    // Lyftet och läggningen går givens väg mellan `top` och kortet ligger med minsta ryck längs vägen, som given.
    const span = lifting[laid]! - lifting[top]!;
    if (frame >= lifts) return lifted(lifting[top]! + span * easeReach((frame - lifts) / (rests - lifts)));
    if (frame >= arrives) return lifted(lifting[laid]! - span * easeReach((frame - arrives) / (lifts - arrives)));
    return laid;
  };
  // Kortet i en ruta: hålkortet i en giv med hålkortet, och i en vändning tills det vänds; annars givens kort.
  const cardIn = (frame: number): Tracks['card'] => (action === 'hole' || (flip && frame < lifts) ? hole! : card);
  const cardAt = (track: Tracks['card'], at: number): Standing => ({ centre: sampled(track.centre, at, mix), long: sampled(track.long, at, mix), face: sampled(track.face, at, mix) });
  // Under lyftet och läggningen i en vändning: hand och kort flyttade i sidled, så att greppet står över sitt läge när
  // kortet ligger (se ovan).
  const resting = mean(sampled(leftHand.points, laid, mixPoints), GRIP);
  const overPlace = (held: Standing, hand: Vec3[]): { held: Standing; hand: Vec3[] } => {
    const grip = mean(hand, GRIP);
    const by: Vec3 = [resting[0] - grip[0], 0, resting[2] - grip[2]];
    return { held: { ...held, centre: add(held.centre, by) }, hand: hand.map((point) => add(point, by)) };
  };

  // Hålkortet plant ur skon (cycle.hole `flat`): kort och hand fram till att kortet ligger går längs slid, i samma takt
  // som en giv (minsta ryck med touch), och slutar där given har kortet och handen när kortet ligger.
  const slide = action === 'hole' && cycle.hole === 'flat' ? slid(scene, cardAt(hole!, 0), leftHand.points[0]!, cardAt(hole!, laid), sampled(leftHand.points, laid, mixPoints)) : null;
  const slideShare = (frame: number): number => (frame <= ready ? 0 : toCard(Math.min(1, (frame - ready) / deal), life.touch));
  // Knuffen (cycle.push): kortet landar push.reach meter före sin plats och skjuts dit av fingertopparna medan de ligger
  // kvar på det, mot spelaren (från dealerns mitt mot kortplatsen), och hålkortet som förs plant längs sin väg.
  // Förskjutningen växer in medan kortet bärs (i en vändning medan det läggs), och är borta när handen lämnar kortet. Där
  // kortet ligger på skons sida om den givande axeln (plats 6–7) är armen redan böjd mot kortet, och en knuff mot
  // spelaren böjer handleden över gränsen (variant E vid plats 7: 84 → 92 grader, mätt): där landar kortet i stället
  // lika långt bortom sin plats och fingertopparna drar det tillbaka dit. (Längs handens riktning gav dealerns kort en
  // knyck på 4,6 i armbågen, mätt.)
  const target = cardAt(cardIn(laid), laid).centre;
  const shoulderX = doll.body.centreX + doll.body.shoulderHalfWidth;
  const push = cycle.push && cycle.push.reach > 0 && letsGo > rests ? cycle.push : null;
  const pushWay: Vec3 = (() => {
    if (!push) return [0, 0, 0];
    const from = slide ? slide.at(slide.tipped).card.centre : ([doll.body.centreX, 0, scene.dealerEdge.z - doll.sitting.behindEdge] as Vec3);
    return mul(unit([target[0] - from[0], 0, target[2] - from[2]]), slide || target[0] <= shoulderX ? 1 : -1);
  })();
  const pushedBy = (frame: number): Vec3 => {
    if (!push || frame > letsGo) return [0, 0, 0];
    const carried = frame >= rests ? 1 : flip ? smooth((frame - lifts) / (rests - lifts)) : slide ? smooth((slideShare(frame) - slide.tipped) / (1 - slide.tipped)) : smooth((given(frame) - move.moments.leavesShoe) / (laid - move.moments.leavesShoe));
    const pushed = easeReach((frame - rests - push.from * move.fps) / ((push.to - push.from) * move.fps));
    return mul(pushWay, -push.reach * carried * (1 - pushed));
  };

  const reaching = heldOf(leftHand.points[0]!);
  const relaxed = heldOf(relaxedLeft(doll));
  /**
   * Vägen mellan handen `from` på kortet och REDO, som andel av vägen från kortet. Fingrarnas form som andel av tiden: ur
   * greppet till den avslappnade handen, och åter till nypet.
   */
  const backPath = (from: Held, touch = life.touch): ((share: number) => Vec3[]) => {
    const turn = rotationBetween(from.axes, reaching.axes);
    return (share) => {
      const way = fromCard(share, touch);
      const arc = Math.sin(Math.PI * share) ** 2;
      const grip = add(mix(from.grip, reaching.grip, way), [0, lift * arc, bow * arc]);
      const axes = from.axes.map((axis) => turned(axis, turn.axis, turn.angle * way));
      const closing = smooth((share - cycle.back.close) / (1 - cycle.back.close));
      return from.local.map((_, k) => {
        const shaped = closing > 0 ? mix(relaxed.local[k]!, reaching.local[k]!, closing) : mix(from.local[k]!, relaxed.local[k]!, smooth(share / cycle.back.open));
        return add(grip, add(add(mul(axes[0]!, shaped[0]), mul(axes[1]!, shaped[1])), mul(axes[2]!, shaped[2])));
      });
    };
  };
  const leavesAt = given(letsGo);
  const back = backPath(heldOf(sampled(leftHand.points, leavesAt, mixPoints)));
  // Ut till hålkortet i en vändning: samma väg baklänges, men handen stannar mjukt vid kortet innan den lyfter det.
  const reach = backPath(heldOf(sampled(leftHand.points, laid, mixPoints)), 0);
  // Givhanden sänkt mot filten, i givens egna rutor (se momentOf): i en vändning skrivs den ut per ruta.
  const settleAt = (at: number): number => smooth((at - move.moments.folds) / (move.moments.rests - move.moments.folds));

  // Kroppens klockor på vägen tillbaka: från vilken ruta och till vilken varje del går tillbaka till REDO.
  const clock = (from: number, to: number): { from: number; to: number } => {
    const start = Math.max(rests, Math.min(from, end - 1));
    return { from: start, to: Math.max(start + 1, Math.min(to, end)) };
  };
  // Med Life.look `place` ser hon inte tillbaka till skon: huvudet kommer hem med bålen, till cykelns sista ruta, så att
  // det rör sig genom REDO också i en cykel utan andning. Annars är det framme när handen är i skon.
  const clocks = {
    head: clock(letsGo - frames(life.gazeLead), life.look === 'place' ? end : home),
    rest: clock(letsGo, home),
    shoulders: clock(letsGo + frames(life.trunkLag), end),
  };
  // Kroppens lästa spår (axlar, huvud, den vilande handen) följer given i jämn takt, inte längs handens väg: där handen
  // går fort genom givens första rutor skulle deras små lästa ryck annars komma tätt.
  // I en vändning står kroppen som när kortet ligger medan handen lyfter, vänder och lägger det, och tills dess klocka går
  // tillbaka (en vila på kortet efter vändningen läser inte givens spår vidare, så att kroppen inte rycker igång där).
  const evenly = (frame: number): number =>
    flip ? laid : Math.max(0, Math.min(Math.min(frame, letsGo) - ready, letsGo - ready)) * pace;
  /** En del av kroppen i en ruta: givens läge tills dess klocka går, sedan mjukt tillbaka till givens första ruta. */
  const homeward = <T>(track: T[], blend: (a: T, b: T, t: number) => T, frame: number, own: { from: number; to: number }): T => {
    if (frame < rests || frame <= own.from) return sampled(track, evenly(frame), blend);
    const from = sampled(track, evenly(own.from), blend);
    return blend(from, track[0]!, easeReach((frame - own.from) / (own.to - own.from)));
  };

  const made = {
    centre: [] as Vec3[],
    long: [] as Vec3[],
    face: [] as Vec3[],
    left: [] as Vec3[][],
    settle: [] as number[],
    right: [] as Vec3[][],
    leftShoulder: [] as Vec3[],
    rightShoulder: [] as Vec3[],
    head: [] as Vec3[],
  };
  /** Kroppen och den vilande handen på vägen ut till hålkortet, andelen `share` av vägen från kortet (baklänges). */
  const between = (at: number, share: number): void => {
    const way = easeReach(share);
    const toward = <T>(track: T[], blend: (a: T, b: T, t: number) => T): T => blend(sampled(track, at, blend), track[0]!, way);
    made.right.push(toward(rightHand.points, mixPoints));
    made.leftShoulder.push(toward(body.leftShoulder, mix));
    made.rightShoulder.push(toward(body.rightShoulder, mix));
    made.head.push(toward(body.head, mix));
  };
  for (let frame = 0; frame < count; frame++) {
    const at = given(frame);
    // Kortet följer given och ligger sedan kvar där handen släppte det; i en vändning ligger hålkortet kvar tills handen tar det.
    let held = cardAt(cardIn(frame), at);
    let hand: Vec3[] | null = null;
    let settling: number | null = null;
    if (flip && frame >= arrives && frame < rests) ({ held, hand } = overPlace(held, sampled(leftHand.points, at, mixPoints)));
    if (slide && frame <= rests) ({ card: held, hand, settle: settling } = slide.at(slideShare(frame)));
    const by = pushedBy(frame);
    if (by[0] !== 0 || by[2] !== 0) {
      held = { ...held, centre: add(held.centre, by) };
      hand = (hand ?? sampled(leftHand.points, at, mixPoints)).map((point) => add(point, by));
    }
    made.centre.push(held.centre);
    made.long.push(held.long);
    made.face.push(held.face);
    if (flip && frame > ready && frame < arrives) {
      // Ut till hålkortet: vägen tillbaka baklänges.
      const share = 1 - (frame - ready) / (arrives - ready);
      made.left.push(reach(share));
      made.settle.push(1 - smooth(share / release));
      between(laid, share);
      continue;
    }
    const away = frame > letsGo && frame < home ? (frame - letsGo) / (home - letsGo) : null;
    if (away !== null) {
      made.left.push(back(away));
      made.settle.push(1 - smooth(away / release));
    } else {
      const from = frame >= home || (flip && frame <= ready) ? 0 : at;
      made.left.push(hand ?? sampled(leftHand.points, from, mixPoints));
      made.settle.push(settling ?? (frame >= home || (flip && frame <= ready) ? 0 : settleAt(from)));
    }
    if (flip && frame <= ready) {
      made.right.push(rightHand.points[0]!);
      made.leftShoulder.push(body.leftShoulder[0]!);
      made.rightShoulder.push(body.rightShoulder[0]!);
      made.head.push(body.head[0]!);
      continue;
    }
    made.right.push(homeward(rightHand.points, mixPoints, frame, clocks.rest));
    made.leftShoulder.push(homeward(body.leftShoulder, mix, frame, clocks.shoulders));
    made.rightShoulder.push(homeward(body.rightShoulder, mix, frame, clocks.shoulders));
    made.head.push(homeward(body.head, mix, frame, clocks.head));
  }
  const { leavesShoe, edge, folds } = move.moments;
  // Givens ruta som en ruta i cykelns giv: där minsta ryck längs vägen når den.
  const retimed = (frame: number): number => ready + Math.round(deal * inverseOf((t) => toCard(t, life.touch), path[Math.min(frame, laid)]! / path[laid]!));
  // I en vändning: givens ruta som en ruta i läggningen. Ingen kort lämnar skon, men leavesShoe är givens, så att skon
  // prövas i samma rutor som i varje annan cykel (shoeTested): medan fingrarna är vid mynningen i början och slutet.
  const laying = (frame: number): number => Math.round(lifts + (rests - lifts) * inverseOf(easeReach, (lifting[frame]! - lifting[top]!) / (lifting[laid]! - lifting[top]!)));
  // Hålkortet plant ur skon: kortet lämnar mynningen när det är halvvägs fällt och ligger plant (edge, folds) när det är
  // helt fällt. Skon prövas inte förrän kortet och handen är ute ur skons hölje, som när fingrarna är i mynningen.
  const slideFrame = (share: number): number => {
    for (let frame = ready; frame <= rests; frame++) if (slideShare(frame) >= share) return frame;
    return rests;
  };
  const tipped = slide ? Math.min(rests - 1, Math.max(ready + 2, slideFrame(slide.tipped))) : 0;
  const slidOut = slide ? Math.min(tipped - 1, Math.max(ready + 1, slideFrame(slide.tipped / 2))) : 0;
  const slideClear = (): number => {
    const skeleton = handSkeleton(doll);
    let last = slidOut;
    for (let frame = slidOut + 1; frame <= rests; frame++) {
      const hand = onFelt(fitHand(skeleton, made.left[frame]!, 'left', GRIP), skeleton.radius, made.settle[frame]!);
      // Kortets hörn på det olutade bordet, som armHits prövar dem (handBalls), och handleden med armens radie.
      const [long, , side] = cardAxes({ centre: made.centre[frame]!, long: made.long[frame]!, face: made.face[frame]! });
      const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b]) => add(made.centre[frame]!, add(mul(side!, (a! * scene.card.width) / 2), mul(long!, (b! * scene.card.height) / 2))));
      const inside =
        [made.centre[frame]!, ...corners].some((point) => intoShoe(scene, doll, point, 0) > TOUCHING) ||
        hand.some((point, k) => intoShoe(scene, doll, point, k === 0 ? doll.shape.wrist : skeleton.radius[k]!) > TOUCHING);
      if (inside) last = frame;
    }
    return Math.max(1, last - slidOut + 1);
  };
  const moments: DollMove['moments'] = slide
    ? { leavesShoe: slidOut, edge: [tipped, tipped], folds: tipped, rests }
    : flip
      ? { leavesShoe: retimed(leavesShoe), edge: [laying(edge[0]), laying(edge[1])], folds: laying(folds), rests }
      : { leavesShoe: retimed(leavesShoe), edge: [retimed(edge[0]), retimed(edge[1])], folds: retimed(folds), rests };
  // Skon prövas inte förrän handen har gått lika långt efter att kortet lämnat skon som CLEAR_AFTER rutor i given.
  const clear = slide ? slideClear() : Math.max(1, retimed(leavesShoe + CLEAR_AFTER) - retimed(leavesShoe));
  return {
    frameCount: count,
    seconds: (count - 1) / move.fps,
    moments,
    back: { letsGo, home, pace, lift, bow, release, look, clear, ...(flip ? { out: [ready, arrives] as [number, number] } : {}) },
    life,
    tracks: {
      card: { ...cardIn(rests), centre: made.centre, long: made.long, face: made.face },
      ...(flip
        ? { next: { about: 'Nästa kort i skons mynning, som handen nyper i REDO och lämnar där när den går ut till hålkortet.', centre: card.centre[0]!, long: card.long[0]!, face: card.face[0]! } }
        : {}),
      leftHand: { ...leftHand, points: made.left, ...(flip || slide ? { settle: made.settle } : {}) },
      rightHand: { ...rightHand, points: made.right },
      body: { ...body, leftShoulder: made.leftShoulder, rightShoulder: made.rightShoulder, head: made.head },
    },
  };
}

/**
 * En väntan (handlingen wait): hon står i REDO hela cykeln, `cycle.seconds` lång, med handen vid kortet i skons mynning
 * och den vilande handen på filten. Kroppen lever som i varje cykel (Life: andning, sväng, huvudets vridning och den
 * vilande handens fingrar, i momentOf och poseAt), och blicken går lugnt upp mot spelarna och ned till REDO:s punkt
 * igen (cycle.wait, spåret lookUp). Väntan är `wait.seconds` lång och andas med `wait.breath`, när de finns, annars som
 * cykeln. Ögonblicken är satta sist i cykeln, i den ordning en rörelse har dem, så att väntan läses som en cykel; inget
 * kort lämnar skon och skon prövas aldrig (back.clear). Första och sista rutan är REDO.
 */
function waited(move: DollMove, tracks: Tracks, cycle: DollCycle): Timing & { tracks: Tracks } {
  if (!cycle.wait) throw new Error(`Cykeln ${cycle.id} säger inte hur hon väntar (wait)`);
  const { look, up, down } = cycle.wait;
  const count = Math.round((cycle.wait.seconds ?? cycle.seconds) * move.fps) + 1;
  const end = count - 1;
  const at = (seconds: number): number => seconds * move.fps;
  const share = Array.from({ length: count }, (_, frame) => {
    const rise = easeReach((frame - at(up[0])) / (at(up[1]) - at(up[0])));
    const fall = easeReach((frame - at(down[0])) / (at(down[1]) - at(down[0])));
    return Math.round(look * (rise - fall) * 1e5) / 1e5;
  });
  const { card, leftHand, rightHand, body } = tracks;
  const every = <T>(value: T): T[] => Array.from({ length: count }, () => value);
  return {
    frameCount: count,
    seconds: end / move.fps,
    moments: { leavesShoe: end - 5, edge: [end - 4, end - 4], folds: end - 3, rests: end - 2 },
    back: { letsGo: end - 2, home: end - 1, pace: 1, lift: 0, bow: 0, release: cycle.back.release, look: cycle.back.look, clear: count },
    life: cycle.wait.breath ? { ...cycle.life, breath: cycle.wait.breath } : cycle.life,
    tracks: {
      card: { ...card, about: 'Kortet i skons mynning, som handen håller i REDO hela väntan.', centre: every(card.centre[0]!), long: every(card.long[0]!), face: every(card.face[0]!) },
      leftHand: { ...leftHand, points: every(leftHand.points[0]!), settle: every(0) },
      rightHand: { ...rightHand, points: every(rightHand.points[0]!) },
      body: { ...body, leftShoulder: every(body.leftShoulder[0]!), rightShoulder: every(body.rightShoulder[0]!), head: every(body.head[0]!) },
      lookUp: { about: 'Hur stor del av vägen blicken har gått från REDO:s punkt upp mot spelarna, per ruta (dollPose.ts, waited).', share },
    },
  };
}

/**
 * Bålens planerade lutning i en cykel (Lean): mot handledens läge när kortet ligger, med vridningen åt det håll som når
 * dit med minst lutning. Den följer en mjuk kurva med minsta ryck: upp från `life.trunkLead` före handen lämnar REDO
 * tills kortet ligger, kvar medan handen vilar, och tillbaka från `life.trunkLag` efter att handen lämnat kortet till
 * cykelns sista ruta. Kurvans höjd är den minsta som gör att armen når i varje ruta, och minst `life.leanLeast`; en
 * människa lutar sig lite mot varje kort. `need(frame, toward, sign)` säger den lutning armen kräver i en ruta.
 */
function planLean(shape: DollMove, life: Life, mostLean: number, ready: number, need: (frame: number, toward: Vec3, sign: number) => number, wristAt: (frame: number) => Vec3): Lean {
  const back = shape.back!;
  const count = shape.frameCount;
  const end = count - 1;
  const rise = { from: Math.max(0, Math.round(ready - life.trunkLead * shape.fps)), to: shape.moments.rests };
  const fall = { from: Math.min(end - 1, back.letsGo + Math.round(life.trunkLag * shape.fps)), to: end };
  const curve = (frame: number): number => {
    if (frame <= rise.from || frame >= fall.to) return 0;
    if (frame < rise.to) return easeReach((frame - rise.from) / (rise.to - rise.from));
    if (frame <= fall.from) return 1;
    return 1 - easeReach((frame - fall.from) / (fall.to - fall.from));
  };
  const toward = wristAt(shape.moments.rests);
  const sign = [1, -1].reduce((best, s) => (need(shape.moments.rests, toward, s) < need(shape.moments.rests, toward, best) ? s : best), 1);
  let height = life.leanLeast;
  const needs: number[] = [];
  for (let frame = 0; frame < count; frame++) {
    const asked = need(frame, toward, sign);
    needs.push(asked);
    const share = curve(frame);
    if (asked > 0 && share > 0.02) height = Math.max(height, asked / share);
  }
  height = Math.min(height, mostLean);
  // Där kurvan inte räcker (bara nära ändarna, om alls) tas det armen kräver.
  const amount = needs.map((asked, frame) => Math.round(Math.max(asked, height * curve(frame)) * 1e5) / 1e5);
  return {
    about: 'Bålens lutning från höften mot handledens läge när kortet ligger, radianer per ruta: en mjuk kurva som börjar före handen och slutar efter den, minst så stor som armen kräver (dollPose.ts, planLean).',
    amount,
    toward,
    sign,
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
function place(scene: SceneDescription, doll: DollDescription, move: DollMove, seat: Seat, index = 0, cycle?: DollCycle, action: Action = 'deal'): Placed {
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
  // En väntan: given behövs bara i REDO, hängd i skon (build), och ingen sväng, båge eller armbåge räknas.
  if (action === 'wait') {
    if (!cycle) throw new Error('Väntan görs bara som cykel');
    const { tracks: still, ...timing } = waited(move, build(atPlace, 0, 0), cycle);
    return { scene, doll, tracks: still, swingDeg: 0, bow: 0, timing };
  }
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
  // den vilande handen, tas den minsta större som gör det. I en vändning prövas vägen ut till hålkortet på samma sätt, med
  // samma båge. Armbågen räknas sedan för hela cykeln. Hålkortet är givens kort utan vändningen (unturned): given hängs
  // likadant vad som än görs med kortet, så att handen gör samma rörelse.
  let timing: Timing | undefined;
  if (action !== 'deal' && !cycle) throw new Error(`${action === 'hole' ? 'Hålkortet' : 'Vändningen'} görs bara som cykel`);
  if (cycle) {
    const given = tracks;
    const hole = action === 'deal' ? null : unturned(given.card, move.moments);
    const shaped = (backBow: number): DollMove => {
      const { tracks: round, ...rest } = cycled(scene, doll, move, given, cycle, backBow, action, hole);
      return { ...move, ...rest, tracks: round };
    };
    const blockedBack = (shape: DollMove): number => {
      const { letsGo, home, out } = shape.back!;
      let frames = 0;
      for (let frame = 0; frame < shape.frameCount; frame++) {
        const tested = (frame > letsGo && frame < home) || (out !== undefined && frame > out[0] && frame < out[1]);
        if (tested && handDepth(poseIn(shape, shape.tracks, frame), frame, shape) > TOUCHING) frames++;
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
    const { tracks: back, frameCount, seconds, moments, life } = round;
    tracks = back;
    timing = { frameCount, seconds, moments, back: round.back, life };
  }
  const shape: DollMove = timing ? { ...move, ...timing } : move;
  const span = shape.frameCount;

  // En cykel: bålens lutning planeras för hela cykeln (planLean), innan armbågen räknas.
  if (cycle) {
    const reachAt = (frame: number) => reachOf(scene, doll, momentOf(shape, tracks, frame, frame, 0, 0));
    const lean = planLean(
      shape,
      cycle.life,
      doll.arm.mostLean,
      Math.round(cycle.parts.ready * move.fps),
      (frame, toward, sign) => {
        const { upright, left } = reachAt(frame);
        return leanNeeded(doll, upright, left[0]!, toward, sign);
      },
      (frame) => reachAt(frame).left[0]!,
    );
    tracks = { ...tracks, lean };
  }

  // Armbågen: per ruta den minsta vridning som för armen fri, åt det håll som kräver minst över hela rörelsen.
  const needed = (sign: number): { turns: number[]; stuck: number } => {
    const turns = Array.from({ length: span }, () => 0);
    let stuck = 0;
    // Från att kortet lämnar skon, eller i en vändning från att handen lämnar REDO.
    for (let frame = Math.min(shape.moments.leavesShoe, shape.back?.out?.[0] ?? Infinity) + 1; frame < span; frame++) {
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

/**
 * Spåren hängda i scenen. Räknas en gång per rörelse; en rörelse som redan är hängd i samma scen ändras inte. En cykel är
 * alltid hängd (moveFor gör den så), också när den har sparats och lästs igen: den spelas som den står.
 */
function placed(scene: SceneDescription, doll: DollDescription, move: DollMove): Placed {
  const known = placements.get(move);
  if (known && known.scene === scene && known.doll === doll) return known;
  const made = move.back
    ? { scene, doll, tracks: move.tracks, swingDeg: move.swingDeg ?? 0, bow: move.bow ?? 0 }
    : place(scene, doll, move, move.seat, move.index ?? 0);
  placements.set(move, made);
  return made;
}

/** En plats som ord i en rörelses namn: `plats-4`, eller `dealer`. */
const seatWord = (seat: Seat): string => (seat === 'D' ? 'dealer' : `plats-${seat}`);

/**
 * Samma rörelse till en annan plats: hämtad vid scenens sko och lagd på platsens kortplats `index` (den första om inget
 * annat sägs). `seat` är en spelarplats eller `D` för dealern. `base` är rörelsen så som den lästes. Hand och kort är de
 * lästa, burna i sidled och svängda; arm och kropp räknas om av dockan själv. Med `cycle` blir den en cykel: given i
 * cykelns takt, och tillbaka till REDO (se cycled). `action` är vad cykeln gör med kortet (Action, cycled).
 */
export function moveFor(scene: SceneDescription, doll: DollDescription, base: DollMove, seat: Seat, options: { index?: number; cycle?: DollCycle; action?: Action } = {}): DollMove {
  const { index = 0, cycle, action = 'deal' } = options;
  if (!ACTIONS.includes(action)) throw new Error(`Okänd handling: ${String(action)}. Handlingarna är ${ACTIONS.join(', ')}.`);
  const made = place(scene, doll, base, seat, index, cycle, action);
  const same = seat === base.seat && index === 0;
  const card = index === 0 ? '' : `-kort-${index}`;
  const move: DollMove = {
    ...base,
    ...made.timing,
    ...(cycle
      ? { about: cycle.about, id: action === 'wait' ? `${cycle.id}-wait` : `${cycle.id}${action === 'deal' ? '' : `-${action}`}-${seatWord(seat)}-kort-${index}`, from: cycle.from, to: cycle.to }
      : { id: same ? base.id : `${base.id}-till-${seatWord(seat)}${card}`, to: same ? base.to : `LAGT ${seat}` }),
    seat,
    ...(index === 0 ? {} : { index }),
    ...(action === 'deal' ? {} : { action }),
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
  // I en cykel: hur stor del av vägen tillbaka handen har gått, från att den lämnar kortet. I en vändning också hur stor
  // del av vägen ut till hålkortet den har gått, från REDO.
  const back = move.back;
  const away = back && at > back.letsGo ? Math.min(1, (at - back.letsGo) / (back.home - back.letsGo)) : null;
  const out = back?.out && at < back.out[1] ? Math.max(0, (at - back.out[0]) / (back.out[1] - back.out[0])) : null;
  // Nästa kort står där kortet stod i rörelsens första ruta, eller där spåren säger (en vändning).
  const nextCard = tracks.next ?? { centre: card.centre[0]!, long: card.long[0]!, face: card.face[0]! };
  const settled = leftHand.settle;
  // I en cykel andas hon och svänger lite, noll i REDO och med samma fart i slutet som i början (Life.breath).
  const breath = move.life?.breath;
  const phase = (2 * Math.PI * at) / move.fps / move.seconds;
  // Med breath.still börjar och slutar andningen stilla: (1 − cos)/2 i stället för sin, så att farten är noll i REDO.
  const wave = (times: number): number => (breath?.still ? (1 - Math.cos(times * phase)) / 2 : Math.sin(times * phase));
  const rise = breath ? breath.rise * wave(breath.cycles) : 0;
  const lifted = (offset: Vec3, by: number, aside = 0): Vec3 => (breath ? add(offset, [aside, by, 0]) : offset);
  const lean = tracks.lean;
  // Den vilande handens pekfinger lyfts lite två gånger per cykel och långfingret tre, noll i REDO.
  const lift = (share: number, times: number): number => (breath ? breath.fingers * share * (0.5 - 0.5 * Math.cos(times * phase)) : 0);
  const fingered = (points: Vec3[]): Vec3[] =>
    !breath || breath.fingers === 0
      ? points
      : points.map((point, k) => {
          const index = [6, 7, 8].indexOf(k);
          const middle = [10, 11, 12].indexOf(k);
          const by = index >= 0 ? lift([0.35, 0.7, 1][index]!, 2) : middle >= 0 ? lift([0.25, 0.5, 0.7][middle]!, 3) : 0;
          return by === 0 ? point : add(point, [0, by, 0]);
        });
  return {
    card: { centre: between(card.centre), long: between(card.long), face: between(card.face) },
    // I en väntan hämtas inget nästa kort: handen står vid kortet i skon hela tiden.
    fetch: tracks.lookUp || (away === null && out === null) ? null : nextCard,
    // På väg ut till hålkortet går blicken före handen dit, så som den på vägen tillbaka går före handen till skon.
    lookBack: away !== null ? smooth(away / back!.look) : out !== null ? 1 - smooth(out / back!.look) : 0,
    left: hand(leftHand.points),
    right: fingered(hand(rightHand.points)),
    body: {
      left: lifted(from(body.leftShoulder), rise),
      right: lifted(from(body.rightShoulder), rise),
      head: lifted(from(body.head), breath ? breath.head * wave(breath.cycles) : 0, breath ? breath.sway * wave(1) : 0),
    },
    lean: lean ? { amount: lean.amount[frame]! + (lean.amount[next]! - lean.amount[frame]!) * share, toward: lean.toward, sign: lean.sign } : null,
    elbowTurn: leftArm ? radians(leftArm.turnDeg[frame]! + (leftArm.turnDeg[next]! - leftArm.turnDeg[frame]!) * share) : 0,
    // Handen sänks mot filten medan kortet fälls ned, och vilar på den när kortet ligger. I en cykel lättar den när den
    // lämnar kortet, så att bågen lyfter den. En vändning bär sänkningen i spåren.
    settle: settled
      ? settled[frame]! + (settled[next]! - settled[frame]!) * share
      : away === null
        ? smooth((at - move.moments.folds) / (move.moments.rests - move.moments.folds))
        : 1 - smooth(away / back!.release),
    lookUp,
  };
}

/**
 * Dockans ställning `time` sekunder in i rörelsen, i scenen. Rörelsen hängs i scenens sko och i rörelsens kortplats
 * (`move.seat`, `move.index`). Tiden hålls inom rörelsen: före början gäller första rutan, efter slutet den sista.
 */
export function poseAt(scene: SceneDescription, doll: DollDescription, move: DollMove, time: number): DollPose {
  const { tracks } = placed(scene, doll, move);
  const momentAt = (seconds: number): Moment => {
    const at = Math.max(0, Math.min(move.seconds, seconds)) * move.fps;
    const frame = Math.min(move.frameCount - 2, Math.floor(at));
    // Hon ser på kortet från skon tills det ligger, genom hela vändningen. Sedan lyfter hon blicken mot spelarna; i en
    // cykel ser hon i stället på kortet tills handen lämnar det, och sedan på nästa kort i skon (momentOf).
    const since = (at - move.moments.rests) / move.fps;
    // I en väntan bär spåren hur långt blicken har gått upp mot spelarna.
    const lookUp = tracks.lookUp ? sampled(tracks.lookUp.share, at, (a, b, t) => a + (b - a) * t) : move.back ? 0 : doll.gaze.share * smooth(since / doll.gaze.seconds);
    return momentOf(move, tracks, frame, frame + 1, Math.min(1, at - frame), lookUp);
  };
  const pose = compose(scene, doll, momentAt(time));
  const life = move.life;
  const ready = readyGaze(scene, doll);
  if (!move.back || !life) {
    // REDO ser på kortplatsen mitt på bordet (readyGaze). En rörelse som inte är en cykel går därifrån till kortet på
    // doll.gaze.seconds sekunder och följer det sedan; i VILA (restPose) gäller punkten framför henne.
    const gaze = mix(ready, pose.gaze, smooth(time / doll.gaze.seconds));
    return { ...pose, gaze, face: gaze };
  }
  const ends = move.seconds;
  // Dit blicken siktar vid tiden t, före försprånget. I en väntan går den från REDO:s punkt upp mot spelarna och tillbaka
  // (lookUp). Med Life.look `place` går den från REDO:s punkt till kortplatsen och tillbaka, aldrig mot skon. Annars
  // följer den kortet och nästa kort i skon (lookOf), och går från och till REDO:s punkt på doll.gaze.seconds sekunder.
  const lastCard = (frame: number): Standing => ({ centre: tracks.card.centre[frame]!, long: tracks.card.long[frame]!, face: tracks.card.face[frame]! });
  const place = !tracks.lookUp && life.look === 'place' ? cardOnTable(scene, lastCard(move.frameCount - 1)).centre : null;
  const toward = place ? lookShare(move) : null;
  const aimAt = (t: number): Vec3 => {
    const moment = momentAt(t);
    if (tracks.lookUp) return mix(ready, aheadOf(doll, pose.head), moment.lookUp);
    if (place && toward) return mix(ready, place, toward(t));
    const share = smooth(t / doll.gaze.seconds) * smooth((ends - t) / doll.gaze.seconds);
    return mix(ready, lookOf(scene, doll, moment, pose.head), share);
  };
  // I en cykel går blicken före: den ser dit den annars skulle se `gazeLead` sekunder senare, och försprånget växer in
  // från REDO. Huvudet vänds mot dit blicken såg `headLag` sekunder tidigare, och bara andelen `headShare` av vägen från
  // REDO; ögonen tar resten. I REDO, i början och slutet, ser båda på REDO:s punkt mitt på bordet.
  const lookAt = (seconds: number): Vec3 => {
    const t = Math.max(0, Math.min(ends, seconds));
    return aimAt(Math.min(ends, t + life.gazeLead * smooth(t / life.gazeLead)));
  };
  const gaze = lookAt(time);
  // Huvudet följer blicken mjukt: riktningen dit blicken såg, vägd över headSpan sekunder kring `headLag` sekunder sedan,
  // så att ett snabbt kast med blicken blir en jämn vridning av huvudet.
  const seen = HEAD_WEIGHTS.reduce<Vec3>((sum, weight, k) => add(sum, mul(lookAt(time - life.headLag + (k - 3) * (life.headSpan / 6)), weight)), [0, 0, 0]);
  const first = unit(sub(lookAt(0), pose.head));
  const late = unit(sub(seen, pose.head));
  const between = Math.acos(Math.max(-1, Math.min(1, dot(first, late))));
  const aimed = between < 1e-9 ? late : turned(first, unit(cross(first, late)), between * life.headShare);
  // En liten nick när kortet läggs (Life.nod): från två gazeLead före kortet ligger till gazeLead efter att handen lämnat
  // det, som en klocka med farten och accelerationen noll i båda ändarna (64 x³ (1 − x)³, störst 1 halvvägs).
  const nodFrom = move.moments.rests / move.fps - 2 * life.gazeLead;
  const nodTo = move.back.letsGo / move.fps + life.gazeLead;
  const nodShare = (time - nodFrom) / (nodTo - nodFrom);
  const nodding = life.nod && !tracks.lookUp && nodShare > 0 && nodShare < 1 ? 64 * nodShare ** 3 * (1 - nodShare) ** 3 : 0;
  const nodded = nodding > 0 ? turned(aimed, unit(cross(aimed, UP)), -radians(life.nod!) * nodding) : aimed;
  // Och lite fram och tillbaka kring lodlinjen hela cykeln, noll i REDO (Life.breath.turn); med breath.still också med
  // farten noll i REDO.
  const phase = (2 * Math.PI * Math.max(0, Math.min(ends, time))) / ends;
  const swing = life.breath.still ? 0.6 * Math.sin(phase) * Math.sin(2 * phase) + 0.4 * (1 - Math.cos(3 * phase)) / 2 : 0.6 * Math.sin(2 * phase) + 0.4 * Math.sin(3 * phase);
  const way = turned(nodded, UP, radians(life.breath.turn) * swing);
  return { ...pose, gaze, face: add(pose.head, mul(way, size(sub(seen, pose.head)))) };
}

/**
 * Hur stor del av vägen blicken har gått från REDO:s punkt mot kortplatsen vid en tid, med Life.look `place`: upp med
 * minsta ryck från början tills kortet ligger (i en vändning tills handen når hålkortet), kvar tills handen lämnar
 * kortet, och tillbaka med minsta ryck till cykelns slut, med huvudet och bålen. Försprånget (gazeLead) läggs på i poseAt.
 */
function lookShare(move: DollMove): (seconds: number) => number {
  const back = move.back!;
  const reached = (back.out?.[1] ?? move.moments.rests) / move.fps;
  const leaves = back.letsGo / move.fps;
  const home = (move.frameCount - 1) / move.fps;
  return (t) => (t < reached ? easeReach(t / reached) : t <= leaves ? 1 : 1 - easeReach((t - leaves) / (home - leaves)));
}

// Huvudets vägning av blicken (poseAt): sju prov över Life.headSpan, med binomialvikter.
const HEAD_WEIGHTS = [1, 6, 15, 20, 15, 6, 1].map((weight) => weight / 64);

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
  const ready = gaze?.ready;
  need(
    !!ready && ((isNumber(ready.seat) && Number.isInteger(ready.seat) && ready.seat > 0) || ready.seat === 'D') && Number.isInteger(ready.index) && ready.index >= 0,
    'gaze.ready: platsen (från 1, eller D) och kortplatsen hon ser på i REDO',
  );
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
  need((isNumber(move?.seat) && Number.isInteger(move.seat) && move.seat > 0) || move?.seat === 'D', 'seat ska vara en plats från 1, eller D för dealern');
  need(move?.action === undefined || ACTIONS.includes(move.action), `action ska vara ${ACTIONS.join(', ')}`);
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
  need(
    back?.out === undefined || (Array.isArray(back.out) && back.out.length === 2 && back.out.every(isFrame) && rests !== undefined && back.out[0] < back.out[1] && back.out[1] < rests),
    'back.out ska vara två rutor före rests: där handen lämnar REDO och där den når hålkortet',
  );
  const next = move?.tracks?.next;
  need(next === undefined || (isPoint(next.centre) && isPoint(next.long) && isPoint(next.face) && typeof next.about === 'string'), 'tracks.next: kortets mitt, långsida och framsida, och about');
  const settle = leftHand?.settle;
  need(settle === undefined || (Array.isArray(settle) && settle.length === count && settle.every((value) => isNumber(value) && value >= 0 && value <= 1)), `tracks.leftHand.settle ska ha ${count} andelar`);
  const lean = move?.tracks?.lean;
  need(
    lean === undefined || (Array.isArray(lean.amount) && lean.amount.length === count && lean.amount.every((value) => isNumber(value) && value >= 0) && isPoint(lean.toward) && (lean.sign === 1 || lean.sign === -1) && typeof lean.about === 'string'),
    `tracks.lean: ${count} lutningar från 0, toward en punkt, sign 1 eller −1, och about`,
  );
  need(move?.life === undefined || isLife(move.life), 'life');
  const looked = move?.tracks?.lookUp;
  need(looked === undefined || (Array.isArray(looked.share) && looked.share.length === count && looked.share.every((value) => isNumber(value) && value >= 0 && value <= 1) && typeof looked.about === 'string'), `tracks.lookUp: ${count} andelar`);
  need(move?.back?.clear === undefined || (Number.isInteger(move.back.clear) && move.back.clear >= 1), 'back.clear ska vara ett heltal från 1');

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
  need(isNumber(back?.open) && isNumber(back?.close) && back.open > 0 && back.open <= back.close && back.close < 1, 'back: open och close andelar, 0 < open ≤ close < 1');
  const flip = cycle?.flip;
  need(
    isNumber(flip?.reach) && isNumber(flip?.pickUp) && flip.reach > 0 && flip.pickUp > 0 && isNumber(parts?.deal) && flip.reach + flip.pickUp < parts.deal && Number.isInteger(flip?.from) && flip!.from >= 0,
    'flip: reach och pickUp över 0 och tillsammans kortare än deal, och from en ruta i given',
  );
  const wait = cycle?.wait;
  const waits = wait?.seconds ?? cycle?.seconds;
  need(
    wait === undefined ||
      (isNumber(wait.look) && wait.look >= 0 && wait.look <= 1 && isPair(wait.up) && isPair(wait.down) && wait.up[0] >= 0 && wait.up[0] < wait.up[1] && wait.up[1] <= wait.down[0] && wait.down[0] < wait.down[1] &&
        isNumber(waits) && waits > 0 && wait.down[1] <= waits && (wait.breath === undefined || isBreath(wait.breath))),
    'wait: look en andel, up och down två tider var i ordning inom väntan, seconds över 0 och breath som life.breath när de finns',
  );
  const push = cycle?.push;
  need(push === undefined || (isNumber(push.reach) && push.reach >= 0 && isNumber(push.from) && isNumber(push.to) && push.from < push.to && isNumber(parts?.onCard) && isNumber(parts?.deal) && push.to <= parts.onCard + 1e-9 && -push.from < parts.deal), 'push: reach från 0, och from och to sekunder från att kortet ligger, from < to, to högst parts.onCard och from inom deal');
  need(cycle?.hole === undefined || cycle.hole === 'given' || cycle.hole === 'flat', 'hole ska vara given eller flat');
  need(isLife(cycle?.life), 'life: gazeLead, headLag, trunkLead, trunkLag, leanLeast och effort från 0, headShare en andel, breath med rise, head och sway från 0 och cycles ett heltal från 1, look card eller place och nod från 0 när de finns');
  need(isMarked(cycle ?? undefined), 'basis och source');
  if (wrong.length > 0) throw new Error(`Cykeln går inte att använda: ${wrong.join('; ')}`);
  return cycle as DollCycle;
}

/** Om ett värde är en Life: tider och mått från 0, en andel för huvudet och ett helt antal andetag per cykel. */
function isLife(value: unknown): value is Life {
  const life = value as Partial<Life> | null | undefined;
  const fromZero = (...values: unknown[]): boolean => values.every((entry) => isNumber(entry) && entry >= 0);
  return (
    fromZero(life?.gazeLead, life?.headLag, life?.headSpan, life?.trunkLead, life?.trunkLag, life?.leanLeast, life?.effort) &&
    isNumber(life?.headShare) && life.headShare >= 0 && life.headShare <= 1 &&
    isBreath(life?.breath) &&
    isNumber(life?.touch) && life.touch >= 0 && life.touch <= 1 &&
    [life?.calm?.hand, life?.calm?.body].every((passes) => Number.isInteger(passes) && passes! >= 0) &&
    (life?.look === undefined || life.look === 'card' || life.look === 'place') &&
    (life?.nod === undefined || fromZero(life.nod))
  );
}

/** Om ett värde är en andning (Life.breath): mått från 0, ett helt antal andetag per cykel, och still sant eller falskt. */
function isBreath(value: unknown): value is Life['breath'] {
  const breath = value as Partial<Life['breath']> | null | undefined;
  return (
    [breath?.rise, breath?.head, breath?.sway, breath?.turn, breath?.fingers].every((entry) => isNumber(entry) && entry >= 0) &&
    Number.isInteger(breath?.cycles) && breath!.cycles! >= 1 && (breath?.still === undefined || typeof breath.still === 'boolean')
  );
}
