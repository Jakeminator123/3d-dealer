// Räknar dockans rörelse till en plats (moveFor i src/scene/dollPose.ts) utanför sidans tråd, så att reglagen i steget
// Dockan går att dra medan den räknas: en plats tar en halv sekund eller så. Sidan skickar scenen och dockans mått en
// gång, given en gång per giv, och sedan cykeln med de värden som ställts; svaret är rörelsen, som sidan spelar med
// poseAt. Fel kommer tillbaka med sitt skäl, på svenska som läsarna skriver det.

import { readScene, type SceneDescription } from '../scene/description.ts';
import { isCycle, moveFor, readCycle, readDoll, readMove, type Action, type DollDescription, type DollMove, type Seat } from '../scene/dollPose.ts';

export type Asked =
  | { kind: 'scene'; scene: unknown; doll: unknown }
  | { kind: 'give'; name: string; give: unknown }
  | { kind: 'move'; id: number; give: string; cycle: unknown | null; seat: Seat; index: number; action: Action };
export type Answer = { kind: 'move'; id: number; move: DollMove } | { kind: 'error'; id: number; error: string };

let scene: SceneDescription | null = null;
let doll: DollDescription | null = null;
const gives = new Map<string, DollMove>();

self.onmessage = (event: MessageEvent<Asked>) => {
  const asked = event.data;
  if (asked.kind === 'scene') {
    scene = readScene(asked.scene);
    doll = readDoll(asked.doll);
    return;
  }
  if (asked.kind === 'give') {
    gives.set(asked.name, readMove(asked.give));
    return;
  }
  let answer: Answer;
  try {
    const base = gives.get(asked.give);
    if (!scene || !doll || !base) throw new Error('Scenen, dockan eller given är inte läst än');
    const cycle = asked.cycle !== null && isCycle(asked.cycle) ? readCycle(asked.cycle) : undefined;
    const move = moveFor(scene, doll, base, asked.seat, { index: asked.index, ...(cycle ? { cycle, action: asked.action } : {}) });
    answer = { kind: 'move', id: asked.id, move };
  } catch (error) {
    answer = { kind: 'error', id: asked.id, error: (error as Error).message };
  }
  self.postMessage(answer);
};
