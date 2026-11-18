// Det statiska byggets sida av Casinots gränssnitt (src/casino/link.ts): spelkärnan i webbläsaren (src/game/game.ts,
// samma session som studions server kör) och filerna bredvid sidan, utan server. Adresserna är relativa, så att mappen
// går att lägga var som helst på en statisk webbvärd.
//
//   content/<fil>.json   scenen, dockans mått och rundan, utan källtexterna (bygg.ts)
//   register.json        utdraget ur registret: bara de fält uppspelningen läser
//   media/<fil>          klippen, rummet och modellerna, med samma sökväg som under assets/

import { createGame, type Table } from '../game/game.ts';
import type { Files, GameLink } from '../casino/link.ts';
import type { RoundEntry } from '../scene/round.ts';

/** Bordet som det skulle ha kommit över HTTP: en egen kopia, utan något som bara finns i kärnans minne. */
const wire = (table: Table): Table => JSON.parse(JSON.stringify(table)) as Table;

/** Spelsessionen i webbläsaren: en ny sko, blandad säkert, och ny kassa när sidan laddas. */
export function browserGame(): GameLink {
  const game = createGame();
  const run = async (step: () => Table, failure: string): Promise<Table> => {
    try {
      return wire(step());
    } catch (error) {
      throw new Error(`${failure}: ${(error as Error).message}`);
    }
  };
  return {
    where: 'i webbläsaren',
    lasts: 'Sessionen börjar om när sidan laddas om.',
    table: () => run(() => game.table(), 'Bordet gick inte att läsa'),
    command: (body) => run(() => game.command(body), 'Spelkärnan sade nej'),
    reset: () => run(() => game.reset(), 'En ny session gick inte att börja'),
  };
}

async function json<T>(path: string, what: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${what} gick inte att läsa (${response.status})`);
  return (await response.json()) as T;
}

/** Filerna bredvid sidan. */
export const staticFiles: Files = {
  content: async <T>(file: string, read: (value: unknown) => T): Promise<T> => read(await json(`content/${file}`, `content/${file}`)),
  entries: async (): Promise<RoundEntry[]> => (await json<{ assets: RoundEntry[] }>('register.json', 'Registrets utdrag')).assets,
  url: (file: string): string => `media/${file.split('/').map(encodeURIComponent).join('/')}`,
};
