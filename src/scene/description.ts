// Scenens beskrivning så som den står i content/scene.json: kameror, bord, sko, rum, förlaga, dealerfilm, kort och kortplatser.
// Verkliga meter: x åt höger i bild, y uppåt, z mot kameran, filten på y = 0. Origo ligger på filtens plan rakt under kameran.
// Här står bara formen. Talen står i content/scene.json, och det som går att räkna ur dem räknas i geometry.ts.

/** Hur ett värde är belagt. Varje grupp i beskrivningen bär märkningen och en kort källa. */
export type Basis = 'mätt' | 'antaget';
export type Marked = { basis: Basis; source: string };

export type Vec3 = [number, number, number];
/** En punkt på filten: x och z. */
export type FeltPoint = [number, number];
export type Frame = { width: number; height: number };

export type SceneDescription = {
  schemaVersion: number;
  about: string;
  /**
   * Gamla projektets lins, som scenens mått är mätta genom: bordskanten och kortplatserna är förda ut på filten genom den.
   * Rutan är den bild kameran ger, i bildpunkter, och rutan spelarens öga ritar; `seat` är den spelarplats som kameran och
   * spelarens öga hör till.
   */
  camera: Marked & { frame: Frame; focalPx: number; position: Vec3; pitchDeg: number; seat: number };
  /**
   * Spelarens öga: vyn scenen ses i. Höjden över filten vid dealerns bordskant, avståndet till den kanten,
   * lutningen nedåt och den lodräta bildvinkeln över rutan. Det står mitt för bordet, på kamerans plats.
   */
  player: Marked & { height: number; distance: number; pitchDeg: number; fovDeg: number };
  /** Dealerns bordskant: linjen på filten där dealerfilmen viks. */
  dealerEdge: Marked & { z: number };
  /**
   * Bordet. `model` säger var filten och dealerns kant ligger i modellens egna mått, så att modellen kan ställas rätt,
   * och `box` är modellens yttersta mått: ur dess undersida räknas golvets höjd.
   * `tilt` är hur många grader bordet lutar mot spelaren kring dealerns bordskant. Allt som ligger på bordet lutar med det:
   * modellen, filmens liggande del, kortplatserna och skon. Deras lägen står som på ett olutat bord.
   */
  table: {
    file: string;
    model: Marked & { feltY: number; dealerEdgeZ: number; box: { min: Vec3; max: Vec3 } };
    tilt: Marked & { deg: number };
  };
  /** Skon: var modellens mitt står på filten, hur den är vriden kring lodlinjen (0 = mynningen mot kameran) och hur lång den är. */
  shoe: Marked & { file: string; at: FeltPoint; yawDeg: number; length: number };
  /** Rummet bakom scenen: hur många grader en 360-bild lyfts från början. Med golv i rummet är det 0. */
  background: Marked & { liftDeg: number };
  /**
   * Rummet som en 360-bild visas som: hur högt över golvet bilden antas vara tagen och hur långt bort väggarna ligger,
   * båda i meter och startvärden för reglagen. `captureHeights` är höjden för en bakgrund som har en egen, med registrets
   * file (captureHeightOf i backdrop.ts). Skuggan under bordet: hur långt utanför bordets fotavtryck den tonar ut, i meter,
   * och hur stor andel av ljuset den som mest tar bort. `dealerShadow` är dealerns skugga på filten (key.ts): hur långt
   * mot spelaren och hur mjukt, i meter, och hur stor andel av ljuset den som mest tar bort.
   */
  room: Marked & {
    captureHeight: number;
    captureHeights: Record<string, number>;
    radius: number;
    shadowReach: number;
    shadowStrength: number;
    dealerShadow: { offset: number; blur: number; strength: number };
  };
  /**
   * Ateljén som ankarnas underlag sparas i: färgerna på skärm, bord och rutnät (0–255 per kanal), och rutnätet på filten i
   * meter: avståndet mellan linjerna, linjens bredd, hur långt åt sidorna och från dealerns bordskant mot spelaren det når,
   * och hur högt över filten det ligger.
   */
  studio: Marked & {
    colours: { screen: [number, number, number]; table: [number, number, number]; grid: [number, number, number] };
    grid: { step: number; line: number; halfWidth: number; reach: number; lift: number };
  };
  /** Förlagan: rutan och takten som scenen sparas i, som underlag för filmer. */
  forlaga: Marked & { frame: Frame; fps: number };
  /**
   * Dealerfilmen. `lift` är hur högt över filten den liggande delen ritas. Resten beskriver närbilden, den ruta en
   * dealerfilm görs i ur en vy: `frame` är rutan, och `reach` är arbetsytan som ska rymmas i den, i meter: i sidled vid
   * bordskanten (`x`), uppåt över filten vid dealern (`top`), bakom dealerns bordskant (`behind`) och förbi varje
   * kortplats på filten (`past`), för de `cards` första kortplatserna på varje plats och hos dealern: fler kortplatser
   * flyttar inte närbilden. `margin` är luften mot rutans kant, som andel av rutan.
   */
  film: Marked & { lift: number; frame: Frame; reach: { x: [number, number]; top: number; behind: number; past: number; cards: number }; margin: number };
  /**
   * Kortet: bredd, höjd, tjocklek och hörnradie, och hur högt över filten scenens kort ritas (under `film.lift`); en
   * kortplats andra kort ligger en tjocklek högre. `colours` är framsidan, dess kant och baksidan, 0–255 per kanal.
   */
  card: Marked & {
    width: number;
    height: number;
    thickness: number;
    corner: number;
    lift: number;
    colours: { face: [number, number, number]; edge: [number, number, number]; back: [number, number, number] };
    /** Skuggan mot filten där kortet ligger (cards.ts): hur långt ut den når och hur mycket mot spelaren, i meter, och hur mörk. */
    shadow: { reach: number; strength: number; offset: number };
  };
  /**
   * Kortplatser: kortets mitt på filten, för dealern och för varje spelarplats, i den ordning korten läggs. I
   * content/scene.json står spelarnas som en båge (`arc`) och dealerns som en rad (`row`), och `seats` och `dealer`
   * räknas ur dem när scenen läses (placesOf). En beskrivning utan båge och rad bär platserna själv.
   */
  places: Marked & { arc?: PlaceArc; row?: PlaceRow; dealer: FeltPoint[]; seats: { seat: number; cards: FeltPoint[] }[] };
};

/**
 * Spelarnas kortplatser som en båge på filten, på ett olutat bord. Platserna 1–`seats` ligger med lika avstånd i sidled
 * över bredden `width` kring `centreX`, med plats 1 längst till vänster i bild. Första kortets djup är `depth` i bågens
 * mitt och böjs tillbaka mot dealern `bend` meter vid ytterplatserna: djupet är depth − bend · |u|^round, där u går från
 * −1 vid plats 1 till 1 vid sista platsen. Med `round` 1 är bågen ett V, med 2 rund: platserna i mitten nästan lika djupt.
 * Varje plats har `cards` kortplatser; nästa ligger `step` (x, z) från det förra.
 */
export type PlaceArc = { centreX: number; depth: number; width: number; bend: number; round: number; step: [number, number]; seats: number; cards: number };
/** Dealerns kortplatser som en rad: första kortet `first` (x, z), och nästa `step` från det förra, `cards` i allt. */
export type PlaceRow = { first: FeltPoint; step: [number, number]; cards: number };

/** Kortplatserna ur bågen och raden, avrundade till 0,1 mm. */
export function placesOf(arc: PlaceArc, row: PlaceRow): { dealer: FeltPoint[]; seats: { seat: number; cards: FeltPoint[] }[] } {
  const tenth = (value: number): number => Math.round(value * 10000) / 10000;
  const seats = Array.from({ length: arc.seats }, (_, k) => {
    const u = arc.seats === 1 ? 0 : (2 * k) / (arc.seats - 1) - 1;
    const x = arc.centreX + (u * arc.width) / 2;
    const z = arc.depth - arc.bend * Math.abs(u) ** arc.round;
    return { seat: k + 1, cards: Array.from({ length: arc.cards }, (_, i): FeltPoint => [tenth(x + i * arc.step[0]), tenth(z + i * arc.step[1])]) };
  });
  const dealer = Array.from({ length: row.cards }, (_, i): FeltPoint => [tenth(row.first[0] + i * row.step[0]), tenth(row.first[1] + i * row.step[1])]);
  return { dealer, seats };
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isPoint = (value: unknown, length: number): boolean =>
  Array.isArray(value) && value.length === length && value.every(isNumber);

/**
 * Tar emot innehållet i content/scene.json och säger på svenska vad som saknas eller inte är ett tal.
 * En scen med ett hål i ska inte ritas: den skulle se rimlig ut och vara fel.
 */
export function readScene(value: unknown): SceneDescription {
  const scene = value as Partial<SceneDescription> | null;
  const wrong: string[] = [];
  const need = (ok: boolean, what: string) => {
    if (!ok) wrong.push(what);
  };
  const marked = (group: Partial<Marked> | undefined, what: string) =>
    need((group?.basis === 'mätt' || group?.basis === 'antaget') && typeof group?.source === 'string' && group.source !== '', `${what}: basis och source`);

  const isFrame = (frame: Partial<Frame> | undefined): boolean => isNumber(frame?.width) && frame.width > 0 && isNumber(frame?.height) && frame.height > 0;

  const { camera, player, dealerEdge, table, shoe, background, room, studio, forlaga, film, card, places } = scene ?? {};
  need(isNumber(camera?.frame?.width) && isNumber(camera?.frame?.height), 'camera.frame');
  need(isNumber(camera?.focalPx) && camera.focalPx > 0, 'camera.focalPx');
  need(isPoint(camera?.position, 3), 'camera.position');
  need(isNumber(camera?.pitchDeg), 'camera.pitchDeg');
  need(isNumber(camera?.seat), 'camera.seat');
  marked(camera, 'camera');
  need(isNumber(player?.height) && player.height > 0 && isNumber(player?.distance) && player.distance > 0, 'player.height och player.distance');
  need(isNumber(player?.pitchDeg) && isNumber(player?.fovDeg) && player.fovDeg > 0 && player.fovDeg < 180, 'player.pitchDeg och player.fovDeg');
  marked(player, 'player');
  need(isNumber(dealerEdge?.z), 'dealerEdge.z');
  marked(dealerEdge, 'dealerEdge');
  need(typeof table?.file === 'string', 'table.file');
  need(isNumber(table?.model?.feltY) && isNumber(table?.model?.dealerEdgeZ), 'table.model');
  need(isPoint(table?.model?.box?.min, 3) && isPoint(table?.model?.box?.max, 3), 'table.model.box');
  marked(table?.model, 'table.model');
  need(isNumber(table?.tilt?.deg), 'table.tilt.deg');
  marked(table?.tilt, 'table.tilt');
  need(typeof shoe?.file === 'string', 'shoe.file');
  need(isPoint(shoe?.at, 2) && isNumber(shoe?.yawDeg) && isNumber(shoe?.length) && shoe.length > 0, 'shoe.at, shoe.yawDeg och shoe.length');
  marked(shoe, 'shoe');
  need(isNumber(background?.liftDeg), 'background.liftDeg');
  marked(background, 'background');
  need(isNumber(room?.captureHeight) && room.captureHeight > 0 && isNumber(room?.radius) && room.radius > 0, 'room.captureHeight och room.radius');
  need(isNumber(room?.shadowReach) && room.shadowReach > 0 && isNumber(room?.shadowStrength), 'room.shadowReach och room.shadowStrength');
  need(
    typeof room?.captureHeights === 'object' && room.captureHeights !== null && Object.values(room.captureHeights).every((height) => isNumber(height) && height > 0),
    'room.captureHeights: en höjd över noll för varje bakgrund',
  );
  const share = (value: unknown): boolean => isNumber(value) && value >= 0 && value <= 1;
  need(
    isNumber(room?.dealerShadow?.offset) && isNumber(room?.dealerShadow?.blur) && room.dealerShadow.blur > 0 && share(room?.dealerShadow?.strength),
    'room.dealerShadow',
  );
  marked(room, 'room');
  const isRgb = (value: unknown): boolean => isPoint(value, 3) && (value as number[]).every((part) => part >= 0 && part <= 255);
  need([studio?.colours?.screen, studio?.colours?.table, studio?.colours?.grid].every(isRgb), 'studio.colours');
  need([studio?.grid?.step, studio?.grid?.line, studio?.grid?.halfWidth, studio?.grid?.reach, studio?.grid?.lift].every((value) => isNumber(value) && value > 0), 'studio.grid');
  marked(studio, 'studio');
  need(isFrame(forlaga?.frame) && isNumber(forlaga?.fps) && forlaga.fps > 0, 'forlaga.frame och forlaga.fps');
  marked(forlaga, 'forlaga');
  need(isNumber(film?.lift), 'film.lift');
  need(isFrame(film?.frame), 'film.frame');
  need(
    isPoint(film?.reach?.x, 2) && film!.reach.x[0] < film!.reach.x[1] && [film?.reach?.top, film?.reach?.behind, film?.reach?.past].every((value) => isNumber(value) && value > 0) &&
      Number.isInteger(film?.reach?.cards) && film!.reach.cards >= 1,
    'film.reach',
  );
  need(isNumber(film?.margin) && film.margin >= 0 && film.margin < 0.5, 'film.margin');
  marked(film, 'film');
  need([card?.width, card?.height, card?.thickness, card?.corner].every(isNumber), 'card');
  // Kortplatserna ur bågen och raden, när beskrivningen bär dem.
  const { arc, row } = places ?? {};
  if (arc !== undefined || row !== undefined) {
    const counts = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 1;
    const arcOk = [arc?.centreX, arc?.depth, arc?.width, arc?.bend, arc?.round].every(isNumber) && arc!.width > 0 && arc!.round > 0 && isPoint(arc?.step, 2) && counts(arc?.seats) && counts(arc?.cards);
    const rowOk = isPoint(row?.first, 2) && isPoint(row?.step, 2) && counts(row?.cards);
    need(arcOk, 'places.arc: centreX, depth, width, bend, round, step, seats och cards');
    need(rowOk, 'places.row: first, step och cards');
    if (arcOk && rowOk) Object.assign(places!, placesOf(arc!, row!));
  }
  // Kortplatsens sista kort ligger ovanpå de andra, en tjocklek högre för varje, och ska fortfarande ligga under filmen.
  const stacked = Math.max(1, ...(places?.seats ?? []).map((entry) => (Array.isArray(entry?.cards) ? entry.cards.length : 1)));
  need(
    isNumber(card?.lift) && card.lift > 0 && isNumber(film?.lift) && isNumber(card?.thickness) && card.lift + (stacked - 1) * card.thickness < film.lift,
    'card.lift, under film.lift också för kortplatsens sista kort',
  );
  need([card?.colours?.face, card?.colours?.edge, card?.colours?.back].every(isRgb), 'card.colours');
  need(isNumber(card?.shadow?.reach) && card.shadow.reach > 0 && share(card?.shadow?.strength) && isNumber(card?.shadow?.offset), 'card.shadow');
  marked(card, 'card');
  need(Array.isArray(places?.dealer) && places.dealer.every((point) => isPoint(point, 2)), 'places.dealer');
  need(
    Array.isArray(places?.seats) &&
      places.seats.length > 0 &&
      places.seats.every((entry) => isNumber(entry?.seat) && Array.isArray(entry.cards) && entry.cards.length > 0 && entry.cards.every((point) => isPoint(point, 2))),
    'places.seats',
  );
  marked(places, 'places');

  if (wrong.length > 0) throw new Error(`Scenens beskrivning går inte att använda: ${wrong.join('; ')}`);
  return scene as SceneDescription;
}
