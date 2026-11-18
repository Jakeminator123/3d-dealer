// Studions sida av Casinots gränssnitt (link.ts), över HTTP: spelsessionen i servern (/api/game, src/game/game.ts),
// registrets poster (/api/registry), beskrivningarna i content/ och filerna i assets/ (/media/). Spelkärnan körs i
// servern; härifrån läses bara dess typer.

import type { RoundEntry } from '../scene/round.ts';
import type { Files, GameLink, Table } from './link.ts';

export const mediaUrl = (file: string): string => `/media/${file.split('/').map(encodeURIComponent).join('/')}`;

/** Svaret som JSON, eller ett fel med serverns skäl. */
async function answer<T>(response: Response, failure: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || body === null) throw new Error(body?.error ? `${failure}: ${body.error}` : `${failure} (${response.status})`);
  return body;
}

const post = (path: string, body: unknown): Promise<Response> =>
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Spelsessionen i servern. */
export const serverGame: GameLink = {
  where: 'i servern',
  lasts: 'Sessionen börjar om när servern startar om.',
  table: async (): Promise<Table> => answer(await fetch('/api/game'), 'Bordet gick inte att läsa'),
  command: async (body): Promise<Table> => answer(await post('/api/game', body), 'Spelkärnan sade nej'),
  reset: async (): Promise<Table> => answer(await post('/api/game/ny', {}), 'En ny session gick inte att börja'),
};

/** Registrets poster, content/ och assets/ genom servern. */
export const serverFiles: Files = {
  async content<T>(file: string, read: (value: unknown) => T): Promise<T> {
    const response = await fetch(`/content/${file}`);
    if (!response.ok) throw new Error(`content/${file} gick inte att läsa (${response.status})`);
    return read(await response.json());
  },
  entries: async (): Promise<RoundEntry[]> => (await answer<{ assets: RoundEntry[] }>(await fetch('/api/registry'), 'Registret gick inte att läsa')).assets,
  url: mediaUrl,
};
