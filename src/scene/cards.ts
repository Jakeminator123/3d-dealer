// Ett kort på filten: scenens eget kort, med valör och färg, liggande på en kortplats. Det är kortet som syns i spelet.
// Dealerns film bär bara ett märkkort; när det ligger nycklas dess blå bort och det här kortet syns under handen.
// Var kortet ligger räknas i geometry.ts (cardCorners) ur beskrivningens tal.

import * as THREE from 'three';
import type { FeltPoint, SceneDescription, Vec3 } from './description.ts';
import { cardCorners } from './geometry.ts';

/**
 * Ett kort att visa: var det ligger, vad det är (till exempel `A♠` eller `10♥`; null för ett kort med baksidan upp,
 * dealerns hålkort), och vilket av kortplatsens kort det är (0 är det första). Ett senare kort ligger en korttjocklek
 * högre, ovanpå de tidigare.
 */
export type CardFace = { place: FeltPoint; face: string | null; index?: number };

// Kortets bild ritas så här många bildpunkter per meter: 63 × 88 mm blir 252 × 352.
const PER_METRE = 4000;

const css = (rgb: [number, number, number]): string => `rgb(${rgb.join(', ')})`;

/**
 * Kortets framsida som bild: med rundade hörn, valören och färgen i två hörn och färgen stor i mitten. Samma bild målas
 * på filmens märkkort medan det är i luften (key.ts), så att valören syns från att framsidan vänds upp.
 */
export function cardFaceImage(scene: SceneDescription, face: string): HTMLCanvasElement {
  const width = Math.round(scene.card.width * PER_METRE);
  const height = Math.round(scene.card.height * PER_METRE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const suit = face.slice(-1);
  const rank = face.slice(0, -1);
  const corner = scene.card.corner * PER_METRE;
  context.fillStyle = css(scene.card.colours.face);
  context.beginPath();
  context.roundRect(0, 0, width, height, corner);
  context.fill();
  context.strokeStyle = css(scene.card.colours.edge);
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

/** Kortets baksida som bild: rundade hörn i baksidans färg, med en kant i framsidans färg som märkkortet målas med. */
function backImage(scene: SceneDescription): HTMLCanvasElement {
  const width = Math.round(scene.card.width * PER_METRE);
  const height = Math.round(scene.card.height * PER_METRE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const corner = scene.card.corner * PER_METRE;
  context.fillStyle = css(scene.card.colours.face);
  context.beginPath();
  context.roundRect(0, 0, width, height, corner);
  context.fill();
  const border = Math.round(width * 0.07);
  context.fillStyle = css(scene.card.colours.back);
  context.beginPath();
  context.roundRect(border, border, width - 2 * border, height - 2 * border, Math.max(0, corner - border / 2));
  context.fill();
  return canvas;
}

export type Card = { mesh: THREE.Mesh; dispose(): void };

/**
 * Hörnen av ett kort som ligger på sin plats: bortre vänstra, bortre högra, hitre högra, hitre vänstra (kortets bild
 * uppe till vänster, uppe till höger, nere till höger, nere till vänster), där bordets lutning lägger dem, strax över
 * filten och under dealerfilmens liggande del. Kortplatsens senare kort ligger ovanpå.
 */
export function lyingCorners(scene: SceneDescription, card: Pick<CardFace, 'place' | 'index'>): Vec3[] {
  const lift = scene.card.lift + (card.index ?? 0) * scene.card.thickness;
  return cardCorners(scene, card.place).map((corner): Vec3 => [corner[0], corner[1] + lift, corner[2]]);
}

/**
 * Ett kort liggande på sin plats, framsidan upp (baksidan när `face` är null), med överkanten bort från spelaren.
 * `anisotropy` håller bilden skarp sedd snett.
 */
export function createCard(scene: SceneDescription, card: CardFace, anisotropy: number): Card {
  // Handen ritas över kortet: det ligger under dealerfilmens liggande del.
  const corners = lyingCorners(scene, card);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
  geometry.setIndex([0, 3, 2, 0, 2, 1]);
  geometry.computeVertexNormals();
  const texture = new THREE.CanvasTexture(card.face === null ? backImage(scene) : cardFaceImage(scene, card.face));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const shadow = contactShadow(scene, corners, mesh);
  return {
    mesh,
    dispose() {
      geometry.dispose();
      texture.dispose();
      material.dispose();
      shadow.dispose();
    },
  };
}

// Kortets skugga mot filten (card.shadow i content/scene.json). Skuggan ritas så här långt under kortet, i meter, så att
// kortet döljer den där det ligger; filten under kortplatserna ligger lägre än så (table.model).
const SHADOW_BELOW = 0.00005;
// Kortet räknas som liggande på sin plats inom så här många meter och med ovansidan uppåt inom så här mycket (cosinus).
const AT_REST = [0.0005, 0.9999] as const;
// Skuggans mjuka kant börjar så här långt in under kortet, som andel av reach: vid kortets kant är den inte helt mörk.
// Med kanten helt mörk blev skuggan en svart linje längs kortets sidor (output/work/scen-bild/skugga-2-0-nara.png).
const SOFT_UNDER = 0.4;

const SHADOW_VERTEX = /* glsl */ `
attribute vec2 at;
varying vec2 vAt;
void main() {
  vAt = at;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// vAt är punkten i kortets mått: åt höger i kortets bild och bort från spelaren, i meter från kortets mitt.
const SHADOW_FRAGMENT = /* glsl */ `
uniform vec2 size;
uniform float corner, reach, strength, offset;
varying vec2 vAt;
// Avståndet till kortets kant med rundade hörn, negativt innanför.
float edge(vec2 p) {
  vec2 q = abs(p) - size + corner;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
}
void main() {
  // Under kortet syns ingen skugga. Skuggan är kortet flyttat mot spelaren, mjuk också in under kortets kant, och borta
  // reach utanför den.
  if (edge(vAt) < 0.0) discard;
  float shade = strength * (1.0 - smoothstep(${-SOFT_UNDER} * reach, reach, edge(vAt + vec2(0.0, offset))));
  if (shade < 0.002) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, shade);
}`;

/**
 * Kortets skugga på filten, som ett barn till kortet `mesh` med hörnen `corners` (lyingCorners). Skuggan ligger kvar på
 * filten där kortet ligger, också om kortet flyttas, och syns bara när kortet ligger där med ovansidan upp: ett kort som
 * lyfts, glider eller vänds har ingen skugga här.
 */
function contactShadow(scene: SceneDescription, corners: Vec3[], mesh: THREE.Mesh): { dispose(): void } {
  const { width, height, corner } = scene.card;
  const { reach, strength, offset } = scene.card.shadow;
  const [far, farRight, , near] = corners.map((point) => new THREE.Vector3(...point)) as THREE.Vector3[];
  const centre = corners.reduce((sum, point) => sum.add(new THREE.Vector3(...point)), new THREE.Vector3()).divideScalar(4);
  const right = farRight!.clone().sub(far!).normalize();
  const away = far!.clone().sub(near!).normalize();
  const out = { x: width / 2 + reach + offset, y: height / 2 + reach + offset };
  const at = [[-out.x, out.y], [out.x, out.y], [out.x, -out.y], [-out.x, -out.y]];
  const points = at.flatMap(([x, y]) => centre.clone().addScaledVector(right, x!).addScaledVector(away, y!).add(new THREE.Vector3(0, -SHADOW_BELOW, 0)).toArray());
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('at', new THREE.Float32BufferAttribute(at.flat() as number[], 2));
  geometry.setIndex([0, 3, 2, 0, 2, 1]);
  const uniforms = {
    size: { value: new THREE.Vector2(width / 2, height / 2) },
    corner: { value: corner },
    reach: { value: reach },
    strength: { value: strength },
    offset: { value: offset },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: SHADOW_VERTEX, fragmentShader: SHADOW_FRAGMENT, transparent: true, depthWrite: false });
  const shadow = new THREE.Mesh(geometry, material);
  shadow.frustumCulled = false;
  // Skuggans hörn står i scenens mått: kortets egen flytt följer inte med.
  shadow.matrixAutoUpdate = false;
  shadow.matrixWorldAutoUpdate = false;
  const now = new THREE.Vector3();
  const up = new THREE.Vector3();
  shadow.onBeforeRender = () => {
    const box = mesh.geometry.boundingBox ?? (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox!);
    box.getCenter(now).applyMatrix4(mesh.matrixWorld);
    up.set(0, 1, 0).transformDirection(mesh.matrixWorld);
    uniforms.strength.value = now.distanceTo(centre) < AT_REST[0] && up.y > AT_REST[1] ? strength : 0;
  };
  mesh.add(shadow);
  return {
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
