// Dealerfilmen på den vikta ytan. Filmen är gjord i närbilden av en vy, över scenens bord som det står, och projiceras
// tillbaka genom samma öga: upprätt på dealerns bordskant ovanför vecket, liggande på filten nedanför. Sedd ur det ögat är
// den därför bilden som den är; från andra håll följer händerna bordet och kroppen är platt.
// Bilden läses i picture.ts, film eller stillbild, och dess gröna skärm nycklas bort (key.ts).
//
// Filmen är en följd av klipp (reel.ts) som spelas efter varandra på samma yta: när ett klipp är slut står dess sista
// ruta kvar tills nästa klipps första ruta är framme, och efter sista klippet står dess sista ruta kvar. Ett ensamt klipp
// är en följd med ett klipp. Samma fil två gånger i följden läses en gång.
//
// Har följden ett vänta-klipp (`wait`) spelas det efter sista klippet, ett varv i taget, så länge följden väntar: i en
// följd som börjar om tills väntans varv har fyllt följdens längd, annars tills någon ställer om följden. Väntan är en
// del efter följdens sista (index `parts.length`), med sin egen film.
//
// En del utan fil (spelkärnans fallback, ett kort som saknar klipp) har ingen film: dealern står i REDO, på förra
// klippets sista ruta (eller nästa klipps första, när inget klipp har gått före), medan tiden går och scenens kort
// glider dit självt (build.ts). Alla klipp börjar och slutar i REDO, så rutan är dealern i REDO.

import * as THREE from 'three';
import type { CardSpot, ClipCard } from './dealer.ts';
import type { SceneDescription, Vec3 } from './description.ts';
import { foldSurfaces, fovYDeg, see, type Eye, type Pixel } from './geometry.ts';
import { createKey } from './key.ts';
import { loadPicture, type Clip, type Picture } from './picture.ts';
import { makeReel, partEnd, placeIn, reelEnd, type Reel } from './reel.ts';

export type Film = {
  /** Den upprätta delen: står på dealerns bordskant. */
  upright: THREE.Mesh;
  /** Den liggande delen: ligger på filten och hör hemma bland det som lutar med bordet. Dess lägen står som på ett olutat bord. */
  lying: THREE.Mesh;
  /** Följden som en film: hela dess tid, med sista rutan kvar eller väntan på slutet. Null när bilden är en stillbild. */
  clip: Clip | null;
  /** Uppfylls när alla klipp är lästa, eller har visat sig oläsbara. */
  ready: Promise<void>;
  /** Följdens tidslinje: klippens längder och kort. Null tills klippen är lästa. */
  reel(): Reel | null;
  /** Tar bort märkkortets blå ur bilden, eller målar det som kortets framsida. */
  setMarker(gone: boolean): void;
  dispose(): void;
};

/**
 * Ett klipp i följden: adressen till filen och kortet klippet lägger. Utan adress (`url: null`) är det en del utan film,
 * `seconds` lång, där kortet går självt från `from`.
 */
export type FilmPart = { url: string | null; seconds?: number; card?: ClipCard; from?: CardSpot | 'skon' };

// Följden står på ett klipps sista ruta så här långt före dess slut, i sekunder: inom sista rutan för varje takt.
const LAST_FRAME = 0.001;

const isFilm = (url: string): boolean => /\.(mp4|webm)(\?|$)/i.test(url);

/**
 * Den vikta ytan för scenen, med klippen `parts` lagda genom ögat `eye` som de är gjorda i, efter varandra. Sista rutan
 * står kvar `hold` sekunder efter sista klippet, och sedan börjar följden om; med `loop` falskt står den kvar.
 * `wait` är adressen till vänta-klippet: med det väntar dealern efter sista klippet i stället för att sista rutan står
 * kvar, i hela varv som täcker `hold` innan följden börjar om, och med `loop` falskt tills följden ställs om.
 * `anisotropy` är grafikkortets högsta, så att den liggande delen håller skärpan sedd snett. `changed` anropas när
 * bilden har ändrats, `problem` när något inte gick att läsa. `shoeCard` är hörnen av kortet i skons mynning i scenen
 * (hämtstället, pickUpCard i dollPose.ts): nyckeln ritar märkkortets kant bara där kortets egen kant syns (marker.ts).
 * Utan det ritas kanten mot allt som inte är kort eller hud.
 */
export function createFilm(
  scene: SceneDescription,
  eye: Eye,
  parts: FilmPart[],
  hold: number,
  anisotropy: number,
  changed: () => void,
  problem: (text: string) => void,
  shoeCard: Vec3[] | null = null,
  loop = true,
  wait: string | null = null,
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

  // En följd har en tidslinje när varje del är en film eller en del utan film. En ensam stillbild har ingen.
  const films = parts.every((part) => part.url === null || isFilm(part.url));
  if (!films && parts.length > 1) problem('En följd kan bara ha filmer; en stillbild står ensam');

  let closed = false;
  // Följdens läge. `current` är delen som visas. `pinned` är följdens tid när den står still: efter en förflyttning,
  // i en skarv och när den är slut. Null medan den går: då räknas tiden ur klippets egen film, eller, i en del utan
  // film, ur klockan sedan delen började (`still`).
  let current = 0;
  let pinned: number | null = 0;
  let still: { from: number; since: number } | null = null;
  let wanted = true;
  let reel: Reel | null = null;
  // I väntan: följdens tid där det pågående varvet började.
  let turnFrom = 0;
  // Varje förflyttning och skarv får ett nummer; en som har blivit ersatt av en senare gör ingenting när den är klar.
  let turn = 0;
  let resting = 0;
  let ticking = 0;

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
  const sequence = parts.map((part) => (part.url === null ? null : pictureOf(part.url)));
  // Bilden varje del visar: sin egen film, eller i en del utan film förra klippets sista ruta (`end`), eller nästa
  // klipps första när inget klipp har gått före. Null när följden inte har någon film alls.
  const showing = parts.map((_, index): { picture: Picture; end: boolean } | null => {
    if (sequence[index]) return { picture: sequence[index]!, end: false };
    for (let before = index - 1; before >= 0; before--) if (sequence[before]) return { picture: sequence[before]!, end: true };
    for (let after = index + 1; after < parts.length; after++) if (sequence[after]) return { picture: sequence[after]!, end: false };
    return null;
  });
  // Väntan: delen efter följdens sista, med vänta-klippets film. Bara en följd av filmer kan vänta.
  const WAIT = parts.length;
  if (wait !== null && !isFilm(wait)) problem('Vänta-klippet måste vara en film');
  const waiting = wait !== null && films && isFilm(wait) ? pictureOf(wait) : null;
  sequence.push(waiting);
  showing.push(waiting ? { picture: waiting, end: false } : null);
  const shown = (): Picture | null => showing[current]?.picture ?? null;
  /** Där delen `index` börjar i följdens tid; väntan där dess pågående varv började. */
  const startOf = (index: number): number => (index === WAIT ? turnFrom : reel!.starts[index]!);
  /** Om följden väntar efter sista klippet: den har ett vänta-klipp som gick att läsa. */
  const waits = (): boolean => waiting !== null && reel?.wait !== undefined;

  // Kortet i skons mynning så som filmens öga ser det.
  const seen = shoeCard?.map((corner) => see(eye, corner)) ?? null;
  const shoeCardSeen = seen && seen.every((pixel): pixel is Pixel => pixel !== null) ? seen : null;
  const first = sequence.find((picture) => picture !== null) ?? null;
  const key = createKey(first?.texture ?? new THREE.Texture(), eye.frame, projection, scene.card.colours, shoeCardSeen, scene.room.dealerShadow);
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

  /** Visar delen `index`: dess bild på ytan och dess skärmfärg i nyckeln. Utan bild syns ingen dealer. */
  function show(index: number): void {
    current = index;
    const picture = shown();
    if (!picture) {
      upright.visible = lying.visible = false;
      changed();
      return;
    }
    key.setMap(picture.texture);
    // Kortet som klippet lägger målas med sin valör medan det är i luften (key.ts). En del utan film lägger inget i bild.
    key.setCard(scene, parts[index]?.url ? parts[index].card : null);
    const screen = screens.get(picture);
    if (screen) {
      key.setScreen(...screen);
      upright.visible = lying.visible = true;
      picture.texture.needsUpdate = true;
    }
    changed();
  }

  /**
   * Följdens tid medan den går: klippets början och tiden i klippets film, eller klockan i en del utan film. I väntan
   * varvets början och tiden i vänta-klippet.
   */
  const running = (): number => {
    if (!reel) return 0;
    if (still) return Math.min(partEnd(reel, current), still.from + (performance.now() - still.since) / 1000);
    return startOf(current) + (sequence[current]?.clip?.time() ?? 0);
  };

  /**
   * Ställer delen `index` på tiden `local` och visar den. En del utan film visar sin bild på förra klippets sista ruta
   * eller nästa klipps första. Uppfylls när rutan är framme, om ingen annan har tagit över.
   */
  async function cue(index: number, local: number, mine: number): Promise<boolean> {
    const view = showing[index];
    const clip = view?.picture.clip ?? null;
    const seconds = clip?.seconds() ?? 0;
    // Den som ställer en annan bild än den som visas pausar den som visas, så att den inte går vidare under bytet.
    const before = shown();
    if (before && before !== view?.picture) before.clip?.pause();
    const at = sequence[index] ? Math.min(local, Math.max(0, seconds - LAST_FRAME)) : view?.end ? Math.max(0, seconds - LAST_FRAME) : 0;
    // Står delen redan stilla på den tiden och visas (en följd som har ställts och sedan spelas) ställs filmen inte om:
    // en film som ställs på den tid den står på visar ingen ny ruta, och rutan väntades då in förgäves (picture.ts,
    // SEEK_PATIENCE).
    const there = current === index && before === view?.picture && clip !== null && !clip.playing() && Math.abs(clip.time() - at) < 1e-6;
    if (clip && !there) await clip.seek(at);
    if (closed || mine !== turn) return false;
    show(index);
    return true;
  }

  /**
   * Spelar följden från delen `index`, tiden `local` in i den. Medan rutan ställs står följden på `standing`: i en skarv
   * förra delens slut, så att kortet och märkkortet följer rutan som syns.
   */
  function go(index: number, local: number, mine: number, standing = startOf(index) + local): void {
    pinned = standing;
    still = null;
    void cue(index, local, mine).then((ok) => {
      if (!ok || !wanted || !reel) return;
      if (sequence[index]) {
        pinned = null;
        sequence[index]!.clip?.play();
        return;
      }
      // En del utan film: klockan går, och scenen ritas om för varje ruta medan kortet glider.
      still = { from: reel.starts[index]! + local, since: performance.now() };
      pinned = null;
      const tick = (): void => {
        if (closed || mine !== turn || !wanted || !still || !reel) return;
        if (running() >= partEnd(reel, index)) {
          still = null;
          return next(index, mine);
        }
        changed();
        ticking = requestAnimationFrame(tick);
      };
      changed();
      ticking = requestAnimationFrame(tick);
    });
  }

  /** Följden väntar från ett varv som börjar `from` i följdens tid, `local` in i varvet. */
  function waitFrom(from: number, local: number, mine: number, standing = from + local): void {
    turnFrom = from;
    go(WAIT, local, mine, standing);
  }

  /**
   * Delen `index` är slut: nästa börjar, eller följden väntar, eller sista rutan står kvar. När ett varv av väntan är
   * slut börjar nästa varv, eller, i en följd som börjar om, följden från början när väntan har fyllt dess längd.
   */
  function next(index: number, mine: number): void {
    if (!reel) return;
    if (index === WAIT) {
      const end = turnFrom + reel.wait!;
      if (loop && end >= reel.seconds - LAST_FRAME) return restart();
      return waitFrom(end, 0, mine, end - LAST_FRAME);
    }
    const end = Math.max(reel.starts[index]!, partEnd(reel, index) - LAST_FRAME);
    if (index < reel.parts.length - 1) return go(index + 1, 0, mine, end);
    if (waits()) return waitFrom(reelEnd(reel), 0, mine, end);
    pinned = reel.seconds;
    changed();
    if (!loop) return;
    // Sista rutan står kvar, och sedan börjar följden om.
    resting = window.setTimeout(() => {
      if (mine === turn && wanted) restart();
    }, reel.hold * 1000);
  }

  /** En film har gått till slut: om det är klippet som spelas, är dess del slut. */
  function finished(picture: Picture): void {
    if (closed || !reel || !wanted || pinned !== null || still || sequence[current] !== picture) return;
    next(current, ++turn);
  }

  function restart(): void {
    go(0, 0, ++turn);
  }

  const ready = Promise.all(sequence.flatMap((picture) => (picture ? [picture.ready] : []))).then(() => {
    if (closed) return;
    reel = makeReel(
      parts.map((part, index) => ({
        seconds: sequence[index] ? (sequence[index]!.clip?.seconds() ?? 0) : Math.max(0, part.seconds ?? 0),
        ...(part.card ? { card: part.card } : {}),
        ...(part.from ? { from: part.from } : {}),
      })),
      hold,
      // Ett vänta-klipp som inte gick att läsa har ingen längd: då står sista rutan kvar, som utan vänta-klipp.
      waiting?.clip?.seconds() || undefined,
    );
    show(0);
    if (wanted && films) restart();
  });

  const stop = (): void => {
    clearTimeout(resting);
    cancelAnimationFrame(ticking);
  };

  const clip: Clip | null = films
    ? {
        seconds: () => reel?.seconds ?? 0,
        time: () => pinned ?? running(),
        playing: () => wanted,
        play() {
          wanted = true;
          if (!reel) return;
          if (pinned === null) {
            if (!still) sequence[current]?.clip?.play();
            return;
          }
          // Från slutet börjar följden om; annars går den vidare där den står. En följd som väntar väntar vidare från
          // där den står, och börjar om först när väntan har fyllt följdens längd (med `loop`).
          if (pinned >= reelEnd(reel) - LAST_FRAME) {
            if (!waits() || (loop && pinned >= reel.seconds - LAST_FRAME)) return restart();
            const { turn: round, local } = placeIn(reel, Math.max(pinned, reelEnd(reel))).wait!;
            return waitFrom(reelEnd(reel) + round * reel.wait!, local, ++turn);
          }
          const place = placeIn(reel, pinned);
          go(place.index, place.local, ++turn);
        },
        pause() {
          wanted = false;
          turn++;
          stop();
          if (pinned === null) pinned = running();
          still = null;
          for (const picture of pictures.values()) picture.clip?.pause();
          changed();
        },
        async seek(time) {
          wanted = false;
          const mine = ++turn;
          stop();
          still = null;
          pinned = time;
          if (!reel) await ready;
          if (!reel || closed) return;
          const place = placeIn(reel, time);
          if (place.wait && waits()) {
            turnFrom = reelEnd(reel) + place.wait.turn * reel.wait!;
            await cue(WAIT, place.wait.local, mine);
          } else await cue(place.index, place.local, mine);
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
      stop();
      for (const picture of pictures.values()) picture.dispose();
      for (const geometry of geometries) geometry.dispose();
      key.material.dispose();
    },
  };
}
