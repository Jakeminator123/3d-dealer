// Helfigurens lokala steg: mätning och sammanläggning, utan betald generering.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  composeRedo,
  handsOf,
  matchHands,
  measureAgainst,
  measureFigure,
  readFigureFrame,
  type Picture,
  type Rgb,
} from './helfigur.ts';

const root = resolve(import.meta.dirname, '..', '..');
const green: Rgb = [2, 182, 48];

function blank(width: number, height: number, colour: Rgb): Picture {
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = colour[0];
    data[i * 3 + 1] = colour[1];
    data[i * 3 + 2] = colour[2];
  }
  return { data, width, height };
}

function paint(picture: Picture, box: { x0: number; y0: number; x1: number; y1: number }, colour: Rgb): void {
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const i = (y * picture.width + x) * 3;
      picture.data[i] = colour[0];
      picture.data[i + 1] = colour[1];
      picture.data[i + 2] = colour[2];
    }
  }
}

test('content/figure-frame.json går att läsa', () => {
  const frame = readFigureFrame(root);
  assert.equal(frame.green.rgb[1], 182);
  assert.equal(frame.poses.vila.hands.length, 2);
  assert.equal(frame.handLimit.px, 25);
});

test('mätningen hittar figuren och händerna på en syntetisk bild', () => {
  const picture = blank(1920, 1080, green);
  paint(picture, { x0: 760, y0: 45, x1: 1152, y1: 1042 }, [40, 40, 40]);
  paint(picture, { x0: 792, y0: 496, x1: 868, y1: 568 }, [180, 140, 120]);
  paint(picture, { x0: 1056, y0: 492, x1: 1128, y1: 568 }, [180, 140, 120]);
  const measured = measureFigure(picture);
  assert.deepEqual(measured.corner, green);
  assert.ok(measured.figure.x0 <= 760 && measured.figure.x1 >= 1151);
  const hands = handsOf(measured, { y0: 400, y1: 700 });
  assert.equal(hands.length, 2);
  const match = matchHands(hands, [
    { x0: 792, y0: 496, x1: 868, y1: 568 },
    { x0: 1056, y0: 492, x1: 1128, y1: 568 },
  ], 25);
  assert.equal(match.within, true);
});

test('measureAgainst skiljer händernas rutor från matchningen', () => {
  const template = readFigureFrame(root);
  const picture = blank(1920, 1080, green);
  const pose = template.poses.vila;
  paint(picture, pose.figure, [40, 40, 40]);
  for (const hand of pose.hands) paint(picture, hand, [180, 140, 120]);
  const report = measureAgainst(picture, 'vila', template);
  assert.equal(report.hands.length, 2);
  assert.equal(report.handMatch.length, 2);
  assert.equal(report.within, true);
});

test('sammanläggningen behåller VILA utanför REDO-området', () => {
  const vila = blank(1920, 1080, green);
  paint(vila, { x0: 800, y0: 500, x1: 900, y1: 600 }, [10, 10, 10]);
  const redo = blank(1920, 1080, green);
  paint(redo, { x0: 800, y0: 500, x1: 900, y1: 600 }, [10, 10, 10]);
  paint(redo, { x0: 1200, y0: 480, x1: 1300, y1: 520 }, [200, 150, 130]);
  const composed = composeRedo(vila, redo, { x0: 1040, y0: 236, x1: 1919, y1: 686 });
  assert.equal(composed.report.changedOutside, 0);
  assert.ok(composed.report.fromRedo > 0);
  // En bildpunkt till vänster om området ska vara oförändrad.
  const i = (550 * 1920 + 850) * 3;
  assert.equal(composed.picture.data[i], 10);
});

test('mallens referensfiler står i registret', () => {
  const template = readFigureFrame(root);
  const registry = JSON.parse(readFileSync(join(root, 'content', 'assets.json'), 'utf8')) as {
    assets: { file: string }[];
  };
  const files = new Set(registry.assets.map((asset) => asset.file));
  assert.ok(files.has(template.reference.vila));
  assert.ok(files.has(template.reference.redo));
  assert.ok(files.has(template.reference.clips['vila-redo']!));
});
