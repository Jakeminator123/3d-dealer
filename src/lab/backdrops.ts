// Det steget Scen läser ur registret: bakgrunderna med sina startvärden, och dealerfilmerna att välja mellan.

import type { SeatView } from '../scene/build.ts';
import type { FilmNote, OneClipNote } from '../scene/dealer.ts';
import { dealsOf, madeWith, planRound, roundFilm, type DealtRound, type Plan, type Round } from '../scene/round.ts';
import { shownText } from './names.ts';
import { kindOf, sectionsOf, type Asset, type Item, type Registry } from './registry.ts';

/**
 * Hur en bakgrund visas. `turn`, `blur`, `exposure` och `mirror` har samma mening som i registrets `oldView`.
 * De andra är scenens egna: `lift` är hur många grader bilden lyfts, och `height` och `radius` är rummet en 360-bild
 * visas som: hur många meter över golvet bilden antas vara tagen och hur många meter bort väggarna ligger.
 */
export type Look = { turn: number; blur: number; exposure: number; mirror: boolean; lift: number; height: number; radius: number };

/** Scenens startvärden för det som är dess eget i en bakgrunds visning. */
type RoomStart = { lift: number; height: number; radius: number };

/** En bakgrund utan värden från gamla projektet visas som den är. */
export const PLAIN = { turn: 0, blur: 0, exposure: 1, mirror: false };

/**
 * Reglagens startvärden för en bakgrund: gamla projektets visning när posten bär den, och scenens lyft och rum.
 * En platt bild fyller redan kamerans ruta och lyfts inte; rummets höjd och radie gäller bara 360-bilder.
 */
export function startLook(asset: Asset, room: RoomStart): Look {
  const old = (asset.oldView ?? {}) as Record<string, unknown>;
  const number = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  return {
    turn: number(old.turn, PLAIN.turn),
    blur: number(old.blur, PLAIN.blur),
    exposure: number(old.exposure, PLAIN.exposure),
    mirror: typeof old.mirror === 'boolean' ? old.mirror : PLAIN.mirror,
    lift: backdropKind(asset) === '360' ? room.lift : 0,
    height: room.height,
    radius: room.radius,
  };
}

export const sameLook = (a: Look, b: Look): boolean =>
  a.turn === b.turn &&
  a.blur === b.blur &&
  a.exposure === b.exposure &&
  a.mirror === b.mirror &&
  a.lift === b.lift &&
  a.height === b.height &&
  a.radius === b.radius;

/** Bakgrunderna i registrets ordning, med samma nummer som i Granska. */
export const backdropItems = (registry: Registry): Item[] =>
  sectionsOf(registry).find((section) => section.key === 'backgrounds')?.items ?? [];

/** En bakgrund är en 360-bild om posten inte säger att den är platt. */
export const backdropKind = (asset: Asset): '360' | 'platt' => (asset.kind === 'platt' ? 'platt' : '360');

/**
 * En dealer att välja i steget Scen: en dealerfilm ur registret, och vad valet heter. Dockan väljs inte här.
 * `lands` är var och när ett klipp lägger sitt kort (postens `lands`): platsen, vilket av platsens kort, och tiden i
 * filmen då det ligger. Från den tiden visar scenen sitt eget kort där. `made` är ögat filmen är gjord genom, skon den
 * bär och var kortet landar på filten, när posten säger det (registrets eye, shoe och place): filmen läggs genom det
 * ögat, och kortet landar där och går sedan till kortplanen, som i hela given.
 */
type Landing = { seat: number; index: number; at: number };
type DealerChoice = { dealer: OneClipNote; label: string; film: boolean; lands?: Landing; made: ReturnType<typeof madeWith> };

/** Vyn en dealerfilm är gjord i, så som posten bär den (`view`). Null när posten inte säger en vy som går att använda. */
function madeIn(asset: Asset): SeatView | null {
  const view = asset.view as { kind?: unknown; seat?: unknown } | undefined;
  if (view?.kind === 'spelaren') return { kind: 'spelaren' };
  if (view?.kind === 'plats' && typeof view.seat === 'number' && Number.isInteger(view.seat) && view.seat > 0) return { kind: 'plats', seat: view.seat };
  return null;
}

/** Var och när ett klipp lägger sitt kort, så som posten bär det (`lands`). Null när posten inte säger det. */
function landing(asset: Asset): Landing | null {
  const lands = asset.lands as Partial<Landing> | undefined;
  const whole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);
  return whole(lands?.seat) && lands.seat > 0 && whole(lands.index) && lands.index >= 0 && typeof lands.at === 'number' && Number.isFinite(lands.at)
    ? { seat: lands.seat, index: lands.index, at: lands.at }
    : null;
}

/**
 * Dealerna att välja mellan: `dealer`s dealerfilmer (`use: "dealerfilm"`, gjorda i närbilden av en vy och lagda på den
 * vikta ytan), filmerna före stillbilderna. Det som utgår eller saknar fil är inte med.
 */
export function dealerChoices(registry: Registry, dealer: string): DealerChoice[] {
  const made = registry.assets.flatMap((asset): DealerChoice[] => {
    if (!asset.present || asset.status === 'utgår') return [];
    const view = asset.use === 'dealerfilm' && asset.dealer === dealer ? madeIn(asset) : null;
    const lands = landing(asset);
    return view ? [{ dealer: { kind: 'film', file: asset.file, view }, label: shownText(asset.title), film: kindOf(asset.file) === 'film', ...(lands ? { lands } : {}), made: madeWith(asset) }] : [];
  });
  return [...made.filter((choice) => choice.film), ...made.filter((choice) => !choice.film)];
}

/**
 * Hela given att välja i steget Scen: för varje vy där `dealer` har cykelklipp i registret, rundan som spelkärnan har
 * delat (`dealt`, ur /api/runda) som dealerfilm, med klippen valda som src/pipeline/runda.ts och Casinot väljer dem
 * (dealsOf och planRound i src/scene/round.ts). Kort utan klipp går självt. `key` är valets värde i listan, `plan` vad
 * som spelas och vad som saknas.
 */
export type RoundChoice = { key: string; label: string; view: SeatView; plan: Plan; dealer: FilmNote };

export function roundChoices(registry: Registry, dealer: string, dealt: DealtRound, round: Round, seats: number[]): RoundChoice[] {
  const views: SeatView[] = [{ kind: 'spelaren' }, ...seats.map((seat): SeatView => ({ kind: 'plats', seat }))];
  const deals = dealsOf(dealt.steps);
  return views.flatMap((view): RoundChoice[] => {
    const plan = planRound(deals, registry.assets, dealer, view, round.fallback);
    const filmed = plan.dealt.filter((deal) => deal.file !== null).length;
    if (filmed === 0) return [];
    const name = view.kind === 'plats' ? `Plats ${view.seat}` : 'Spelaren';
    const count = plan.missing.length === 0 ? `${plan.dealt.length} kort` : `${plan.dealt.length} kort, ${plan.missing.length} utan klipp`;
    return [{ key: `runda:${view.kind === 'plats' ? `plats-${view.seat}` : 'spelaren'}`, label: `Hela given ur ${name} (${count})`, view, plan, dealer: roundFilm(plan, round, view) }];
  });
}
