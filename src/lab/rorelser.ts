// Dockans rörelser och tagningen som förbereds, så som steget Dockan når dem över HTTP (src/server/rorelser.ts och
// forbered.ts). Labbet läser inte servern, så formen står här.

export type MoveInfo = {
  name: string;
  kind: 'cykel' | 'giv';
  about: string;
  seconds: number | null;
  give: string | null;
  basis: string | null;
  source: string | null;
  madeInLab: boolean;
  clips: number;
  left: number;
  packages: string[];
  usedBy: string[];
  /** Varför rörelsen inte får skrivas över, eller null. */
  locked: string | null;
};

export type Check = { key: string; what: string; value: unknown; unit: string; limit: string; verdict: string };
export type Measured = { checks: Check[]; values: Record<string, { value: number | null; what: string }> };
export type Saved = { name: string; file: string; overwrote: boolean; changes: string[] };
export type Card = { seat: number | 'D'; index: number; action: 'deal' | 'hole' | 'flip' | 'wait' };

export type Job = {
  id: number;
  spec: { dealer: string; view: string; seat: number | 'D'; index: number; action?: string; cycle?: string };
  command: string;
  state: 'förbereds' | 'förberedd' | 'gick inte';
  started: string;
  ended: string | null;
  lines: string[];
  result: { id: string; dir: string; order: Record<string, any>; checks: Check[] } | null;
  error: string | null;
};

/** Svaret ur en väg, eller ett fel med serverns skäl. */
async function answer<T>(response: Response, failure: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error ?? `${failure} (${response.status})`);
  return body;
}

const send = (path: string, body: unknown): Promise<Response> =>
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const fetchMoves = async (): Promise<MoveInfo[]> => (await answer<{ moves: MoveInfo[] }>(await fetch('/api/rorelser', { cache: 'no-store' }), 'Rörelserna gick inte att läsa')).moves;

/** Sparar cykeln som en ny rörelse, ändrad ur `from`. Svaret är det sparade och rörelserna som de står efteråt. */
export const saveMove = async (name: string, from: string, cycle: unknown, note: string): Promise<{ saved: Saved; moves: MoveInfo[] }> =>
  answer(await send('/api/rorelser', { name, from, cycle, note }), 'Rörelsen sparades inte');

export const measureMove = async (cycle: unknown, card: Card): Promise<Measured> => answer(await send('/api/rorelser/matt', { cycle, ...card }), 'Måtten gick inte att räkna');

export const fetchJob = async (): Promise<Job | null> => (await answer<{ job: Job | null }>(await fetch('/api/forbered', { cache: 'no-store' }), 'Förberedelsen gick inte att läsa')).job;

export const prepareTake = async (spec: Job['spec']): Promise<Job> => (await answer<{ job: Job }>(await send('/api/forbered', spec), 'Tagningen förbereddes inte')).job;
