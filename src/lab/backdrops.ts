// Det steget Scen läser ur registret: bakgrunderna med sina startvärden, och bilden som står in för dealern.

import { sectionsOf, type Asset, type Item, type Registry } from './registry.ts';

/**
 * Hur en bakgrund visas. `turn`, `blur`, `exposure` och `mirror` har samma mening som i registrets `oldView`;
 * `lift` är scenens eget: hur många grader bilden lyfts så att horisonten kommer in i kamerans ruta.
 */
export type Look = { turn: number; blur: number; exposure: number; mirror: boolean; lift: number };

/** En bakgrund utan värden från gamla projektet visas som den är. */
export const PLAIN: Look = { turn: 0, blur: 0, exposure: 1, mirror: false, lift: 0 };

/**
 * Reglagens startvärden för en bakgrund: gamla projektets visning när posten bär den, och scenens lyft (`liftDeg`)
 * för en 360-bild. En platt bild fyller redan kamerans ruta och lyfts inte.
 */
export function startLook(asset: Asset, liftDeg: number): Look {
  const old = (asset.oldView ?? {}) as Record<string, unknown>;
  const number = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  return {
    turn: number(old.turn, PLAIN.turn),
    blur: number(old.blur, PLAIN.blur),
    exposure: number(old.exposure, PLAIN.exposure),
    mirror: typeof old.mirror === 'boolean' ? old.mirror : PLAIN.mirror,
    lift: backdropKind(asset) === '360' ? liftDeg : PLAIN.lift,
  };
}

export const sameLook = (a: Look, b: Look): boolean =>
  a.turn === b.turn && a.blur === b.blur && a.exposure === b.exposure && a.mirror === b.mirror && a.lift === b.lift;

/** Bakgrunderna i registrets ordning, med samma nummer som i Granska. */
export const backdropItems = (registry: Registry): Item[] =>
  sectionsOf(registry).find((section) => section.key === 'backgrounds')?.items ?? [];

/** En bakgrund är en 360-bild om posten inte säger att den är platt. */
export const backdropKind = (asset: Asset): '360' | 'platt' => (asset.kind === 'platt' ? 'platt' : '360');

/**
 * Bilden som står in för dealern tills scenen har egna ankare: registrets ankare i vila för den dealern.
 * Ett godkänt går före ett som väntar på omdöme. Ett som utgår, eller vars fil saknas, används inte.
 */
export function standIn(registry: Registry, dealer: string): Asset | null {
  const resting = registry.assets.filter(
    (asset) => asset.group === 'anchors' && asset.dealer === dealer && asset.pose === 'vila' && asset.present && asset.status !== 'utgår',
  );
  return resting.find((asset) => asset.status === 'godkänd') ?? resting[0] ?? null;
}
