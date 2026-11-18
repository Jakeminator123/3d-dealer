// Gränssnittet Casinot talar med spelet och filerna genom. I studion är det servern (server.ts: /api/game, /api/registry,
// /content/ och /media/); i visningen är det spelkärnan i webbläsaren och visningens egna filer (src/visning/spel.ts).
// Casinot är detsamma i båda: bara det som står bakom gränssnittet skiljer.

import type { Table } from '../game/game.ts';
import type { Background, SeatView } from '../scene/build.ts';
import { readScene, type SceneDescription } from '../scene/description.ts';
import { readDoll, type DollDescription } from '../scene/dollPose.ts';
import { backgroundOf, readRound, type Round, type RoundEntry } from '../scene/round.ts';

export type { Table } from '../game/game.ts';

// Första dealern. Tills dealerns egen fil finns i content/ står hennes id här, som i Labbet.
export const DEALER = 'paulina';
// Vyn man spelar i.
export const VIEW: SeatView = { kind: 'spelaren' };

/** Spelsessionen: spelkärnan i servern eller i webbläsaren. Ett nej från kärnan kastas som ett fel med dess skäl. */
export type GameLink = {
  /** Var kärnan körs, som ord efter "Spelkärnan": `i servern`, `i webbläsaren`. */
  where: string;
  /** Hur länge sessionen lever, som en mening. */
  lasts: string;
  /** Bordet: sessionens läge och rundans steg hittills. */
  table(): Promise<Table>;
  /** Ett kommando till kärnan (start, act, insurance, collect), med requestId och versionen bordet står på. */
  command(body: Record<string, unknown>): Promise<Table>;
  /** En ny session: ny sko och ny kassa. */
  reset(): Promise<Table>;
};

/** Filerna: beskrivningarna ur content/, registrets poster, och adressen till en fil ur registret. */
export type Files = {
  content<T>(file: string, read: (value: unknown) => T): Promise<T>;
  entries(): Promise<RoundEntry[]>;
  url(file: string): string;
};

/** Ett kommando som ord för kärnan: med ett eget requestId, och versionen bordet står på. */
export function commandFor(table: Table, command: Record<string, unknown>): Record<string, unknown> {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return { ...command, requestId: id, expectedVersion: table.state.ver };
}

/** Det Casinot läser en gång: scenen, dockans mått, rundans fallback och rum, registrets poster och rummet som bakgrund. */
export type Content = { scene: SceneDescription; doll: DollDescription; round: Round; entries: RoundEntry[]; background: Background | null };

export async function loadContent(files: Files): Promise<Content> {
  const [scene, doll, round, entries] = await Promise.all([files.content('scene.json', readScene), files.content('doll.json', readDoll), files.content('runda.json', readRound), files.entries()]);
  const room = entries.find((entry) => entry.file === round.film.background);
  const background = room && room.present !== false ? { ...backgroundOf(room, scene), url: files.url(room.file) } : null;
  return { scene, doll, round, entries, background };
}
