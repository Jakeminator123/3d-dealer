// Vägarna till tagningarna (tagningar.ts): listan, en fil ur ett paket, och det som nekas. Allt i en tillfällig mapp
// med påhittade namn.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { addEntry, addOrder, archive, createRegister, setStatus } from '../pipeline/registry.ts';
import { createApi } from './api.ts';
import { handler } from './main.ts';
import { filmStep, sentOf, type Takes } from './tagningar.ts';

let root: string;
let server: Server;
let base: string;
let port: number;

const sha = (content: string): string => createHash('sha256').update(content).digest('hex');
function put(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

const KEPT = 'dealers/prova/clips/rorelse-2-0_vy_t1.mp4';
const FAILED = 'dealers/prova/clips/rorelse-3-1_vy_t1.mp4';
const ANCHOR = 'dealers/prova/anchors/vy-redo-9.png';

/** Ett paket som tagning.ts gör det: beställningen, dockans film, och efter ta-emot måtten och posten. */
function pack(id: string, clip: string, seat: number, index: number, received: boolean): void {
  put(
    `output/tagningar/${id}/bestallning.json`,
    JSON.stringify({ id, dealer: 'prova', viewWord: 'vy', view: { kind: 'spelaren' }, seat, index, action: 'deal', take: 1, cycle: 'rorelse', clip, anchor: ANCHOR, model: 'filmmodell', resolution: '1080p', duration: 3, ratio: '16:9', inputs: { referenceVideos: [{ frames: 72, fps: 24, durationSeconds: 3 }] } }),
  );
  put(`output/tagningar/${id}/referens.mp4`, `docka ${id}`);
  put(`output/tagningar/${id}/text.txt`, 'texten lämnas inte ut');
  if (!received) return;
  put(`output/tagningar/${id}/ark.jpg`, `ark ${id}`);
  put(`output/tagningar/${id}/post.json`, '{}');
  put(
    `output/tagningar/${id}/matning.json`,
    JSON.stringify({
      film: { width: 1920, height: 1080, fps: 24, frames: 73, seconds: 3.04, codec: 'h264', audio: false },
      soundInDownload: true,
      seconds: { lands: 1.8 },
      doll: { lands: 1.9 },
      judged: [
        { key: 'takt', what: 'takten', value: 1.02, unit: 'gånger', limit: '≤ 1,6', verdict: 'inom', source: 'lång källa' },
        { key: 'skon', what: 'skon', value: 3, unit: 'nivåer', limit: '≤ 2', verdict: 'utanför', source: 'lång källa' },
        { key: 'gront', what: 'det gröna', value: 0.01, unit: '%', limit: '≤ 0,1', verdict: 'inom', source: 'lång källa' },
      ],
    }),
  );
}

function clipEntry(file: string, seat: number, index: number) {
  return {
    file,
    group: 'clips',
    title: `Prov ${seat}-${index}`,
    status: 'att granska',
    dealer: 'prova',
    use: 'dealerfilm',
    view: { kind: 'spelaren' },
    pose: 'redo → redo',
    seat,
    index,
    action: 'deal',
    take: 1,
    move: 'rorelse',
    lands: { seat, index, at: 1.8 },
    source: { from: 'runway', sha256: sha(file), references: [{ role: 'startFrame', what: ANCHOR }] },
  };
}

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'tagningar-'));
  put('hemlig.txt', 'utanför paketen');
  createRegister(root, { about: 'prov', statuses: { 'att granska': 'väntar', godkänd: 'ja', utgår: 'nej' }, asksWhy: [], groups: { clips: 'klipp' }, sources: { runway: { what: 'filmmodellen' } } });
  for (const [file, seat, index] of [[KEPT, 2, 0], [FAILED, 3, 1]] as const) {
    put(`assets/${file}`, file);
    addEntry(root, clipEntry(file, seat, index));
  }
  pack('prova_vy_rorelse_2-0_t1', KEPT, 2, 0, true);
  pack('prova_vy_rorelse_3-1_t1', FAILED, 3, 1, true);
  pack('prova_vy_rorelse_4-0_t1', 'dealers/prova/clips/rorelse-4-0_vy_t1.mp4', 4, 0, false);
  addOrder(root, { at: '2026-11-19 01:00', model: 'filmmodell', kind: 'film', inputs: JSON.stringify({ duration: 3 }), credits: 64, balanceBefore: 100, balanceAfter: 36, basis: 'mätt', result: KEPT, note: 'at är tiden då filmen togs emot' });
  setStatus(root, FAILED, 'utgår', 'granskaren: påhittat skäl', '2026-11-19 01:05');
  archive(root, FAILED, 'underkänd i provet', '2026-11-19 01:06');

  server = createServer(handler(createApi(root, () => '2026-11-19 01:10'), (_request, response) => void response.writeHead(418).end()));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

/** En förfrågan med vägen exakt som den skrivs, utan att fetch först städar bort ../ ur den. */
function raw(path: string): Promise<number> {
  return new Promise((done, fail) => {
    httpRequest({ host: '127.0.0.1', port, path }, (response) => {
      response.resume();
      done(response.statusCode ?? 0);
    })
      .on('error', fail)
      .end();
  });
}

test('listan bär registrets klipp med paket, det arkiverade underkända och paketet som väntar', async () => {
  const response = await fetch(`${base}/api/tagningar`);
  assert.equal(response.status, 200);
  const { takes, waiting } = (await response.json()) as Takes;
  assert.deepEqual(
    takes.map((take) => [take.id, take.file, take.status, take.present, take.archived?.why ?? null]),
    [
      ['prova_vy_rorelse_2-0_t1', KEPT, 'att granska', true, null],
      ['prova_vy_rorelse_3-1_t1', FAILED, 'utgår', false, 'underkänd i provet'],
    ],
  );
  const [kept, failed] = takes;
  assert.equal(kept!.anchor, ANCHOR);
  assert.deepEqual(kept!.files, ['referens.mp4', 'ark.jpg']);
  assert.deepEqual(failed!.files, ['referens.mp4', 'ark.jpg', 'klippet.mp4']);
  assert.equal(failed!.statusBy, 'granskaren: påhittat skäl');
  assert.deepEqual(kept!.order, { at: '2026-11-19 01:00', model: 'filmmodell', credits: 64, basis: 'mätt', seconds: 3, received: true });
  assert.deepEqual(kept!.judged!.shown.map((one) => [one.key, one.verdict]), [['takt', 'inom'], ['skon', 'utanför']], 'de alltid visade måtten och de utanför sin gräns');
  assert.deepEqual([kept!.judged!.inside, kept!.judged!.total], [2, 3]);
  assert.equal('source' in kept!.judged!.shown[0]!, false, 'gränsernas källor följer inte med');
  assert.deepEqual(kept!.reference, { frames: 72, fps: 24, seconds: 3 });
  assert.deepEqual(waiting.map((one) => [one.id, one.seat, one.index, one.view, one.anchor]), [['prova_vy_rorelse_4-0_t1', 4, 0, 'vy', ANCHOR]]);
});

test('en fil ur ett paket lämnas ut, och det arkiverade klippet ur arkivet', async () => {
  const doll = await fetch(`${base}/tagning/prova_vy_rorelse_2-0_t1/referens.mp4`);
  assert.deepEqual([doll.status, doll.headers.get('content-type'), await doll.text()], [200, 'video/mp4', 'docka prova_vy_rorelse_2-0_t1']);
  const sheet = await fetch(`${base}/tagning/prova_vy_rorelse_3-1_t1/ark.jpg`);
  assert.equal(sheet.status, 200);
  const archived = await fetch(`${base}/tagning/prova_vy_rorelse_3-1_t1/klippet.mp4`);
  assert.deepEqual([archived.status, await archived.text()], [200, FAILED]);
  // Ett klipp som står i assets/ hämtas genom /media/, inte här.
  assert.equal(await raw('/tagning/prova_vy_rorelse_2-0_t1/klippet.mp4'), 404);
  assert.equal(await raw('/tagning/prova_vy_rorelse_2-0_t1/bevis.mp4'), 404, 'en fil som paketet inte har');
});

test('annat än paketets visade filer, och sökvägar utanför paketen, nekas', async () => {
  for (const path of [
    '/tagning/prova_vy_rorelse_2-0_t1/bestallning.json',
    '/tagning/prova_vy_rorelse_2-0_t1/text.txt',
    '/tagning/prova_vy_rorelse_2-0_t1/matning.json',
    '/tagning/..%2F..%2Fhemlig.txt/referens.mp4',
    '/tagning/prova_vy_rorelse_2-0_t1/..%2F..%2F..%2Fhemlig.txt',
    '/tagning/prova_vy_rorelse_2-0_t1/referens.mp4/mer',
    '/tagning/finns-inte/referens.mp4',
    '/tagning/..%2Fassets/referens.mp4',
  ]) {
    assert.equal(await raw(path), 404, path);
  }
  // Ett ../ som står öppet i vägen städas bort av adressen innan servern ser den: den når aldrig tagningarnas väg.
  assert.equal(await raw('/tagning/../../hemlig.txt'), 418);
});

test('filmen som skickades läses ur beställningen: dockans film, ett klipp i dess ställe, eller ingen', () => {
  const doll = { file: 'output/tagningar/p/referens.mp4', frames: 72, fps: 24, durationSeconds: 3 };
  const clip = { file: 'output/tagningar/p/referensklipp.mp4', asset: KEPT, frames: 73, fps: 24, durationSeconds: 3.04 };
  assert.deepEqual(sentOf({ inputs: { referenceVideos: [doll] } }), { kind: 'docka', role: 'referenceVideos', asset: null, frames: 72, fps: 24, seconds: 3 });
  assert.deepEqual(sentOf({ inputs: { referenceVideos: [clip] }, motionFrom: { file: KEPT, role: 'referenceVideos' } }), { kind: 'klipp', role: 'referenceVideos', asset: KEPT, frames: 73, fps: 24, seconds: 3.04 });
  assert.deepEqual(sentOf({ inputs: { referenceVideo: clip } }).role, 'referenceVideo', 'video till video');
  assert.deepEqual(sentOf({ inputs: { startFrame: {}, endFrame: {} } }), { kind: 'ingen', role: null, asset: null, frames: null, fps: null, seconds: null });
});

test('filmens steg räknas ur klippets post: dockans film som referens är steg 2, annars steg 3', async () => {
  const post = (...references: { role: string; what: string }[]) => ({ source: { references: [{ role: 'startFrame', what: ANCHOR }, ...references] } });
  const doll = { role: 'referenceVideos[0]', what: 'output/tagningar/p/referens.mp4 (förlagan output/forlagor/docka.mp4): dockan gör rorelse' };
  const clip = { role: 'referenceVideos[0]', what: `output/tagningar/p/referensklipp.mp4: det godkända klippet ${KEPT}` };
  assert.equal(filmStep(post(doll)), 2, 'prototypen följer dockan');
  assert.equal(filmStep(post()), 3, 'fritt, utan referensfilm');
  assert.equal(filmStep(post(clip)), 3, 'ett klipp som rörelsereferens');
  assert.equal(filmStep(post({ role: 'referenceVideo', what: `det godkända klippet ${KEPT} som filmen som görs om` })), 3, 'video till video');
  assert.equal(filmStep(post({ role: 'referenceImages[0]', what: 'output/tagningar/p/forsta.png' }, clip)), 3, 'en referensbild är ingen film');
  assert.equal(filmStep({}), 3, 'en post utan referenser');

  // Servern bär steget till Labbet: i tagningarna och i registret.
  const { takes } = (await (await fetch(`${base}/api/tagningar`)).json()) as Takes;
  assert.deepEqual(takes.map((take) => take.step), [3, 3], 'provets klipp har ingen referensfilm i sina poster');
  const registry = (await (await fetch(`${base}/api/registry`)).json()) as { assets: { file: string; step?: number }[] };
  assert.deepEqual(registry.assets.map((entry) => [entry.file, entry.step]), [[KEPT, 3]]);
});
