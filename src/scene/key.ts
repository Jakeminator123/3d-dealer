// Nyckeln: materialet som tar bort den gröna skärmen ur dealerfilmen på den vikta ytan (film.ts) och gör märkkortet till
// ett spelkort: det gula och det blå målas med kortets färger, och när kortet ligger tas det blå bort (marker.ts).
//
// Nyckeln är förd över ur gamla Dealer (src/scene3d-film.ts, FRAGMENT, commit 1198340774d8ee78be218506a169faeaa781fa22):
// skärmens andel av en bildpunkt, konturen indragen en bildpunkt, det gröna spillet och den rena kanten (edgeClean, där
// standard sedan 2026-11-13). Dess skuggor, kort och ljus är inte med.

import * as THREE from 'three';
import { cardFaceImage, lyingCorners } from './cards.ts';
import type { ClipCard } from './dealer.ts';
import type { Frame, SceneDescription, Vec3 } from './description.ts';
import type { Pixel } from './geometry.ts';
import {
  createFaceTracker,
  faceUniforms,
  MARKER_GLSL,
  markerUniforms,
  orientFace,
  setFaceQuad,
  shoeCardUniforms,
  type CardColours,
  type FaceGuide,
  type Quad,
} from './marker.ts';
import { spotPlace } from './round.ts';

// Nyckelns gränser: skärmens grönhet är 1, och en bildpunkt är helt dealer under LO och helt skärm över HI.
// Värdena är gamla projektets för den upprätta delen (lo 0,12 och hi 0,9 − 0,08).
const LO = 0.12;
const HI = 0.82;
// Hur mycket av grannarnas skärm som dras in i konturen: den yttersta bildpunkten av hud och hår bär skärmens gröna.
const ERODE = 0.6;
// Steget mellan nyckelns prov, i rutans bildpunkter. Kanten letas två och fyra steg ut och färgen hämtas fem steg in.
const STEP = 1.4;
// Grönheten (skärmens = 1) under vilken en punkt inte bär skärmens grönt och behåller sin egen färg i kanten, och över
// vilken den får färgen längre in helt. Blond hud och hår ligger kring −0,2 till −0,4, en mättat rosa tumspets kring −0,7
// (mätt 2026-11-18 i plats 1, kort 1, ruta 46: tumspetsen 250,154,149 är −0,72).
const TINGED = [-0.6, -0.3];
// Prov på dealerns skugga: mitten och två ringar med så här många prov var.
const SHADOW_TAPS = 6;
// Fingertopparnas bruna ton: (grönt − blått) / rött där en varm punkt börjar räknas som brun, är helt brun, och slutar vara
// det. Mätt 2026-11-18 i plats 2, kort 0, ruta 46 (output/work/scen-bild/pixlar.mjs): hud 0,01–0,08, spetsarna 0,17–0,28,
// skons bronsram omkring 0,4. Hudens grönt och blått mot rött i samma ruta: 0,71–0,76 och 0,67–0,68. En brun punkt ljusnar
// så stor del av vägen mot SKIN_LIGHT (fingrets hud en bit in är 0,66).
const BROWN = [0.1, 0.2, 0.32, 0.42];
const SKIN_RATIO = [0.74, 0.67];
const SKIN_LIGHT = 0.6;
const BROWN_LIFT = 0.7;

/**
 * Hur mycket av en bildpunkt som är skärm, som nyckeln räknar det (screenOf nedan): 0 är dealer, 1 är skärm. Färgerna är
 * 0–255. För mätningar av en film utanför webbläsaren (src/pipeline/matning.ts).
 */
export function screenShare(r: number, g: number, b: number, key: readonly [number, number, number]): number {
  const range = Math.max((key[1] - Math.max(key[0], key[2])) / 255, 0.05);
  return Math.min(1, Math.max(0, ((g - Math.max(r, b)) / 255 / range - LO) / (HI - LO)));
}

// Bilden på den vikta ytan hämtas där kameran som gjorde den såg punkten: punktens plats i världen, genom kamerans
// projektion. Bilden är gjord i scenen som den står, med bordet lutat.
//
// Dealerns skugga på filten (room.dealerShadow i content/scene.json) hämtas på samma sätt: en punkt på filten är i skugga
// där bilden visar dealern en bit närmare henne, shadowShift i den liggande delens egna mått (bort från spelaren längs
// filten), och skuggan är mjuk över shadowBlur meter åt sidorna och längs filten.
const PROJECTED = /* glsl */ `
uniform mat4 film;
uniform vec3 shadowShift;
uniform float shadowBlur;
varying vec4 vFilm;
varying vec4 vShadow;
varying vec4 vShadowX;
varying vec4 vShadowZ;
void main() {
  vFilm = film * modelMatrix * vec4(position, 1.0);
  vec3 from = position + shadowShift;
  vShadow = film * modelMatrix * vec4(from, 1.0);
  vShadowX = film * modelMatrix * vec4(from + vec3(shadowBlur, 0.0, 0.0), 1.0);
  vShadowZ = film * modelMatrix * vec4(from + vec3(0.0, 0.0, shadowBlur), 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec3 key;
uniform vec2 texel;
uniform float marker;
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
${MARKER_GLSL}

// Varm färg som hud, också mörk hud i skugga: mer rött än grönt och mer grönt än blått.
float warmOf(vec3 c) {
  return smoothstep(0.12, 0.2, c.r) * smoothstep(0.02, 0.06, c.r - c.g) * smoothstep(0.0, 0.04, c.g - c.b);
}
// Hur brun en varm färg är: grönt långt över blått mot rött. Hud ligger under 0,08, fingertopparnas bruna ton på 0,17–0,28;
// skons bronsram och blont hår ligger över 0,4 och är inte bruna här.
float brownOf(vec3 c) {
  float tone = (c.g - c.b) / max(c.r, 0.05);
  return smoothstep(${BROWN[0]}, ${BROWN[1]}, tone) * (1.0 - smoothstep(${BROWN[2]}, ${BROWN[3]}, tone));
}
// Fingrets hud: grönt och blått mot rött, och hur ljus en fingertopp blir som mest.
const vec3 SKIN = vec3(1.0, ${SKIN_RATIO[0].toFixed(2)}, ${SKIN_RATIO[1].toFixed(2)});

// Dealerns skugga: bara på den liggande delen (lying), där filten är.
uniform float lying;
uniform float shadowStrength;
varying vec4 vShadow;
varying vec4 vShadowX;
varying vec4 vShadowZ;
// Hur mycket av bilden som är dealer och ligger kvar i den på punkten at: inte skärm, och inte märkkortets blå när det är
// borttaget, också där det blå är utsmetat mot skärmen. Bilden läses något grövre (lod), så att proven inte faller mellan.
float dealerAt(vec2 at, float range, float lod) {
  if (at.x < 0.0 || at.x > 1.0 || at.y < 0.0 || at.y > 1.0) return 0.0;
  vec3 c = textureLod(map, at, lod).rgb;
  vec3 toB = MARK_FACE - key;
  float t = clamp(dot(c - key, toB) / dot(toB, toB), 0.0, 1.0);
  float blue = 1.0 - smoothstep(0.08, 0.16, length(c - key - t * toB));
  return (1.0 - screenOf(c, range)) * (1.0 - marker * blue);
}
// Skuggans täckning på den här punkten av filten: dealern där skuggan kommer ifrån, i mitten och på en ring runt om.
float dealerShadow(float range) {
  if (lying < 0.5 || shadowStrength <= 0.0 || vShadow.w <= 0.0) return 0.0;
  vec2 at = vShadow.xy / vShadow.w * 0.5 + 0.5;
  vec2 ax = vShadowX.xy / vShadowX.w * 0.5 + 0.5 - at;
  vec2 az = vShadowZ.xy / vShadowZ.w * 0.5 + 0.5 - at;
  float lod = log2(max(1.0, 0.4 * length(ax * filmSize)));
  float sum = 2.0 * dealerAt(at, range, lod);
  for (int i = 0; i < ${SHADOW_TAPS}; i++) {
    float a = float(i) * ${((2 * Math.PI) / SHADOW_TAPS).toFixed(6)};
    sum += dealerAt(at + 0.6 * (cos(a) * ax + sin(a) * az), range, lod) + dealerAt(at + cos(a + 0.4) * ax + sin(a + 0.4) * az, range, lod);
  }
  return shadowStrength * sum / float(${2 * SHADOW_TAPS + 2});
}

void main() {
  // Punkten i bildens ruta: bilden ligger där kameran såg den. Var den ligger på märkkortets framsida räknas innan någon
  // punkt slängs (marker.ts, prepareFace).
  vec2 uv = vFilm.xy / vFilm.w * 0.5 + 0.5;
  prepareFace(uv);
  if (vFilm.w <= 0.0) discard;
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
  // Där skärmen är syns filten, och på den dealerns skugga.
  float shade = dealerShadow(range);
  if (alpha < 0.004) {
    if (shade < 0.004) discard;
    gl_FragDepth = gl_FragCoord.z;
    gl_FragColor = vec4(0.0, 0.0, 0.0, shade);
    return;
  }
  // Skärmens del av färgen tas bort; det som blir kvar är dealerns, redan vägt med hur mycket av punkten hon täcker.
  vec3 colour = max(c - screen * key, 0.0);
  // Grönt spill: det gröna får inte överstiga det röda och blå.
  colour.g = min(colour.g, mix(max(colour.r, colour.b), 0.5 * (colour.r + colour.b), smoothstep(0.0, 0.1, greenness)));

  // Konturens färg. Punkterna närmast skärmen är en blandning av dealer och skärm, och bilden bär skärmens gröna en bit in
  // i hår och hud: en blek gulgrön linje där för lite grönt togs bort, en rosa där för mycket. Inom ungefär fem bildpunkter
  // från skärmen tar en punkt därför färgen av bilden några punkter längre in, bort från skärmen, och behåller sin egen ljushet.
  // Bara en punkt som bär skärmens grönt gör det: en punkt klart mindre grön än så, som en tumspets intill det blå kortet,
  // behåller sin egen färg. Längre in kan annars ligga kortets blå reflex i huden, som ljusheten förstärker till starkt rosa.
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
    float tinged = smoothstep(float(${TINGED[0]}), float(${TINGED[1]}), greenness);
    // Hud tar aldrig färgen av märkkortet längre in: en nagel mot kortets hörn blir annars ljusblå (plats 6, kort 0, ruta 54).
    vec2 furtherMark = markOf(further);
    float fromCard = skinOf(c) * max(furtherMark.x, furtherMark.y);
    colour = mix(colour, inner * min(own / theirs, 2.0), smoothstep(0.02, 0.2, close) * (1.0 - furtherScreen) * tinged * (1.0 - fromCard));
  }
  // Fingertoppar mot filten: filmen bär där en brun ton, mörk hud med skärmens gröna i sig, upp till tio bildpunkter in
  // (plats 2, kort 0, ruta 46: 110, 88, 57 i spetsen mot 214, 157, 145 en bit in). En varm, brun punkt nära skärmen på den
  // liggande delen får hudens förhållande mellan rött, grönt och blått, och ljusnar en bit mot hudens ljushet.
  float brown = lying * warmOf(c) * brownOf(c);
  if (brown > 0.0) {
    vec2 eight = texel * 8.0;
    float near = max(close, max(
      max(screenAt(uv + vec2(eight.x, 0.0), range), screenAt(uv - vec2(eight.x, 0.0), range)),
      max(screenAt(uv + vec2(0.0, eight.y), range), screenAt(uv - vec2(0.0, eight.y), range))));
    float k = brown * smoothstep(0.1, 0.5, near);
    vec3 toned = mix(colour, colour.r * SKIN, k);
    float light = max(dot(toned, LUMA), 0.004);
    float wanted = mix(light, max(light, ${SKIN_LIGHT.toFixed(2)} * whole), ${BROWN_LIFT.toFixed(2)} * k);
    colour = toned * (wanted / light);
  }

  // Den indragna konturen tunnar ut punkten, den färgar inte om den.
  colour *= alpha / max(whole, 0.001);
  // Märkkortet blir ett spelkort, och när kortet ligger tas det blå bort, så att scenens kort syns där under handen
  // (marker.ts). Det målade kortet ritas över scenens sko.
  float front;
  vec4 marked = markCard(uv, c, colour, alpha, range, front);
  // Skuggan ligger under dealern: den syns där hon inte täcker punkten. Färgen är förmultiplicerad, och skuggan är svart.
  float covered = marked.a + (1.0 - marked.a) * shade;
  if (covered < 0.004) discard;
  gl_FragDepth = frontDepth(front);
  gl_FragColor = vec4(marked.rgb, covered);
}`;

export type Key = {
  /** Materialet: genomskinligt, utan djupskrivning men med djupprov, så att det som står framför dealern döljer henne. */
  material: THREE.ShaderMaterial;
  /** Skärmens färg i bilden, 0–255 per kanal. */
  setScreen(red: number, green: number, blue: number): void;
  /** Tar bort märkkortets blå ur bilden, eller målar det som kortets framsida. */
  setMarker(gone: boolean): void;
  /** Byter bilden: en följds nästa klipp. */
  setMap(map: THREE.Texture): void;
  /**
   * Kortet som bildens klipp lägger. Dess framsida, med valören, målas på märkkortets blå medan kortet är i luften, och
   * läggs nära kortplatsen där scenens kort ligger när det har landat. Null eller ett kort utan valör ger en blank framsida.
   */
  setCard(scene: SceneDescription, card: ClipCard | null | undefined): void;
};

// Rutan innan räknas som alldeles före när den ligger så här nära i tid, i sekunder: inom några rutor i alla takter.
const FACE_FOLLOW_SECONDS = 0.1;
// Kortets avstånd från filmens öga när kortet inte har någon kortplats, i meter: ungefär kortplatsernas (antaget).
const FACE_DEPTH = 1.6;

/**
 * Bildens värden används som de står: nyckeln räknar på dem, och dealern ritas med bildens egna färger.
 * `anisotropy` är grafikkortets högsta, så att bilden håller skärpan sedd snett.
 */
export function prepareKeyTexture(texture: THREE.Texture, anisotropy: number): void {
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
}

/**
 * Nyckelns material för en bild i rutan `frame`, gjord genom kameran `projection` (projektion gånger vy): bilden ligger
 * där den kameran såg ytans punkter. Märkkortet målas med kortets färger `card`. `shoeCard` är hörnen av kortet i skons
 * mynning i bildens bildpunkter: innanför det ritas baksidans kant bara mot kortets egen kant (marker.ts). `shadow` är
 * dealerns skugga på filten (room.dealerShadow); den läggs bara på den del av ytan som ligger plant, på filten.
 */
export function createKey(
  map: THREE.Texture,
  frame: Frame,
  projection: THREE.Matrix4,
  card: CardColours,
  shoeCard: Pixel[] | null = null,
  shadow: SceneDescription['room']['dealerShadow'] | null = null,
): Key {
  const uniforms = {
    map: { value: map },
    film: { value: projection },
    key: { value: new THREE.Vector3(0, 1, 0) },
    texel: { value: new THREE.Vector2(STEP / frame.width, STEP / frame.height) },
    marker: { value: 0 },
    ...markerUniforms(card),
    ...shoeCardUniforms(shoeCard, frame),
  };
  const face = faceUniforms();
  // Skuggan hämtas närmare dealern: bort från spelaren längs filten, i den liggande delens egna mått.
  const shading = {
    lying: { value: 0 },
    shadowStrength: { value: shadow?.strength ?? 0 },
    shadowShift: { value: new THREE.Vector3(0, 0, -(shadow?.offset ?? 0)) },
    shadowBlur: { value: shadow?.blur ?? 0.001 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, ...face, ...shading },
    vertexShader: PROJECTED,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  });

  // Märkkortets framsida: kortets bild för varje valör, och fyrhörningen kring det blå i rutan som visas (marker.ts).
  const faces = new Map<string, THREE.Texture>();
  const tracker = typeof document === 'undefined' ? null : createFaceTracker(frame);
  let guide: Omit<FaceGuide, 'previous'> | null = null;
  let last: { map: THREE.Texture; time: number; quad: Quad | null } | null = null;
  // En punkt i scenen i bildens bildpunkter, som skuggaren räknar dem.
  const inFilm = (point: Vec3): Pixel | null => {
    const v = new THREE.Vector4(point[0], point[1], point[2], 1).applyMatrix4(projection);
    if (v.w <= 0) return null;
    return { x: ((v.x / v.w) * 0.5 + 0.5) * frame.width - 0.5, y: (0.5 - (v.y / v.w) * 0.5) * frame.height - 0.5 };
  };
  // Bildpunkter per meter på kortets avstånd: ögats brännvidd i bildpunkter ur projektionen, genom avståndet.
  const e = projection.elements;
  const focal = (Math.hypot(e[0]!, e[4]!, e[8]!) * frame.width) / 2;

  /** Letar upp kortets framsida i rutan som visas, en gång per ruta, medan kortet är i luften. */
  function track(): void {
    if (!tracker || !guide || uniforms.marker.value > 0.5 || !face.faceMap.value) return;
    const map = uniforms.map.value;
    const source = map.image as HTMLVideoElement | HTMLImageElement | null | undefined;
    if (!source) return;
    const video = 'videoWidth' in source ? source : null;
    const width = video ? video.videoWidth : (source as HTMLImageElement).naturalWidth;
    const height = video ? video.videoHeight : (source as HTMLImageElement).naturalHeight;
    if (!width || !height || (video && video.readyState < 2)) return;
    const time = video ? video.currentTime : 0;
    if (last && last.map === map && last.time === time) return;
    const previous = last && last.map === map && Math.abs(last.time - time) < FACE_FOLLOW_SECONDS ? last.quad : null;
    const found = tracker.find(source, width, height);
    const quad = found ? orientFace(found.quad, { ...guide, previous }) : null;
    last = { map, time, quad };
    setFaceQuad(face, quad);
  }
  // Samma material ritar båda delarna av ytan. Den liggande delen är plan i sina egna mått; bara där läggs skuggan.
  const flat = new WeakMap<THREE.BufferGeometry, boolean>();
  material.onBeforeRender = (_renderer, _scene, _camera, geometry) => {
    let lying = flat.get(geometry);
    if (lying === undefined) {
      const box = geometry.boundingBox ?? (geometry.computeBoundingBox(), geometry.boundingBox!);
      lying = box.max.y - box.min.y < 1e-6;
      flat.set(geometry, lying);
    }
    if (shading.lying.value !== (lying ? 1 : 0)) {
      shading.lying.value = lying ? 1 : 0;
      material.uniformsNeedUpdate = true;
    }
    track();
  };
  material.addEventListener('dispose', () => {
    for (const texture of faces.values()) texture.dispose();
    faces.clear();
  });

  return {
    material,
    setScreen(red, green, blue) {
      uniforms.key.value.set(red / 255, green / 255, blue / 255);
    },
    setMarker(gone) {
      uniforms.marker.value = gone ? 1 : 0;
    },
    setMap(next) {
      uniforms.map.value = next;
    },
    setCard(scene, card) {
      last = null;
      const value = card?.face ?? null;
      if (!card || value === null || typeof document === 'undefined') {
        guide = null;
        face.faceMap.value = null;
        setFaceQuad(face, null);
        return;
      }
      let texture = faces.get(value);
      if (!texture) {
        texture = new THREE.CanvasTexture(cardFaceImage(scene, value));
        // Som filmens bild: skuggaren tar färgerna som de står.
        texture.colorSpace = THREE.NoColorSpace;
        faces.set(value, texture);
      }
      face.faceMap.value = texture;
      const place = spotPlace(scene, card);
      const corners = place ? lyingCorners(scene, { place, index: card.index }).map(inFilm) : null;
      const landing = corners && corners.every((corner): corner is Pixel => corner !== null) ? (corners as Quad) : null;
      guide = { landing, scale: focal / FACE_DEPTH, card: scene.card };
      setFaceQuad(face, null);
    },
  };
}
