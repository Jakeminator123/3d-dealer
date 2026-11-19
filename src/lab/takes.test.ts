// Kartans lägen och tagningarnas ordning (takes.ts), med påhittade tagningar. Namnen prövas i names.test.ts.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fackOrder, fackTakes, groupTakes, nodeOf, sentWords, type SeriesCard, type Take, type Waiting } from './takes.ts';

const ANCHOR = 'dealers/prova/anchors/vy-redo-2.png';
const OLD = 'dealers/prova/anchors/vy-redo.png';

function take(id: string, fields: Partial<Take>): Take {
  return {
    id, file: `dealers/prova/clips/${id}.mp4`, title: id, dealer: 'prova', view: { kind: 'spelaren' }, seat: 2, index: 0, action: 'deal', take: 1, move: 'rorelse', anchor: ANCHOR,
    status: 'att granska', statusBy: null, statusAt: null, comment: null, reply: null, present: true, archived: null, files: [], bytes: null, film: null, soundInDownload: null,
    times: null, judged: null, variant: null, reference: null, sent: { kind: 'docka', role: 'referenceVideos', asset: null, frames: 72, fps: 24, seconds: 3 }, step: 2, request: { model: null, resolution: null, duration: null, ratio: null, made: null }, order: null, eye: null, shoe: null, place: null, lands: null,
    ...fields,
  };
}
const card = (seat: number | 'D', index: number, action = 'deal', clip: SeriesCard['clip'] = null): SeriesCard => ({ seat, index, action, first: true, label: '', clip, others: 0 });
const waiting = (id: string, seat: number | 'D', index: number, anchor = ANCHOR): Waiting => ({ id, dealer: 'prova', view: 'spelaren', seat, index, action: 'deal', take: 2, move: 'rorelse', anchor, clip: null, made: null, sent: 'docka' });


test('ett kort är godkänt, att granska, underkänt, har ett paket som väntar eller saknas', () => {
  const failed = take('p3-t1', { seat: 3, status: 'utgår', present: false, archived: { at: null, why: 'fälld' } });
  const takes = [take('p2-t1', { status: 'godkänd' }), failed, take('p5-t2', { seat: 5, take: 2 }), take('p5-t1', { seat: 5, status: 'utgår' }), take('p6-gammal', { seat: 6, status: 'utgår', anchor: OLD })];
  const queue = [waiting('p3-t2', 3, 0), waiting('p4-t1', 4, 0), waiting('p6-annat', 6, 0, OLD)];
  const node = (c: SeriesCard) => nodeOf('spelaren', ANCHOR, c, takes, queue);

  const approved = node(card(2, 0, 'deal', { file: 'dealers/prova/clips/p2-t1.mp4', status: 'godkänd', take: 1 }));
  assert.deepEqual([approved.name, approved.state, approved.open, approved.note], ['P2 C1', 'godkänd', 'p2-t1', null]);
  const retaken = node(card(5, 0, 'deal', { file: 'dealers/prova/clips/p5-t2.mp4', status: 'att granska', take: 2 }));
  assert.deepEqual([retaken.state, retaken.take, retaken.open, retaken.note], ['att granska', 2, 'p5-t2', 't1 underkänd']);
  const rejected = node(card(3, 0));
  assert.deepEqual([rejected.state, rejected.open, rejected.note], ['underkänd', 'p3-t1', 'tas om: t2 väntar på beställning']);
  assert.deepEqual([node(card(4, 0)).state, node(card(4, 0)).open], ['paket väntar', null]);
  // Det som är gjort ur ett annat ankare räknas inte för vyns ankare.
  assert.equal(node(card(6, 0)).state, 'saknas');
  assert.equal(nodeOf('plats-7', ANCHOR, card(2, 0), takes, queue).state, 'saknas', 'en annan vy');
});

test('tagningarna ordnas: vyns ankare i dag först, sedan flest tagningar, och efter plats och kort', () => {
  const takes = [take('gammal-a', { anchor: OLD, move: 'gammal' }), take('gammal-b', { anchor: OLD, move: 'gammal', seat: 1 }), take('ny-d', { seat: 'D', index: 1, action: 'hole' }), take('ny-p7', { seat: 7 }), take('ny-vantan', { seat: 'D', index: 0, action: 'wait' }), take('ny-d0', { seat: 'D', index: 0 }), take('sidan', { view: { kind: 'plats', seat: 7 } })];
  const groups = groupTakes(takes, new Set([ANCHOR]));
  assert.deepEqual(groups.map((group) => [group.view, group.anchor, group.current, group.takes.map((one) => one.id)]), [
    ['spelaren', ANCHOR, true, ['ny-p7', 'ny-d0', 'ny-d', 'ny-vantan']],
    ['spelaren', OLD, false, ['gammal-b', 'gammal-a']],
    ['plats-7', ANCHOR, true, ['sidan']],
  ]);
});

test('vad som skickades som film sägs i ord', () => {
  const sent = (kind: 'docka' | 'klipp' | 'ingen', role: 'referenceVideos' | 'referenceVideo' | null = 'referenceVideos') => ({ kind, role, asset: kind === 'klipp' ? 'dealers/prova/clips/p2-t1.mp4' : null, frames: null, fps: null, seconds: null });
  assert.equal(sentWords(sent('docka')), 'dockans film, som rörelsereferens');
  assert.equal(sentWords(sent('klipp')), 'klippet p2-t1.mp4, som rörelsereferens i stället för dockans film');
  assert.match(sentWords(sent('klipp', 'referenceVideo')), /video till video/);
  assert.equal(sentWords(sent('ingen', null)), 'ingen film: bara första och sista bilden och texten');
});

test('steget Klipp sorteras i fack efter filmens steg, med det underkända och arkiverade för sig', () => {
  const takes = [
    take('e-p4', { seat: 4, status: 'godkänd' }),
    take('e-p1', { seat: 1, status: 'godkänd' }),
    take('tva-p4', { seat: 4, move: 'tva-hander' }),
    take('fri-p4', { seat: 4, step: 3, status: 'godkänd', variant: 'fri' }),
    take('ref-p4', { seat: 4, step: 3, status: 'utgår', variant: 'klippref' }),
    take('fri-arm-p4', { seat: 4, step: 3, variant: 'fri-arm' }),
    take('e-p2-gammal', { seat: 2, status: 'utgår', present: false, archived: { at: null, why: 'fälld' } }),
  ];
  const facks = fackTakes(takes, new Set([ANCHOR]));
  assert.deepEqual(
    facks.map((fack) => [fack.step, fack.groups.map((group) => [group.move, group.takes.map((one) => one.id)]), fack.aside.map((one) => one.id)]),
    [
      [2, [['rorelse', ['e-p1', 'e-p4']], ['tva-hander', ['tva-p4']]], ['e-p2-gammal']],
      [3, [['rorelse', ['fri-p4', 'fri-arm-p4']]], ['ref-p4']],
    ],
  );
  assert.deepEqual(fackOrder(facks).map((one) => one.id), ['e-p1', 'e-p4', 'tva-p4', 'e-p2-gammal', 'fri-p4', 'fri-arm-p4', 'ref-p4']);
});
