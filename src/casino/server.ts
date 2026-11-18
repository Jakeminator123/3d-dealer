// Det Casinot hämtar och skickar över HTTP: spelsessionen i servern (/api/game, src/server/game.ts), registrets poster,
// beskrivningarna i content/ och filerna i assets/. Spelkärnan körs i servern; härifrån läses bara dess typer.

import type { Snapshot } from '../engine/session.ts';
import type { RoundEntry, RoundStep } from '../scene/round.ts';

/** Bordet så som servern lämnar det: sessionens läge, och rundans steg hittills (tomt när ingen runda pågår). */
export type Table = { state: Snapshot; steps: (RoundStep & { op: string })[] };

export const mediaUrl = (file: string): string => `/media/${file.split('/').map(encodeURIComponent).join('/')}`;

/** Svaret som JSON, eller ett fel med serverns skäl. */
async function answer<T>(response: Response, failure: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || body === null) throw new Error(body?.error ? `${failure}: ${body.error}` : `${failure} (${response.status})`);
  return body;
}

export const fetchTable = async (): Promise<Table> => answer(await fetch('/api/game'), 'Bordet gick inte att läsa');

/** Ett kommando till spelkärnan (start, act, insurance, collect), med ett eget requestId och versionen bordet står på. */
export async function sendCommand(table: Table, command: Record<string, unknown>): Promise<Table> {
  const body = { ...command, requestId: crypto.randomUUID(), expectedVersion: table.state.ver };
  return answer(await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), 'Spelkärnan sade nej');
}

/** En ny session: ny sko och ny kassa. */
export const newSession = async (): Promise<Table> =>
  answer(await fetch('/api/game/ny', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), 'En ny session gick inte att börja');

/** Registrets poster: dealerns klipp och rummet. */
export const fetchEntries = async (): Promise<RoundEntry[]> => (await answer<{ assets: RoundEntry[] }>(await fetch('/api/registry'), 'Registret gick inte att läsa')).assets;

/** En beskrivning ur content/, läst med `read`. */
export async function fetchContent<T>(file: string, read: (value: unknown) => T): Promise<T> {
  const response = await fetch(`/content/${file}`);
  if (!response.ok) throw new Error(`content/${file} gick inte att läsa (${response.status})`);
  return read(await response.json());
}
