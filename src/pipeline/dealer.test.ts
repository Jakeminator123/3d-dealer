// Dealerns fil, orden och texterna, och var en dealer står: på projektets content/ och på ett register i en tillfällig mapp.

import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { cardLabel, dealerState, fillParagraphs, fillText, listDealers, placeholdersOf, readDealer, readMall, seriesCard, wordKeys, wordsOf, type Dealer } from './dealer.ts';
import { createRegister, importAsset, setStatus } from './registry.ts';

const root = resolve(import.meta.dirname, '..', '..');
const mall = readMall(root);
const json = (file: string) => JSON.parse(readFileSync(join(root, 'content', file), 'utf8'));

/** En dealer utan något om sig utom pronomenet: det som texterna ska klara. */
const bare = (pronoun: 'she' | 'he'): Dealer => ({
  id: 'prov',
  name: 'Prov',
  looks: { pronoun, basis: 'antaget', source: 'prov' },
  identity: { images: [], basis: 'antaget', source: 'prov' },
  anchors: { redo: {}, basis: 'antaget', source: 'prov' },
});

test('platshållarna: ord, villkor och fel', () => {
  const words = { her: 'her', Her: 'Her', handMarks: 'roses' };
  assert.equal(fillText('{Her} hands{handMarks? carry {handMarks}}{handMarks! are bare}.', words), 'Her hands carry roses.');
  assert.equal(fillText('{Her} hands{handMarks? carry {handMarks}}{handMarks! are bare}.', { Her: 'His' }), 'His hands are bare.');
  assert.throws(() => fillText('{hair}', {}), /hair saknas/);
  assert.throws(() => fillText('{ha ir}', {}), /Okänd platshållare/);
  assert.throws(() => fillText('{hair', {}), /\{ utan \}/);
  assert.deepEqual(placeholdersOf('{a} {b?x {c}} {d!y}').sort(), ['a', 'b', 'c', 'd']);
  assert.equal(fillParagraphs(['A {x?b}  c.', 'D.'], {}), 'A c.\n\nD.');
});

test('Paulinas fil: identitetsbilderna per slag, ankarna per vy och orden', () => {
  const paulina = readDealer(root, 'paulina', mall);
  assert.ok(listDealers(root).includes('paulina'));
  for (const role of ['ansikte', 'helkropp', 'händer']) assert.ok(paulina.identity.images.some((image) => image.shows === role), role);
  assert.ok(paulina.anchors.redo.spelaren?.startsWith('dealers/paulina/anchors/'));
  const words = wordsOf(paulina, mall);
  assert.equal(words.Her, 'Her');
  assert.ok(words.handMarks?.includes('mandala') && words.marks?.includes('neck'));
});

test('texterna i content/ har bara kända ord, och fungerar för en dealer utan tatueringar, också för en man', () => {
  const known = [...wordKeys(mall), 'grid', 'gaze', 'person2'];
  const texts = [
    ...json('ankare.json').steps.flatMap((step: { text: string[] }) => step.text),
    json('ankare.json').words.gaze,
    ...Object.entries(json('identitet.json').roles).filter(([key]) => key !== 'basis' && key !== 'source').flatMap(([, role]) => (role as { text: string[] }).text),
    json('tagning.json').prompt.text,
    json('tagning.json').prompt.actions.wait.text,
  ];
  for (const text of texts) for (const key of placeholdersOf(text)) assert.ok(known.includes(key), `okänt ord {${key}} i "${text.slice(0, 50)}…"`);
  const paulina = wordsOf(readDealer(root, 'paulina', mall), mall, { grid: '10 cm', gaze: 'down' });
  const she = wordsOf(bare('she'), mall, { grid: '10 cm', gaze: 'down' });
  const he = wordsOf(bare('he'), mall, { grid: '10 cm', gaze: 'down' });
  const all = (words: Record<string, string | undefined>) => texts.map((text) => fillParagraphs(text, words)).join('\n');
  assert.ok(all(paulina).includes('tattoos') && all(paulina).includes('blonde'));
  assert.ok(!/tattoos (?:covering|from)|\{|\}/.test(all(she)), 'inga tatueringar och inga platshållare kvar');
  assert.ok(all(she).includes(mall.looks.uniform), 'mallens kläder när filen inte säger');
  assert.ok(!/\b(she|She|her|Her)\b/.test(all(he).replace(/Locked camera[\s\S]*?No sound\./g, '')), 'en man i bildtexterna; filmens text säger woman');
});

test('serien: kort i ord', () => {
  assert.deepEqual(seriesCard('D/1/hole'), { seat: 'D', index: 1, action: 'hole', key: 'D/1/hole' });
  assert.deepEqual(seriesCard('4/0'), { seat: 4, index: 0, action: 'deal', key: '4/0/deal' });
  assert.equal(seriesCard('8/0'), null);
  assert.equal(cardLabel(seriesCard('D/0/wait')!), 'väntan i REDO');
  assert.equal(mall.series.first.length, 18);
});

test('var en dealer står: från en bild till spelbar, med nästa steg och kommandona', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dealer-'));
  try {
    mkdirSync(join(dir, 'content', 'dealers'), { recursive: true });
    copyFileSync(join(root, 'content', 'dealer.json'), join(dir, 'content', 'dealer.json'));
    // Rundan säger vilken rörelse seriens klipp är gjorda med: kartan visar det klipp rundan spelar.
    copyFileSync(join(root, 'content', 'runda.json'), join(dir, 'content', 'runda.json'));
    createRegister(dir, { about: 'prov', statuses: { 'att granska': 'inte dömd', godkänd: 'godkänd', utgår: 'utgår' }, asksWhy: [], groups: { identity: 'identitet', anchors: 'ankare', clips: 'klipp' }, sources: { runway: { what: 'Runway' }, jakob: { what: 'Jakob' } } });
    // Ingen fil: första steget är att skriva den ur en bild.
    let state = dealerState(dir, 'prov');
    assert.match(state.next[0]!.commands[0]!, /identitet\.ts ny prov/);
    // Filen med en källa: identitetsbilderna saknas.
    const dealer = bare('she');
    const image = join(dir, 'bild.png');
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#aa8877' } }).png().toFile(image);
    const add = async (file: string, group: string, more: Record<string, unknown> = {}) =>
      importAsset(dir, { from: image, file, group, dealer: 'prov', title: file, source: { from: 'runway' }, ...more });
    await add('dealers/prov/identity/kalla.png', 'identity', { shows: 'källa' });
    dealer.identity.images.push({ file: 'dealers/prov/identity/kalla.png', shows: 'källa' });
    writeFileSync(join(dir, 'content', 'dealers', 'prov.json'), JSON.stringify(dealer));
    state = dealerState(dir, 'prov');
    assert.deepEqual(state.identity.filter((one) => one.need).map((one) => one.image), [null, null, null]);
    assert.match(state.next[0]!.commands[0]!, /identitet\.ts förbered prov/);
    // Identitetsbilderna införda men inte dömda: granskaren först.
    for (const [role, name] of [['ansikte', 'ansikte'], ['helkropp', 'helkropp'], ['händer', 'hander']] as const) {
      await add(`dealers/prov/identity/${name}.png`, 'identity', { shows: role });
      dealer.identity.images.push({ file: `dealers/prov/identity/${name}.png`, shows: role });
    }
    writeFileSync(join(dir, 'content', 'dealers', 'prov.json'), JSON.stringify(dealer));
    state = dealerState(dir, 'prov');
    assert.equal(state.next[0]!.commands.length, 3);
    assert.match(state.next[0]!.commands[0]!, /reg -- status dealers\/prov\/identity\/ansikte\.png godkänd/);
    for (const name of ['ansikte', 'helkropp', 'hander']) setStatus(dir, `dealers/prov/identity/${name}.png`, 'godkänd', 'prov', '2026-11-18 20:00');
    // Godkänd identitet: ankaret ur Spelaren.
    state = dealerState(dir, 'prov');
    assert.deepEqual(state.views.map((view) => view.view), ['spelaren']);
    assert.match(state.next[0]!.commands[0]!, /ankare\.ts förbered prov spelaren/);
    // Ett godkänt ankare som dealerns fil inte pekar på: använd.
    await add('dealers/prov/anchors/spelaren-redo.png', 'anchors', { use: 'dealerfilm', view: { kind: 'spelaren' }, pose: 'redo', status: 'godkänd' });
    state = dealerState(dir, 'prov');
    assert.match(state.next[0]!.commands[0]!, /ankare\.ts använd prov spelaren dealers\/prov\/anchors\/spelaren-redo\.png/);
    dealer.anchors.redo.spelaren = 'dealers/prov/anchors/spelaren-redo.png';
    writeFileSync(join(dir, 'content', 'dealers', 'prov.json'), JSON.stringify(dealer));
    // Ankaret i filen: provklipp, sedan serien, ytterlägena först.
    state = dealerState(dir, 'prov');
    assert.match(state.next[0]!.commands[0]!, /tagning\.ts forbered prov spelaren 4 0/);
    const references = [{ role: 'startFrame', what: 'dealers/prov/anchors/spelaren-redo.png' }];
    await add('dealers/prov/clips/cykel-nyp-4-0_spelaren_t1.mp4', 'clips', { use: 'dealerfilm', view: { kind: 'spelaren' }, pose: 'redo → redo', seat: 4, index: 0, action: 'deal', take: 1, lands: { seat: 4, index: 0, at: 1.8 }, status: 'godkänd', source: { from: 'runway', references } });
    state = dealerState(dir, 'prov');
    const card = state.views[0]!.cards.find((one) => one.key === '4/0/deal')!;
    assert.equal(card.clip?.status, 'godkänd');
    assert.match(state.next[0]!.what, /17 av seriens 18 kort saknar klipp/);
    assert.match(state.next[0]!.commands[0]!, /forbered prov spelaren (1|7) 0/);
    assert.equal(state.views[0]!.playable, false);
    // Kartan visar det klipp rundan spelar (src/scene/round.ts, clipFor): ett steg 3-klipp före seriens steg 2-klipp,
    // och aldrig ett godkänt steg 2-klipp med en annan rörelse än serien.
    const doll = [...references, { role: 'referenceVideos[0]', what: 'output/tagningar/prov/referens.mp4: dockan gör rörelsen' }];
    const series = JSON.parse(readFileSync(join(dir, 'content', 'runda.json'), 'utf8')).series.move as string;
    const clip = { use: 'dealerfilm', view: { kind: 'spelaren' }, pose: 'redo → redo', action: 'deal', status: 'godkänd' };
    await add('dealers/prov/clips/serie-4-0_spelaren_t2.mp4', 'clips', { ...clip, seat: 4, index: 0, take: 2, lands: { seat: 4, index: 0, at: 1.8 }, move: series, source: { from: 'runway', references: doll } });
    await add('dealers/prov/clips/annan-1-0_spelaren_t1.mp4', 'clips', { ...clip, seat: 1, index: 0, take: 1, lands: { seat: 1, index: 0, at: 1.8 }, move: 'en-annan-rorelse', source: { from: 'runway', references: doll } });
    state = dealerState(dir, 'prov');
    const shown = (key: string) => state.views[0]!.cards.find((one) => one.key === key)!.clip?.file ?? null;
    assert.equal(shown('4/0/deal'), 'dealers/prov/clips/cykel-nyp-4-0_spelaren_t1.mp4', 'steg 3 före steg 2, fast steg 2 har en senare tagning');
    assert.equal(shown('1/0/deal'), null, 'en annan rörelse i steg 2 spelas inte och visas inte som kortets');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
