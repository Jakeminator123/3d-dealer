// Tagningarna så som Labbet ser dem: hämtade från servern (/api/tagningar, src/server/tagningar.ts), med namnen som
// stegen Dealer och Klipp visar och läget för varje kort i kartan. Labbet läser inte servern, så formen står här.

import { cardName, cardWords, viewWord, type Seat } from './names.ts';
import { mediaUrl } from './registry.ts';

export type { Seat };
export type Judged = { key: string; what: string; value: unknown; unit: string; limit: string; verdict: string };
export type TakeFile = 'referens.mp4' | 'ark.jpg' | 'bevis.mp4' | 'klippet.mp4' | 'forsta.png' | 'sista.png' | 'ark-docka.jpg' | 'referensklipp.mp4';
/** Filmen som skickades med första och sista bilden: dockans film, ett godkänt klipp i dess ställe, eller ingen (sentOf i src/server/tagningar.ts). */
export type Sent = { kind: 'docka' | 'klipp' | 'ingen'; role: 'referenceVideos' | 'referenceVideo' | null; asset: string | null; frames: number | null; fps: number | null; seconds: number | null };

export type Take = {
  id: string;
  file: string;
  title: string;
  dealer: string | null;
  view: unknown;
  seat: Seat | null;
  index: number | null;
  action: string;
  take: number | null;
  move: string | null;
  variant: string | null;
  anchor: string | null;
  status: string;
  statusBy: string | null;
  statusAt: string | null;
  comment: string | null;
  reply: string | null;
  present: boolean;
  archived: { at: string | null; why: string } | null;
  files: TakeFile[];
  bytes: number | null;
  film: { width?: number; height?: number; fps?: number; frames?: number; seconds?: number; codec?: string; audio?: boolean } | null;
  soundInDownload: boolean | null;
  times: { clip: Record<string, number | null>; doll: Record<string, number | null> } | null;
  judged: { inside: number; total: number; shown: Judged[] } | null;
  /** Dockans film i paketet, skickad eller inte. */
  reference: { frames: number | null; fps: number | null; seconds: number | null } | null;
  sent: Sent;
  request: { model: string | null; resolution: string | null; duration: number | null; ratio: string | null; made: string | null };
  order: { at: string | null; model: string; credits: number | null; basis: string; seconds: number | null; received: boolean } | null;
  eye: unknown;
  shoe: unknown;
  place: unknown;
  lands: unknown;
};
export type Waiting = { id: string; dealer: string | null; view: string | null; seat: Seat | null; index: number | null; action: string; take: number | null; move: string | null; anchor: string | null; clip: string | null; made: string | null; sent: Sent['kind'] };
export type Takes = { takes: Take[]; waiting: Waiting[] };

export async function fetchTakes(): Promise<Takes> {
  const response = await fetch('/api/tagningar', { cache: 'no-store' });
  const body = (await response.json().catch(() => null)) as (Takes & { error?: string }) | null;
  if (!response.ok || !body?.takes) throw new Error(body?.error ? `Tagningarna gick inte att läsa: ${body.error}` : `Tagningarna gick inte att läsa (${response.status})`);
  return body;
}

export const takeUrl = (id: string, name: TakeFile): string => `/tagning/${encodeURIComponent(id)}/${name}`;
/** Klippet: ur assets/ när det står där, annars det arkiverade ur paketets väg. Null när inget av dem finns. */
export const clipUrl = (take: Take): string | null => (take.present ? mediaUrl(take.file) : take.files.includes('klippet.mp4') ? takeUrl(take.id, 'klippet.mp4') : null);

const SEAT_ORDER = (seat: Seat | null): number => (seat === 'D' ? 8 : (seat ?? 9));
/** Dealerns kort i kartans ordning: öppet kort, hålkort, vändning, extrakorten, väntan sist. */
export const dealerOrder = (index: number | null, action: string): number => (action === 'wait' ? 99 : action === 'hole' ? 1 : action === 'flip' ? 2 : (index ?? 0) === 0 ? 0 : 2 + (index ?? 0));
const cardOrder = (a: { seat: Seat | null; index: number | null; action: string }, b: { seat: Seat | null; index: number | null; action: string }): number =>
  SEAT_ORDER(a.seat) - SEAT_ORDER(b.seat) || (a.seat === 'D' ? dealerOrder(a.index, a.action) - dealerOrder(b.index, b.action) : (a.index ?? 0) - (b.index ?? 0));

export type TakeGroup = { key: string; view: string; anchor: string | null; move: string | null; current: boolean; takes: Take[] };

/**
 * Tagningarna i grupper efter vy, ankare och cykel: Spelaren först, i varje vy först klippen ur ett ankare som en
 * dealers fil pekar ut för vyn i dag (`current`, ankarnas registernamn), sedan de med flest tagningar. I en grupp efter
 * plats, kort och tagning.
 */
export function groupTakes(takes: Take[], current: Set<string>): TakeGroup[] {
  const groups = new Map<string, TakeGroup>();
  for (const take of takes) {
    const view = viewWord(take.view);
    const key = `${view}|${take.anchor ?? ''}|${take.move ?? ''}`;
    const group = groups.get(key) ?? { key, view, anchor: take.anchor, move: take.move, current: take.anchor !== null && current.has(take.anchor), takes: [] };
    group.takes.push(take);
    groups.set(key, group);
  }
  for (const group of groups.values()) group.takes.sort((a, b) => cardOrder(a, b) || (a.take ?? 0) - (b.take ?? 0));
  return [...groups.values()].sort(
    (a, b) =>
      Number(a.view !== 'spelaren') - Number(b.view !== 'spelaren') ||
      a.view.localeCompare(b.view) ||
      Number(b.current) - Number(a.current) ||
      b.takes.length - a.takes.length ||
      String(a.move).localeCompare(String(b.move)),
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Kartan: läget för ett kort i serien

export type NodeState = 'godkänd' | 'att granska' | 'underkänd' | 'paket väntar' | 'saknas';
export const NODE_STATES: NodeState[] = ['godkänd', 'att granska', 'underkänd', 'paket väntar', 'saknas'];

/** Ett kort i serien så som /api/dealers ger det (CardState i src/pipeline/dealer.ts). */
export type SeriesCard = { seat: Seat; index: number; action: string; first: boolean; label: string; clip: { file: string; status: string; take: number | null } | null; others: number };
export type MapNode = { name: string; words: string; state: NodeState; take: number | null; open: string | null; note: string | null };

const sameCard = (one: { seat: Seat | null; index: number | null; action: string }, card: SeriesCard): boolean => one.seat === card.seat && one.index === card.index && one.action === card.action;

/**
 * Läget för kortet `card` ur vyn `view` och ankaret `anchor`: klippet dealer.ts valde (godkänd eller att granska), annars
 * en underkänd tagning ur samma ankare (arkiverad eller inte), annars ett paket som väntar på beställning, annars saknas.
 * `open` är tagningen (paketets namn) som steget Klipp öppnar.
 */
export function nodeOf(view: string, anchor: string | null, card: SeriesCard, takes: Take[], waiting: Waiting[]): MapNode {
  const base = { name: cardName(card.seat, card.index, card.action), words: cardWords(card.seat, card.index, card.action) };
  const ours = (one: { anchor: string | null }) => anchor === null || one.anchor === anchor;
  const rejected = takes.filter((take) => take.status === 'utgår' && viewWord(take.view) === view && sameCard(take, card) && ours(take)).sort((a, b) => (b.take ?? 0) - (a.take ?? 0));
  const queued = waiting.filter((one) => (one.view ?? 'spelaren') === view && sameCard(one, card) && ours(one));
  const queuedWords = queued.length > 0 ? `${queued.map((one) => `t${one.take ?? '?'}`).join(', ')} väntar på beställning` : null;
  if (card.clip) {
    const approved = card.clip.status === 'godkänd';
    const notes = [card.clip.status === 'granska igen' ? 'Jakob vill ha den sedd igen' : null, !approved && rejected.length > 0 ? `${rejected.map((one) => `t${one.take ?? '?'}`).join(', ')} underkänd` : null].filter(Boolean);
    return { ...base, state: approved ? 'godkänd' : 'att granska', take: card.clip.take, open: takes.find((take) => take.file === card.clip!.file)?.id ?? null, note: notes.length ? notes.join('; ') : null };
  }
  if (rejected.length > 0) {
    const last = rejected[0]!;
    return { ...base, state: 'underkänd', take: last.take, open: last.id, note: queuedWords ? `tas om: ${queuedWords}` : last.archived ? 'arkiverad, tas om' : 'inte arkiverad än' };
  }
  if (queued.length > 0) return { ...base, state: 'paket väntar', take: queued[0]!.take, open: null, note: queuedWords };
  return { ...base, state: 'saknas', take: null, open: null, note: null };
}

/** Vad som skickades som film med första och sista bilden, i ord. */
export function sentWords(sent: Sent): string {
  const clip = sent.asset ? `klippet ${sent.asset.split('/').at(-1)}` : 'ett godkänt klipp';
  if (sent.kind === 'ingen') return 'ingen film: bara första och sista bilden och texten';
  if (sent.kind === 'docka') return 'dockans film, som rörelsereferens';
  return sent.role === 'referenceVideo' ? `${clip}, som filmen som görs om (video till video), i stället för dockans film` : `${clip}, som rörelsereferens i stället för dockans film`;
}
