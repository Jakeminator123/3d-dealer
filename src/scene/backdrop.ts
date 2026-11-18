// Rummet bakom scenen. En 360-bild (likformig cylinderprojektion) omger kameran på oändligt avstånd: den vrids rätt när
// kameran vrids, men förskjuts inte när kameran flyttas. En platt bild visas som en kuliss som fyller scenkamerans ruta,
// också den oändligt långt bort; utanför den är det svart.
//
// Gamla Dealer ritade rummet till en egen yta i halv storlek och lade oskärpa på den i två pass (src/scene3d-view.ts).
// Här görs oskärpan i samma pass som rummet ritas, i rummets egna vinklar, så att scenen inte behöver egna ritytor.
// three:s egen bakgrund (scene.background med backgroundBlurriness) valdes bort: den kan inte spegelvända bilden, dess
// oskärpa har ingen enhet som går att föra över från gamla projektets värden, och den håller en stor extra yta per bild.

import * as THREE from 'three';
import type { Eye } from './geometry.ts';

/**
 * En bakgrund och hur den visas. `turn`: grader kring lodlinjen; 0 ställer bildens mitt rakt bakom dealern, och ett positivt
 * värde för dit det som stod till höger i bilden. `blur`: oskärpans standardavvikelse i bildpunkter av scenkamerans ruta.
 * `exposure`: ljusstyrkan, en faktor på ljuset. `mirror`: bilden spegelvänd. Samma mening som gamla projektets värden.
 *
 * `lift`: grader som bilden lyfts. Scenens kamera ser nedåt, så olyft visar en 360-bild sitt golv bakom dealern; lyft visar
 * den i varje riktning det som låg så många grader högre upp, och horisonten kommer in i rutan. Lyftet hör till rummet och
 * är detsamma åt alla håll: lodräta linjer står kvar lodräta och horisonten ligger vågrätt från varje plats. Priset är att
 * horisonten blir en svagt böjd linje i bilden. Det andra sättet, att luta hela bilden kring en vågrät axel, ger en rak
 * horisont från scenens kamera men en sned från platserna vid sidan av den.
 */
export type Background = {
  url: string;
  kind: '360' | 'platt';
  turn: number;
  blur: number;
  exposure: number;
  mirror: boolean;
  lift: number;
};

export type Backdrop = {
  mesh: THREE.Mesh;
  /** Byter bakgrund och inställningar. Bilden läses bara om när adressen är en annan; null släcker rummet. */
  show(background: Background | null): void;
  dispose(): void;
};

// Antalet prov i oskärpan. Proven ligger i en spiral inom två och en halv standardavvikelse.
const TAPS = 32;

const VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  // Bara kamerans vridning räknas, inte dess plats: lådan följer kameran, så rummet ligger oändligt långt bort.
  vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = clip.xyww;
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float flatPlate, turn, lift, mirror, exposure, blur, texelsPerRadian;
uniform mat3 plateView;
uniform vec2 plateHalf;
varying vec3 vDirection;
const float PI = 3.141592653589793;

// Rummets färg i en riktning. lod väljer hur grov version av bilden som läses.
vec3 room(vec3 d, float lod) {
  float c = cos(turn), s = sin(turn);
  d = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
  // Lyftet: samma väderstreck, men så många grader högre upp i rummet. Över zenit finns inget mer att visa.
  float height = clamp(asin(clamp(d.y, -1.0, 1.0)) + lift, -0.5 * PI, 0.5 * PI);
  float along = length(d.xz);
  vec2 heading = along > 1e-6 ? d.xz / along : vec2(0.0, -1.0);
  d = vec3(heading.x * cos(height), sin(height), heading.y * cos(height));
  vec2 uv;
  if (flatPlate > 0.5) {
    // Kulissen: riktningen sedd genom scenens kamera, som en punkt i dess ruta.
    vec3 v = plateView * d;
    if (v.z <= 0.0) return vec3(0.0);
    uv = v.xy / v.z / plateHalf * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
  } else {
    uv = vec2(atan(d.x, -d.z) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  }
  if (mirror > 0.5) uv.x = 1.0 - uv.x;
  return textureLod(map, uv, lod).rgb;
}

void main() {
  vec3 d = normalize(vDirection);
  // Så många av bildens punkter som ryms i en punkt på skärmen. Nivån räknas här och inte av grafikkortet,
  // som annars ritar en söm där bildens vänstra och högra kant möts.
  float footprint = length(fwidth(d)) * texelsPerRadian;
  vec3 colour;
  if (blur * texelsPerRadian < 0.5) {
    colour = room(d, log2(max(footprint, 1.0)));
  } else {
    vec3 side = normalize(cross(d, abs(d.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 up = cross(side, d);
    float reach = 2.5 * blur;
    // Varje prov läser en version av bilden som är lika grov som avståndet mellan proven, så att inget faller mellan dem.
    float spacing = reach * sqrt(PI / float(${TAPS}));
    float lod = log2(max(max(spacing * texelsPerRadian, footprint), 1.0));
    vec3 sum = vec3(0.0);
    float weight = 0.0;
    for (int i = 0; i < ${TAPS}; i++) {
      float r = sqrt((float(i) + 0.5) / float(${TAPS})) * reach;
      float a = float(i) * 2.399963;
      float w = exp(-0.5 * r * r / (blur * blur));
      sum += w * room(normalize(d + (cos(a) * side + sin(a) * up) * r), lod);
      weight += w;
    }
    colour = sum / weight;
  }
  gl_FragColor = vec4(colour * exposure, 1.0);
  #include <colorspace_fragment>
}`;

/** Rummet för en scen vars kamera är `eye`. `changed` anropas när bilden har bytts, `problem` när en bild inte gick att läsa. */
export function createBackdrop(eye: Eye, changed: () => void, problem: (text: string) => void): Backdrop {
  // Scenkamerans axlar som rader: höger, upp, framåt. Med dem läggs en riktning i världen in i kamerans ruta.
  const forward = new THREE.Vector3(...eye.forward).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward);
  const plateView = new THREE.Matrix3().set(right.x, right.y, right.z, up.x, up.y, up.z, forward.x, forward.y, forward.z);

  const uniforms = {
    map: { value: null as THREE.Texture | null },
    flatPlate: { value: 0 },
    turn: { value: 0 },
    lift: { value: 0 },
    mirror: { value: 0 },
    exposure: { value: 1 },
    blur: { value: 0 },
    texelsPerRadian: { value: 1 },
    plateView: { value: plateView },
    plateHalf: { value: new THREE.Vector2(1, 1) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.visible = false;

  const loader = new THREE.TextureLoader();
  let shown: { url: string; texture: THREE.Texture } | null = null;
  let wanted: Background | null = null;
  let loading: string | null = null;
  let closed = false;

  // Inställningarna för bilden som visas. Bilden som väntar på att läsas får sina när den kommer.
  function apply(background: Background, texture: THREE.Texture): void {
    const image = texture.image as { width: number; height: number };
    const flat = background.kind === 'platt';
    uniforms.flatPlate.value = flat ? 1 : 0;
    uniforms.turn.value = THREE.MathUtils.degToRad(background.turn);
    uniforms.lift.value = THREE.MathUtils.degToRad(background.lift);
    uniforms.mirror.value = background.mirror ? 1 : 0;
    uniforms.exposure.value = background.exposure;
    uniforms.blur.value = Math.atan(background.blur / eye.focalPx);
    if (flat) {
      // Kulissen fyller rutan: bilden skalas tills den täcker både bredd och höjd.
      const scale = Math.max(eye.frame.width / image.width, eye.frame.height / image.height);
      uniforms.plateHalf.value.set((image.width * scale) / 2 / eye.focalPx, (image.height * scale) / 2 / eye.focalPx);
      uniforms.texelsPerRadian.value = eye.focalPx / scale;
    } else {
      uniforms.texelsPerRadian.value = image.width / (2 * Math.PI);
    }
  }

  return {
    mesh,
    show(background) {
      wanted = background;
      if (!background) {
        shown?.texture.dispose();
        shown = null;
        uniforms.map.value = null;
        mesh.visible = false;
        changed();
        return;
      }
      if (shown?.url === background.url) {
        apply(background, shown.texture);
        changed();
        return;
      }
      // Den gamla bilden står kvar tills den nya är läst. Samma bild hämtas inte två gånger.
      const { url } = background;
      if (loading === url) return;
      loading = url;
      const done = () => {
        if (loading === url) loading = null;
      };
      loader.load(
        url,
        (texture) => {
          done();
          // En bild som kommer efter att en annan har valts, eller efter att scenen är stängd, används inte.
          if (closed || wanted?.url !== url) return texture.dispose();
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.generateMipmaps = true;
          // En 360-bild går runt: dess vänstra kant fortsätter i den högra.
          texture.wrapS = wanted.kind === 'platt' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
          shown?.texture.dispose();
          shown = { url, texture };
          uniforms.map.value = texture;
          apply(wanted, texture);
          mesh.visible = true;
          changed();
        },
        undefined,
        () => {
          done();
          if (!closed && wanted?.url === url) problem('Bakgrundens bild gick inte att läsa');
        },
      );
    },
    dispose() {
      closed = true;
      shown?.texture.dispose();
      shown = null;
      geometry.dispose();
      material.dispose();
    },
  };
}
