// Dealerfilmen på den vikta ytan. Filmen är gjord i närbilden av en vy, över scenens bord som det står, och projiceras
// tillbaka genom samma öga: upprätt på dealerns bordskant ovanför vecket, liggande på filten nedanför. Sedd ur det ögat är
// den därför bilden som den är; från andra håll följer händerna bordet och kroppen är platt.
// Bilden läses i picture.ts, film eller stillbild, och dess gröna skärm nycklas bort (key.ts).

import * as THREE from 'three';
import type { SceneDescription } from './description.ts';
import { foldSurfaces, fovYDeg, type Eye } from './geometry.ts';
import { createKey } from './key.ts';
import { loadPicture, type Clip } from './picture.ts';

export type Film = {
  /** Den upprätta delen: står på dealerns bordskant. */
  upright: THREE.Mesh;
  /** Den liggande delen: ligger på filten och hör hemma bland det som lutar med bordet. Dess lägen står som på ett olutat bord. */
  lying: THREE.Mesh;
  /** Filmen, när bilden är en film. Null för en stillbild. */
  clip: Clip | null;
  /** Uppfylls när bilden är läst, eller har visat sig oläsbar. */
  ready: Promise<void>;
  /** Tar bort märkkortets blå ur bilden, eller låter det vara. */
  setMarker(gone: boolean): void;
  dispose(): void;
};

/**
 * Den vikta ytan för scenen, med bilden på adressen `url` lagd genom ögat `eye` som den är gjord i. `anisotropy` är
 * grafikkortets högsta, så att den liggande delen håller skärpan sedd snett. `changed` anropas när bilden har ändrats,
 * `problem` när den inte gick att läsa.
 */
export function createFilm(
  scene: SceneDescription,
  eye: Eye,
  url: string,
  anisotropy: number,
  changed: () => void,
  problem: (text: string) => void,
): Film {
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

  let closed = false;
  const picture = loadPicture(
    url,
    anisotropy,
    () => {
      if (closed) return;
      upright.visible = lying.visible = true;
      key.setScreen(...picture.screen());
      picture.texture.needsUpdate = true;
      changed();
    },
    changed,
    problem,
    'Dealerns bild',
  );
  const key = createKey(picture.texture, eye.frame, projection);
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
