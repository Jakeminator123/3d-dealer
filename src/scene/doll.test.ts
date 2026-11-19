// Dockan i three (doll.ts): att rörelsen går att byta medan hon står i scenen, utan att något byggs om. Rörelserna är
// cykeln i content/moves/ till två platser; ingen yta ritas, bara punkterna prövas.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import * as THREE from 'three';
import { readScene } from './description.ts';
import { createDoll } from './doll.ts';
import { moveFor, readCycle, readDoll, readMove } from './dollPose.ts';

// Node har ingen ritning per skärmruta. Dockan spelas inte här, men att ställa tiden pausar henne först.
globalThis.cancelAnimationFrame ??= () => {};

const root = resolve(import.meta.dirname, '..', '..');
const read = (file: string): unknown => JSON.parse(readFileSync(join(root, 'content', file), 'utf8'));
const scene = readScene(read('scene.json'));
const doll = readDoll(read('doll.json'));
const cycle = readCycle(read('moves/cykel-nyp-rask.json'));
const base = readMove(read(`moves/${cycle.give}.json`));

/** Världens läge för varje del av dockan, i den ordning de ligger i gruppen. */
const positions = (group: THREE.Group): number[][] => {
  group.updateMatrixWorld(true);
  return group.children.map((part) => part.getWorldPosition(new THREE.Vector3()).toArray());
};

test('dockan byter rörelse utan att byggas om: tiden står kvar och ställningen är den nya rörelsens', () => {
  const toFour = moveFor(scene, doll, base, 4, { cycle });
  const toOne = moveFor(scene, doll, base, 1, { cycle });
  let drawn = 0;
  const made = createDoll(scene, doll, toFour, () => drawn++);
  const parts = made.group.children.length;

  void made.clip.seek(1.7);
  const atFour = positions(made.group);
  const before = drawn;
  made.setMove(toOne);
  assert.ok(drawn > before, 'ställningen ritas om när rörelsen byts');
  assert.equal(made.clip.time(), 1.7, 'tiden står kvar');
  assert.equal(made.group.children.length, parts, 'samma delar: ingenting byggs om');
  const atOne = positions(made.group);
  assert.notDeepEqual(atOne, atFour, 'handen och kortet står där rörelsen till plats 1 har dem');

  // Samma rörelse till plats 1 i en docka som byggts med den från början ger samma ställning.
  const fresh = createDoll(scene, doll, toOne, () => {});
  void fresh.clip.seek(1.7);
  assert.deepEqual(atOne, positions(fresh.group));

  // En kortare rörelse håller tiden inom sin längd, och längden är den nya rörelsens.
  const shorter = { ...toOne, seconds: 1 };
  made.setMove(shorter);
  assert.equal(made.clip.seconds(), 1);
  assert.equal(made.clip.time(), 1);
  made.dispose();
  fresh.dispose();
});
