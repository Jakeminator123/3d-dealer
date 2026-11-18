// Scenens beskrivning så som den står i content/scene.json: kamera, bord, sko, kort och kortplatser.
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
   * Filmkameran: den kamera dealerns bilder är gjorda genom, och genom vilken de läggs på den vikta ytan.
   * Rutan är den bild kameran ger, i bildpunkter; `seat` är den spelarplats som kameran och spelarens öga hör till.
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
   * Bordet. `model` säger var filten och dealerns kant ligger i modellens egna mått, så att modellen kan ställas rätt.
   * `tilt` är hur många grader bordet lutar mot spelaren kring dealerns bordskant. Allt som ligger på bordet lutar med det:
   * modellen, filmens liggande del, kortplatserna och skon. Deras lägen står som på ett olutat bord.
   */
  table: { file: string; model: Marked & { feltY: number; dealerEdgeZ: number }; tilt: Marked & { deg: number } };
  /** Skon: var modellens mitt står på filten, hur den är vriden kring lodlinjen (0 = mynningen mot kameran) och hur lång den är. */
  shoe: Marked & { file: string; at: FeltPoint; yawDeg: number; length: number };
  /** Rummet bakom scenen: hur många grader en 360-bild lyfts från början, så att dess horisont kommer in i kamerans ruta. */
  background: Marked & { liftDeg: number };
  /** Dealerfilmens yta: hur högt över filten den liggande delen ritas. */
  film: Marked & { lift: number };
  card: Marked & { width: number; height: number; thickness: number; corner: number };
  /** Kortplatser: kortets mitt på filten, för dealern och för varje spelarplats, i den ordning korten läggs. */
  places: Marked & { dealer: FeltPoint[]; seats: { seat: number; cards: FeltPoint[] }[] };
};

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

  const { camera, player, dealerEdge, table, shoe, background, film, card, places } = scene ?? {};
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
  marked(table?.model, 'table.model');
  need(isNumber(table?.tilt?.deg), 'table.tilt.deg');
  marked(table?.tilt, 'table.tilt');
  need(typeof shoe?.file === 'string', 'shoe.file');
  need(isPoint(shoe?.at, 2) && isNumber(shoe?.yawDeg) && isNumber(shoe?.length) && shoe.length > 0, 'shoe.at, shoe.yawDeg och shoe.length');
  marked(shoe, 'shoe');
  need(isNumber(background?.liftDeg), 'background.liftDeg');
  marked(background, 'background');
  need(isNumber(film?.lift), 'film.lift');
  marked(film, 'film');
  need([card?.width, card?.height, card?.thickness, card?.corner].every(isNumber), 'card');
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
