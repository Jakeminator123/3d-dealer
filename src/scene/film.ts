// Dealerfilmen på den vikta ytan. Filmen är gjord i närbilden av en vy, över scenens bord som det står, och projiceras
// tillbaka genom samma öga: upprätt på dealerns bordskant ovanför vecket, liggande på filten nedanför. Sedd ur det ögat är
// den därför bilden som den är; från andra håll följer händerna bordet och kroppen är platt.
// Bilden läses i picture.ts, film eller stillbild, och dess gröna skärm nycklas bort (key.ts).
//
// Filmen är en följd av klipp (reel.ts) som spelas efter varandra på samma yta: när ett klipp är slut står dess sista
// ruta kvar tills nästa klipps första ruta är framme, och efter sista klippet står dess sista ruta kvar. Ett ensamt klipp
// är en följd med ett klipp. Samma fil två gånger i följden läses en gång.

import * as THREE from 'three';
import type { ClipCard } from './dealer.ts';
import type { SceneDescription } from './description.ts';
import { foldSurfaces, fovYDeg, type Eye } from './geometry.ts';
import { createKey } from './key.ts';
import { loadPicture, type Clip, type Picture } from './picture.ts';
import { makeReel, placeIn, reelEnd, type Reel } from './reel.ts';

export type Film = {
  /** Den upprätta delen: står på dealerns bordskant. */
  upright: THREE.Mesh;
  /** Den liggande delen: ligger på filten och hör hemma bland det som lutar med bordet. Dess lägen står som på ett olutat bord. */
  lying: THREE.Mesh;
  /** Följden som en film: hela dess tid, med sista rutan kvar på slutet. Null när bilden är en stillbild. */
  clip: Clip | null;
  /** Uppfylls när alla klipp är lästa, eller har visat sig oläsbara. */
  ready: Promise<void>;
  /** Följdens tidslinje: klippens längder och kort. Null tills klippen är lästa. */
  reel(): Reel | null;
  /** Tar bort märkkortets blå ur bilden, eller målar det som kortets framsida. */
  setMarker(gone: boolean): void;
  dispose(): void;
};

/** Ett klipp i följden: adressen till filen och kortet klippet lägger. */
export type FilmPart = { url: string; card?: ClipCard };

// Följden står på ett klipps sista ruta så här långt före dess slut, i sekunder: inom sista rutan för varje takt.
const LAST_FRAME = 0.001;

const isFilm = (url: string): boolean => /\.(mp4|webm)(\?|$)/i.test(url);

/**
 * Den vikta ytan för scenen, med klippen `parts` lagda genom ögat `eye` som de är gjorda i, efter varandra. Sista rutan
 * står kvar `hold` sekunder efter sista klippet. `anisotropy` är grafikkortets högsta, så att den liggande delen håller
 * skärpan sedd snett. `changed` anropas när bilden har ändrats, `problem` när något inte gick att läsa.
 */
export function createFilm(
  scene: SceneDescription,
  eye: Eye,
  parts: FilmPart[],
  hold: number,
  anisotropy: number,
  changed: () => void,
  problem: (text: string) => void,
): Film {
  if (parts.length === 0) throw new Error('Dealerns film har inga klipp');
  const { width, height } = eye.frame;

  // Ögats egen projektion, oberoende av varifrån scenen betraktas.
  const projector = new THREE.PerspectiveCamera(fovYDeg(eye), width / height, 0.1, 100);
  projector.position.set(...eye.position);
  projector.lookAt(eye.position[0] + eye.forward[0], eye.position[1] + eye.forward[1], eye.position[2] + eye.forward[2]);
  projector.updateMatrixWorld();
  const projection = new THREE.Matrix4().multiplyMatrices(projector.projectionMatrix, projector.matrixWorldInverse);

  // Två fyrhörningar: den upprätta delen och den liggande.
  const surfaces = foldSurfaces(scene);
  const quad = (points: number[][]): THREE.BufferGeometry => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setIndex([0, 3, 2, 0, 2, 1]);
    return geometry;
  };
  const geometries = [quad(surfaces.upright), quad(surfaces.felt)];

  const films = parts.every((part) => isFilm(part.url));
  if (!films && parts.length > 1) problem('En följd kan bara ha filmer; en stillbild står ensam');

  let closed = false;
  // Följdens läge. `current` är klippet som visas. `pinned` är följdens tid när den står still: efter en förflyttning,
  // i en skarv och när den är slut. Null medan klippet går, och då räknas tiden ur klippets egen film.
  let current = 0;
  let pinned: number | null = 0;
  let wanted = true;
  let reel: Reel | null = null;
  // Varje förflyttning och skarv får ett nummer; en som har blivit ersatt av en senare gör ingenting när den är klar.
  let turn = 0;
  let resting = 0;

  // Varje fil läses en gång, och dess skärmfärg läses ur dess första ruta.
  const pictures = new Map<string, Picture>();
  const screens = new Map<Picture, [number, number, number]>();
  const pictureOf = (url: string): Picture => {
    const known = pictures.get(url);
    if (known) return known;
    const picture = loadPicture(
      url,
      anisotropy,
      () => {
        if (closed) return;
        screens.set(picture, picture.screen());
        if (picture === shown()) show(current);
        changed();
      },
      changed,
      problem,
      'Dealerns bild',
      () => finished(picture),
    );
    pictures.set(url, picture);
    return picture;
  };
  const sequence = parts.map((part) => pictureOf(part.url));
  const shown = (): Picture => sequence[current]!;

  const key = createKey(sequence[0]!.texture, eye.frame, projection, scene.card.colours);
  // Kroppen ritas före händerna, som ligger framför den på bordet.
  const layer = (geometry: THREE.BufferGeometry, order: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, key.material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = order;
    return mesh;
  };
  const upright = layer(geometries[0]!, 1);
  const lying = layer(geometries[1]!, 2);

  /** Visar klippet `index`: dess bild på ytan och dess skärmfärg i nyckeln. */
  function show(index: number): void {
    current = index;
    const picture = sequence[index]!;
    key.setMap(picture.texture);
    const screen = screens.get(picture);
    if (screen) {
      key.setScreen(...screen);
      upright.visible = lying.visible = true;
      picture.texture.needsUpdate = true;
    }
    changed();
  }

  /** Följdens tid medan den går: klippets början och tiden i klippets film. */
  const running = (): number => (reel ? reel.starts[current]! + (shown().clip?.time() ?? 0) : 0);

  /** Ställer klippet `index` på tiden `local` och visar det. Uppfylls när rutan är framme, om ingen annan har tagit över. */
  async function cue(index: number, local: number, mine: number): Promise<boolean> {
    const clip = sequence[index]!.clip;
    const seconds = clip?.seconds() ?? 0;
    // Den som ställer ett annat klipp än det som visas pausar det som visas, så att det inte går vidare under bytet.
    if (index !== current) shown().clip?.pause();
    if (clip) await clip.seek(Math.min(local, Math.max(0, seconds - LAST_FRAME)));
    if (closed || mine !== turn) return false;
    show(index);
    return true;
  }

  /** Ett klipp har gått till slut: nästa börjar, eller sista rutan står kvar. */
  function finished(picture: Picture): void {
    if (closed || !reel || !wanted || picture !== shown() || pinned !== null) return;
    const mine = ++turn;
    const last = reel.parts.length - 1;
    // Under skarven står följden på klippets slut, så att kortet och märkkortet följer rutan som syns.
    pinned = reel.starts[current]! + Math.max(0, reel.parts[current]!.seconds - LAST_FRAME);
    if (current < last) {
      const next = current + 1;
      void cue(next, 0, mine).then((ok) => {
        if (!ok || !wanted) return;
        pinned = null;
        shown().clip?.play();
      });
    } else {
      pinned = reel.seconds;
      changed();
      // Sista rutan står kvar, och sedan börjar följden om.
      resting = window.setTimeout(() => {
        if (mine === turn && wanted) restart();
      }, reel.hold * 1000);
    }
  }

  function restart(): void {
    const mine = ++turn;
    pinned = 0;
    void cue(0, 0, mine).then((ok) => {
      if (!ok || !wanted) return;
      pinned = null;
      shown().clip?.play();
    });
  }

  const ready = Promise.all(sequence.map((picture) => picture.ready)).then(() => {
    if (closed) return;
    reel = makeReel(
      parts.map((part, index) => ({ seconds: sequence[index]!.clip?.seconds() ?? 0, ...(part.card ? { card: part.card } : {}) })),
      hold,
    );
    show(0);
    if (wanted && films) restart();
  });

  const clip: Clip | null = films
    ? {
        seconds: () => reel?.seconds ?? 0,
        time: () => pinned ?? running(),
        playing: () => wanted,
        play() {
          wanted = true;
          if (!reel) return;
          if (pinned === null) return shown().clip?.play();
          // Från slutet börjar följden om; annars går den vidare där den står.
          if (pinned >= reelEnd(reel) - LAST_FRAME) return restart();
          const mine = ++turn;
          const place = placeIn(reel, pinned);
          void cue(place.index, place.local, mine).then((ok) => {
            if (!ok || !wanted) return;
            pinned = null;
            shown().clip?.play();
          });
        },
        pause() {
          wanted = false;
          turn++;
          clearTimeout(resting);
          if (pinned === null) pinned = running();
          for (const picture of sequence) picture.clip?.pause();
          changed();
        },
        async seek(time) {
          wanted = false;
          const mine = ++turn;
          clearTimeout(resting);
          pinned = time;
          if (!reel) await ready;
          if (!reel || closed) return;
          const place = placeIn(reel, time);
          await cue(place.index, place.local, mine);
        },
      }
    : null;

  return {
    upright,
    lying,
    clip,
    ready,
    reel: () => reel,
    setMarker(gone) {
      key.setMarker(gone);
      changed();
    },
    dispose() {
      closed = true;
      clearTimeout(resting);
      for (const picture of pictures.values()) picture.dispose();
      for (const geometry of geometries) geometry.dispose();
      key.material.dispose();
    },
  };
}
