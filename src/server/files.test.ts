import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { test } from 'node:test';
import { pathInside, sendFile } from './files.ts';

test('en sökväg godtas bara om den stannar i mappen', () => {
  const base = join(tmpdir(), 'bas');
  assert.equal(pathInside(base, 'a/b.png'), join(base, 'a', 'b.png'));
  assert.equal(pathInside(base, 'tv%C3%A5%20ord.png'), join(base, 'två ord.png'));
  assert.equal(pathInside(base, '../bas2/x.png'), null);
  assert.equal(pathInside(base, '..%5Cx.png'), null);
  assert.equal(pathInside(base, `a/../../x.png`), null);
  assert.equal(pathInside(base, '%E0%A4%A'), null, 'trasig kodning');
  assert.equal(pathInside(base, 'a%00.png'), null);
  assert.equal(pathInside(base, ''), null, 'mappen själv är ingen fil i mappen');
  assert.ok(pathInside(base, 'a')!.startsWith(base + sep));
});

test('filen stängs när mottagaren avbryter mitt i överföringen', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'files-'));
  const big = join(folder, 'stor.mp4');
  writeFileSync(big, Buffer.alloc(8 * 1024 * 1024, 1));

  let reading: Readable | null = null;
  const server = createServer((incoming, response) => {
    reading = sendFile(incoming, response, big);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;

  try {
    await new Promise<void>((done, fail) => {
      const asking = request({ host: '127.0.0.1', port, path: '/' }, (response) => {
        response.once('data', () => {
          response.destroy();
          done();
        });
      });
      asking.on('error', fail).end();
    });

    const stream = reading as Readable | null;
    assert.ok(stream, 'en läsning startades');
    const deadline = Date.now() + 3000;
    while (!stream.destroyed && Date.now() < deadline) await new Promise((wait) => setTimeout(wait, 20));
    assert.equal(stream.destroyed, true, 'läsningen av filen ska vara avslutad');
  } finally {
    server.closeAllConnections();
    server.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
