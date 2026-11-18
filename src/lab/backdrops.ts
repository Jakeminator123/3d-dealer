// Det steget Scen läser ur registret: bakgrunderna med sina startvärden, och dealerna att välja mellan.

import type { DealerNote, SeatView } from '../scene/build.ts';
import { kindOf, sectionsOf, type Asset, type Item, type Registry } from './registry.ts';

/**
 * Hur en bakgrund visas. `turn`, `blur`, `exposure` och `mirror` har samma mening som i registrets `oldView`.
 * De andra är scenens egna: `lift` är hur många grader bilden lyfts, och `height` och `radius` är rummet en 360-bild
 * visas som: hur många meter över golvet bilden antas vara tagen och hur många meter bort väggarna ligger.
 */
export type Look = { turn: number; blur: number; exposure: number; mirror: boolean; lift: number; height: number; radius: number };

/** Scenens startvärden för det som är dess eget i en bakgrunds visning. */
export type RoomStart = { lift: number; height: number; radius: number };

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
 * Bilden som står in för dealern på den vikta ytan: registrets ankare i vila för den dealern, i gamla projektets ruta.
 * Ett godkänt går före ett som väntar på omdöme. Ett som utgår, vars fil saknas eller som är en helfigur används inte.
 */
export function standIn(registry: Registry, dealer: string): Asset | null {
  const resting = registry.assets.filter(
    (asset) =>
      asset.group === 'anchors' &&
      asset.dealer === dealer &&
      asset.pose === 'vila' &&
      asset.use !== 'helfigur' &&
      asset.use !== 'dealerfilm' &&
      asset.present &&
      asset.status !== 'utgår',
  );
  return resting.find((asset) => asset.status === 'godkänd') ?? resting[0] ?? null;
}

/**
 * En dealer att välja i steget Scen: en bild eller film ur registret, och vad valet heter. Dockan väljs inte här.
 * `lands` är var och när ett klipp lägger sitt kort (postens `lands`): platsen, vilket av platsens kort, och tiden i
 * filmen då det ligger. Från den tiden visar scenen sitt eget kort där.
 */
export type Landing = { seat: number; index: number; at: number };
export type DealerChoice = { dealer: Exclude<DealerNote, { kind: 'docka' }>; label: string; film: boolean; lands?: Landing };

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
 * Dealerna att välja mellan: först `dealer`s egna dealerfilmer (`use: "dealerfilm"`, gjorda i närbilden av en vy och
 * lagda på den vikta ytan), sedan registrets helfigurer (`use: "helfigur"`), och sist det gamla ankaret för `dealer`.
 * Inom varje slag står filmerna före stillbilderna. Det som utgår eller saknar fil är inte med.
 */
export function dealerChoices(registry: Registry, dealer: string): DealerChoice[] {
  const usable = registry.assets.filter((asset) => asset.present && asset.status !== 'utgår');
  const filmsFirst = (choices: DealerChoice[]): DealerChoice[] => [...choices.filter((choice) => choice.film), ...choices.filter((choice) => !choice.film)];
  const made = usable.flatMap((asset): DealerChoice[] => {
    const view = asset.use === 'dealerfilm' && asset.dealer === dealer ? madeIn(asset) : null;
    const lands = landing(asset);
    return view ? [{ dealer: { kind: 'film', file: asset.file, view }, label: asset.title, film: kindOf(asset.file) === 'film', ...(lands ? { lands } : {}) }] : [];
  });
  const figures = usable
    .filter((asset) => asset.use === 'helfigur')
    .map((asset): DealerChoice => ({ dealer: { kind: 'helfigur', file: asset.file }, label: asset.title, film: kindOf(asset.file) === 'film' }));
  const anchor = standIn(registry, dealer);
  return [
    ...filmsFirst(made),
    ...filmsFirst(figures),
    ...(anchor ? [{ dealer: { kind: 'ankare' as const, file: anchor.file }, label: `Gamla ankaret: ${anchor.title}`, film: false }] : []),
  ];
}
