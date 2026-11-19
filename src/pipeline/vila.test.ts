// Den vilande armen: en konstgjord film i en tillfällig mapp där en hudfärgad "hand" glider 10 bp och en mörk "arm" står
// still. Handen och armbågen letas i första rutan; handen ska ha rört sig och armbågen inte.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { dollPoints, readAnkare } from './ankare.ts';
import { readCycleParts } from './cykel.ts';
import { firstFrame } from './matning.ts';
import { restMotion, restPlaces } from './vila.ts';

const root = resolve(import.meta.dirname, '..', '..');

test('den vilande handen som glider 10 bp mäts så, och en arm som står still mäts still', async () => {
  const content = readAnkare(root);
  const parts = readCycleParts(content.underlag.move, root);
  const view = { kind: 'spelaren' } as const;
  const doll = dollPoints(parts, view, content, root);
  const key = JSON.parse(readFileSync(join(root, 'content', 'scene.json'), 'utf8')).studio.colours.screen as [number, number, number];
  const hand = { x: Math.round(doll.rest.hand.x), y: Math.round(doll.rest.hand.y) };
  const dir = mkdtempSync(join(tmpdir(), 'vila-'));
  try {
    const film = join(dir, 'vila.mp4');
    const hex = (rgb: number[]) => `0x${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    // Bakgrunden i skärmens gröna, armen mörk från ovanför axlarna ned till handen, och handen hudfärgad, 10 bp på 0,5 s.
    execFileSync('ffmpeg', [
      '-v', 'error', '-y',
      '-f', 'lavfi', '-i', `color=c=${hex(key)}:s=1920x1080:r=24:d=0.5`,
      '-f', 'lavfi', '-i', 'color=c=0x202020:s=240x420:r=24:d=0.5',
      '-f', 'lavfi', '-i', 'color=c=0xd8a088:s=90x44:r=24:d=0.5',
      '-filter_complex', `[0:v][1:v]overlay=x=${hand.x - 230}:y=${hand.y - 440}[a];[a][2:v]overlay=x='${hand.x - 45}+20*t':y=${hand.y - 22}[v]`,
      '-map', '[v]', '-c:v', 'libx264', '-crf', '8', '-pix_fmt', 'yuv444p', film,
    ]);
    const frame = { width: 1920, height: 1080 };
    const places = restPlaces(parts, view, { seat: content.underlag.seat, index: content.underlag.index, action: 'deal' }, await firstFrame(film, frame), key);
    if (!places) throw new Error('den vilande handen hittades inte');
    assert.ok(places.hand.x0 <= hand.x - 45 && places.hand.x1 >= hand.x + 45, 'handens ruta kring handen');
    assert.equal(places.side, -1, 'den vilande sidan till vänster i bild');
    const values = await restMotion(film, frame, 24, places, key);
    assert.ok(values.vilaHandBp! >= 3 && values.vilaHandBp! <= 7, `handen ${values.vilaHandBp} bp från sin median`);
    assert.ok(values.vilaHandCm! > 0 && values.vilaHandCm! < values.vilaHandBp!, 'i cm');
    assert.ok(values.vilaArmbageBp! <= 1, `armbågen ${values.vilaArmbageBp} bp`);
    assert.ok(values.vilaFingrar! > 0, 'formen ändras när handen glider');
    // En grön ruta utan dealer: armen går inte att mäta, och måtten saknas.
    const green = { data: Buffer.alloc(1920 * 1080 * 3), width: 1920, height: 1080 };
    for (let p = 0; p < 1920 * 1080; p++) green.data.set(key, p * 3);
    assert.equal(restPlaces(parts, view, { seat: content.underlag.seat, index: content.underlag.index, action: 'deal' }, green, key), null);
    assert.equal((await restMotion(film, frame, 24, null, key)).vilaHandBp, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
