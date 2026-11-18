// Kortplanen som Labbet ställer (steget Kortplan) och servern sparar i content/scene.json: spelarnas båge
// (places.arc), dealerns rad (places.row) och kortens storlek på bordet (card.onTable.scale), och med dem farten
// dealerns klipp spelas i (content/runda.json, speed.clips). Här står vilka tal det är, deras gränser och prövningen av
// dem. Antalet platser och kortplatser, och allt annat i scenen och rundan, ändras inte här.
// Inget three och ingen filläsning, så att servern och Node kan pröva allt.

import { CARD_SCALE, placesOf, type FeltPoint, type PlaceArc, type PlaceRow, type SceneDescription } from './description.ts';

/**
 * Talen som går att ställa: bågens sex, radens två punkter, kortens storlek, och klippens fart (`speed`, som står i
 * content/runda.json och inte i scenen). Utan `speed` rörs farten inte.
 */
export type CardPlan = {
  arc: Pick<PlaceArc, 'centreX' | 'depth' | 'width' | 'bend' | 'round' | 'step'>;
  row: Pick<PlaceRow, 'first' | 'step'>;
  scale: number;
  speed?: number;
};

export class PlanError extends Error {}

/**
 * Gränserna för varje tal, i meter när inget annat sägs. Djupen räknas från dealerns bordskant (dealerEdge.z) mot
 * spelaren, så att gränsen följer bordet: bågens djup (`depth`) och dealerns första kort (`row.first[1]`). Valda av
 * agenten 2026-11-18 som rimliga för ett blackjackbord på 2,1 × 1,6 m, inte mätta:
 * - spelarnas kort ligger mellan 15 och 90 cm från dealerns kant, bågen är 30–160 cm bred och böjs högst 40 cm tillbaka
 *   (negativt böjer den mot spelarna), och round går från ett V (1) till platt i mitten (4);
 * - nästa kort på en plats ligger 2,5–6 cm åt höger, så att det förras valör syns och korten ligger över varandra,
 *   och högst 2 cm i djup (som provet i description.test.ts);
 * - dealerns första kort ligger inom en halv meter i sidled och 5–60 cm från kanten, och nästa kort som hos spelarna;
 * - kortens storlek är CARD_SCALE gånger filmens kort;
 * - klippens fart går från 1, som de är filmade, till 2, dubbelt så fort: ett klipp på 3–4 s tar då 1,5–2 s (en mätt
 *   dealer delar ett kort på 0,62–0,90 s, och Kling gör inga klipp under 3 s). Fortare än 2 hoppar filmen över mer än
 *   varannan ruta.
 */
export const PLAN_LIMITS = {
  centreX: [-0.3, 0.3],
  depthFromEdge: [0.15, 0.9],
  width: [0.3, 1.6],
  bend: [-0.2, 0.4],
  round: [1, 4],
  arcStep: { x: [0.025, 0.06], z: [-0.02, 0.02] },
  rowFirst: { x: [-0.5, 0.5], zFromEdge: [0.05, 0.6] },
  rowStep: { x: [0.025, 0.06], z: [-0.02, 0.02] },
  scale: CARD_SCALE,
  speed: [1, 2],
} as const;

/** Talen så som scenen bär dem. Null när scenen inte har båge och rad. */
export function planOf(scene: SceneDescription): CardPlan | null {
  const { arc, row } = scene.places;
  if (!arc || !row) return null;
  return {
    arc: { centreX: arc.centreX, depth: arc.depth, width: arc.width, bend: arc.bend, round: arc.round, step: [arc.step[0], arc.step[1]] },
    row: { first: [row.first[0], row.first[1]], step: [row.step[0], row.step[1]] },
    scale: scene.card.onTable.scale,
  };
}

/** Om två planer har samma tal. */
export const samePlan = (a: CardPlan, b: CardPlan): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Scenen med kortplanen `plan`: bågen, raden och kortplatserna ur dem, och kortens storlek. Antalet platser och
 * kortplatser är scenens.
 */
export function withPlan(scene: SceneDescription, plan: CardPlan): SceneDescription {
  const { arc, row } = scene.places;
  if (!arc || !row) throw new PlanError('Scenen har ingen båge och rad att ställa (places.arc och places.row)');
  const nextArc: PlaceArc = { ...arc, ...plan.arc, step: [plan.arc.step[0], plan.arc.step[1]] };
  const nextRow: PlaceRow = { ...row, first: [plan.row.first[0], plan.row.first[1]], step: [plan.row.step[0], plan.row.step[1]] };
  return {
    ...scene,
    places: { ...scene.places, arc: nextArc, row: nextRow, ...placesOf(nextArc, nextRow) },
    card: { ...scene.card, onTable: { ...scene.card.onTable, scale: plan.scale } },
  };
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const within = (value: unknown, [low, high]: readonly [number, number]): boolean => isNumber(value) && value >= low - 1e-9 && value <= high + 1e-9;

/** Om `value` är en fart som klippen får spelas i (PLAN_LIMITS.speed). */
export const isSpeed = (value: unknown): value is number => within(value, PLAN_LIMITS.speed);
const range = ([low, high]: readonly [number, number], from = 0): string =>
  `${String(Number((low + from).toFixed(4))).replace('.', ',')} … ${String(Number((high + from).toFixed(4))).replace('.', ',')}`;

/** Ett objekt med precis de här fälten, inga andra. */
function exactly(value: unknown, keys: string[], what: string, wrong: string[]): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    wrong.push(`${what} saknas`);
    return null;
  }
  const extra = Object.keys(value).filter((key) => !keys.includes(key));
  if (extra.length > 0) wrong.push(`${what} får inte bära ${extra.join(', ')}`);
  return value as Record<string, unknown>;
}

/** Ett par tal [x, z]. */
const isPair = (value: unknown): value is [number, number] => Array.isArray(value) && value.length === 2 && value.every(isNumber);

/**
 * Prövar en kortplan som Labbet skickar mot scenen `scene`: bara talen i CardPlan, var och en inom PLAN_LIMITS. Säger
 * på svenska vad som är fel; inget annat tal i scenen eller rundan tas emot.
 */
export function readPlan(value: unknown, scene: SceneDescription): CardPlan {
  const wrong: string[] = [];
  const edge = scene.dealerEdge.z;
  const body = exactly(value, ['arc', 'row', 'scale', 'speed'], 'kortplanen', wrong);
  const arc = exactly(body?.arc, ['centreX', 'depth', 'width', 'bend', 'round', 'step'], 'arc', wrong);
  const row = exactly(body?.row, ['first', 'step'], 'row', wrong);
  const need = (ok: boolean, what: string) => {
    if (!ok) wrong.push(what);
  };
  const L = PLAN_LIMITS;
  if (arc) {
    need(within(arc.centreX, L.centreX), `arc.centreX ${range(L.centreX)}`);
    need(within(isNumber(arc.depth) ? arc.depth - edge : NaN, L.depthFromEdge), `arc.depth ${range(L.depthFromEdge, edge)} (${range(L.depthFromEdge)} m från dealerns bordskant)`);
    need(within(arc.width, L.width), `arc.width ${range(L.width)}`);
    need(within(arc.bend, L.bend), `arc.bend ${range(L.bend)}`);
    need(within(arc.round, L.round), `arc.round ${range(L.round)}`);
    need(isPair(arc.step) && within(arc.step[0], L.arcStep.x) && within(arc.step[1], L.arcStep.z), `arc.step [${range(L.arcStep.x)}, ${range(L.arcStep.z)}]`);
  }
  if (row) {
    need(isPair(row.first) && within(row.first[0], L.rowFirst.x) && within(row.first[1] - edge, L.rowFirst.zFromEdge), `row.first [${range(L.rowFirst.x)}, ${range(L.rowFirst.zFromEdge, edge)}]`);
    need(isPair(row.step) && within(row.step[0], L.rowStep.x) && within(row.step[1], L.rowStep.z), `row.step [${range(L.rowStep.x)}, ${range(L.rowStep.z)}]`);
  }
  need(within(body?.scale, L.scale), `scale ${range(L.scale)}`);
  need(body?.speed === undefined || isSpeed(body.speed), `speed ${range(L.speed)}`);
  if (wrong.length > 0) throw new PlanError(`Kortplanen tas inte emot: ${wrong.join('; ')}`);
  const step = (pair: unknown): [number, number] => [(pair as FeltPoint)[0], (pair as FeltPoint)[1]];
  return {
    arc: { centreX: arc!.centreX as number, depth: arc!.depth as number, width: arc!.width as number, bend: arc!.bend as number, round: arc!.round as number, step: step(arc!.step) },
    row: { first: step(row!.first), step: step(row!.step) },
    scale: body!.scale as number,
    ...(body!.speed === undefined ? {} : { speed: body!.speed as number }),
  };
}
