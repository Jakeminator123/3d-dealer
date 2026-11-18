// Rummet bakom scenen. En 360-bild (likformig cylinderprojektion) visas som ett rum med golv: bilden antas vara tagen
// från en punkt en viss höjd över golvet, och rummet är en sfär kring den punkten, avskuren av golvet där den går under
// det. Strålen från ögats verkliga plats möter sfären eller golvet, och bilden slås upp i riktningen från bildens punkt
// till träffpunkten. Då sitter rummet ihop med bordet: golvet ligger där bordet står, och rummet förskjuts som ett rum gör
// när ögat flyttas. Det är samma tanke som three:s GroundedSkybox, men räknad per bildpunkt här, så att vridning,
// spegling, lyft, oskärpa och ljusstyrka fungerar som för ett rum utan golv. På golvet ligger en mjuk skugga under bordet.
//
// En platt bild visas som en kuliss som fyller rutan för det öga rummet är tänkt att ses från (spelarens), oändligt långt
// bort; utanför den är det svart. Den har inget golv.
//
// Gamla Dealer ritade rummet till en egen yta i halv storlek och lade oskärpa på den i två pass (src/scene3d-view.ts).
// Här görs oskärpan i samma pass som rummet ritas, i rummets egna vinklar, så att scenen inte behöver egna ritytor.
// three:s egen bakgrund (scene.background med backgroundBlurriness) valdes bort: den kan inte spegelvända bilden, dess
// oskärpa har ingen enhet som går att föra över från gamla projektets värden, och den håller en stor extra yta per bild.

import * as THREE from 'three';
import type { FeltPoint, SceneDescription, Vec3 } from './description.ts';
import type { Eye } from './geometry.ts';

/**
 * Hur många meter över golvet en 360-bild antas vara tagen: bakgrundens egen höjd när scenen har en
 * (`room.captureHeights`, med registrets file), annars scenens (`room.captureHeight`). Startvärdet för `height` nedan.
 */
export function captureHeightOf(scene: SceneDescription, file: string): number {
  return scene.room.captureHeights[file] ?? scene.room.captureHeight;
}

/**
 * En bakgrund och hur den visas. `turn`: grader kring lodlinjen; 0 ställer bildens mitt rakt bakom dealern, och ett positivt
 * värde för dit det som stod till höger i bilden. `blur`: oskärpans standardavvikelse i bildpunkter av rutan för det öga
 * rummet är tänkt att ses från. `exposure`: ljusstyrkan, en faktor på ljuset. `mirror`: bilden spegelvänd.
 * Samma mening som gamla projektets värden.
 *
 * `height` och `radius` gäller 360-bilder: hur många meter över golvet bilden antas vara tagen, och hur många meter bort
 * rummets väggar ligger. En lägre höjd gör rummet större mot bordet, en högre gör det mindre. Är någon av dem noll har
 * rummet inget golv: bilden ligger oändligt långt bort och förskjuts inte när ögat flyttas.
 *
 * `lift`: grader som bilden lyfts: bilden visar i varje riktning det som låg så många grader högre upp. Lyftet hör till
 * rummet och är detsamma åt alla håll: lodräta linjer står kvar lodräta, men horisonten blir en svagt böjd linje.
 * Med golv i rummet behövs det inte, och scenens startvärde är 0.
 */
export type Background = {
  url: string;
  kind: '360' | 'platt';
  turn: number;
  blur: number;
  exposure: number;
  mirror: boolean;
  lift: number;
  height: number;
  radius: number;
};

/**
 * Golvet som rummet står på: punkten på golvet som en 360-bild antas vara tagen över, och skuggan under bordet.
 * Skuggan är bordets fotavtryck sett uppifrån (minsta och största x och z), hur många meter utanför det den tonar ut
 * och hur stor andel av ljuset den som mest tar bort.
 */
export type Floor = {
  foot: Vec3;
  shadow: { min: FeltPoint; max: FeltPoint; reach: number; strength: number };
};

export type Backdrop = {
  mesh: THREE.Mesh;
  /** Skuggan under bordet. Den syns när rummet har golv. */
  shadow: THREE.Mesh;
  /** Byter bakgrund och inställningar. Bilden läses bara om när adressen är en annan; null släcker rummet. */
  /** Löftet uppfylls när rummet visas så, eller när bilden har visat sig oläsbar. */
  show(background: Background | null): Promise<void>;
  dispose(): void;
};

// Antalet prov i oskärpan. Proven ligger i en spiral inom två och en halv standardavvikelse.
const TAPS = 32;

const VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  // Lådan följer kameran och ritas längst bort: den är bara en yta att räkna rummet på. Var rummet ligger avgörs per bildpunkt.
  vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = clip.xyww;
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float flatPlate, turn, lift, mirror, exposure, blur, texelsPerRadian;
uniform float grounded, roomRadius, roomHeight;
uniform vec3 roomCentre;
uniform mat3 plateView;
uniform vec2 plateHalf;
varying vec3 vDirection;
const float PI = 3.141592653589793;

// Riktningen bilden slås upp i för en stråle från ögat. Utan golv är det strålens egen riktning: rummet ligger oändligt
// långt bort. Med golv möter strålen sfären kring punkten där bilden togs, eller golvet där det ligger närmare, och
// riktningen är den från bildens punkt till träffpunkten.
vec3 toward(vec3 d) {
  if (grounded < 0.5) return d;
  vec3 from = cameraPosition - roomCentre;
  float along = dot(from, d);
  float inside = along * along - dot(from, from) + roomRadius * roomRadius;
  // Ett öga utanför rummet, vars stråle går förbi det eller bort från det, ser bilden som oändligt avlägsen.
  if (inside <= 0.0) return d;
  float reach = sqrt(inside) - along;
  if (reach <= 0.0) return d;
  // Golvet ligger roomHeight under bildens punkt. Det gäller där strålen når det före sfären.
  if (d.y < 0.0) {
    float floorAt = (-roomHeight - from.y) / d.y;
    if (floorAt > 0.0 && floorAt < reach) reach = floorAt;
  }
  return normalize(from + reach * d);
}

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
    // Kulissen: riktningen sedd genom ögat rummet är tänkt för, som en punkt i dess ruta.
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
  vec3 seen = toward(d);
  // Så många av bildens punkter som ryms i en punkt på skärmen, räknat på riktningen bilden slås upp i. Nivån räknas
  // här och inte av grafikkortet, som annars ritar en söm där bildens vänstra och högra kant möts.
  float footprint = length(fwidth(seen)) * texelsPerRadian;
  vec3 colour;
  if (blur * texelsPerRadian < 0.5) {
    colour = room(seen, log2(max(footprint, 1.0)));
  } else {
    vec3 side = normalize(cross(d, abs(d.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 up = cross(side, d);
    float reach = 2.5 * blur;
    // Varje prov läser en version av bilden som är lika grov som avståndet mellan proven, så att inget faller mellan dem.
    // Proven går samma väg som bildpunkten själv: genom rummet. Golv och väggar nära ögat drar isär dem i bilden.
    float spacing = reach * sqrt(PI / float(${TAPS}));
    float apart = grounded < 0.5
      ? spacing
      : max(length(toward(normalize(d + side * spacing)) - seen), length(toward(normalize(d + up * spacing)) - seen));
    float lod = log2(max(max(apart * texelsPerRadian, footprint), 1.0));
    vec3 sum = vec3(0.0);
    float weight = 0.0;
    for (int i = 0; i < ${TAPS}; i++) {
      float r = sqrt((float(i) + 0.5) / float(${TAPS})) * reach;
      float a = float(i) * 2.399963;
      float w = exp(-0.5 * r * r / (blur * blur));
      sum += w * room(toward(normalize(d + (cos(a) * side + sin(a) * up) * r)), lod);
      weight += w;
    }
    colour = sum / weight;
  }
  gl_FragColor = vec4(colour * exposure, 1.0);
  #include <colorspace_fragment>
}`;

// Skuggan under bordet: en mörk fläck på golvet med bordets fotavtryck som form och en mjuk kant.
const SHADOW_VERTEX = /* glsl */ `
varying vec2 vAt;
void main() {
  vAt = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SHADOW_FRAGMENT = /* glsl */ `
uniform vec2 middle, extent;
uniform float reach, strength;
varying vec2 vAt;
void main() {
  // Avståndet från fotavtryckets kant, negativt innanför. Hörnen är rundade med kantens bredd.
  vec2 q = abs(vAt - middle) - extent + reach;
  float outside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - reach;
  // Skuggan är hel en bit innanför kanten och borta reach utanför den.
  float shade = strength * (1.0 - smoothstep(-reach, reach, outside));
  if (shade < 0.002) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, shade);
}`;

/**
 * Rummet för en scen som är tänkt att ses från `eye`: oskärpan räknas i det ögats ruta, och en platt bild fyller den.
 * `floor` är golvet rummet står på. `changed` anropas när bilden har bytts, `problem` när en bild inte gick att läsa.
 */
export function createBackdrop(eye: Eye, floor: Floor, changed: () => void, problem: (text: string) => void): Backdrop {
  // Ögats axlar som rader: höger, upp, framåt. Med dem läggs en riktning i världen in i ögats ruta.
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
    grounded: { value: 0 },
    roomRadius: { value: 1 },
    roomHeight: { value: 1 },
    roomCentre: { value: new THREE.Vector3() },
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

  // Skuggan ligger på golvet och ritas efter rummet, som inte skriver något djup. Bordet framför den döljer den.
  const { min, max, reach, strength } = floor.shadow;
  const middle = new THREE.Vector2((min[0] + max[0]) / 2, (min[1] + max[1]) / 2);
  const extent = new THREE.Vector2((max[0] - min[0]) / 2, (max[1] - min[1]) / 2);
  const shadowGeometry = new THREE.BufferGeometry();
  const far = { x: extent.x + reach, z: extent.y + reach };
  shadowGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        [middle.x - far.x, middle.y - far.z],
        [middle.x + far.x, middle.y - far.z],
        [middle.x + far.x, middle.y + far.z],
        [middle.x - far.x, middle.y + far.z],
      ].flatMap(([x, z]) => [x!, floor.foot[1], z!]),
      3,
    ),
  );
  shadowGeometry.setIndex([0, 3, 2, 0, 2, 1]);
  const shadowMaterial = new THREE.ShaderMaterial({
    uniforms: { middle: { value: middle }, extent: { value: extent }, reach: { value: reach }, strength: { value: strength } },
    vertexShader: SHADOW_VERTEX,
    fragmentShader: SHADOW_FRAGMENT,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.frustumCulled = false;
  shadow.renderOrder = -900;
  shadow.visible = false;

  const loader = new THREE.TextureLoader();
  let shown: { url: string; texture: THREE.Texture } | null = null;
  let wanted: Background | null = null;
  let loading: string | null = null;
  // Löftet för bilden som läses just nu: den som ber om samma bild igen får samma löfte.
  let arriving: Promise<void> = Promise.resolve();
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
    // En 360-bild med höjd och radie är ett rum med golv, och bilden antas tagen så högt över golvets punkt.
    const grounded = !flat && background.height > 0 && background.radius > 0;
    uniforms.grounded.value = grounded ? 1 : 0;
    uniforms.roomHeight.value = background.height;
    uniforms.roomRadius.value = background.radius;
    uniforms.roomCentre.value.set(floor.foot[0], floor.foot[1] + background.height, floor.foot[2]);
    shadow.visible = grounded;
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
    shadow,
    show(background) {
      wanted = background;
      if (!background) {
        shown?.texture.dispose();
        shown = null;
        uniforms.map.value = null;
        mesh.visible = false;
        shadow.visible = false;
        changed();
        return Promise.resolve();
      }
      if (shown?.url === background.url) {
        apply(background, shown.texture);
        changed();
        return Promise.resolve();
      }
      // Den gamla bilden står kvar tills den nya är läst. Samma bild hämtas inte två gånger.
      const { url } = background;
      if (loading === url) return arriving;
      loading = url;
      const done = () => {
        if (loading === url) loading = null;
      };
      arriving = new Promise((resolve) => {
        loader.load(
          url,
          (texture) => {
            done();
            resolve();
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
            resolve();
            if (!closed && wanted?.url === url) problem('Bakgrundens bild gick inte att läsa');
          },
        );
      });
      return arriving;
    },
    dispose() {
      closed = true;
      shown?.texture.dispose();
      shown = null;
      geometry.dispose();
      material.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
    },
  };
}
