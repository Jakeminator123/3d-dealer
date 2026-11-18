// Spelkärnan i webbläsaren: med det statiska byggets node:crypto och Buffer (nodecrypto.ts) ger kärnan samma händelser som i
// servern för samma frö, och byggets sida av Casinots gränssnitt svarar som serverns.
//
// Samma rundor och sessioner spelas i två egna processer: en som servern, med Nodes node:crypto och Buffer, och en som
// webbläsaren i det statiska Casinot, där Buffer är borttagen och node:crypto i src/engine pekar på nodecrypto.ts, som i bygget
// (bygg.ts). Svaren ska vara lika.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { Bytes, createHash as shimHash, randomBytes as shimRandom, randomFillSync, randomUUID } from './nodecrypto.ts';
import { browserGame } from './spel.ts';

const url = (file: string): string => pathToFileURL(join(import.meta.dirname, file)).href;

// Det som körs i processerna. Rundorna ur dealRound med flera frön, och sessioner med frö som spelas med en fast regel:
// försäkring när den erbjuds, Dela upp ett par, Dubbla på 11, Hit under 16, annars Stand, tre rundor i följd. Och en
// session utan frö, där skon blandas säkert.
const PLAY = `
import { registerHooks } from 'node:module';
const [like, shim, gameUrl] = process.argv.slice(1);
if (like === 'webbläsare') {
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'node:crypto' && context.parentURL && context.parentURL.includes('/src/engine/')) return next(shim, context);
      return next(specifier, context);
    },
  });
  delete globalThis.Buffer;
}
const { createGame, dealRound } = await import(gameUrl);
const SEEDS = ['runda-3', 'prov-a', 'prov-b', 'prov-c', 'prov-d', 'ett längre frö med å, ä och ö'];
const DEAL = { bets: [{ seat: 1, main: 10 }, { seat: 4, main: 25 }, { seat: 7, main: 10 }], hitBelow: 15 };
function played(seed) {
  const game = createGame({ seed });
  const tables = [];
  let n = 0;
  const send = (command) => {
    const table = game.command({ ...command, requestId: 'prov-' + ++n, expectedVersion: game.table().state.ver });
    tables.push(table);
    return table;
  };
  for (let number = 0; number < 3; number++) {
    let table = send({ op: 'start', bets: [{ seat: 3, main: 10 }, { seat: 5, main: 20 }] });
    for (let steps = 0; table.state.view.round && table.state.view.round.phase !== 'settled' && steps < 60; steps++) {
      const { round, roundId, turnSeq } = table.state.view;
      if (round.phase === 'insurance') {
        table = send({ op: 'insurance', roundId, take: true });
        continue;
      }
      const hand = round.hands[round.active];
      const can = (action) => round.legalActions.includes(action);
      const action = can('split') ? 'split' : hand.total === 11 && can('double') ? 'double' : hand.total < 16 && can('hit') ? 'hit' : 'stand';
      table = send({ op: 'act', action, seat: round.activeSeat, handIndex: round.active, roundId, turnSeq });
    }
    send({ op: 'collect', roundId: table.state.view.roundId });
  }
  return tables;
}
const secure = createGame().command({ op: 'start', bets: [{ seat: 4, main: 10 }], requestId: 's1', expectedVersion: 0 });
process.stdout.write(JSON.stringify({
  buffer: globalThis.Buffer && globalThis.Buffer.name,
  rounds: SEEDS.map((seed) => dealRound({ ...DEAL, seed })),
  sessions: SEEDS.slice(0, 3).map(played),
  secure: { source: secure.state.view.shoe.source, events: secure.steps[0].events.length, cards: secure.state.view.round.hands[0].cards.length },
}));
`;

type Played = { buffer: string; rounds: unknown[]; sessions: unknown[][]; secure: { source: string; events: number; cards: number } };

const play = (like: 'server' | 'webbläsare'): Played =>
  JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', PLAY, like, url('nodecrypto.ts'), url('../game/game.ts')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })) as Played;

test('byggets sha256, Buffer och slump gör det kärnan läser som Nodes', () => {
  for (const size of [0, 1, 55, 56, 63, 64, 65, 119, 120, 128, 1000, 5000]) {
    const bytes = randomBytes(size);
    assert.equal(shimHash('sha256').update(bytes).digest('hex'), createHash('sha256').update(bytes).digest('hex'), `${size} bytes`);
  }
  const text = 'game-rng/1\nshuffle\n{"å":"ä"} ö €';
  assert.equal(shimHash('sha256').update(text, 'utf8').digest('hex'), createHash('sha256').update(text, 'utf8').digest('hex'));
  // copy fortsätter från samma läge, och digest() är bytes som går att hasha vidare (HMAC i rng.ts).
  const inner = shimHash('sha256').update('nyckel');
  const node = createHash('sha256').update('nyckel');
  assert.equal(shimHash('sha256').update(inner.copy().update('ett').digest()).digest('hex'), createHash('sha256').update(node.copy().update('ett').digest()).digest('hex'));
  assert.equal(inner.copy().update('två').digest('hex'), node.copy().update('två').digest('hex'));

  const label = Bytes.from('game-rng/1/seeded', 'utf8');
  const message = Bytes.alloc(label.length + 8);
  label.copy(message);
  message.writeBigUInt64BE(258n, label.length);
  const nodeMessage = Buffer.alloc(label.length + 8);
  Buffer.from('game-rng/1/seeded', 'utf8').copy(nodeMessage);
  nodeMessage.writeBigUInt64BE(258n, label.length);
  assert.deepEqual([...message], [...nodeMessage]);
  assert.equal(message.readUInt32BE(4), nodeMessage.readUInt32BE(4));
  assert.ok(message.map((byte) => byte ^ 0x36) instanceof Bytes);
  assert.equal(Bytes.from([1, 171, 255]).toString('hex'), '01abff');

  assert.equal(shimRandom(32).toString('hex').length, 64);
  assert.ok(randomFillSync(new Uint32Array(70000)).some((word) => word !== 0));
  assert.match(randomUUID(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('spelkärnan med byggets node:crypto ger samma händelser som serverns för samma frö', () => {
  const server = play('server');
  const browser = play('webbläsare');
  // Buffer togs bort i webbläsarens process: den som finns där är byggets, och då läste kärnan byggets node:crypto.
  assert.deepEqual([server.buffer, browser.buffer], ['Buffer', 'Bytes']);
  assert.equal(browser.rounds.length, 6);
  assert.deepEqual(browser.rounds, server.rounds);
  assert.ok(browser.sessions.every((tables) => tables.length >= 6));
  assert.deepEqual(browser.sessions, server.sessions);
  // Utan frö blandas skon säkert, ur webbläsarens slump.
  assert.deepEqual([browser.secure.source, browser.secure.cards], ['secure', 2]);
  assert.ok(browser.secure.events > 0);
});

test('byggets spel svarar som serverns: bordet som över nätet, kärnans nej med dess skäl, och en ny session', async () => {
  const game = browserGame();
  const empty = await game.table();
  assert.deepEqual([empty.state.ver, empty.state.balance, empty.state.view.round, empty.steps], [0, 1000, null, []]);
  assert.equal(empty.state.view.shoe!.source, 'secure');
  const started = await game.command({ op: 'start', bets: [{ seat: 4, main: 10 }], requestId: 'v1', expectedVersion: 0 });
  assert.equal(started.state.balance, 990);
  assert.equal(started.steps.length, 1);
  // Bordet är en kopia: att ändra den ändrar inte sessionen.
  started.steps.length = 0;
  assert.equal((await game.table()).steps.length, 1);
  await assert.rejects(game.command({ op: 'start', bets: [{ seat: 4, main: 10 }], requestId: 'v2', expectedVersion: 0 }), /^Error: Spelkärnan sade nej: /);
  const fresh = await game.reset();
  assert.deepEqual([fresh.state.ver, fresh.state.balance, fresh.steps], [0, 1000, []]);
});
