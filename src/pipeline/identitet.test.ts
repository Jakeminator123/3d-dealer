// Identiteten ur en bild, i en tillfällig mapp: dealerns fil och källan, paketet med beställningarna, och bilderna
// tagna emot i registret och i dealerns fil. Ingen beställning: "bildmodellens" bilder görs här.

import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { dealerState, readDealer } from './dealer.ts';
import { forbered, ny, readIdentitet, taEmot } from './identitet.ts';
import { about, createRegister, getEntry, setStatus } from './registry.ts';

const root = resolve(import.meta.dirname, '..', '..');
const quiet = () => {};
let dir = '';

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'identitet-'));
  mkdirSync(join(dir, 'content'), { recursive: true });
  for (const file of ['dealer.json', 'identitet.json']) copyFileSync(join(root, 'content', file), join(dir, 'content', file));
  createRegister(dir, { about: 'prov', statuses: { 'att granska': 'inte dömd', godkänd: 'godkänd', utgår: 'utgår' }, asksWhy: [], groups: { identity: 'identitet', anchors: 'ankare', clips: 'klipp' }, sources: { runway: { what: 'Runway' }, jakob: { what: 'Jakob' } } });
  await sharp({ create: { width: 300, height: 400, channels: 3, background: '#c89a80' } }).jpeg().toFile(join(dir, 'foto.jpg'));
});
after(() => rmSync(dir, { recursive: true, force: true }));

test('mallen: ett slag per bild linjen behöver, och referenser bara bakåt', () => {
  const content = readIdentitet(root);
  assert.deepEqual(Object.keys(content.roles), ['ansikte', 'helkropp', 'händer']);
  assert.equal(content.roles.helkropp!.references[0]!.from, 'ansikte');
});

test('från en bild: dealerns fil, källan, beställningarna, och bilderna tagna emot under dealern', async () => {
  await ny('anna', 'Anna', [join(dir, 'foto.jpg')], { root: dir, say: quiet });
  const dealer = readDealer(dir, 'anna');
  assert.deepEqual(dealer.identity.images, [{ file: 'dealers/anna/identity/kalla.png', shows: 'källa' }]);
  assert.equal(getEntry(dir, 'dealers/anna/identity/kalla.png')?.status, 'att granska');
  await assert.rejects(ny('anna', 'Anna', [join(dir, 'foto.jpg')], { root: dir, say: quiet }), /finns redan/);
  await assert.rejects(ny('berit', 'Berit', [join(dir, 'saknas.jpg')], { root: dir, say: quiet }), /finns inte/);
  assert.ok(!existsSync(join(dir, 'content', 'dealers', 'berit.json')), 'ingen fil utan bild');

  const made = await forbered('anna', { root: dir, say: quiet });
  assert.deepEqual(made.roles, ['ansikte', 'helkropp', 'händer']);
  const order = JSON.parse(readFileSync(join(made.dir, 'bestallning.json'), 'utf8'));
  const [face, body, hands] = order.steps;
  assert.deepEqual(face.referenceImages.map((ref: { tag: string }) => ref.tag), ['person'], 'en bild: ingen @person2');
  assert.deepEqual(body.referenceImages[0], { tag: 'face', taskId: '<ansiktes taskId>', from: 'ansikte' });
  assert.equal(hands.ratio, '16:9');
  for (const step of order.steps) {
    assert.ok(!/[{}]/.test(step.promptText), 'alla platshållare fyllda');
    assert.ok(!/tattoos? (?:from|covering)/.test(step.promptText), 'inga tatueringar för en dealer utan');
    assert.ok(existsSync(join(made.dir, step.promptFile.split('/').at(-1))), 'texten i paketet');
  }
  assert.ok(face.promptText.includes('blazer'), 'mallens kläder');
  const ref = await sharp(join(made.dir, 'ref', 'kalla-1.jpg')).metadata();
  assert.deepEqual([ref.width, ref.height], [300, 400], 'inte förstorad');

  // "Bildmodellens" bilder och kvittot.
  const receipts = [];
  for (const [k, step] of order.steps.entries()) {
    const file = join(dir, `ut-${k}.png`);
    await sharp({ create: { width: 64, height: 64, channels: 3, background: '#d0a090' } }).png().toFile(file);
    receipts.push({ step: step.step, file, taskId: `task-${k}`, credits: 20, before: 1000 - 20 * k, after: 980 - 20 * k, at: '2026-11-18 20:00' });
  }
  writeFileSync(join(made.dir, 'kvitto.json'), JSON.stringify(receipts.slice(0, 2)));
  const first = await taEmot(made.id, { root: dir, say: quiet });
  assert.equal(first.length, 2);
  assert.ok(existsSync(join(made.dir, 'delvis.json')) && !existsSync(join(made.dir, 'mottaget.json')), 'händerna väntar');
  writeFileSync(join(made.dir, 'kvitto.json'), JSON.stringify(receipts));
  assert.equal((await taEmot(made.id, { root: dir, say: quiet })).length, 1, 'bara det som inte var mottaget');
  assert.ok(existsSync(join(made.dir, 'mottaget.json')));
  const entry = getEntry(dir, 'dealers/anna/identity/hander.png')!;
  assert.deepEqual([entry.status, entry.shows, entry.dealer, entry.group], ['att granska', 'händer', 'anna', 'identity']);
  assert.equal(about(dir, 'dealers/anna/identity/helkropp.png').orders[0]?.task_id, 'task-1');
  assert.deepEqual(readDealer(dir, 'anna').identity.images.map((image) => image.shows), ['källa', 'ansikte', 'helkropp', 'händer']);

  // Läget: granskaren dömer, sedan ankaret; ett nytt paket behövs inte.
  assert.match(dealerState(dir, 'anna').next[0]!.what, /oberoende granskare dömer identitetsbilderna/);
  for (const name of ['ansikte', 'helkropp', 'hander']) setStatus(dir, `dealers/anna/identity/${name}.png`, 'godkänd', 'prov', '2026-11-18 20:10');
  assert.match(dealerState(dir, 'anna').next[0]!.commands[0]!, /ankare\.ts förbered anna spelaren/);
  await assert.rejects(forbered('anna', { root: dir, say: quiet }), /har alla identitetsbilder/);
});
