// Namnen Labbet visar, på ett ställe: korten, ankarna, vyerna och cyklerna. I data räknas en plats kort från 0 (kort 0,
// 1, 2); i Labbet heter de C1, C2, C3, och ingenting som visas säger "kort 0". Ankarna har korta koder bredvid ordet:
//
//   A1     VILA: hon sitter och andas, båda händerna på filten
//   A2.n   REDO: handen vid kortet i skon; n är REDO-ställningen, och var och en har sin serie. I dag finns en
//          ställning, A2.1; en ny version av samma bild (spelaren-redo-3.png) är fortfarande A2.1
//   A3Pn   REDO med kortet lagt på plats n (1–7): det en tagning slutar på, dess sista bild
//   A3D    samma hos dealern
//
// Koderna byter inte namn på filer, poster eller fält; de räknas ur dem här. Förklaringen står under Orden i
// docs/architecture.md.

export type Seat = number | 'D';

/** Kortet på platsen, räknat från 1: C1 är det första. `index` är kortplatsens nummer i data, från 0. */
export const cardCode = (index: number | null | undefined): string => (typeof index === 'number' ? `C${index + 1}` : 'C?');

const ORDINAL = ['första', 'andra', 'tredje', 'fjärde', 'femte', 'sjätte'];

/** Kortets namn: P4 C1 är plats 4, första kortet; D C1 dealerns öppna kort; D hålkort, D vändning; Väntan. */
export function cardName(seat: Seat | null, index: number | null, action: string): string {
  if (action === 'wait') return 'Väntan';
  if (seat === 'D') return action === 'hole' ? 'D hålkort' : action === 'flip' ? 'D vändning' : `D ${cardCode(index)}`;
  return `P${seat ?? '?'} ${cardCode(index)}`;
}

/** Kortet i ord: "plats 4, första kortet", "dealerns öppna kort", "hålkortet vänds". */
export function cardWords(seat: Seat | null, index: number | null, action: string): string {
  if (action === 'wait') return 'väntan i REDO';
  const nth = index === null ? 'okänt' : (ORDINAL[index] ?? `${index + 1}:e`);
  if (seat === 'D') {
    if (action === 'hole') return 'dealerns andra kort, baksidan upp';
    if (action === 'flip') return 'hålkortet vänds';
    return index === 0 ? 'dealerns öppna kort' : `dealerns ${nth} kort`;
  }
  return `plats ${seat ?? '?'}, ${nth} kortet`;
}

/**
 * En text ur registret eller ur kommandona med korten som Labbet räknar dem: "plats 4, kort 0" blir "plats 4, C1".
 * Registrets titlar och tagning.ts utskrifter räknar från 0; texten i dem ändras inte, bara hur den visas här.
 */
export const shownText = (text: string): string => text.replace(/\bkort (\d+)\b/g, (_, index: string) => cardCode(Number(index)));

/**
 * Ankarets kod ur filnamnet: A1 för VILA, A2.1 för REDO. Siffran i ett filnamn (spelaren-redo-3.png) är bildens version,
 * inte en annan ställning: Jakobs A2.2 och A2.3 är andra REDO-ställningar med egna serier, och ingen sådan finns än. När
 * en görs står dess nummer i dealerns fil och läses här.
 */
export function anchorCode(file: string | null | undefined): string {
  if (!file) return 'A?';
  const name = file.split('/').at(-1) ?? file;
  return /vila/i.test(name) ? 'A1' : 'A2.1';
}

/** Ankarets kod och ord: "A2.1 · REDO", "A1 · VILA". */
export function anchorName(file: string | null | undefined): string {
  if (!file) return 'okänt ankare';
  const code = anchorCode(file);
  return `${code} · ${code === 'A1' ? 'VILA' : 'REDO'}`;
}

/** Bilden en tagning slutar på: REDO med kortet lagt, "A3P4 · C1" eller "A3D · C2". */
export const laidName = (seat: Seat | null, index: number | null): string => `A3${seat === 'D' ? 'D' : `P${seat ?? '?'}`} · ${cardCode(index)}`;

/**
 * Bilderna en tagning börjar och slutar på, med koderna: REDO-ankaret, och REDO med kortet lagt. En vändning börjar med
 * hålkortet lagt, och en väntan slutar som den börjar.
 */
export function framesOf(anchor: string | null | undefined, seat: Seat | null, index: number | null, action: string): { first: string; last: string } {
  const redo = anchorName(anchor);
  if (action === 'wait') return { first: redo, last: redo };
  return { first: action === 'flip' ? `${laidName(seat, index)}, baksidan upp` : redo, last: laidName(seat, index) };
}

/** Vyn ett klipp är gjort i, som ett ord: spelaren eller plats-N. */
export function viewWord(view: unknown): string {
  const seen = view as { kind?: unknown; seat?: unknown } | null | undefined;
  return seen?.kind === 'plats' && Number.isInteger(seen.seat) ? `plats-${seen.seat}` : 'spelaren';
}

/** Vyn som namn: Spelaren, Plats 7. */
export const viewLabel = (word: string): string => (word === 'spelaren' ? 'Spelaren' : `Plats ${word.split('-')[1]}`);

/** Cykelns kortnamn ur dess beskrivning i content/moves/ ("Variant E: …" är E), annars namnet. */
export function cycleLabel(move: string | null, about: string | undefined): string {
  const variant = about ? /^Variant (\S+?):/.exec(about)?.[1] : undefined;
  return variant ? `${variant} (${move})` : (move ?? 'okänd cykel');
}

/** Kortet i en adress till steget Dockan: plats-kort i data, med handlingen efter när den inte är deal: 4-0, d-1-hole. */
export const cardKey = (seat: Seat | null, index: number | null, action: string): string => `${seat === 'D' ? 'd' : (seat ?? 4)}-${index ?? 0}${action === 'deal' ? '' : `-${action}`}`;
