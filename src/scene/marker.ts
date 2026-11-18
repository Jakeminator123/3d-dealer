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
//
// Kanten ritas bara där kortets egen kant syns. Kortet i skons mynning står där scenen säger (hämtstället, pickUpCard i
// dollPose.ts), sett genom filmens öga: det som inte är kort och ligger klart innanför det kortets kontur, eller nära
// kortet men djupare in i det än det gula bredvid, som en ärm eller skons läpp, ligger framför kortet. Där målas ingen
// kant; i plats 6, kort 0, ruta 36–66 blev ärmens kant mot nästa kort annars en flimrande vit fläck.

import * as THREE from 'three';
import type { Rgb } from './dealer.ts';
import { MARK_BACK, MARK_FACE } from './doll.ts';
import type { Pixel } from './geometry.ts';

/** Kortets färger, 0–255 per kanal: framsidan, dess kant och baksidan (content/scene.json, card.colours). */
export type CardColours = { face: Rgb; edge: Rgb; back: Rgb };

// Gränserna för märkkortets färger, i andelar av full ton. Blått över rött och grönt finns bara i märkkortet. Gult med
// lite blått i: märkkortets gula har min(röd, grön) − blå omkring 0,70 i filmen, blont hår och hud högst 0,25 (mätt i
// pilotens rutor 2026-11-18, output/work/runda/farger.mjs).
const BLUE = [0.1, 0.2];
const YELLOW = [0.33, 0.48];
// Det gula i skugga, till exempel under ärmen i plats 6, kort 1, ruta 30–62: mörkare (130, 98, 0 mot 222, 176, 5) men
// lika rent, nästan utan blått, så att min(röd, grön) − blå bara är 0,38 och kortet blev en orange rand. Det räknas som
// gult när min(röd, grön) − blå är minst SHADED och minst PURE av max(röd, grön); blont hår (220, 180, 90) har 0,41 av
// max och hud mindre. Mätt 2026-11-18 i alla 16 cykelklipp, var åttonde ruta (output/work/scen-sist/skuggat-gult.mjs):
// 106–275 bildpunkter till per klipp i halv storlek, alla vid kortet utom en i skons spänne (plats 6, kort 0, ruta 64).
const SHADED = [0.2, 0.3];
const PURE = [0.6, 0.72];
// Minsta skillnad i märkets tecken mellan kortet och dealern bredvid, när kortets andel i en kantpunkt räknas.
const SIGN_SPAN = 0.1;
// Hur nära triangeln mellan skärmen, märkkortets blå och dess gula en punkt ska ligga för att vara en blandning av dem,
// hur mycket blått den minst ska ha, och hur mycket mer blått än rött. Mätt 2026-11-18 i pilotens ruta 27: den turkosa
// spetsen ligger 0,08 från linjen mellan skärmen och det blå, med 0,69 blått. I plats 2, kort 0, ruta 26 är kortet mitt
// i vändningen en turkos oskärpa som ligger upp till 0,15 från triangeln (output/work/sko-arm/smet.mjs). Hår, hud och
// blus har mer rött än blått, och hårets kant mot skärmen ligger annars i triangeln.
const SCREEN_MIX = 0.15;
const SMEAR_LEAST = 0.15;
const BLUE_OVER_RED = 0.2;
// En punkt som är så här mycket kort ritas över det som står framför den vikta ytan.
const FRONT = 0.3;
// Hur långt innanför konturen av kortet i skons mynning, i filmens bildpunkter, det som ligger bredvid kortet ändå är
// platsen bredvid kortets egen kant, och var det i stället ligger framför kortet. Mätt 2026-11-18 i plats 6, kort 0,
// rutorna 0, 26, 90 och 96 (output/work/scen-sist/kantavstand.ts): det gula kortets kant mot skon ligger −3 till +3 bp
// från den räknade konturen; ärmens kant mot kortet i ruta 44 och 54 ligger 3–15 bp innanför den.
const OWN_EDGE = [3.5, 6];
// Nära kortet i mynningen, från så här långt utanför dess kontur (bp), ligger det som är djupare in i kortet än punkten
// själv framför kortet: kortets egen kant vetter alltid utåt, mot konturen. I ruta 44–61 sticker det gula ut upp till
// 5 bp utanför konturen, med ärmen innanför sig (output/work/scen-sist/efter-6-0-kontur.png). DEEPER är hur mycket
// djupare, i bp, grannen två steg bort ska ligga för att räknas så: en granne längs kanten ligger lika djupt.
const NEAR_CARD = [6, 10];
const DEEPER = [0.5, 1.5];

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
// Kortet i skons mynning i filmens bildpunkter (y nedåt), hörnen i den ordning där kortets inre har sideOf > 0 för
// varje kant (shoeCardUniforms), och filmens ruta. shoeCardOn är 0 när scenen inte vet var kortet står.
uniform vec2 shoeCard[4];
uniform float shoeCardOn;
uniform vec2 filmSize;
const vec3 MARK_FACE = ${glslRgb(MARK_FACE)};
const vec3 MARK_BACK = ${glslRgb(MARK_BACK)};

float sideOf(vec2 p, vec2 a, vec2 b) {
  vec2 e = b - a;
  return (e.x * (p.y - a.y) - e.y * (p.x - a.x)) / max(length(e), 1e-6);
}
// Hur långt innanför konturen av kortet i skons mynning punkten ligger, i filmens bildpunkter; negativt utanför.
float inShoeCard(vec2 at) {
  if (shoeCardOn < 0.5) return -1e6;
  vec2 p = vec2(at.x * filmSize.x, (1.0 - at.y) * filmSize.y) - 0.5;
  return min(min(sideOf(p, shoeCard[0], shoeCard[1]), sideOf(p, shoeCard[1], shoeCard[2])),
    min(sideOf(p, shoeCard[2], shoeCard[3]), sideOf(p, shoeCard[3], shoeCard[0])));
}
const vec2 OWN_EDGE = vec2(${OWN_EDGE.map((value) => value.toFixed(2)).join(', ')});
const vec2 NEAR_CARD = vec2(${NEAR_CARD.map((value) => value.toFixed(2)).join(', ')});
const vec2 DEEPER = vec2(${DEEPER.map((value) => value.toFixed(2)).join(', ')});
// Om det som ligger på punkten at bredvid kortets baksida, sett från en punkt som ligger here bp innanför kortet i skons
// mynning, är platsen bredvid kortets egen kant (1), eller ligger framför kortet (0): klart innanför kortets kontur, eller
// nära kortet och djupare in i det än punkten själv.
float besideEdge(vec2 at, float here) {
  float there = inShoeCard(at);
  float near = 1.0 - smoothstep(NEAR_CARD.x, NEAR_CARD.y, -here);
  return (1.0 - smoothstep(OWN_EDGE.x, OWN_EDGE.y, there)) * (1.0 - near * smoothstep(DEEPER.x, DEEPER.y, there - here));
}

// Hur mycket av en bildpunkt som är märkkortets blå (x) och gula (y), också det gula i skugga.
vec2 markOf(vec3 c) {
  float yellow = min(c.r, c.g) - c.b;
  float shaded = smoothstep(${SHADED[0]}, ${SHADED[1]}, yellow) * smoothstep(${PURE[0]}, ${PURE[1]}, yellow / max(max(c.r, c.g), 0.05));
  return vec2(smoothstep(${BLUE[0]}, ${BLUE[1]}, c.b - max(c.r, c.g)), max(smoothstep(${YELLOW[0]}, ${YELLOW[1]}, yellow), shaded));
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
// Hur mycket det som ligger på punkten at, med färgen colour, ger kortet en kant: inte kort eller hud, och för baksidan
// (onBack, sedd från en punkt here bp innanför kortet i skons mynning) inte framför det kortet.
float edgeFrom(vec2 at, vec3 colour, bool onBack, float here) {
  return (1.0 - smoothstep(0.3, 0.9, solidOf(colour))) * (onBack ? besideEdge(at, here) : 1.0);
}
float edgeAt(vec2 at, bool onBack, float here) {
  return edgeFrom(at, texture2D(map, at).rgb, onBack, here);
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
  // Märkkortet utsmetat i rörelse när det vänds: en blandning av skärmens gröna, det blå och det gula (turkos), som
  // nyckeln inte tar som skärm. Den ligger nära triangeln mellan de tre färgerna, också längre från kortet än proven når.
  // Andelarna blått och gult räknas med minsta kvadrat; resten är skärm.
  vec3 toB = MARK_FACE - key;
  vec3 toY = MARK_BACK - key;
  vec3 off = c - key;
  float bb = dot(toB, toB);
  float yy = dot(toY, toY);
  float by = dot(toB, toY);
  float det = max(bb * yy - by * by, 1e-6);
  float partB = clamp((dot(off, toB) * yy - dot(off, toY) * by) / det, 0.0, 1.0);
  float partY = clamp((dot(off, toY) * bb - dot(off, toB) * by) / det, 0.0, 1.0);
  float partCard = partB + partY;
  if (partCard > 1.0) {
    partB /= partCard;
    partY /= partCard;
    partCard = 1.0;
  }
  bool smear = own.x < 0.99 && own.y < 0.99 && partB > ${SMEAR_LEAST} && c.b - c.r > ${BLUE_OVER_RED} && skinOf(c) < 0.5
    && length(off - partB * toB - partY * toY) < ${SCREEN_MIX};
  if (!smear && max(max(own.x, own.y), max(beside.x, beside.y)) < 0.01) return vec4(colour, alpha);

  // Dealerns färg utan täckningen, och vilket märke punkten hör till: det som är mest här eller intill.
  vec3 u = colour / max(alpha, 0.004);
  vec2 which = max(own, beside);
  bool face = smear ? partB >= partY : which.x > which.y;
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
  // I det utsmetade kortet är skärmens del genomskinlig och resten kort.
  if (smear) {
    alpha = min(alpha, partCard);
    share = 1.0;
    O = u;
  }
  if (share < 0.004) return vec4(colour, alpha);

  // Kanten: kortet har skärm eller sko två steg bort åt något av åtta håll, inte kort eller hud. Baksidan får framsidans
  // färg där, som ett riktigt kort, och framsidan sin kant. Det som ligger klart innanför kortet i skons mynning ligger
  // framför baksidan där och ger ingen kant (besideEdge); framsidan och det utsmetade kortet är i luften.
  vec2 d = two * 0.7071;
  vec2 dx = vec2(two.x, 0.0);
  vec2 dy = vec2(0.0, two.y);
  vec2 dd = vec2(d.x, -d.y);
  bool onBack = !face && !smear;
  float here = inShoeCard(uv);
  float rim = max(max(max(edgeFrom(uv + dx, tx1, onBack, here), edgeFrom(uv - dx, tx0, onBack, here)), max(edgeFrom(uv + dy, ty1, onBack, here), edgeFrom(uv - dy, ty0, onBack, here))),
    max(max(edgeAt(uv + d, onBack, here), edgeAt(uv - d, onBack, here)), max(edgeAt(uv + dd, onBack, here), edgeAt(uv - dd, onBack, here))));
  vec3 facePaint = mix(cardFace, cardEdge, rim);
  vec3 backPaint = mix(cardBack, cardFace, rim);
  // Det utsmetade kortet är framsida och baksida i sina andelar; annars den sida punkten hör till.
  vec3 paint = smear ? mix(backPaint, facePaint, partB / max(partCard, 1e-4)) : face ? facePaint : backPaint;
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

/** Hur långt punkten `p` ligger till vänster om kanten från `a` till `b` (bildpunkter, y nedåt), som skuggarens sideOf. */
export const sideOf = (p: Pixel, a: Pixel, b: Pixel): number =>
  ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1e-6);

/**
 * Kortet i skons mynning sett genom filmens öga, som skuggarens värden: de fyra hörnen i filmens bildpunkter (`corners`,
 * runt kortet åt något håll), och filmens ruta. Hörnen ställs så att kortets inre ligger på den sida skuggaren räknar som
 * innanför. Utan hörn ritas kortets kant mot allt som inte är kort eller hud, som förr.
 */
export function shoeCardUniforms(corners: Pixel[] | null, frame: { width: number; height: number }) {
  const known = corners !== null && corners.length === 4;
  const centre = known ? { x: corners.reduce((sum, p) => sum + p.x, 0) / 4, y: corners.reduce((sum, p) => sum + p.y, 0) / 4 } : null;
  const ordered = known ? (sideOf(centre!, corners[0]!, corners[1]!) >= 0 ? corners : [...corners].reverse()) : [];
  return {
    shoeCard: { value: [0, 1, 2, 3].map((k) => new THREE.Vector2(ordered[k]?.x ?? 0, ordered[k]?.y ?? 0)) },
    shoeCardOn: { value: known ? 1 : 0 },
    filmSize: { value: new THREE.Vector2(frame.width, frame.height) },
  };
}
