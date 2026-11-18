// Dealern och ateljén så som de pekas ut i en beställning eller en beskrivning: bara namn och tal, ingenting läst.
// Scenbygget (build.ts) tar samma sak med dockans mått och rörelse redan lästa.

import type { SeatView } from './geometry.ts';

/**
 * Dealern i scenen.
 * - `film`: en dealerfilm, film eller stillbild av dealern på grön skärm, gjord i närbilden av vyn `view` med scenens
 *   bord framför sig och projicerad därifrån på den vikta ytan. Filen pekas ut som registrets `file`.
 * - `docka`: den vita dockan. `move` är rörelsens namn (content/moves/<namn>.json), och `pose` säger om den gör
 *   rörelsen (`giv`) eller sitter i vila med händerna på filten (`vila`). Med `seat` ställs rörelsen om till den
 *   platsen: kortet hämtas på samma ställe i skon och läggs på den platsens första kortplats, eller på kortplatsen
 *   `index` (0 är den första). `move` kan också vara en cykel (content/moves/cykel-*.json): given i cykelns takt,
 *   och handen tillbaka till REDO.
 */
export type DealerNote =
  | { kind: 'film'; file: string; view: SeatView }
  | { kind: 'docka'; move: string; pose: 'giv' | 'vila'; seat?: number; index?: number };

/**
 * Ett kort som scenen visar på en kortplats: platsen (1–7) och vilket av platsens kort (0 är det första), vad kortet är
 * (till exempel `A♠`), och från vilken tid i dealerns film det ligger där. Från den tiden tas filmens blå märkkort bort.
 */
export type CardNote = { seat: number; index: number; face: string; from: number };

export type Rgb = [number, number, number];

/**
 * Ateljén: scenen utan rum mot en enfärgad skärm, för bilder som ska bli underlag. `screen` är skärmens färg, 0–255 per
 * kanal. Med `table` ritas bordet enfärgat i den färgen, utan ljus, så att det döljer det som står bakom utan att synas
 * som bord; null låter bordet vara som det är. Med `grid` ritas ett rutnät i den färgen på filten, en ruta var tionde
 * centimeter: det visar filtens plan och lutning för den som ska rita en hand på den, och i en grön ton nycklas det bort
 * med skärmen.
 */
export type Studio = { screen: Rgb; table: Rgb | null; grid?: Rgb | null };
