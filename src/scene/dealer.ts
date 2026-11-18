// Dealern och ateljén så som de pekas ut i en beställning eller en beskrivning: bara namn och tal, ingenting läst.
// Scenbygget (build.ts) tar samma sak med dockans mått och rörelse redan lästa.

import type { SeatView } from './geometry.ts';

/**
 * Kortet ett klipp lägger: platsen (1–7), vilket av platsens kort (0 är det första), vad kortet är (till exempel `A♠`),
 * och tiden i klippet, i sekunder, då det ligger på kortplatsen (registrets `lands.at`). Från den tiden tas klippets blå
 * märkkort bort och scenens kort ligger där, till följdens slut.
 */
export type ClipCard = { seat: number; index: number; face: string; at: number };

/** Ett klipp i dealerns film: filen som registrets `file`, och kortet klippet lägger, om det lägger ett. */
export type FilmClip = { file: string; card?: ClipCard };

/**
 * En dealerfilm: en följd av klipp av dealern på grön skärm, alla gjorda i närbilden av vyn `view` med scenens bord
 * framför sig och projicerade därifrån på den vikta ytan. Klippen spelas efter varandra utan glapp, och varje kort
 * ligger kvar från att det har landat tills följden är slut. Efter sista klippet står filmens sista ruta kvar i `hold`
 * sekunder. Ett ensamt klipp är en följd med ett klipp; en stillbild kan bara stå ensam.
 */
export type FilmNote = { kind: 'film'; view: SeatView; clips: FilmClip[]; hold?: number };

/**
 * Ett ensamt klipp skrivet som förr: filen här, och kortet bredvid i beställningen (`card`, CardNote). Det läses som en
 * följd med ett klipp (`filmOf`), så att beställningar som redan finns går som förut.
 */
export type OneClipNote = { kind: 'film'; file: string; view: SeatView };

/**
 * Dealern i scenen.
 * - `film`: en dealerfilm (FilmNote), eller ett ensamt klipp skrivet som förr (OneClipNote).
 * - `docka`: den vita dockan. `move` är rörelsens namn (content/moves/<namn>.json), och `pose` säger om den gör
 *   rörelsen (`giv`) eller sitter i vila med händerna på filten (`vila`). Med `seat` ställs rörelsen om till den
 *   platsen: kortet hämtas på samma ställe i skon och läggs på den platsens första kortplats, eller på kortplatsen
 *   `index` (0 är den första). `move` kan också vara en cykel (content/moves/cykel-*.json): given i cykelns takt,
 *   och handen tillbaka till REDO.
 */
export type DealerNote = FilmNote | OneClipNote | { kind: 'docka'; move: string; pose: 'giv' | 'vila'; seat?: number; index?: number };

/**
 * Kortet till ett ensamt klipp skrivet som förr (OneClipNote): platsen, vilket av platsens kort, vad kortet är, och från
 * vilken tid i filmen det ligger där.
 */
export type CardNote = { seat: number; index: number; face: string; from: number };

/** En dealerfilm som följd: ett ensamt klipp skrivet som förr blir en följd med ett klipp, med kortet `card`. */
export function filmOf(note: FilmNote | OneClipNote, card?: CardNote | null): FilmNote {
  if ('clips' in note) return note;
  const laid = card ? { card: { seat: card.seat, index: card.index, face: card.face, at: card.from } } : {};
  return { kind: 'film', view: note.view, clips: [{ file: note.file, ...laid }] };
}

export type Rgb = [number, number, number];

/**
 * Ateljén: scenen utan rum mot en enfärgad skärm, för bilder som ska bli underlag. `screen` är skärmens färg, 0–255 per
 * kanal. Med `table` ritas bordet enfärgat i den färgen, utan ljus, så att det döljer det som står bakom utan att synas
 * som bord; null låter bordet vara som det är. Med `grid` ritas ett rutnät i den färgen på filten, en ruta var tionde
 * centimeter: det visar filtens plan och lutning för den som ska rita en hand på den, och i en grön ton nycklas det bort
 * med skärmen.
 */
export type Studio = { screen: Rgb; table: Rgb | null; grid?: Rgb | null };
