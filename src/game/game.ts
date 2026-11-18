// Spelsessionen: spelkärnan (src/engine) som en session, med rundans steg så som kärnan svarade på dem. Kärnan avgör
// kort och pengar; här hålls bara sessionen och stegen, så att Casinot kan spela upp rundan och läsa om den.
//
// Samma session körs på två ställen: i studions server (src/server/api.ts, /api/game och /api/runda), som sidorna når
// över HTTP, och i webbläsaren i visningen (src/visning), där sidan inte har någon server. Casinot talar med båda genom
// samma gränssnitt (src/casino/link.ts).
//
// Här delas också rundan som Labbet, visningen och src/pipeline/runda.ts visar (dealRound): en session med frö, där
// spelarna i content/runda.json spelar efter en enkel regel. Regeln är spelarens val, inte kärnans: kärnan avgör allt annat.
//
// Sessionen lever så länge processen eller sidan lever. Servern startar om sig själv när dess kod ändras, och då börjar
// sessionen om med en ny sko och ny kassa; i visningen börjar den om när sidan laddas om.

import { createSession, type Session, type Snapshot } from '../engine/session.ts';
import type { DealtRound, Round, RoundStep } from '../scene/round.ts';

/** Ett steg som spelkärnan svarade på: kommandot (och handlingen), händelserna i spelordning och vyn efter steget. */
export type GameStep = RoundStep & { op: string };

/** Bordet så som Casinot ser det: sessionens läge, och rundans steg hittills (tomt när ingen runda pågår). */
export type Table = { state: Snapshot; steps: GameStep[] };

/** Fröet till skon, när sessionen ska gå att göra om. Utan frö blandas skon säkert (kärnans `secure`). */
export type GameOptions = { seed?: string };

const stepOf = (input: Record<string, unknown>, snapshot: Snapshot): GameStep => ({
  op: String(input.op),
  ...(typeof input.action === 'string' ? { action: input.action } : {}),
  events: snapshot.events,
  view: snapshot.view,
});

/** Spelsessionen för Casinot: en spelare, en session åt gången. */
export function createGame(options: GameOptions = {}) {
  let session: Session = open(options);
  let steps: GameStep[] = [];

  function open({ seed }: GameOptions): Session {
    return createSession(seed ? { shoe: { mode: 'seeded', seed } } : {});
  }

  return {
    /** Läget och rundans steg. */
    table(): Table {
      return { state: session.state(), steps };
    },
    /**
     * Ett kommando till kärnan (session.ts: start, act, insurance, collect). Ett fel kastas som kärnans SessionError
     * och ändrar ingenting. Ett kommando som kommer en gång till (samma requestId) får samma svar och läggs inte till.
     */
    command(input: unknown): Table {
      const before = session.state().ver;
      const snapshot = session.command(input);
      const body = input as Record<string, unknown>;
      if (snapshot.ver > before) {
        if (body.op === 'start') steps = [stepOf(body, snapshot)];
        else if (body.op === 'collect') steps = [];
        else steps = [...steps, stepOf(body, snapshot)];
      }
      return { state: snapshot, steps };
    },
    /** En ny session: ny sko, ny kassa, ingen runda. */
    reset(next: GameOptions = {}): Table {
      session = open(next);
      steps = [];
      return { state: session.state(), steps };
    },
  };
}

export type Game = ReturnType<typeof createGame>;

// Fler steg än så här i en runda betyder att något har gått fel: sju händer med Hit till 21 ryms med god marginal.
const MOST_STEPS = 200;

/**
 * Delar en runda med spelkärnan: en session med skon blandad ur `deal.seed`, insatserna i `deal.bets`, och spelare som
 * tar Hit så länge handen är under `deal.hitBelow`, annars Stand, och aldrig försäkring. Samma frö ger samma runda.
 */
export function dealRound(deal: Round['deal']): DealtRound {
  const session = createSession({ shoe: { mode: 'seeded', seed: deal.seed } });
  const before = session.state().balance;
  const steps: GameStep[] = [];
  let count = 0;
  const send = (command: Record<string, unknown>): Snapshot => {
    const snapshot = session.command({ ...command, requestId: `runda-${++count}`, expectedVersion: session.state().ver });
    steps.push(stepOf(command, snapshot));
    return snapshot;
  };
  let snapshot = send({ op: 'start', bets: deal.bets });
  while (snapshot.view.round && snapshot.view.round.phase !== 'settled') {
    if (steps.length > MOST_STEPS) throw new Error(`Rundan blev inte klar på ${MOST_STEPS} steg`);
    const { round, roundId, turnSeq } = snapshot.view;
    if (round.phase === 'insurance') {
      snapshot = send({ op: 'insurance', roundId, take: false });
    } else if (round.phase === 'decisions') {
      const hand = round.hands[round.active]!;
      const action = hand.total < deal.hitBelow && round.legalActions.includes('hit') ? 'hit' : 'stand';
      snapshot = send({ op: 'act', action, seat: round.activeSeat, handIndex: round.active, roundId, turnSeq });
    } else {
      throw new Error(`Rundan står i ${round.phase} och väntar inte på någon spelare`);
    }
  }
  const settle = steps.flatMap((step) => step.events).find((event) => event.type === 'settle') ?? null;
  const paid = session.command({ op: 'collect', roundId: snapshot.view.roundId, requestId: `runda-${++count}`, expectedVersion: session.state().ver });
  return {
    seed: deal.seed,
    bets: deal.bets,
    hitBelow: deal.hitBelow,
    steps,
    result: { before, after: paid.balance, settle: (settle as DealtRound['result']['settle']) ?? null },
  };
}
