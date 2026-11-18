// Dealern och ateljén så som de pekas ut i en beställning eller en beskrivning: bara namn och tal, ingenting läst.
// Scenbygget (build.ts) tar samma sak med dockans mått och rörelse redan lästa.

import type { SeatView } from './geometry.ts';

/**
 * Var ett kort ligger: platsen (1–7, eller `D` för dealern), vilken av platsens händer (0 är den första; en delad hand
 * får nästa) och kortets nummer i handen, 0 för det första. Kortplatsen räknas ur content/scene.json (spotPlace i
 * round.ts). Utan `hand` är det platsens första hand.
 */
export type CardSpot = { seat: number | 'D'; index: number; hand?: number };

/**
 * Kortet ett klipp lägger: var det ligger, vad kortet är (till exempel `A♠`), och tiden i klippet, i sekunder, då det
 * ligger på kortplatsen (registrets `lands.at`). Från den tiden tas klippets blå märkkort bort och scenens kort ligger
 * där, till följdens slut. Ett senare kort på samma kortplats tar det tidigares plats: så vänds hålkortet.
 * `face` null är ett kort med baksidan upp, hålkortet innan det vänds: spelkärnan har inte sagt vad det är.
 * `place` är var kortet ligger på filten (x, z på ett olutat bord) när klippet bär det (registrets `place`): där klippet
 * lägger det, också när scenens kortplatser har flyttats sedan klippet gjordes. Utan det räknas platsen ur scenen.
 */
export type ClipCard = CardSpot & { face: string | null; at: number; place?: [number, number] };

/**
 * Ögat en dealerfilm är gjord genom: vyns närbild så som den räknades när filmen gjordes, som en förlaga bär det (läge,
 * riktning och brännvidd i rutan `frame`). Filmen läggs tillbaka genom samma öga, också när scenen har ändrats sedan.
 */
export type FilmEye = { position: [number, number, number]; forward: [number, number, number]; focalPx: number; frame: { width: number; height: number } };

/** Skon så som den stod när en dealerfilm gjordes (content/scene.json, shoe): den är inbakad i filmen. */
export type FilmShoe = { at: [number, number]; yawDeg: number; length: number };

/**
 * Ett klipp i dealerns film: filen som registrets `file`, och kortet klippet lägger, om det lägger ett.
 *
 * Utan fil (`file: null`) är det spelkärnans `fallback`: ett kort som saknar klipp. Dealern står då i REDO (filmens ruta
 * står kvar) i `seconds` sekunder medan scenens kort glider dit självt, från `from`: skons mynning (`skon`), en annan
 * kortplats (ett kort som flyttas när en hand delas), eller samma kortplats (kortet vänds där det ligger). Kortet ligger
 * från `card.at`.
 */
export type FilmClip = { file: string; card?: ClipCard } | { file: null; seconds: number; card: ClipCard; from: CardSpot | 'skon' };

/**
 * En dealerfilm: en följd av klipp av dealern på grön skärm, alla gjorda i närbilden av vyn `view` med scenens bord
 * framför sig och projicerade därifrån på den vikta ytan. Klippen spelas efter varandra utan glapp, och varje kort
 * ligger kvar från att det har landat tills följden är slut. Efter sista klippet står filmens sista ruta kvar i `hold`
 * sekunder, och sedan börjar följden om; med `loop: false` står den kvar där. Ett ensamt klipp är en följd med ett
 * klipp; en stillbild kan bara stå ensam. `eye` och `shoe` är ögat filmerna är gjorda genom och skon de bär, när
 * registret säger det (FilmEye, FilmShoe); utan dem räknas de ur scenen och vyn.
 */
export type FilmNote = { kind: 'film'; view: SeatView; clips: FilmClip[]; hold?: number; loop?: boolean; eye?: FilmEye; shoe?: FilmShoe };

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
 *   och handen tillbaka till REDO. `seat` är 1–7 eller `D` för dealerns egna kort, och `action` vad en cykel gör med
 *   kortet: `deal` (om inget sägs), `hole` (hålkortet med baksidan upp) eller `flip` (hålkortet vänds där det ligger).
 */
export type DealerNote =
  | FilmNote
  | OneClipNote
  | { kind: 'docka'; move: string; pose: 'giv' | 'vila'; seat?: number | 'D'; index?: number; action?: 'deal' | 'hole' | 'flip' };

/**
 * Kortet till ett ensamt klipp skrivet som förr (OneClipNote): platsen, vilket av platsens kort, vad kortet är, och från
 * vilken tid i filmen det ligger där.
 */
export type CardNote = { seat: number; index: number; face: string; from: number };

/** Om två kortplatser är samma. */
export const sameSpot = (a: CardSpot, b: CardSpot): boolean => a.seat === b.seat && a.index === b.index && (a.hand ?? 0) === (b.hand ?? 0);

/** En kortplats som ord, för en nyckel eller en utskrift: `4/0/1` är plats 4, första handen, andra kortet. */
export const spotKey = (spot: CardSpot): string => `${spot.seat}/${spot.hand ?? 0}/${spot.index}`;

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
