// Dealern som bild på den vikta ytan. Bilden projiceras från kameran den är gjord genom: upprätt på dealerns bordskant
// ovanför vecket, liggande på filten nedanför. Sedd från den kameran är den därför bilden som den är; från andra håll
// följer händerna bordet.
// Bilden läses i picture.ts, film eller stillbild, och dess gröna skärm nycklas bort (key.ts).
//
// Två slags bilder läggs här. Ett gammalt ankare är gjort genom filmkameran över ett olutat bord, med bordskant och sko
// inbakade. En dealerfilm är gjord i närbilden av en vy, över scenens bord som det står, lutat. Helfiguren, dealern utan
// bord på en upprätt yta, står i figure.ts.

import * as THREE from 'three';
import type { SceneDescription } from './description.ts';
import { foldSurfaces, fovYDeg, type Eye, type Pixel } from './geometry.ts';
import { createKey } from './key.ts';
import { loadPicture, type Clip } from './picture.ts';

/**
 * Kameran en dealerbild är gjord genom. `level` är sant när bilden är gjord över ett olutat bord: då läggs den liggande
 * delen på filten som kameran såg ett olutat bord, och lutar sedan med bordet. Annars läggs bilden där kameran ser
 * scenen som den står.
 */
export type FilmCamera = { eye: Eye; level: boolean };

export type Film = {
  /** Den upprätta delen: står på dealerns bordskant. */
  upright: THREE.Mesh;
  /** Den liggande delen: ligger på filten och hör hemma bland det som lutar med bordet. Dess lägen står som på ett olutat bord. */
  lying: THREE.Mesh;
  /** Filmen, när bilden är en film. Null för en stillbild. */
  clip: Clip | null;
  /** Uppfylls när bilden är läst, eller har visat sig oläsbar. */
  ready: Promise<void>;
  /**
   * Tar bort det en stillbild har där ett föremål i scenen står: konturen, i rutans bildpunkter, målas över med skärmens
   * färg innan bilden nycklas. Null lämnar bilden som den är. En film målas inte över.
   */
  cover(outline: Pixel[] | null): void;
  /** Tar bort märkkortets blå ur bilden, eller låter det vara. */
  setMarker(gone: boolean): void;
  dispose(): void;
};

// Hur långt utanför ett föremåls kontur bilden målas över, i rutans bildpunkter. Skomodellens kontur följer inte den
// inbakade skon exakt: mätt som mest 14,7 bildpunkter i ankaret VILA (output/scen-matning/sko-pass.ts).
const COVER_MARGIN = 20;

/**
 * Den vikta ytan för scenen, med bilden på adressen `url` lagd genom `camera`. `anisotropy` är grafikkortets högsta, så
 * att den liggande delen håller skärpan sedd snett. `changed` anropas när bilden har ändrats, `problem` när den inte gick att läsa.
 */
export function createFilm(
  scene: SceneDescription,
  camera: FilmCamera,
  url: string,
  anisotropy: number,
  changed: () => void,
  problem: (text: string) => void,
): Film {
  const { eye } = camera;
  const { width, height } = eye.frame;

  // Kamerans egen projektion, oberoende av varifrån scenen betraktas.
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

  let covered: Pixel[] | null = null;
  let closed = false;
  // En stillbild som ska målas över ritas av på en egen yta, som sedan är texturens bild.
  let canvas: HTMLCanvasElement | null = null;

  function paint(): void {
    if (closed || !upright.visible) return;
    const [r, g, b] = picture.screen();
    key.setScreen(r, g, b);
    if (!picture.clip && covered && covered.length >= 3) {
      canvas ??= document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      context.drawImage(picture.element, 0, 0, width, height);
      context.fillStyle = context.strokeStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
      context.lineJoin = 'round';
      context.lineWidth = 2 * COVER_MARGIN;
      context.beginPath();
      // En bildpunkts mitt ligger en halv enhet in på ritytan.
      covered.forEach((point, index) => (index === 0 ? context.moveTo(point.x + 0.5, point.y + 0.5) : context.lineTo(point.x + 0.5, point.y + 0.5)));
      context.closePath();
      context.fill();
      context.stroke();
      picture.texture.image = canvas;
    } else if (!picture.clip) {
      picture.texture.image = picture.element;
    }
    picture.texture.needsUpdate = true;
    changed();
  }

  const picture = loadPicture(
    url,
    anisotropy,
    () => {
      upright.visible = lying.visible = true;
      paint();
    },
    changed,
    problem,
    'Dealerns bild',
  );
  const key = createKey(picture.texture, eye.frame, projection, !camera.level);
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

  return {
    upright,
    lying,
    clip: picture.clip,
    ready: picture.ready,
    cover(outline) {
      covered = outline;
      paint();
    },
    setMarker(gone) {
      key.setMarker(gone);
      changed();
    },
    dispose() {
      closed = true;
      picture.dispose();
      for (const geometry of geometries) geometry.dispose();
      key.material.dispose();
    },
  };
}
