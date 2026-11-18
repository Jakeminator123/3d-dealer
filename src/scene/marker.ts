// Märkkortet i dealerfilmen blir ett spelkort. Filmen bär ett enfärgat märkkort, gult på baksidan och blått på framsidan
// (doll.ts, MARK_BACK och MARK_FACE). Nyckeln (key.ts) målar det gula som kortets baksida, med framsidans färg som kant
// där kortet möter skärmen eller skon, och det blå som kortets framsida medan kortet är i luften. När kortet ligger tas
// det blå bort, så att scenens eget kort syns där under handen. Färgerna står i content/scene.json (card.colours).
//
// En bildpunkt i kortets kant är en blandning av kortet och det som ligger bredvid: skärm, sko eller ett finger. Andelen
// kort räknas ur var punktens märke (blått mot rött, gult mot blått) ligger mellan kortets några steg in i kortet och
// dealerns några steg ut från det. Då får en fingertopp mot kortet sin egen färg i kanten, inte en blandning med blått.
//
// Kortet ritas över scenens sko: filmens kort i skons mynning är det som filmens öga såg där, och skons modell står
// framför den vikta ytan.

import * as THREE from 'three';
import type { Rgb } from './dealer.ts';
import { MARK_BACK, MARK_FACE } from './doll.ts';

/** Kortets färger, 0–255 per kanal: framsidan, dess kant och baksidan (content/scene.json, card.colours). */
export type CardColours = { face: Rgb; edge: Rgb; back: Rgb };

// Gränserna för märkkortets färger, i andelar av full ton. Blått över rött och grönt finns bara i märkkortet. Gult med
// lite blått i: märkkortets gula har min(röd, grön) − blå omkring 0,70 i filmen, blont hår och hud högst 0,25 (mätt i
// pilotens rutor 2026-11-18, output/work/runda/farger.mjs).
const BLUE = [0.1, 0.2];
const YELLOW = [0.33, 0.48];
// Minsta skillnad i märkets tecken mellan kortet och dealern bredvid, när kortets andel i en kantpunkt räknas.
const SIGN_SPAN = 0.1;
// Hur nära linjen mellan skärmen och märkkortets blå en punkt ska ligga för att vara en blandning av dem, och hur mycket
// blått den minst ska ha. Mätt 2026-11-18 i pilotens ruta 27: den turkosa spetsen ligger 0,08 från linjen, med 0,69 blått.
const SCREEN_MIX = 0.1;
const SMEAR_LEAST = 0.15;
// En punkt som är så här mycket kort ritas över det som står framför den vikta ytan.
const FRONT = 0.3;

const glslRgb = (colour: number): string =>
  `vec3(${[(colour >> 16) & 255, (colour >> 8) & 255, colour & 255].map((part) => (part / 255).toFixed(4)).join(', ')})`;

/**
 * GLSL för nyckelns bildskuggare. Den behöver `map`, `texel`, `key`, `marker`, `LUMA` och `screenOf` och ger
 * `markCard`: dealerns färg och täckning (förmultiplicerad) med märkkortet målat eller borttaget, och i `front` hur
 * mycket av punkten som är målat kort.
 */
export const MARKER_GLSL = /* glsl */ `
uniform vec3 cardFace;
uniform vec3 cardEdge;
uniform vec3 cardBack;
const vec3 MARK_FACE = ${glslRgb(MARK_FACE)};
const vec3 MARK_BACK = ${glslRgb(MARK_BACK)};

// Hur mycket av en bildpunkt som är märkkortets blå (x) och gula (y).
vec2 markOf(vec3 c) {
  return vec2(smoothstep(${BLUE[0]}, ${BLUE[1]}, c.b - max(c.r, c.g)), smoothstep(${YELLOW[0]}, ${YELLOW[1]}, min(c.r, c.g) - c.b));
}
// Hud, kring samma gräns som tagningens mätningar (pipeline/cykel.ts, isSkin), mjukt, så att kanten inte fladdrar med
// filmens brus.
float skinOf(vec3 c) {
  return smoothstep(0.37, 0.45, c.r) * smoothstep(0.0, 0.06, c.r - c.g) * smoothstep(-0.05, 0.0, c.g - c.b) * smoothstep(0.05, 0.12, c.r - c.b);
}
// Det som inte ger kortet en kant: kort eller hud.
float solidOf(vec3 c) {
  vec2 m = markOf(c);
  return max(max(m.x, m.y), skinOf(c));
}
float solidAt(vec2 uv) {
  return solidOf(texture2D(map, uv).rgb);
}
// Märkets tecken i en färg: blått mot rött för framsidan, gult mot blått för baksidan.
float signOf(vec3 c, bool face) {
  return face ? c.b - c.r : min(c.r, c.g) - c.b;
}

vec4 markCard(vec2 uv, vec3 c, vec3 colour, float alpha, float range, out float front) {
  front = 0.0;
  vec2 two = texel * 2.0;
  vec2 four = texel * 4.0;
  vec3 tx1 = texture2D(map, uv + vec2(two.x, 0.0)).rgb;
  vec3 tx0 = texture2D(map, uv - vec2(two.x, 0.0)).rgb;
  vec3 ty1 = texture2D(map, uv + vec2(0.0, two.y)).rgb;
  vec3 ty0 = texture2D(map, uv - vec2(0.0, two.y)).rgb;
  vec2 mx1 = markOf(tx1), mx0 = markOf(tx0), my1 = markOf(ty1), my0 = markOf(ty0);
  vec2 Mx1 = markOf(texture2D(map, uv + vec2(four.x, 0.0)).rgb);
  vec2 Mx0 = markOf(texture2D(map, uv - vec2(four.x, 0.0)).rgb);
  vec2 My1 = markOf(texture2D(map, uv + vec2(0.0, four.y)).rgb);
  vec2 My0 = markOf(texture2D(map, uv - vec2(0.0, four.y)).rgb);
  vec2 own = markOf(c);
  vec2 beside = max(max(max(mx1, mx0), max(my1, my0)), max(max(Mx1, Mx0), max(My1, My0)));
  // Märkkortets blå utsmetat mot skärmen när kortet vänds: en blandning av det blå och skärmens gröna (turkos), som
  // nyckeln inte tar som skärm. Den ligger på linjen mellan skärmen och det blå, också längre från kortet än proven når.
  vec3 spanB = MARK_FACE - key;
  float partB = clamp(dot(c - key, spanB) / max(dot(spanB, spanB), 1e-4), 0.0, 1.0);
  bool smear = own.x < 0.99 && partB > ${SMEAR_LEAST} && length(c - key - partB * spanB) < ${SCREEN_MIX};
  if (!smear && max(max(own.x, own.y), max(beside.x, beside.y)) < 0.01) return vec4(colour, alpha);

  // Dealerns färg utan täckningen, och vilket märke punkten hör till: det som är mest här eller intill.
  vec3 u = colour / max(alpha, 0.004);
  vec2 which = max(own, beside);
  bool face = smear || which.x > which.y;
  vec3 nominal = face ? MARK_FACE : MARK_BACK;
  vec2 keyed = markOf(u);
  float share = face ? max(own.x, keyed.x) : max(own.y, keyed.y);

  // Kortets färg här (M) och färgen bredvid kortet (O). I kanten hämtas de fyra steg in i kortet och fyra steg ut.
  vec3 M = c;
  vec3 O = u;
  vec2 toward = vec2(
    (mx1.x + mx1.y) - (mx0.x + mx0.y) + (Mx1.x + Mx1.y) - (Mx0.x + Mx0.y),
    (my1.x + my1.y) - (my0.x + my0.y) + (My1.x + My1.y) - (My0.x + My0.y));
  if (share < 0.99 && dot(toward, toward) > 1e-4) {
    vec2 step4 = normalize(toward) * texel * 4.0;
    vec3 inside = texture2D(map, uv + step4).rgb;
    vec3 outside = texture2D(map, uv - step4).rgb;
    vec2 mIn = markOf(inside);
    M = (face ? mIn.x : mIn.y) > 0.5 ? inside : nominal;
    float outScreen = screenOf(outside, range);
    vec2 mOut = markOf(outside);
    if (outScreen < 0.5 && max(mOut.x, mOut.y) < 0.5) {
      // Bredvid ligger dealern, till exempel en fingertopp: punkten är en blandning av henne och kortet, och filmens
      // kodning för kortets färg ett par punkter in i fingret. Kortets andel är var punktens märke ligger mellan
      // dealerns och kortets; märket är blått mot rött eller gult mot blått, så att skugga och ljus spelar mindre roll.
      O = max(outside - outScreen * key, 0.0) / max(1.0 - outScreen, 0.05);
      float sO = signOf(O, face);
      float mixed = clamp((signOf(u, face) - sO) / max(signOf(M, face) - sO, ${SIGN_SPAN}), 0.0, 1.0);
      share = max(share, mixed * (face ? beside.x : beside.y));
    } else {
      O = u;
    }
  }
  // I det utsmetade blå är skärmens del genomskinlig och resten kort.
  if (smear) {
    alpha = min(alpha, partB);
    share = 1.0;
    O = u;
  }
  if (share < 0.004) return vec4(colour, alpha);

  // Kanten: kortet har skärm eller sko två steg bort åt något av åtta håll, inte kort eller hud. Baksidan får framsidans
  // färg där, som ett riktigt kort, och framsidan sin kant.
  vec2 d = two * 0.7071;
  float solid = min(min(min(solidOf(tx1), solidOf(tx0)), min(solidOf(ty1), solidOf(ty0))),
    min(min(solidAt(uv + d), solidAt(uv - d)), min(solidAt(uv + vec2(d.x, -d.y)), solidAt(uv - vec2(d.x, -d.y)))));
  float rim = 1.0 - smoothstep(0.3, 0.9, solid);
  vec3 paint = face ? mix(cardFace, cardEdge, rim) : mix(cardBack, cardFace, rim);
  // Kortets ljus i filmen följer med: skugga och rörelseoskärpa.
  paint = min(paint * clamp(dot(M, LUMA) / max(dot(nominal, LUMA), 0.05), 0.55, 1.15), 1.0);
  // Det blå tas bort när kortet ligger; annars målas det.
  float gone = face ? marker : 0.0;
  front = share * (1.0 - gone);
  return vec4(alpha * ((1.0 - share) * O + share * (1.0 - gone) * paint), alpha * (1.0 - share * gone));
}

// Hur mycket av punkten som är målat kort, för att det ska ritas över det som står framför den vikta ytan.
float frontDepth(float front) {
  return front > ${FRONT} ? 0.0 : gl_FragCoord.z;
}
`;

const vec = (rgb: Rgb): THREE.Vector3 => new THREE.Vector3(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);

/** Skuggarens värden för kortets färger. */
export function markerUniforms(colours: CardColours): Record<'cardFace' | 'cardEdge' | 'cardBack', { value: THREE.Vector3 }> {
  return { cardFace: { value: vec(colours.face) }, cardEdge: { value: vec(colours.edge) }, cardBack: { value: vec(colours.back) } };
}
