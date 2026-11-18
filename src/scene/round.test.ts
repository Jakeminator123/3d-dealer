// Valet av klipp för en runda som spelkärnan har delat: rätt klipp för varje händelse (deal, hole, flip), spelkärnans
// fallback när klippet saknas, hålkortet nedvänt tills det vänds, valörerna ur händelserna, och kortplatserna ur scenen.
// Händelserna här är skrivna för hand i spelkärnans form (src/engine/seats.ts); samma val med kärnans egna händelser
// prövas i src/server/game.test.ts. Filnamnen är påhittade: ett riktigt registernamn i ett test pekar på posten och
// hindrar npm run reg -- ta-bort.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { readScene } from './description.ts';
import { planOf, withPlan } from './plan.ts';
import { flyingAt, lyingAt, makeReel } from './reel.ts';
import { dealName, dealsOf, planPlace, planRound, readRound, readyClip, roundFilm, spotPlace, waitClip, type Deal, type Round, type RoundEntry, type RoundStep } from './round.ts';

const project = resolve(import.meta.dirname, '..', '..');
const readJson = (file: string): unknown => JSON.parse(readFileSync(join(project, 'content', file), 'utf8'));
const FALLBACK = { seconds: 1.2, turn: 0.8, move: 0.8 };
const rounded = (flying: ReturnType<typeof flyingAt>) => flying && { ...flying, progress: Math.round(flying.progress * 1e6) / 1e6 };
const round: Round = { deal: { seed: 'prov', bets: [{ seat: 4, main: 10 }], hitBelow: 15 }, fallback: FALLBACK, film: { background: 'scene/backgrounds/prov-rum.jpg', fps: 24, hold: 1.5 }, wait: { most: 4 }, speed: { clips: 1 } };

// Spelkärnans händelser och vy, i den form seats.ts ger dem. Bara det rundan läser är ifyllt.
const card = (face: string, shoeDraw: number) => ({ r: face.slice(0, -1), s: face.slice(-1), serial: shoeDraw, shoeDraw });
const toSeat = (seat: number, hand: number, cardIndex: number, face: string, shoeDraw: number) => ({
  type: 'deal', to: 'seat', seat, handIndex: 0, hand, cardIndex, card: card(face, shoeDraw), faceDown: false, shoeDraw, total: 0, soft: false, natural: false, target: String(seat), clip: { action: 'deal-centre', fallback: 'slide' },
});
const toDealer = (cardIndex: number, face: string | null, shoeDraw: number) => ({
  type: 'deal', to: 'dealer', seat: null, handIndex: null, hand: null, cardIndex, card: face ? card(face, shoeDraw) : null, faceDown: face === null, shoeDraw, total: 0, soft: false, natural: false, target: face ? 'dealer' : 'hole', clip: { action: 'deal-dealer', fallback: 'slide' },
});
const reveal = (face: string, shoeDraw: number) => ({ type: 'reveal', to: 'dealer', card: card(face, shoeDraw), shoeDraw, cardIndex: 1, total: 0, soft: false, blackjack: false, target: 'flip' });
/** Ett steg: händelserna, och platsernas händer efter steget som [plats, hand, [valör, plats i skon]...]. */
const step = (events: object[], hands: [number, number, [string, number][]][]): RoundStep =>
  ({ events, view: { round: { hands: hands.map(([seat, hand, cards]) => ({ seat, hand, cards: cards.map(([face, draw]) => card(face, draw)) })) } } }) as unknown as RoundStep;

// Plats 4 mot dealern: 10♠ och 6♦ mot 9♣ över hålkortet (7♥), en Hit som drar 3♣, Stand, vändningen och dealerns 5♠.
const STEPS: RoundStep[] = [
  step([{ type: 'speak', line: 'goodluck' }, toSeat(4, 0, 0, '10♠', 2), toDealer(0, '9♣', 3), toSeat(4, 0, 1, '6♦', 4), toDealer(1, null, 5), { type: 'turn' }], [[4, 0, [['10♠', 2], ['6♦', 4]]]]),
  step([toSeat(4, 0, 2, '3♣', 6), { type: 'turn' }], [[4, 0, [['10♠', 2], ['6♦', 4], ['3♣', 6]]]]),
  step([reveal('7♥', 5), toDealer(2, '5♠', 7), { type: 'settle' }], [[4, 0, [['10♠', 2], ['6♦', 4], ['3♣', 6]]]]),
];

const clip = (file: string, more: Record<string, unknown>): RoundEntry => ({
  file: `dealers/paulina/clips/${file}`,
  status: 'godkänd',
  dealer: 'paulina',
  use: 'dealerfilm',
  pose: 'redo → redo',
  view: { kind: 'spelaren' },
  seconds: 4,
  ...more,
});
// De två befintliga klippen till plats 4 saknar action (de är äldre), dealerns tre har den.
const ENTRIES: RoundEntry[] = [
  clip('prov-4-0.mp4', { seat: 4, index: 0, lands: { seat: 4, index: 0, at: 1.9 } }),
  clip('prov-4-1.mp4', { lands: { seat: 4, index: 1, at: 1.8 } }),
  clip('prov-d-0.mp4', { seat: 'D', index: 0, action: 'deal', lands: { at: 2.0 } }),
  clip('prov-d-hole.mp4', { seat: 'D', index: 1, action: 'hole', lands: { at: 2.1 } }),
  clip('prov-d-flip.mp4', { seat: 'D', index: 1, action: 'flip', lands: { at: 1.5 } }),
];

test('korten ur spelkärnans händelser: plats, hand och kortets nummer, valören, och hålkortet med baksidan upp tills det vänds', () => {
  assert.deepEqual(
    dealsOf(STEPS).map((deal) => [deal.seat, deal.hand, deal.index, deal.face, deal.action]),
    [
      [4, 0, 0, '10♠', 'deal'],
      ['D', 0, 0, '9♣', 'deal'],
      [4, 0, 1, '6♦', 'deal'],
      ['D', 0, 1, null, 'hole'],
      [4, 0, 2, '3♣', 'deal'],
      ['D', 0, 1, '7♥', 'flip'],
      ['D', 0, 2, '5♠', 'deal'],
    ],
  );
});

test('varje kort får det godkända klippet som gör just det: seat, index och action, och en post utan action är en utdelning', () => {
  const plan = planRound(dealsOf(STEPS), ENTRIES, 'paulina', { kind: 'spelaren' }, FALLBACK);
  assert.deepEqual(plan.clips, [
    { file: 'dealers/paulina/clips/prov-4-0.mp4', card: { seat: 4, index: 0, face: '10♠', at: 1.9 } },
    { file: 'dealers/paulina/clips/prov-d-0.mp4', card: { seat: 'D', index: 0, face: '9♣', at: 2.0 } },
    { file: 'dealers/paulina/clips/prov-4-1.mp4', card: { seat: 4, index: 1, face: '6♦', at: 1.8 } },
    { file: 'dealers/paulina/clips/prov-d-hole.mp4', card: { seat: 'D', index: 1, face: null, at: 2.1 } },
    // Spelarens tredje kort har inget klipp: det går självt från skon medan dealern står i REDO.
    { file: null, seconds: 1.2, card: { seat: 4, index: 2, face: '3♣', at: 1.2 }, from: 'skon' },
    { file: 'dealers/paulina/clips/prov-d-flip.mp4', card: { seat: 'D', index: 1, face: '7♥', at: 1.5 } },
    { file: null, seconds: 1.2, card: { seat: 'D', index: 2, face: '5♠', at: 1.2 }, from: 'skon' },
  ]);
  assert.deepEqual(plan.missing.map(dealName), ['plats 4, kort 2 (deal)', 'dealern, kort 2 (deal)']);
  assert.deepEqual(plan.unusable, []);
  assert.deepEqual(roundFilm(plan, round, { kind: 'spelaren' }, false), { kind: 'film', view: { kind: 'spelaren' }, clips: plan.clips, hold: 1.5, loop: false });
});

test('utan dealerns klipp går hans kort självt, och hålkortet vänds där det ligger', () => {
  const players = ENTRIES.filter((entry) => !entry.file.includes('-d-'));
  const plan = planRound(dealsOf(STEPS), players, 'paulina', { kind: 'spelaren' }, FALLBACK);
  assert.deepEqual(
    plan.clips.map((part) => (part.file === null ? [part.from, part.seconds, part.card.face] : part.file.split('/').at(-1))),
    ['prov-4-0.mp4', ['skon', 1.2, '9♣'], 'prov-4-1.mp4', ['skon', 1.2, null], ['skon', 1.2, '3♣'], [{ seat: 'D', index: 1 }, 0.8, '7♥'], ['skon', 1.2, '5♠']],
  );
  assert.deepEqual(plan.missing.map(dealName), ['dealern, kort 0 (deal)', 'dealern, kort 1 med baksidan upp (hole)', 'plats 4, kort 2 (deal)', 'dealern, kort 1 vänds (flip)', 'dealern, kort 2 (deal)']);
});

test('bara godkända klipp spelas, ur rätt vy och för rätt dealer; den senaste tagningen före en tidigare', () => {
  const entries: RoundEntry[] = [
    clip('prov-4-0-t1.mp4', { seat: 4, index: 0, take: 1, lands: { at: 1.9 } }),
    clip('prov-4-0-t2.mp4', { seat: 4, index: 0, take: 2, lands: { at: 1.7 } }),
    clip('prov-4-0-t3.mp4', { seat: 4, index: 0, take: 3, status: 'att granska', lands: { at: 1.6 } }),
    clip('prov-d-hole-ogranskad.mp4', { seat: 'D', index: 1, action: 'hole', status: 'att granska', lands: { at: 2 } }),
    clip('prov-d-flip-plats-7.mp4', { seat: 'D', index: 1, action: 'flip', view: { kind: 'plats', seat: 7 }, lands: { at: 1.5 } }),
    clip('prov-d-0-liv.mp4', { seat: 'D', index: 0, action: 'deal', dealer: 'liv', lands: { at: 1.5 } }),
    clip('prov-d-0-okand.mp4', { seat: 'D', index: 0, action: 'kasta', lands: { at: 1.5 } }),
    clip('prov-4-1-utan-tid.mp4', { seat: 4, index: 1, lands: {} }),
    clip('prov-4-1-saknas.mp4', { seat: 4, index: 1, present: false, lands: { at: 1.8 } }),
  ];
  const plan = planRound(dealsOf(STEPS), entries, 'paulina', { kind: 'spelaren' }, FALLBACK);
  assert.deepEqual(plan.dealt.map((deal) => deal.file?.split('/').at(-1) ?? null), ['prov-4-0-t2.mp4', null, null, null, null, null, null]);
  assert.deepEqual(
    plan.unusable.map((item) => [item.file.split('/').at(-1), item.why]),
    [
      ['prov-4-0-t3.mp4', 'status att granska'],
      ['prov-d-hole-ogranskad.mp4', 'status att granska'],
      ['prov-d-0-okand.mp4', 'action "kasta" är inte deal, hole eller flip'],
      ['prov-4-1-utan-tid.mp4', 'lands.at saknas: tiden då kortet ligger är inte mätt'],
      ['prov-4-1-saknas.mp4', 'filen saknas i assets/'],
    ],
  );
  assert.equal(readyClip(entries, 'paulina', { kind: 'spelaren' }), 'dealers/paulina/clips/prov-4-0-t1.mp4');
  assert.equal(readyClip(entries, 'paulina', { kind: 'plats', seat: 3 }), null);
});

test('väntan: klippet med action wait ur följdens ankare spelas medan spelet väntar, och hör inte till följden', () => {
  const made = (anchor: string) => ({ source: { references: [{ role: 'startFrame', what: `dealers/paulina/anchors/${anchor}` }] } });
  const entries: RoundEntry[] = [
    clip('ny-4-0.mp4', { ...made('ny.png'), seat: 4, index: 0, lands: { at: 1.7 } }),
    clip('ny-vanta-t1.mp4', { ...made('ny.png'), seat: 'D', index: 0, action: 'wait', take: 1 }),
    clip('ny-vanta-t2.mp4', { ...made('ny.png'), seat: 'D', index: 0, action: 'wait', take: 2 }),
    clip('ny-vanta-t3.mp4', { ...made('ny.png'), seat: 'D', index: 0, action: 'wait', take: 3, status: 'att granska' }),
    clip('gammal-vanta.mp4', { ...made('gammal.png'), seat: 'D', index: 0, action: 'wait', take: 9 }),
  ];
  const plan = planRound(dealsOf(STEPS), entries, 'paulina', { kind: 'spelaren' }, FALLBACK);
  assert.equal(plan.anchor, 'dealers/paulina/anchors/ny.png');
  assert.ok(plan.clips.every((one) => !one.file?.includes('vanta')), 'väntan spelas inte som ett kort');
  assert.ok(plan.unusable.every((one) => !one.file.includes('vanta')), 'och räknas inte som oanvändbar');
  assert.equal(waitClip(entries, 'paulina', { kind: 'spelaren' }, plan.anchor), 'dealers/paulina/clips/ny-vanta-t2.mp4', 'den senaste godkända ur följdens ankare');
  assert.equal(waitClip(entries, 'paulina', { kind: 'spelaren' }), 'dealers/paulina/clips/gammal-vanta.mp4', 'utan ankare: den senaste tagningen');
  assert.equal(waitClip(entries, 'paulina', { kind: 'plats', seat: 3 }, plan.anchor), null);
});

test('en följd blandar aldrig klipp ur olika REDO-ankare: ankaret med flest godkända klipp för rundan väljs', () => {
  const made = (anchor: string) => ({ source: { references: [{ role: 'startFrame', what: `dealers/paulina/anchors/${anchor}` }, { role: 'endFrame', what: 'sista.png' }] } });
  const old = (file: string, more: Record<string, unknown>) => clip(file, { ...made('prov-redo.png'), ...more });
  const fresh = (file: string, more: Record<string, unknown>) => clip(file, { ...made('prov-redo-ny.png'), ...more });
  const entries: RoundEntry[] = [
    old('gammal-4-0.mp4', { seat: 4, index: 0, lands: { at: 1.9 } }),
    old('gammal-4-1.mp4', { seat: 4, index: 1, lands: { at: 1.8 } }),
    old('gammal-d-0.mp4', { seat: 'D', index: 0, action: 'deal', lands: { at: 2 } }),
    fresh('ny-4-0.mp4', { seat: 4, index: 0, lands: { at: 1.7 } }),
    fresh('ny-4-1.mp4', { seat: 4, index: 1, lands: { at: 1.7 } }),
    fresh('ny-d-hole.mp4', { seat: 'D', index: 1, action: 'hole', lands: { at: 2 } }),
    fresh('ny-d-flip.mp4', { seat: 'D', index: 1, action: 'flip', lands: { at: 1.5 } }),
    fresh('ny-4-2.mp4', { seat: 4, index: 2, status: 'att granska', lands: { at: 1.7 } }),
    old('gammal-4-2.mp4', { seat: 4, index: 2, status: 'att granska', lands: { at: 1.7 } }),
  ];
  // Det nya ankaret har klipp till fyra av rundans kort, det gamla till tre: alla klipp i följden är ur det nya, också
  // när det gamla har ett klipp till ett kort som det nya saknar (dealerns öppna kort).
  const plan = planRound(dealsOf(STEPS), entries, 'paulina', { kind: 'spelaren' }, FALLBACK);
  assert.equal(plan.anchor, 'dealers/paulina/anchors/prov-redo-ny.png');
  assert.deepEqual(plan.anchors, [
    { anchor: 'dealers/paulina/anchors/prov-redo-ny.png', clips: 4 },
    { anchor: 'dealers/paulina/anchors/prov-redo.png', clips: 3 },
  ]);
  assert.deepEqual(plan.dealt.map((deal) => deal.file?.split('/').at(-1) ?? null), ['ny-4-0.mp4', null, 'ny-4-1.mp4', 'ny-d-hole.mp4', null, 'ny-d-flip.mp4', null]);
  // Det som inte spelas sägs bara för det valda ankaret.
  assert.deepEqual(plan.unusable, [{ file: 'dealers/paulina/clips/ny-4-2.mp4', why: 'status att granska' }]);
  // Lika många klipp till rundan: det ankare som har flest godkända klipp ur vyn, och sedan det senast införda.
  const even = entries.filter((entry) => /-4-[01]\.mp4$/.test(entry.file));
  assert.equal(planRound(dealsOf(STEPS), even, 'paulina', { kind: 'spelaren' }, FALLBACK).anchor, 'dealers/paulina/anchors/prov-redo-ny.png');
  assert.equal(planRound(dealsOf(STEPS), [...even, old('gammal-6-0.mp4', { seat: 6, index: 0, lands: { at: 1.9 } })], 'paulina', { kind: 'spelaren' }, FALLBACK).anchor, 'dealers/paulina/anchors/prov-redo.png');
  // Dealern i REDO utan runda är ur ankaret med flest godkända klipp ur vyn.
  assert.equal(readyClip(entries, 'paulina', { kind: 'spelaren' }), 'dealers/paulina/clips/ny-4-0.mp4');
  assert.equal(readyClip([...even, old('gammal-6-0.mp4', { seat: 6, index: 0, lands: { at: 1.9 } })], 'paulina', { kind: 'spelaren' }), 'dealers/paulina/clips/gammal-4-0.mp4');
});

test('hålkortet ligger med baksidan upp på bordet tills vändningen har landat; då ligger det uppvända kortet där', () => {
  const plan = planRound(dealsOf(STEPS), ENTRIES, 'paulina', { kind: 'spelaren' }, FALLBACK);
  const reel = makeReel(plan.clips.map((part) => (part.file === null ? { seconds: part.seconds, card: part.card, from: part.from } : { seconds: 4, ...(part.card ? { card: part.card } : {}) })));
  const faceAt = (time: number) => lyingAt(reel, time).map((index) => reel.parts[index]!.card!.face);
  // Hålkortet landar 2,1 s in i fjärde delen: med baksidan upp.
  assert.deepEqual(faceAt(12 + 2.05), ['10♠', '9♣', '6♦']);
  assert.deepEqual(faceAt(12 + 2.11), ['10♠', '9♣', '6♦', null]);
  // Spelarens tredje kort går självt (femte delen, 1,2 s): på väg från skon, sedan liggande.
  assert.deepEqual(rounded(flyingAt(reel, 16.6)), { part: 4, progress: 0.5, left: null });
  assert.deepEqual(faceAt(17.2), ['10♠', '9♣', '6♦', null, '3♣']);
  // Vändningen är ett klipp: hålkortet ligger nedvänt tills klippets kort har landat, och sedan ligger 7♥ där.
  assert.deepEqual(faceAt(17.2 + 1.4), ['10♠', '9♣', '6♦', null, '3♣']);
  assert.deepEqual(faceAt(17.2 + 1.5), ['10♠', '9♣', '6♦', '3♣', '7♥']);
  assert.deepEqual(faceAt(reel.seconds), ['10♠', '9♣', '6♦', '3♣', '7♥', '5♠']);
});

test('ett kort som flyttas när handen delas går från sin gamla kortplats till den nya, före stegets nya kort', () => {
  // Plats 2 delar 8♠ 8♥: 8♥ blir den andra handens första kort, och varje hand får ett nytt.
  const steps = [
    step([toSeat(2, 0, 0, '8♠', 2), toDealer(0, '6♣', 3), toSeat(2, 0, 1, '8♥', 4), toDealer(1, null, 5)], [[2, 0, [['8♠', 2], ['8♥', 4]]]]),
    step([toSeat(2, 0, 1, '3♦', 6), toSeat(2, 1, 1, '2♣', 7)], [
      [2, 0, [['8♠', 2], ['3♦', 6]]],
      [2, 1, [['8♥', 4], ['2♣', 7]]],
    ]),
  ];
  const deals = dealsOf(steps);
  assert.deepEqual(deals.slice(4), [
    { seat: 2, hand: 1, index: 0, face: '8♥', action: 'move', from: { seat: 2, hand: 0, index: 1 } },
    { seat: 2, hand: 0, index: 1, face: '3♦', action: 'deal' },
    { seat: 2, hand: 1, index: 1, face: '2♣', action: 'deal' },
  ] satisfies Deal[]);
  const plan = planRound(deals, [clip('prov-2-1.mp4', { seat: 2, index: 1, lands: { at: 1.8 } })], 'paulina', { kind: 'spelaren' }, FALLBACK);
  // Flyttningen har inget klipp och räknas inte som saknad; den andra handens kort har inget klipp (klippen lägger på platsens första hand).
  assert.deepEqual(plan.clips.slice(4), [
    { file: null, seconds: 0.8, card: { seat: 2, index: 0, hand: 1, face: '8♥', at: 0.8 }, from: { seat: 2, hand: 0, index: 1 } },
    { file: 'dealers/paulina/clips/prov-2-1.mp4', card: { seat: 2, index: 1, face: '3♦', at: 1.8 } },
    { file: null, seconds: 1.2, card: { seat: 2, index: 1, hand: 1, face: '2♣', at: 1.2 }, from: 'skon' },
  ]);
  assert.deepEqual(plan.missing.map(dealName).slice(-1), ['plats 2, hand 2, kort 1 (deal)']);
  // I följden lämnar 8♥ sin kortplats när flyttningen börjar, och ligger på den nya när den har landat.
  const reel = makeReel(plan.clips.map((part) => (part.file === null ? { seconds: part.seconds, card: part.card, from: part.from } : { seconds: 4, ...(part.card ? { card: part.card } : {}) })));
  const start = reel.starts[4]!;
  const faces = (time: number) => lyingAt(reel, time).map((index) => reel.parts[index]!.card!.face);
  // Hålkortet går självt och landar när dess del är slut; flyttningen börjar där.
  assert.deepEqual(faces(start - 0.01), ['8♠', '6♣', '8♥']);
  assert.deepEqual(faces(start), ['8♠', '6♣', null]);
  assert.deepEqual(rounded(flyingAt(reel, start + 0.4)), { part: 4, progress: 0.5, left: 2 });
  assert.deepEqual(faces(start + 0.8), ['8♠', '6♣', null, '8♥']);
});

test('kortplatsen ur content/scene.json: platsens kortplatser, ett steg längre för ett tredje kort, och en delad hand närmare spelaren', () => {
  const scene = readScene(readJson('scene.json'));
  const four = scene.places.seats.find((entry) => entry.seat === 4)!.cards;
  assert.deepEqual(spotPlace(scene, { seat: 4, index: 0 }), four[0]);
  assert.deepEqual(spotPlace(scene, { seat: 4, index: 1 }), four[1]);
  const [a, b] = [four.at(-2)!, four.at(-1)!];
  const third = spotPlace(scene, { seat: 4, index: four.length })!;
  assert.ok(Math.abs(third[0] - (2 * b[0] - a[0])) < 1e-12 && Math.abs(third[1] - (2 * b[1] - a[1])) < 1e-12, `${third}`);
  assert.deepEqual(spotPlace(scene, { seat: 4, index: 0, hand: 1 }), [four[0]![0], four[0]![1] + scene.card.height]);
  assert.deepEqual(spotPlace(scene, { seat: 'D', index: 1 }), scene.places.dealer[1]);
  assert.equal(spotPlace(scene, { seat: 9, index: 0 }), null);
});

test('content/runda.json går att läsa, och en runda som inte går att använda sägs med fältets namn', () => {
  const whole = readJson('runda.json') as Record<string, unknown>;
  const read = readRound(whole);
  assert.ok(read.deal.seed.length > 0);
  assert.ok(read.deal.bets.length >= 1);
  const scene = readScene(readJson('scene.json'));
  for (const bet of read.deal.bets) assert.ok(scene.places.seats.some((entry) => entry.seat === bet.seat), `plats ${bet.seat}`);
  assert.throws(() => readRound({ ...whole, deal: { ...read.deal, bets: [{ seat: 8, main: 10 }] } }), /deal\.bets/);
  assert.throws(() => readRound({ ...whole, deal: { ...read.deal, bets: [{ seat: 1, main: 10 }, { seat: 1, main: 5 }] } }), /varje plats en gång/);
  assert.throws(() => readRound({ ...whole, fallback: { seconds: 0, turn: 1, move: 1 } }), /fallback/);
  assert.throws(() => readRound({ ...whole, film: { background: 'x.jpg', fps: 0, hold: 1 } }), /film\.fps/);
  assert.ok(read.wait.most >= 0);
  assert.throws(() => readRound({ ...whole, wait: { most: -1 } }), /wait\.most/);
  assert.throws(() => readRound({ ...whole, wait: undefined }), /wait\.most/);
  assert.throws(() => readRound(null), /deal\.seed/);
  // Klippens fart: 1–2, och den står i filen.
  assert.ok(read.speed.clips >= 1 && read.speed.clips <= 2);
  for (const clips of [1, 1.5, 2]) assert.equal(readRound({ ...whole, speed: { clips } }).speed.clips, clips);
  for (const speed of [{ clips: 0.9 }, { clips: 2.5 }, { clips: '1,5' }, {}, undefined]) assert.throws(() => readRound({ ...whole, speed }), /speed\.clips 1 … 2/);
});

test('rundans dealerfilm spelar klippen i rundans fart, och säger ingen fart i 1', () => {
  const plan = planRound([{ seat: 4, hand: 0, index: 0, face: 'A♠', action: 'deal' }], [clip('a.mp4', { seat: 4, index: 0, lands: { seat: 4, index: 0, at: 1.9 } })], 'paulina', { kind: 'spelaren' }, FALLBACK);
  assert.equal('speed' in roundFilm(plan, round, { kind: 'spelaren' }), false);
  assert.equal(roundFilm(plan, { ...round, speed: { clips: 1.5 } }, { kind: 'spelaren' }).speed, 1.5);
});

test('ett klipp som bär sitt öga, sin sko och var kortet landar spelas så, också när scenens tal har ändrats', () => {
  // Som registrets poster för klippen som gjordes före skons flytt (eye, shoe, place).
  const eye = { position: [0, 0.6, 0.0562], forward: [0.0178, -0.1817, -0.9832], focalPx: 2065.9, frame: { width: 1920, height: 1080 } };
  const shoe = { at: [0.495, -1.8433], yawDeg: -74.6, length: 0.442 };
  const made = (file: string, more: Record<string, unknown>) => clip(file, { ...more, eye, shoe });
  const entries = [
    made('gammal-4-0.mp4', { seat: 4, index: 0, lands: { at: 1.9 }, place: [-0.019, -1.4468] }),
    made('gammal-4-1.mp4', { seat: 4, index: 1, lands: { at: 1.8 }, place: [0.0191, -1.46] }),
  ];
  const scene = readScene(readJson('scene.json'));
  const plan = planRound(dealsOf(STEPS), entries, 'paulina', { kind: 'spelaren' }, FALLBACK);
  assert.deepEqual(plan.clips[0], { file: 'dealers/paulina/clips/gammal-4-0.mp4', card: { seat: 4, index: 0, face: '10♠', at: 1.9, place: [-0.019, -1.4468] } });
  const film = roundFilm(plan, round, { kind: 'spelaren' }, false);
  assert.deepEqual([film.eye, film.shoe], [eye, shoe], 'följden läggs genom ögat klippen gjordes i, med skon de bär');
  // Kortet ligger där klippet lägger det, inte på scenens kortplats; ett kort utan klipp ligger på scenens.
  assert.deepEqual(spotPlace(scene, plan.clips[0]!.card!), [-0.019, -1.4468]);
  assert.notDeepEqual(spotPlace(scene, { seat: 4, index: 0 }), [-0.019, -1.4468]);
  assert.deepEqual(spotPlace(scene, plan.clips[4]!.card!), scene.places.seats.find((entry) => entry.seat === 4)!.cards[2]);
  // Ett klipp utan öga i posten läggs genom vyns närbild i dag (inget eye i följden).
  assert.equal(roundFilm(planRound(dealsOf(STEPS), ENTRIES, 'paulina', { kind: 'spelaren' }, FALLBACK), round, { kind: 'spelaren' }).eye, undefined);
});

test('ett klipps kort landar där handen lade det, och har sin plats i dagens kortplan, som följer planen när den ställs om', () => {
  const scene = readScene(readJson('scene.json'));
  const old = { seat: 4, index: 0, face: '10♠', at: 1.9, place: [-0.019, -1.4468] as [number, number] };
  const four = scene.places.seats.find((entry) => entry.seat === 4)!.cards;
  assert.deepEqual(spotPlace(scene, old), old.place, 'där kortet landar');
  assert.deepEqual(planPlace(scene, old), four[0], 'dit det går');
  // Planen ställd om: tre centimeter närmare spelarna och större kort. Där handen lade kortet ändras inte.
  const plan = planOf(scene)!;
  const moved = withPlan(scene, { ...plan, arc: { ...plan.arc, depth: plan.arc.depth + 0.03 }, scale: 1.5 });
  assert.deepEqual(spotPlace(moved, old), old.place);
  const there = planPlace(moved, old)!;
  assert.ok(Math.abs(there[0] - four[0]![0]) < 1e-9 && Math.abs(there[1] - four[0]![1] - 0.03) < 2e-4, `${there}`);
  // En delad hand ligger ett kort längre mot spelaren, i kortens storlek på bordet.
  assert.ok(Math.abs(planPlace(moved, { seat: 4, index: 0, hand: 1 })![1] - there[1] - 1.5 * scene.card.height) < 1e-9);
  // Ett kort vars klipp är gjort med dagens plan landar där det ska ligga: det går ingenstans.
  assert.deepEqual(spotPlace(scene, { ...old, place: four[0]! }), planPlace(scene, old));
});
