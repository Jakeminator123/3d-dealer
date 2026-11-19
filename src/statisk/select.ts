// Vad som följer med det statiska Casinot (bygg.ts): klippen ur det REDO-ankare som rundan i content/runda.json väljer
// (hela given, som i Labbet), rummet och modellerna, ett
// utdrag ur registret med bara de fält uppspelningen läser, och beskrivningarna i content/ utan sina källtexter. Inga
// beställningar, inga omdömestexter, inga av Jakobs ord, inga sökvägar på datorn. Här läses inga filer.

import { DEALER, VIEW } from '../casino/link.ts';
import type { SceneDescription } from '../scene/description.ts';
import { anchorOf, clipsOf, dealsOf, madeWith, planRound, readyClip, type DealtRound, type Round, type RoundEntry } from '../scene/round.ts';

export class SelectError extends Error {}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Bara fälten med ett värde: ett fält som posten inte har följer inte med som tomt. */
const kept = <T extends Record<string, unknown>>(fields: T): Partial<T> => Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<T>;

/**
 * Ett cykelklipp så som uppspelningen läser det (src/scene/round.ts: planRound, readyClip, waitClip, anchorOf, madeWith):
 * vem och vad, omdömet, vyn, ställningen, kortet det lägger och när, tagningen och längden, ögat, skon och var kortet
 * landar, och ankaret som den enda raden ur beställningen (`source.references`, rollen startFrame).
 */
export function clipEntry(entry: RoundEntry): RoundEntry {
  const view = entry.view as { kind?: unknown; seat?: unknown } | undefined;
  const lands = entry.lands as { seat?: unknown; index?: unknown; at?: unknown } | undefined;
  const { eye, shoe, place } = madeWith(entry);
  const anchor = anchorOf(entry);
  return {
    file: entry.file,
    status: entry.status,
    ...kept({
      dealer: entry.dealer,
      use: entry.use,
      view: view ? kept({ kind: view.kind, seat: view.seat }) : undefined,
      pose: entry.pose,
      seat: entry.seat,
      index: entry.index,
      action: entry.action,
      take: entry.take,
      seconds: entry.seconds,
      lands: lands ? kept({ seat: lands.seat, index: lands.index, at: lands.at }) : undefined,
      eye: eye ? { position: eye.position, forward: eye.forward, focalPx: eye.focalPx, frame: { width: eye.frame.width, height: eye.frame.height } } : undefined,
      shoe: shoe ? { at: shoe.at, yawDeg: shoe.yawDeg, length: shoe.length } : undefined,
      place,
      source: anchor ? { references: [{ role: 'startFrame', what: anchor }] } : undefined,
    }),
  };
}

/** Rummet så som Casinot läser det (backgroundOf i round.ts): filen, om den är en 360-bild eller platt, och hur den visas. */
export function roomEntry(entry: RoundEntry): RoundEntry {
  const old = entry.oldView as Record<string, unknown> | undefined;
  return {
    file: entry.file,
    status: entry.status,
    ...kept({
      kind: entry.kind,
      oldView: old ? kept({ turn: isNumber(old.turn) ? old.turn : undefined, blur: isNumber(old.blur) ? old.blur : undefined, exposure: isNumber(old.exposure) ? old.exposure : undefined, mirror: typeof old.mirror === 'boolean' ? old.mirror : undefined }) : undefined,
    }),
  };
}

/** Det som följer med: ankaret, utdraget ur registret och filerna ur assets/. */
export type Chosen = { anchor: string; extract: RoundEntry[]; files: string[]; notes: string[] };

/**
 * Väljer det som följer med. Klippen är de som en runda ur hela givens REDO-ankare kan spela ur vyn Spelaren (clipsOf),
 * vilka kort spelkärnan än delar; rummet är rundans (content/runda.json film.background); modellerna är scenens bord och
 * sko. Med bara utdraget väljer uppspelningen samma klipp för hela given som med hela registret, annars är det ett fel.
 * `notes` säger det som är värt att veta men inte hindrar.
 */
export function choose(entries: RoundEntry[], round: Round, dealt: DealtRound, scene: SceneDescription): Chosen {
  const deals = dealsOf(dealt.steps);
  const plan = planRound(deals, entries, DEALER, VIEW, round);
  if (plan.anchor === null) throw new SelectError('Hela given har inget godkänt klipp ur Spelaren: Casinot har ingen dealer att visa');
  const clips = clipsOf(entries, DEALER, VIEW, plan.anchor, round.series);
  const room = entries.find((entry) => entry.file === round.film.background);
  if (!room || room.present === false) throw new SelectError(`Rummet ${round.film.background} (content/runda.json film.background) saknas i registret eller i assets/`);
  const extract = [...entries.filter((entry) => clips.includes(entry.file)).map(clipEntry), roomEntry(room)];

  const again = planRound(deals, extract, DEALER, VIEW, round);
  const files = (one: typeof plan) => one.clips.map((clip) => clip.file);
  if (JSON.stringify(files(again)) !== JSON.stringify(files(plan)) || again.anchor !== plan.anchor) {
    throw new SelectError('Med utdraget ur registret väljer hela given andra klipp än med hela registret');
  }
  const notes: string[] = [];
  const ready = readyClip(entries, DEALER, VIEW);
  const readyEntry = entries.find((entry) => entry.file === ready);
  if (readyEntry && anchorOf(readyEntry) !== plan.anchor) notes.push(`I studion står dealern i REDO ur ett annat ankare (${anchorOf(readyEntry)}) än hela givens; det statiska Casinot har bara hela givens.`);
  return { anchor: plan.anchor, extract, files: [...new Set([...clips, room.file, scene.table.file, scene.shoe.file])], notes };
}

// Det som står i stället för en källtext: läsarna i src/scene vill ha en text där, och den följer inte med.
export const NO_SOURCE = 'Utdrag: källan står i studion.';

/**
 * En beskrivning ur content/ utan sina texter: varje `source` och `about` blir NO_SOURCE. Talen, märkningen (`basis`)
 * och filernas namn står kvar, så att samma läsare (readScene, readDoll, readRound) läser den.
 */
export function withoutTexts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutTexts);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, (key === 'source' || key === 'about') && typeof item === 'string' ? NO_SOURCE : withoutTexts(item)]));
}

/**
 * Adresserna till andra filer i en GLB-modell: buffertar och bilder som inte ligger i filen själv. En modell som läser
 * andra filer följer inte med utan dem. Bara modellens JSON-del läses.
 */
export function glbReferences(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) throw new SelectError('Filen är ingen GLB-modell');
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) throw new SelectError('GLB-modellen börjar inte med sin JSON-del');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as { buffers?: { uri?: unknown }[]; images?: { uri?: unknown }[] };
  return [...(json.buffers ?? []), ...(json.images ?? [])].flatMap((item) => (typeof item.uri === 'string' && !item.uri.startsWith('data:') ? [item.uri] : []));
}
