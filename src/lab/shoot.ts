// Sparar en förlaga utan att någon klickar. Beställningen står i adressen, /lab/forlaga.html?order=<JSON>, och svaret
// läggs i window.shot när förlagan är sparad eller har misslyckats. Sidan öppnas av src/pipeline/shoot.ts i en huvudlös
// webbläsare; i Labbet sparas samma sak med knapparna i steget Scen. Båda går genom saveForlaga.

import { buildScene, type Background, type Dealer, type DealerNote } from '../scene/build.ts';
import { readScene, type Frame, type SceneDescription } from '../scene/description.ts';
import { isCycle, moveFor, readCycle, readDoll, readMove } from '../scene/dollPose.ts';
import { saveForlaga, type ForlagaOrder, type Saved } from './forlaga.ts';
import { mediaUrl } from './registry.ts';

/**
 * Beställningen: det förlagan sparas ur, och om den är en stillbild eller ett klipp. `time` ställer dealerns film eller
 * dockans rörelse på en tid innan en stillbild tas. Rutan och takten är scenens förlaga om inget annat sägs.
 */
type Shot = Omit<ForlagaOrder, 'frame' | 'fps'> & { still: boolean; time?: number; frame?: Frame; fps?: number };
type Answer = { ok: true; saved: Saved; problems: string[] } | { ok: false; error: string; problems: string[] };

declare global {
  interface Window {
    shot?: Answer;
    progress?: { done: number; of: number };
  }
}

async function json(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} gick inte att läsa (${response.status})`);
  return response.json();
}

/**
 * Dealern så som scenen bygger den: dockans mått och rörelse läses ur content/, och rörelsen ställs om till platsen och
 * kortplatsen. En cykel läses med sin giv och spelas på givens egen plats om ingen annan sägs.
 */
async function dealerOf(scene: SceneDescription, note: DealerNote | null): Promise<Dealer | null> {
  if (!note) return null;
  if (note.kind !== 'docka') return note;
  const doll = readDoll(await json('/content/doll.json'));
  const read = await json(`/content/moves/${note.move}.json`);
  const cycle = isCycle(read) ? readCycle(read) : undefined;
  const base = readMove(cycle ? await json(`/content/moves/${cycle.give}.json`) : read);
  const placed = note.seat !== undefined || note.index !== undefined || cycle;
  const move = placed ? moveFor(scene, doll, base, note.seat ?? base.seat, { index: note.index, cycle }) : base;
  return { kind: 'docka', doll, move, pose: note.pose };
}

async function shoot(problems: string[]): Promise<Saved> {
  const raw = new URLSearchParams(location.search).get('order');
  if (!raw) throw new Error('Adressen bär ingen beställning (?order=)');
  const shot = JSON.parse(raw) as Shot;
  const scene = readScene(await json('/content/scene.json'));
  const frame = shot.frame ?? scene.forlaga.frame;
  const fps = shot.fps ?? scene.forlaga.fps;

  const host = document.getElementById('stage')!;
  host.style.width = `${frame.width}px`;
  host.style.height = `${frame.height}px`;
  const handle = buildScene(host, scene, { urlOf: mediaUrl, dealer: await dealerOf(scene, shot.dealer), onProblem: (text) => problems.push(text), pixelRatio: 1 });
  handle.resize(frame.width, frame.height);
  handle.setStudio(shot.studio);
  handle.setShoe(shot.shoe);
  handle.setPlaces(shot.places === true);
  handle.setCard(shot.card ?? null);
  handle.setView(shot.view);
  const background: Background | null = shot.background ? { ...shot.background, url: mediaUrl(shot.background.file) } : null;
  await Promise.all([handle.ready, handle.setBackground(background)]);
  if (problems.length > 0) throw new Error(problems.join('; '));

  if (shot.still && handle.clip) await handle.clip.seek(shot.time ?? 0);
  const { still, time: _time, frame: _frame, fps: _fps, ...order } = shot;
  return saveForlaga(handle, { ...order, frame, fps }, still, (done, of) => {
    window.progress = { done, of };
  });
}

const problems: string[] = [];
shoot(problems).then(
  (saved) => {
    window.shot = { ok: true, saved, problems };
  },
  (error: Error) => {
    window.shot = { ok: false, error: error.message, problems };
  },
);
