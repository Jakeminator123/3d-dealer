// Nyckeln: materialet som tar bort den gröna skärmen ur dealerfilmen på den vikta ytan (film.ts) och gör märkkortet till
// ett spelkort: det gula och det blå målas med kortets färger, och när kortet ligger tas det blå bort (marker.ts).
//
// Nyckeln är förd över ur gamla Dealer (src/scene3d-film.ts, FRAGMENT, commit 1198340774d8ee78be218506a169faeaa781fa22):
// skärmens andel av en bildpunkt, konturen indragen en bildpunkt, det gröna spillet och den rena kanten (edgeClean, där
// standard sedan 2026-11-13). Dess skuggor, kort och ljus är inte med.

import * as THREE from 'three';
import type { Frame } from './description.ts';
import { MARKER_GLSL, markerUniforms, type CardColours } from './marker.ts';

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
const PROJECTED = /* glsl */ `
uniform mat4 film;
varying vec4 vFilm;
void main() {
  vFilm = film * modelMatrix * vec4(position, 1.0);
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

void main() {
  if (vFilm.w <= 0.0) discard;
  // Punkten i bildens ruta: bilden ligger där kameran såg den.
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

  // Den indragna konturen tunnar ut punkten, den färgar inte om den.
  colour *= alpha / max(whole, 0.001);
  // Märkkortet blir ett spelkort, och när kortet ligger tas det blå bort, så att scenens kort syns där under handen
  // (marker.ts). Det målade kortet ritas över scenens sko.
  float front;
  vec4 marked = markCard(uv, c, colour, alpha, range, front);
  if (marked.a < 0.004) discard;
  gl_FragDepth = frontDepth(front);
  gl_FragColor = marked;
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
};

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
 * där den kameran såg ytans punkter. Märkkortet målas med kortets färger `card`.
 */
export function createKey(map: THREE.Texture, frame: Frame, projection: THREE.Matrix4, card: CardColours): Key {
  const uniforms = {
    map: { value: map },
    film: { value: projection },
    key: { value: new THREE.Vector3(0, 1, 0) },
    texel: { value: new THREE.Vector2(STEP / frame.width, STEP / frame.height) },
    marker: { value: 0 },
    ...markerUniforms(card),
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: PROJECTED,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
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
  };
}
