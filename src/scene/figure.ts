// Helfiguren: dealern som film eller stillbild på en upprätt yta bakom bordet. Bilden visar en sittande person på grön
// skärm, utan bord: bordet i scenen står framför henne och döljer underkroppen, och händerna hamnar vid bordskanten.
// Var ytan står räknas i geometry.ts (figureCorners) ur beskrivningens tal. Bilden läses i picture.ts, och den gröna
// skärmen nycklas bort (key.ts).
//
// Helfiguren i scenen är en förlaga: ur den sparas bilder och klipp som underlag för de filmer som görs sedan.

import * as THREE from 'three';
import type { SceneDescription } from './description.ts';
import { figureCorners } from './geometry.ts';
import { createKey } from './key.ts';
import { loadPicture, type Clip } from './picture.ts';

export type { Clip } from './picture.ts';

export type Figure = {
  mesh: THREE.Mesh;
  /** Filmen, när helfiguren är en film. Null för en stillbild. */
  clip: Clip | null;
  /** Uppfylls när första rutan är läst, eller filen har visat sig oläsbar. */
  ready: Promise<void>;
  dispose(): void;
};

/**
 * Helfiguren för scenen, med filmen eller stillbilden på adressen `url`. `anisotropy` är grafikkortets högsta.
 * `changed` anropas för varje ny ruta, `problem` när filen inte gick att läsa.
 */
export function createFigure(scene: SceneDescription, url: string, anisotropy: number, changed: () => void, problem: (text: string) => void): Figure {
  // En fyrhörning med hörnen medurs i bild från övre vänstra. Rutans överkant ligger där v är 1.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(figureCorners(scene).flat(), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
  geometry.setIndex([0, 3, 2, 0, 2, 1]);

  const picture = loadPicture(
    url,
    anisotropy,
    () => {
      key.setScreen(...picture.screen());
      picture.texture.needsUpdate = true;
      mesh.visible = true;
      changed();
    },
    changed,
    problem,
    'Dealerns bild',
  );
  const key = createKey(picture.texture, scene.figure.frame);
  const mesh = new THREE.Mesh(geometry, key.material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  // Samma plats i ritordningen som den vikta ytans upprätta del: efter rummet och golvets skugga.
  mesh.renderOrder = 1;

  return {
    mesh,
    clip: picture.clip,
    ready: picture.ready,
    dispose() {
      picture.dispose();
      geometry.dispose();
      key.material.dispose();
    },
  };
}
