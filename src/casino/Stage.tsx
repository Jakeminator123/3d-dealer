// Scenen som Casinot och visningens hela giv spelar dealerns film i. En ny dealerfilm byggs i en egen scen bredvid den
// som syns, och tar dess plats först när bord, rum och klipp är lästa och filmen står där den ska börja, så att bordet
// inte blinkar mellan stegen. Väntar dealern i den som syns tar den nya över där hennes pågående varv slutar, i REDO,
// där den nya filmen börjar. Vyn (med närbild eller utan) och klippens fart ställs i den film som går, utan att scenen
// byggs om.

import { useEffect, useRef, type CSSProperties } from 'react';
import { buildScene, type Background, type FilmNote, type SceneHandle, type SeatView } from '../scene/build.ts';
import type { SceneDescription } from '../scene/description.ts';
import type { DollDescription } from '../scene/dollPose.ts';
import { nextStart, reelEnd } from '../scene/reel.ts';

type StageProps = {
  scene: SceneDescription;
  doll: DollDescription;
  background: Background | null;
  /** Adressen till en fil ur registret. */
  urlOf: (file: string) => string;
  /** Dealerns film, med klippens fart (FilmNote `speed`). En ny fart ställs i filmen som går; resten bygger om scenen. */
  dealer: FilmNote | null;
  /** Vyn scenen ses i, med närbild eller utan. */
  view: SeatView;
  /** Delen filmen börjar på, eller dess slut. */
  start: number | 'end';
  /**
   * Om filmen spelas därifrån när den är byggd, eller står still (en följd som väntar väntar då). Läses när en ny film
   * byggs, och bygger inte om den.
   */
  play: boolean;
  /** Hur länge en ny film högst väntar på att dealerns varv av väntan ska gå klart, i sekunder (content/runda.json). */
  most: number;
  /** Filmernas rutor per sekund (content/runda.json): en halv ruta från varvets slut räknas som slutet. */
  fps: number;
  /** Sägs till när filmen har lagt sitt sista kort. */
  onDone: () => void;
  /** Får det som hoppar fram till filmens slut. */
  skip: { current: () => void };
  onProblem: (text: string) => void;
  /** Får scenen som syns, när en ny har tagit plats. */
  onShown?: (handle: SceneHandle) => void;
};

// Hur länge, i millisekunder, en ny film väntar efter att varvet borde ha gått klart, om filmen som syns har stannat.
const TURN_PATIENCE = 500;

/**
 * Uppfylls när dealern i scenen `handle` har gått klart med sitt pågående varv av väntan (reel.ts, nextStart, högst
 * `most` sekunder), inom `near` sekunder från varvets slut. Direkt när hennes film inte går eller inte väntar, och när
 * `still` slutar vara sant.
 */
function turnOver(handle: SceneHandle | null, most: number, near: number, still: () => boolean): Promise<void> {
  const clip = handle?.clip;
  const reel = handle?.reel();
  if (!clip || !reel || reel.wait === undefined || !clip.playing()) return Promise.resolve();
  const from = clip.time();
  const at = nextStart(reel, from, most);
  if (at - from <= near) return Promise.resolve();
  const until = performance.now() + (at - from) * 1000 + TURN_PATIENCE;
  return new Promise((done) => {
    const look = (): void => {
      const now = clip.time();
      if (!still() || now >= at - near || now < from || performance.now() > until) return done();
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
}

/** Scenens sidförhållande för den som håller scenen (casino.css, --frame): stående får scenen den höjden. */
export const frameStyle = (scene: SceneDescription): CSSProperties => ({ ['--frame' as string]: `${scene.camera.frame.width} / ${scene.camera.frame.height}` });

export function Stage({ scene, doll, background, urlOf, dealer, view, start, play, most, fps, onDone, skip, onProblem, onShown }: StageProps) {
  const holder = useRef<HTMLDivElement>(null);
  const shown = useRef<{ handle: SceneHandle; layer: HTMLDivElement } | null>(null);
  // Scenerna som finns just nu: den som syns och en som byggs. Vyn och farten ställs i alla.
  const live = useRef(new Set<SceneHandle>());
  const done = useRef(onDone);
  done.current = onDone;
  const told = useRef(onShown);
  told.current = onShown;
  const playing = useRef(play);
  playing.current = play;
  const speed = dealer?.speed ?? 1;
  const pace = useRef(speed);
  pace.current = speed;
  const looking = useRef(view);
  looking.current = view;
  const viewKey = JSON.stringify(view);
  // Dealern utan sin fart: en ny fart bygger inte om scenen.
  const dealerKey = JSON.stringify(dealer && { ...dealer, speed: undefined });

  useEffect(() => {
    const host = holder.current!;
    const layer = document.createElement('div');
    layer.className = 'layer';
    layer.style.visibility = 'hidden';
    host.append(layer);
    let alive = true;
    let watching = 0;
    const note = JSON.parse(dealerKey) as FilmNote | null;
    const handle = buildScene(layer, scene, { urlOf, dealer: note && pace.current !== 1 ? { ...note, speed: pace.current } : note, doll, onProblem });
    live.current.add(handle);
    const fit = () => handle.resize(host.clientWidth, host.clientHeight);
    const watcher = new ResizeObserver(fit);
    watcher.observe(host);
    fit();
    handle.setView(looking.current);
    handle.setShoe(true);
    // Hoppa fram innan den nya filmen syns: den tar över direkt och hoppar till sitt slut.
    let hurry = false;
    skip.current = () => void (hurry = true);

    void Promise.all([handle.ready, handle.setBackground(background)]).then(async () => {
      if (!alive) return;
      const clip = handle.clip;
      const reel = handle.reel();
      const at = !reel ? 0 : start === 'end' ? reel.seconds : (reel.starts[start] ?? reel.seconds);
      if (clip) await clip.seek(at);
      if (!alive) return;
      await turnOver(shown.current?.handle ?? null, most, 0.5 / fps, () => alive && !hurry);
      if (!alive) return;
      layer.style.visibility = 'visible';
      const before = shown.current;
      shown.current = { handle, layer };
      if (before) {
        live.current.delete(before.handle);
        before.handle.dispose();
        before.layer.remove();
      }
      told.current?.(handle);
      if (!clip || !reel) return void done.current();
      // En följd som väntar går in i väntan när den har spelat klart, eller hoppats fram; annars står sista rutan kvar.
      const rest = () => {
        if (reel.wait !== undefined) clip.play();
      };
      if (!playing.current) {
        rest();
        return void done.current();
      }
      const finish = () => {
        cancelAnimationFrame(watching);
        if (alive) done.current();
      };
      // Följden läses om varje gång: farten kan ha ställts om sedan den byggdes.
      skip.current = () =>
        void clip.seek(handle.reel()?.seconds ?? reel.seconds).then(() => {
          if (!alive) return;
          rest();
          finish();
        });
      if (hurry) return skip.current();
      clip.play();
      const watch = () => {
        if (!alive) return;
        if (clip.time() >= reelEnd(handle.reel() ?? reel) - 1e-3) return finish();
        watching = requestAnimationFrame(watch);
      };
      watching = requestAnimationFrame(watch);
    });

    return () => {
      alive = false;
      cancelAnimationFrame(watching);
      watcher.disconnect();
      // Den som syns står kvar tills nästa är framme; en som aldrig kom fram städas bort direkt.
      if (shown.current?.handle !== handle) {
        live.current.delete(handle);
        handle.dispose();
        layer.remove();
      }
    };
  }, [scene, doll, background, urlOf, dealerKey, start, most, fps, onProblem, skip]);

  useEffect(() => {
    for (const handle of live.current) handle.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    for (const handle of live.current) handle.setView(JSON.parse(viewKey) as SeatView);
  }, [viewKey]);

  useEffect(
    () => () => {
      shown.current?.handle.dispose();
      shown.current?.layer.remove();
      shown.current = null;
      live.current.clear();
    },
    [],
  );

  const { width, height } = scene.camera.frame;
  return <div ref={holder} className="stage" role="img" aria-label="Bordet i 3D" style={{ aspectRatio: `${width} / ${height}`, width: `min(100cqw, 100cqh * ${width} / ${height})` }} />;
}
