// Det Labbets scen läser och skickar utöver registret: beskrivningarna i content/, rundan som spelkärnan delar
// (/api/runda) och kortplanen som steget Kortplan sparar (/api/kortplan).

import { readScene, type SceneDescription } from '../scene/description.ts';
import { readDoll, type DollDescription } from '../scene/dollPose.ts';
import type { CardPlan } from '../scene/plan.ts';
import { readRound, type DealtRound, type Round } from '../scene/round.ts';

/** En beskrivning ur content/, läst med `read`. `what` är vad den heter i ett fel. */
export async function fetchContent<T>(file: string, what: string, read: (value: unknown) => T): Promise<T> {
  const response = await fetch(`/content/${file}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${what} gick inte att läsa (${response.status})`);
  return read(await response.json());
}

/** Rundan som spelkärnan delar efter content/runda.json. */
export async function fetchDealt(): Promise<DealtRound> {
  const response = await fetch('/api/runda');
  const body = (await response.json().catch(() => null)) as (DealtRound & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(`Spelkärnan delade ingen runda: ${body?.error ?? response.status}`);
  return body;
}

/**
 * Scenen, dockans mått (där kortet står i skons mynning) och rundan, ur content/, och rundan som spelkärnan har delat
 * efter den (servern, /api/runda).
 */
export type Content = { scene: SceneDescription; doll: DollDescription; round: Round; dealt: DealtRound };

export async function fetchAll(): Promise<Content> {
  const [scene, doll, round, dealt] = await Promise.all([
    fetchContent('scene.json', 'Scenens beskrivning', readScene),
    fetchContent('doll.json', 'Dockans mått', readDoll),
    fetchContent('runda.json', 'Rundan', readRound),
    fetchDealt(),
  ]);
  return { scene, doll, round, dealt };
}

/** Sparar kortplanen i content/scene.json genom servern, och ger den som den står efteråt, eller serverns skäl. */
export async function savePlan(plan: CardPlan): Promise<CardPlan> {
  const response = await fetch('/api/kortplan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plan) });
  const body = (await response.json().catch(() => null)) as { plan?: CardPlan; error?: string } | null;
  if (!response.ok || !body?.plan) throw new Error(body?.error ?? `Kortplanen sparades inte (${response.status})`);
  return body.plan;
}
