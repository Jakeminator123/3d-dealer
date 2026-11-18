// Sparar en förlaga ur scenen: en stillbild eller ett klipp, ruta för ruta, ur en fast vy.
// Scenen ritar rutorna och servern sparar dem under output/forlagor/ och sätter ihop klippet (src/pipeline/forlaga.ts).

import type { Background, CardNote, DealerNote, SceneHandle, Studio, View } from '../scene/build.ts';
import type { Frame } from '../scene/description.ts';

/** Det en förlaga sparas ur: vyn, dealern, bakgrunden med sina reglage eller ateljén, och rutan och takten den sparas i. */
export type ForlagaOrder = {
  view: View;
  dealer: DealerNote | null;
  /** Bakgrunden som registrets `file`, med reglagens värden. Null utan rum. */
  background: (Omit<Background, 'url'> & { file: string }) | null;
  /** Ateljén, när scenen står i den. */
  studio: Studio | null;
  shoe: boolean;
  /** Om kortplatserna är utritade på filten. */
  places?: boolean;
  /** Scenens kort på en kortplats, när ett sådant ligger där. */
  card?: CardNote;
  frame: Frame;
  fps: number;
  /** Ett ord som skiljer förlagan från andra ur samma uppställning. */
  label?: string;
};

/** Det servern svarar när förlagan är sparad: namnet och filerna, räknade från projektmappen. */
export type Saved = { name: string; file: string; json: string; frames: number; seconds: number };

async function answer<T>(response: Response, failure: string): Promise<T> {
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(problem?.error ?? `${failure} (${response.status})`);
  }
  return (await response.json()) as T;
}

/**
 * Sparar en förlaga. En stillbild är scenen som den står nu, med dealerns film på den ruta den visar. Ett klipp är hela
 * dealerns film: ruta i ställs på tiden (i + 0,5) / takten, mitt i rutan, så att varje ruta i filmen ritas en gång.
 * `onProgress` får veta hur många rutor som är sparade. Filmen fortsätter efteråt om den gick förut.
 */
export async function saveForlaga(
  handle: SceneHandle,
  order: ForlagaOrder,
  still: boolean,
  onProgress: (done: number, of: number) => void = () => {},
): Promise<Saved> {
  const clip = handle.clip;
  if (!still && !clip) throw new Error('Ett klipp behöver en dealer i film');
  const wasPlaying = clip?.playing() ?? false;
  clip?.pause();
  const times = still ? [clip ? clip.time() : null] : Array.from({ length: Math.round(clip!.seconds() * order.fps) }, (_, index) => (index + 0.5) / order.fps);
  if (times.length === 0) throw new Error('Dealerns film är inte läst än');

  const shoot = handle.shoot(order.view, order.frame);
  try {
    const { position, forward, focalPx } = shoot.eye;
    const started = await answer<{ name: string }>(
      await fetch('/api/forlaga/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...order,
          still,
          frames: times.length,
          eye: { position, forward, focalPx },
          dealer: order.dealer && { ...order.dealer, ...(still && times[0] !== null ? { time: times[0] } : {}) },
        }),
      }),
      'Förlagan gick inte att börja',
    );
    let saved: Saved | null = null;
    for (const [index, time] of times.entries()) {
      if (clip && time !== null) await clip.seek(time);
      const picture = await shoot.take();
      const reply = await answer<{ saved: Saved | null }>(
        await fetch(`/api/forlaga/${started.name}/${index}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: picture }),
        `Ruta ${index + 1} gick inte att spara`,
      );
      saved = reply.saved;
      onProgress(index + 1, times.length);
    }
    if (!saved) throw new Error('Servern satte inte ihop förlagan');
    return saved;
  } finally {
    shoot.end();
    if (wasPlaying) clip?.play();
  }
}
