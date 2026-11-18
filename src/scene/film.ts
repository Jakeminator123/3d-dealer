// Dealern som bild på den vikta ytan. Bilden projiceras från scenens kamera: upprätt på dealerns bordskant ovanför vecket,
// liggande på filten nedanför. Sedd från scenens kamera är den därför bilden som den är; från andra håll följer händerna bordet.
// Bildens gröna skärm nycklas bort.
//
// Än så länge visas en stillbild: ett ankare ur gamla projektets ruta som står in för dealern tills scenen har egna.
//
// Nyckeln är förd över ur gamla Dealer (src/scene3d-film.ts, FRAGMENT, commit 1198340774d8ee78be218506a169faeaa781fa22):
// skärmens andel av en bildpunkt, konturen indragen en bildpunkt, det gröna spillet och den rena kanten (edgeClean, där
// standard sedan 2026-11-13). Dess skuggor, kort och ljus är inte med.

import * as THREE from 'three';
import type { SceneDescription } from './description.ts';
import { fold, fovYDeg, sceneEye, type Pixel } from './geometry.ts';

export type Film = {
  /** Den upprätta delen: står på dealerns bordskant. */
  upright: THREE.Mesh;
  /** Den liggande delen: ligger på filten och hör hemma bland det som lutar med bordet. Dess lägen står som på ett olutat bord. */
  lying: THREE.Mesh;
  /** Visar en stillbild som dealer. Löftet uppfylls när bilden är läst, eller har visat sig oläsbar. */
  show(url: string): Promise<void>;
  /**
   * Tar bort det bilden har där ett föremål i scenen står: konturen, i rutans bildpunkter, målas över med skärmens färg
   * innan bilden nycklas. Null lämnar bilden som den är.
   */
  cover(outline: Pixel[] | null): void;
  dispose(): void;
};

// Nyckelns gränser: skärmens grönhet är 1, och en bildpunkt är helt dealer under LO och helt skärm över HI.
// Värdena är gamla projektets för den upprätta delen (lo 0,12 och hi 0,9 − 0,08).
const LO = 0.12;
const HI = 0.82;
// Hur mycket av grannarnas skärm som dras in i konturen: den yttersta bildpunkten av hud och hår bär skärmens gröna.
const ERODE = 0.6;
// Steget mellan nyckelns prov, i rutans bildpunkter. Kanten letas två och fyra steg ut och färgen hämtas fem steg in.
const STEP = 1.4;
// Hur långt utanför ett föremåls kontur bilden målas över, i rutans bildpunkter. Skomodellens kontur följer inte den
// inbakade skon exakt: mätt som mest 14,7 bildpunkter i ankaret VILA (output/scen-matning/sko-pass.ts).
const COVER_MARGIN = 20;

// Bilden hämtas där filmkameran såg ytans punkt på ett olutat bord (ytans egna lägen), inte där punkten står i världen.
// Då sitter händerna fast på filten och följer med när bordet lutas.
const VERTEX = /* glsl */ `
uniform mat4 film;
varying vec4 vFilm;
void main() {
  vFilm = film * vec4(position, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec3 key;
uniform vec2 texel;
varying vec4 vFilm;
const float LO = float(${LO});
const float HI = float(${HI});
const float ERODE = float(${ERODE});

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Hur mycket av en bildpunkt som är skärm: 0 är dealer, 1 är skärm.
float screenOf(vec3 c, float range) {
  return clamp(((c.g - max(c.r, c.b)) / range - LO) / (HI - LO), 0.0, 1.0);
}
float screenAt(vec2 uv, float range) {
  return screenOf(texture2D(map, uv).rgb, range);
}

void main() {
  if (vFilm.w <= 0.0) discard;
  // Punkten i scenkamerans ruta: bilden ligger där kameran såg den.
  vec2 uv = vFilm.xy / vFilm.w * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec3 c = texture2D(map, uv).rgb;
  float range = max(key.g - max(key.r, key.b), 0.05);
  float greenness = (c.g - max(c.r, c.b)) / range;
  float screen = screenOf(c, range);
  float around = max(
    max(screenAt(uv + vec2(texel.x, 0.0), range), screenAt(uv - vec2(texel.x, 0.0), range)),
    max(screenAt(uv + vec2(0.0, texel.y), range), screenAt(uv - vec2(0.0, texel.y), range)));
  float whole = 1.0 - screen;
  float alpha = 1.0 - max(screen, mix(screen, around, ERODE));
  if (alpha < 0.004) discard;
  // Skärmens del av färgen tas bort; det som blir kvar är dealerns, redan vägt med hur mycket av punkten hon täcker.
  vec3 colour = max(c - screen * key, 0.0);
  // Grönt spill: det gröna får inte överstiga det röda och blå.
  colour.g = min(colour.g, mix(max(colour.r, colour.b), 0.5 * (colour.r + colour.b), smoothstep(0.0, 0.1, greenness)));

  // Konturens färg. Punkterna närmast skärmen är en blandning av dealer och skärm, och bilden bär skärmens gröna en bit in
  // i hår och hud: en blek gulgrön linje där för lite grönt togs bort, en rosa där för mycket. Inom ungefär fem bildpunkter
  // från skärmen tar en punkt därför färgen av bilden några punkter längre in, bort från skärmen, och behåller sin egen ljushet.
  vec2 two = texel * 2.0;
  vec2 four = texel * 4.0;
  float x1 = screenAt(uv + vec2(two.x, 0.0), range), x0 = screenAt(uv - vec2(two.x, 0.0), range);
  float y1 = screenAt(uv + vec2(0.0, two.y), range), y0 = screenAt(uv - vec2(0.0, two.y), range);
  float X1 = screenAt(uv + vec2(four.x, 0.0), range), X0 = screenAt(uv - vec2(four.x, 0.0), range);
  float Y1 = screenAt(uv + vec2(0.0, four.y), range), Y0 = screenAt(uv - vec2(0.0, four.y), range);
  vec2 slope = vec2(x1 - x0, y1 - y0) + vec2(X1 - X0, Y1 - Y0);
  float close = max(max(max(screen, around), max(max(x1, x0), max(y1, y0))), max(max(X1, X0), max(Y1, Y0)));
  if (close > 0.02 && dot(slope, slope) > 1e-4) {
    vec3 further = texture2D(map, uv - normalize(slope) * texel * 5.0).rgb;
    float furtherScreen = screenOf(further, range);
    vec3 inner = max(further - furtherScreen * key, 0.0);
    inner.g = min(inner.g, max(inner.r, inner.b));
    float own = dot(colour, LUMA);
    float theirs = max(dot(inner, LUMA), 0.02);
    colour = mix(colour, inner * min(own / theirs, 2.0), smoothstep(0.02, 0.2, close) * (1.0 - furtherScreen));
  }

  // Den indragna konturen tunnar ut punkten, den färgar inte om den.
  colour *= alpha / max(whole, 0.001);
  gl_FragColor = vec4(colour, alpha);
}`;

/**
 * Den vikta ytan för scenen, utan bild. `anisotropy` är grafikkortets högsta, så att den liggande delen håller skärpan sedd snett.
 * `changed` anropas när bilden har ändrats, `problem` när den inte gick att läsa.
 */
export function createFilm(scene: SceneDescription, anisotropy: number, changed: () => void, problem: (text: string) => void): Film {
  const eye = sceneEye(scene);
  const { width, height } = eye.frame;

  // Scenkamerans egen projektion, oberoende av varifrån scenen betraktas.
  const projector = new THREE.PerspectiveCamera(fovYDeg(eye), width / height, 0.1, 100);
  projector.position.set(...eye.position);
  projector.lookAt(eye.position[0] + eye.forward[0], eye.position[1] + eye.forward[1], eye.position[2] + eye.forward[2]);
  projector.updateMatrixWorld();
  const film = new THREE.Matrix4().multiplyMatrices(projector.projectionMatrix, projector.matrixWorldInverse);

  // Två fyrhörningar: den upprätta delen och den liggande. Hörnen går medurs i bild från övre vänstra.
  const corners = fold(scene);
  const quad = (points: number[][]): THREE.BufferGeometry => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setIndex([0, 3, 2, 0, 2, 1]);
    return geometry;
  };
  const geometries = [quad(corners.upright), quad(corners.felt)];

  // Bilden ritas av på en egen yta, så att den kan målas över innan den nycklas.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const texture = new THREE.CanvasTexture(canvas);
  // Bildens värden används som de står: nyckeln räknar på dem, och dealern ritas med bildens egna färger.
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;

  const uniforms = {
    map: { value: texture },
    film: { value: film },
    key: { value: new THREE.Vector3(0, 1, 0) },
    texel: { value: new THREE.Vector2(STEP / width, STEP / height) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  });
  // Kroppen ritas före händerna, som ligger framför den på bordet.
  const layer = (geometry: THREE.BufferGeometry, order: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = order;
    return mesh;
  };
  const upright = layer(geometries[0]!, 1);
  const lying = layer(geometries[1]!, 2);

  let picture: HTMLImageElement | null = null;
  let covered: Pixel[] | null = null;
  let closed = false;

  function paint(): void {
    if (!picture) return;
    context.clearRect(0, 0, width, height);
    context.drawImage(picture, 0, 0, width, height);
    // Skärmens färg läses i bildens övre vänstra hörn.
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    uniforms.key.value.set(r! / 255, g! / 255, b! / 255);
    if (covered && covered.length >= 3) {
      context.fillStyle = context.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      context.lineJoin = 'round';
      context.lineWidth = 2 * COVER_MARGIN;
      context.beginPath();
      // En bildpunkts mitt ligger en halv enhet in på ritytan.
      covered.forEach((point, index) => (index === 0 ? context.moveTo(point.x + 0.5, point.y + 0.5) : context.lineTo(point.x + 0.5, point.y + 0.5)));
      context.closePath();
      context.fill();
      context.stroke();
    }
    texture.needsUpdate = true;
    upright.visible = lying.visible = true;
    changed();
  }

  return {
    upright,
    lying,
    show(url) {
      return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
          if (!closed) {
            picture = image;
            paint();
          }
          resolve();
        };
        image.onerror = () => {
          if (!closed) problem('Dealerns bild gick inte att läsa');
          resolve();
        };
        image.src = url;
      });
    },
    cover(outline) {
      covered = outline;
      paint();
    },
    dispose() {
      closed = true;
      picture = null;
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
