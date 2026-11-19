// En tagning förberedd ur Labbets steg Dockan: servern kör samma väg som `node src/pipeline/tagning.ts forbered …`
// (forbered i tagning.ts) med studions data, och Labbet följer arbetet tills paketet är gjort. Ingenting beställs här:
// beställningen lägger agenten genom Runways MCP-server, som production.md säger.
//
//   POST /api/forbered   { dealer, view, seat, index, action, cycle }: börjar förbereda. En i taget.
//   GET  /api/forbered   job: det som förbereds eller förbereddes senast, med raderna tagning.ts skriver och paketet.
//
// Arbetet lever i serverns minne. Startas servern om medan det pågår är det borta; paketet syns ändå i Labbet när det
// blev klart (/api/tagningar, waiting), och ett halvgjort paket utan bestallning.json listas inte.

import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { PrepareOptions, Prepared, Spec } from '../pipeline/tagning.ts';
import { MOVE_NAME, MoveError } from './rorelser.ts';

/** Vägen som gör paketet: forbered i src/pipeline/tagning.ts, eller i ett prov något som låtsas vara den. */
export type Preparer = (spec: Spec, options: Pick<PrepareOptions, 'root' | 'say'>) => Promise<Prepared>;

const usual: Preparer = async (spec, options) => (await import('../pipeline/tagning.ts')).forbered(spec, options);

export type Job = {
  id: number;
  spec: Spec;
  /** Samma tagning som kommando, för den som vill köra den i terminalen. */
  command: string;
  state: 'förbereds' | 'förberedd' | 'gick inte';
  started: string;
  ended: string | null;
  /** Raderna tagning.ts skriver medan den arbetar. */
  lines: string[];
  /** Paketet när det är gjort: namnet, mappen och beställningen som tagning.ts skrev den. */
  result: { id: string; dir: string; order: Record<string, unknown>; checks: unknown[] } | null;
  error: string | null;
};

// Raderna som sparas: de senaste, så att ett långt arbete inte fyller minnet.
const MOST_LINES = 400;
const DEALER = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VIEW = /^(spelaren|plats-[1-9]\d?)$/;

/** Tagningen ur det Labbet skickade, prövad till formen. Resten (ankare, kortplats, ruta) prövar tagning.ts. */
function specOf(root: string, body: unknown): Spec {
  const asked = (body ?? {}) as Record<string, unknown>;
  const dealer = typeof asked.dealer === 'string' ? asked.dealer : '';
  if (!DEALER.test(dealer)) throw new MoveError('Välj en dealer');
  const view = typeof asked.view === 'string' ? asked.view : '';
  if (!VIEW.test(view)) throw new MoveError('Vyn ska vara spelaren eller plats-N');
  const seat = asked.seat === 'D' ? 'D' : Number.isInteger(asked.seat) && (asked.seat as number) > 0 ? (asked.seat as number) : null;
  if (seat === null) throw new MoveError('Platsen ska vara 1–7 eller D för dealern');
  const index = Number.isInteger(asked.index) && (asked.index as number) >= 0 ? (asked.index as number) : null;
  if (index === null) throw new MoveError('Kortplatsen ska vara ett heltal från 0');
  const action = asked.action ?? 'deal';
  if (!['deal', 'hole', 'flip', 'wait'].includes(action as string)) throw new MoveError('Handlingen ska vara deal, hole, flip eller wait');
  const cycle = typeof asked.cycle === 'string' ? asked.cycle : '';
  if (!MOVE_NAME.test(cycle) || !existsSync(join(root, 'content', 'moves', `${cycle}.json`))) throw new MoveError(`Rörelsen ${cycle || '(inget namn)'} finns inte i content/moves/: spara den först`);
  return { dealer, view, seat, index, action: action as Spec['action'], cycle };
}

const commandOf = (spec: Spec): string =>
  `node src/pipeline/tagning.ts forbered ${spec.dealer} ${spec.view} ${spec.seat} ${spec.index} ${spec.action ?? 'deal'} --cykel ${spec.cycle}`;

/**
 * Förberedelsen för projektmappen `root`: en tagning i taget, med `prepare` (tagning.ts forbered om inget annat sägs).
 * `now` ger tiden som registret skriver den.
 */
export function createPreparing(root: string, now: () => string, prepare: Preparer = usual) {
  let job: Job | null = null;
  let next = 1;

  return {
    current: (): Job | null => job,
    /** Börjar förbereda tagningen i `body`. Svaret är arbetet som det står när det har börjat. */
    start(body: unknown): Job {
      if (job?.state === 'förbereds') throw new MoveError(`En tagning förbereds redan (${commandOf(job.spec)}): vänta tills den är klar`);
      const spec = specOf(root, body);
      const started: Job = { id: next++, spec, command: commandOf(spec), state: 'förbereds', started: now(), ended: null, lines: [], result: null, error: null };
      job = started;
      const say = (text: string): void => {
        console.log(`förbered ${started.id}: ${text}`);
        started.lines.push(...text.split('\n'));
        if (started.lines.length > MOST_LINES) started.lines.splice(0, started.lines.length - MOST_LINES);
      };
      prepare(spec, { root, say }).then(
        (made) => {
          started.result = { id: made.id, dir: relative(root, made.dir).replaceAll('\\', '/'), order: made.order, checks: made.checks };
          started.state = 'förberedd';
          started.ended = now();
        },
        (error: unknown) => {
          started.error = error instanceof Error ? error.message : String(error);
          started.state = 'gick inte';
          started.ended = now();
        },
      );
      return started;
    },
  };
}
