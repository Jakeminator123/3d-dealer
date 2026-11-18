// Spelsessionen i servern: rundan som spelkärnan delar efter content/runda.json (samma frö ger samma runda, och varje
// kort i kärnans händelser blir ett klipp eller en fallback med kärnans valör), och vägarna /api/game och /api/runda.
// Filnamnen är påhittade: ett riktigt registernamn i ett test pekar på posten och hindrar npm run reg -- ta-bort.

import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { dealName, dealsOf, planRound, readRound, type RoundEntry } from '../pipeline/runda.ts';
import { createApi } from './api.ts';
import { createGame, dealRound, type Table } from '../game/game.ts';
import { handler } from './main.ts';

const project = resolve(import.meta.dirname, '..', '..');
const round = readRound(JSON.parse(readFileSync(join(project, 'content', 'runda.json'), 'utf8')));
const deal = { seed: 'prov-runda', bets: [{ seat: 2, main: 10 }, { seat: 4, main: 10 }, { seat: 6, main: 10 }], hitBelow: 15 };

// Cykelklipp till varje plats, kort 0 och 1, ur Spelaren: som de 14 i registret, utan action.
const ENTRIES: RoundEntry[] = [1, 2, 3, 4, 5, 6, 7].flatMap((seat) =>
  [0, 1].map((index) => ({
    file: `dealers/paulina/clips/prov-${seat}-${index}.mp4`,
    status: 'godkänd',
    dealer: 'paulina',
    use: 'dealerfilm',
    pose: 'redo → redo',
    view: { kind: 'spelaren' },
    seat,
    index,
    lands: { seat, index, at: 1.88 },
    seconds: 4.04,
  })),
);

test('samma frö ger samma runda, och ett annat frö en annan', () => {
  const first = dealRound(deal);
  assert.deepEqual(dealRound(deal), first);
  assert.notDeepEqual(dealRound({ ...deal, seed: 'prov-runda-2' }).steps, first.steps);
  assert.equal(first.steps[0]!.op, 'start');
  assert.equal(first.steps.at(-1)!.view.round!.phase, 'settled');
  assert.ok(first.result.settle, 'rundan avgjordes');
  // Pengarna är kärnans: kassan efter är kassan före med varje hands utfall.
  const settle = first.result.settle!;
  assert.equal(first.result.after, first.result.before + settle.hands.reduce((sum, hand) => sum + hand.returned - hand.stake, 0));
});

test('varje kort i spelkärnans händelser blir ett klipp eller en fallback, med kärnans valör, och hålkortet nedvänt tills det vänds', () => {
  for (const seed of ['prov-runda', 'prov-a', 'prov-b', 'prov-c', round.deal.seed]) {
    const dealt = dealRound({ ...deal, seed });
    const events = dealt.steps.flatMap((step) => step.events);
    const plan = planRound(dealsOf(dealt.steps), ENTRIES, 'paulina', { kind: 'spelaren' }, round.fallback);
    // Kärnans kort, i spelordning: varje utdelning och vändningen.
    const cards = events.flatMap((event) =>
      event.type === 'deal' ? [{ seat: event.to === 'dealer' ? 'D' : event.seat, index: event.cardIndex, face: event.card ? `${event.card.r}${event.card.s}` : null }] : event.type === 'reveal' ? [{ seat: 'D', index: event.cardIndex, face: `${event.card.r}${event.card.s}` }] : [],
    );
    // Allt utom en flyttning när en hand delas (den lägger inget nytt kort).
    const laid = plan.clips.filter((part) => part.file !== null || part.from === 'skon' || (part.from.seat === part.card.seat && part.from.index === part.card.index));
    assert.deepEqual(laid.map((part) => ({ seat: part.card!.seat, index: part.card!.index, face: part.card!.face })), cards, seed);
    // Hålkortet läggs nedvänt och vänds på samma kortplats.
    const hole = plan.dealt.findIndex((one) => one.action === 'hole');
    const flip = plan.dealt.findIndex((one) => one.action === 'flip');
    assert.ok(hole >= 0 && flip > hole, seed);
    assert.deepEqual([plan.dealt[hole]!.seat, plan.dealt[hole]!.index, plan.dealt[hole]!.face], ['D', 1, null]);
    assert.deepEqual([plan.dealt[flip]!.seat, plan.dealt[flip]!.index], ['D', 1]);
    // Med klipp bara till platsernas två första kort: dealerns kort och platsernas tredje går självt, och sägs.
    for (const one of plan.dealt) {
      const filmed = one.seat !== 'D' && one.hand === 0 && one.index <= 1 && one.action === 'deal';
      assert.equal(one.file !== null, filmed, `${seed}: ${dealName(one)}`);
    }
    assert.deepEqual(plan.missing.map(dealName), plan.dealt.filter((one) => one.file === null && one.action !== 'move').map(dealName));
  }
});

let root: string;
let server: Server;
let base: string;

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'spel-'));
  mkdirSync(join(root, 'content'));
  copyFileSync(join(project, 'content', 'runda.json'), join(root, 'content', 'runda.json'));
  server = createServer(handler(createApi(root, () => '2026-11-18 15:00', { seed: 'prov-casino' }), (_request, response) => void response.writeHead(418).end()));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

const post = async (path: string, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) => {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json().catch(() => null)) as Table & { error?: string; code?: string } };
};

test('Casinots runda genom /api/game: kommandona går till kärnan, stegen sparas, och kärnans nej kommer med sin kod', async () => {
  const empty = (await (await fetch(`${base}/api/game`)).json()) as Table;
  assert.deepEqual([empty.state.ver, empty.state.balance, empty.state.view.round, empty.steps], [0, 1000, null, []]);
  assert.equal(empty.state.view.shoe!.source, 'seeded');

  const started = await post('/api/game', { op: 'start', bets: [{ seat: 4, main: 10 }], requestId: 'c1', expectedVersion: 0 });
  assert.equal(started.status, 200);
  assert.equal(started.body.state.balance, 990, 'insatsen lämnar kassan när kortet delas');
  assert.equal(started.body.steps.length, 1);
  // Före vändningen finns hålkortet inte i något svar: dealern har ett kort i vyn, och händelsen saknar valör.
  const round = started.body.state.view.round!;
  assert.equal(round.dealer.length, 1);
  const hole = started.body.state.events.find((event) => event.type === 'deal' && event.faceDown);
  assert.ok(hole && hole.type === 'deal' && hole.card === null);
  const read = (await (await fetch(`${base}/api/game`)).json()) as Table;
  assert.deepEqual(read.steps, started.body.steps, 'en omladdning läser rundans steg');
  assert.ok(!JSON.stringify(read).includes(`"shoeDraw":${round.holeDraw},"r"`));

  // Samma kommando en gång till ger samma svar och läggs inte till; en gammal version är kärnans nej.
  const again = await post('/api/game', { op: 'start', bets: [{ seat: 4, main: 10 }], requestId: 'c1', expectedVersion: 0 });
  assert.deepEqual([again.status, again.body.steps.length], [200, 1]);
  const stale = await post('/api/game', { op: 'start', bets: [{ seat: 4, main: 10 }], requestId: 'c2', expectedVersion: 0 });
  assert.deepEqual([stale.status, stale.body.code], [409, 'STALE_VERSION']);
  const foreign = await post('/api/game', { op: 'collect', requestId: 'c3', expectedVersion: 1 }, { 'Content-Type': 'application/json', Origin: 'https://ond.example' });
  assert.equal(foreign.status, 403);

  // Spela klart: försäkring nej om den erbjuds, sedan Stand tills rundan är avgjord, och samla in.
  let table = started.body;
  let n = 3;
  while (table.state.view.round && table.state.view.round.phase !== 'settled') {
    const view = table.state.view;
    const command =
      view.round!.phase === 'insurance'
        ? { op: 'insurance', roundId: view.roundId, take: false }
        : { op: 'act', action: 'stand', seat: view.round!.activeSeat, handIndex: view.round!.active, roundId: view.roundId, turnSeq: view.turnSeq };
    const answer = await post('/api/game', { ...command, requestId: `c${++n}`, expectedVersion: table.state.ver });
    assert.equal(answer.status, 200, answer.body.error);
    table = answer.body;
  }
  assert.ok(table.steps.length >= 2);
  assert.ok(table.steps.flatMap((step) => step.events).some((event) => event.type === 'settle'));
  const paid = await post('/api/game', { op: 'collect', roundId: table.state.view.roundId, requestId: `c${++n}`, expectedVersion: table.state.ver });
  assert.deepEqual([paid.status, paid.body.state.view.round, paid.body.steps], [200, null, []]);

  // En ny session: ny kassa och ingen runda.
  const fresh = await post('/api/game/ny', { seed: 'prov-ny' });
  assert.deepEqual([fresh.status, fresh.body.state.ver, fresh.body.state.balance, fresh.body.steps], [200, 0, 1000, []]);
  assert.equal((await post('/api/game/ny', { seed: 'x'.repeat(201) })).status, 400);
});

test('/api/runda delar rundan ur content/runda.json, eller med ett annat frö', async () => {
  const standard = await (await fetch(`${base}/api/runda`)).json();
  assert.equal(standard.seed, round.deal.seed);
  assert.deepEqual(standard, JSON.parse(JSON.stringify(dealRound(round.deal))));
  const other = await (await fetch(`${base}/api/runda?fro=prov-annat`)).json();
  assert.equal(other.seed, 'prov-annat');
  assert.deepEqual(other.bets, round.deal.bets);
  assert.equal((await fetch(`${base}/api/runda?fro=${'x'.repeat(201)}`)).status, 400);
});

test('en session utan frö blandar skon säkert', () => {
  assert.equal(createGame().table().state.view.shoe!.source, 'secure');
});
