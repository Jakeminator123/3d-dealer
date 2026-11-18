// Var studions server svarar: bara på den här datorn, på porten i PORT eller 5310. Läses av main.ts och background.ts,
// och har inga andra importer, så att `npm stop` fungerar även när serverns övriga kod inte går att läsa.

export const HOST = '127.0.0.1';
export const DEFAULT_PORT = 5310;

/** Porten ur `PORT`, eller 5310. Ett värde som inte är en port ger ett fel med skälet, inte en tyst annan port. */
export function studioPort(env: NodeJS.ProcessEnv = process.env): number {
  const given = env.PORT?.trim();
  if (!given) return DEFAULT_PORT;
  const port = Number(given);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT=${given} är ingen port: ange ett heltal 1–65535, eller låt bli för ${DEFAULT_PORT}.`);
  return port;
}
