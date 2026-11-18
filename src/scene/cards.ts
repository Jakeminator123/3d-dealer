// Ett kort på filten: scenens eget kort, med valör och färg, liggande på en kortplats. Det är kortet som syns i spelet.
// Dealerns film bär bara ett märkkort; när det ligger nycklas dess blå bort och det här kortet syns under handen.
// Var kortet ligger räknas i geometry.ts (cardCorners) ur beskrivningens tal.

import * as THREE from 'three';
import type { FeltPoint, SceneDescription } from './description.ts';
import { cardCorners } from './geometry.ts';

/** Ett kort att visa: var det ligger och vad det är, till exempel `A♠` eller `10♥`. */
export type CardFace = { place: FeltPoint; face: string };

// Kortets bild ritas så här många bildpunkter per meter: 63 × 88 mm blir 252 × 352.
const PER_METRE = 4000;

/** Kortets framsida som bild: vit med rundade hörn, valören och färgen i två hörn och färgen stor i mitten. */
function faceImage(scene: SceneDescription, face: string): HTMLCanvasElement {
  const width = Math.round(scene.card.width * PER_METRE);
  const height = Math.round(scene.card.height * PER_METRE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const suit = face.slice(-1);
  const rank = face.slice(0, -1);
  const corner = scene.card.corner * PER_METRE;
  context.fillStyle = '#fbfaf6';
  context.beginPath();
  context.roundRect(0, 0, width, height, corner);
  context.fill();
  context.strokeStyle = '#c9c6bd';
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = suit === '♥' || suit === '♦' ? '#c8102e' : '#16181d';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const mark = (): void => {
    context.font = `600 ${Math.round(height * 0.16)}px Georgia, 'Times New Roman', serif`;
    context.fillText(rank, width * 0.15, height * 0.11);
    context.font = `${Math.round(height * 0.13)}px 'Segoe UI Symbol', 'Arial Unicode MS', sans-serif`;
    context.fillText(suit, width * 0.15, height * 0.24);
  };
  mark();
  context.save();
  context.translate(width, height);
  context.rotate(Math.PI);
  mark();
  context.restore();
  context.font = `${Math.round(height * 0.34)}px 'Segoe UI Symbol', 'Arial Unicode MS', sans-serif`;
  context.fillText(suit, width / 2, height / 2);
  return canvas;
}

export type Card = { mesh: THREE.Mesh; dispose(): void };

/** Ett kort liggande på sin plats, framsidan upp, med överkanten bort från spelaren. `anisotropy` håller bilden skarp sedd snett. */
export function createCard(scene: SceneDescription, card: CardFace, anisotropy: number): Card {
  // Hörnen: bortre vänstra, bortre högra, hitre högra, hitre vänstra, där bordets lutning lägger dem, strax över filten
  // och under dealerfilmens liggande del, så att handen ritas över kortet.
  const corners = cardCorners(scene, card.place).map((corner) => [corner[0], corner[1] + scene.card.lift, corner[2]]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
  geometry.setIndex([0, 3, 2, 0, 2, 1]);
  geometry.computeVertexNormals();
  const texture = new THREE.CanvasTexture(faceImage(scene, card.face));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() {
      geometry.dispose();
      texture.dispose();
      material.dispose();
    },
  };
}
