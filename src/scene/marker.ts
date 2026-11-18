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
// Hur mycket av kantens färg framsidan får där den möter skärmen. Scenens kort har en kant som är en halv bildpunkt i
// filmen; med full kant (1) fick märkkortet en grå ram på tre bildpunkter som försvann när kortet landade. Valt i bild
// 2026-11-18 (output/work/scen-bild/).
const FACE_RIM = 0.35;
// Hur stor del av en kantpunkt mot hud som ändå räknas som hud, inte kort, när huden bredvid är hel hud. Valt i bild
// 2026-11-18 i plats 4, kort 0, ruta 43–47 (output/work/scen-bild/finger-4-0-*.png).
const FINGER_BIAS = 0.2;
// Hur mörk skuggan på kortet i en kantpunkt mot hud som mest blir, som andel av kortets ljus längre in.
const CARD_SHADE_LEAST = 0.45;

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

// Kortets framsida med valören (cards.ts, cardFaceImage), lagd på märkkortets blå genom fyrhörningen kring det i filmens
// ruta (faceFromFilm, se orientFace). faceOn är 0 när kortet inte går att se i rutan; då målas framsidan blank.
uniform sampler2D faceMap;
uniform float faceOn;
uniform mat3 faceFromFilm;
vec2 faceUv;
vec2 faceDx;
vec2 faceDy;
// Var punkten ligger i kortets bild, och hur mycket det ändras till grannpunkterna. Räknas först i main, innan någon
// punkt slängs, så att bilden läses lika skarpt vid kortets kant som inne i det.
void prepareFace(vec2 at) {
  vec2 p = vec2(at.x * filmSize.x, (1.0 - at.y) * filmSize.y) - 0.5;
  vec3 q = faceFromFilm * vec3(p, 1.0);
  faceUv = q.xy / max(q.z, 1e-6);
  faceUv.y = 1.0 - faceUv.y;
  faceDx = dFdx(faceUv);
  faceDy = dFdy(faceUv);
}
// Kortets framsida i punkten: bilden med valören, eller den blanka färgen.
vec3 facePrint() {
  if (faceOn < 0.5) return cardFace;
  vec4 print = textureGrad(faceMap, clamp(faceUv, 0.0, 1.0), faceDx, faceDy);
  return mix(cardFace, print.rgb, print.a);
}

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
  // Kortets eget ljus i punkten mot kortets längre in: en fingertopp mot kortet skuggar det i filmen.
  float cardShade = 1.0;
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
      // Hud bredvid: filmen lägger kortets blå reflex i fingertoppen, och den är finger, inte kort. Utan det blev
      // fingertoppen över kortet fläckvis vit, och genomskinlig när kortet hade landat (plats 4, kort 0, ruta 43–47).
      float skinBeside = ${FINGER_BIAS.toFixed(2)} * skinOf(O);
      mixed = clamp((mixed - skinBeside) / (1.0 - skinBeside), 0.0, 1.0);
      // Kortets färg i punkten när dealerns del är borttagen. Mörkare än kortet längre in är skugga, som linjen där
      // fingertoppen möter kortet: den följer med till det målade kortet och, när det blå är borttaget, till scenens.
      vec3 cardHere = (u - (1.0 - mixed) * O) / max(mixed, 0.25);
      // Som mest så här mörk, och bara där punkten är mest kort: annars blev linjen prickig (plats 4, kort 0, ruta 45).
      cardShade = mix(1.0, clamp(dot(cardHere, LUMA) / max(dot(M, LUMA), 0.05), ${CARD_SHADE_LEAST.toFixed(2)}, 1.0), smoothstep(0.3, 0.6, mixed));
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
  // Framsidan bär valören (facePrint) och har sin kant bara mot skärmen: mot ett finger på kortet är det fingret som syns,
  // inte kortets kant. Kanten är svag, som på scenens kort, så att bytet när kortet landar inte syns.
  float faceRim = max(max(screenOf(tx1, range), screenOf(tx0, range)), max(screenOf(ty1, range), screenOf(ty0, range)));
  vec3 facePaint = mix(facePrint(), cardEdge, faceRim * ${FACE_RIM.toFixed(2)});
  vec3 backPaint = mix(cardBack, cardFace, rim);
  // Det utsmetade kortet är framsida och baksida i sina andelar; annars den sida punkten hör till.
  vec3 paint = smear ? mix(backPaint, facePaint, partB / max(partCard, 1e-4)) : face ? facePaint : backPaint;
  // Kortets ljus i filmen följer med: skugga och rörelseoskärpa.
  paint = min(paint * clamp(dot(M, LUMA) / max(dot(nominal, LUMA), 0.05), 0.55, 1.15), 1.0) * cardShade;
  // Det blå tas bort när kortet ligger; annars målas det. Skuggan på det blå ligger kvar som en svart hinna över scenens kort.
  float gone = face ? marker : 0.0;
  front = share * (1.0 - gone);
  return vec4(alpha * ((1.0 - share) * O + share * (1.0 - gone) * paint), alpha * (1.0 - share * gone * cardShade));
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

// ---------------------------------------------------------------------------------------------------------------------
// Framsidan i luften. Ett riktigt kort visar sin valör så fort framsidan vänds upp, så märkkortets blå målas med samma
// bild av framsidan som scenens kort får när det landar (cards.ts, cardFaceImage). Bilden läggs på kortet där filmen
// visar det: för varje ruta letas det blå upp (findFace), dess kontur görs till en fyrhörning (quadOf), och hörnen ställs
// i kortets ordning (orientFace). Skuggaren slår upp bilden genom fyrhörningen (faceFromFilm).

/** Märkkortets blå i en bildpunkt, 0–255: blått minst så här mycket över rött och grönt. Mitt i skuggarens BLUE (0,15). */
const FACE_BLUE = 38;
// En bit av det blå räknas till kortet om den har minst så här många bildpunkter och minst den här andelen av den största
// biten: ett finger över kortet delar det i bitar, och kortets blå reflex i en fingertopp är några få bildpunkter.
const FACE_PIECE = [8, 0.1] as const;
// Minsta yta (bp²) och minsta andel blått av fyrhörningen för att kortets bild ska läggas: ett kort sett från kanten, eller
// en fyrhörning som är mycket större än det blå, bär ingen valör.
const FACE_AREA = 150;
const FACE_FILL = 0.45;

/** Fyra hörn i filmens bildpunkter (y nedåt, en bildpunkts mitt på heltalet). */
export type Quad = [Pixel, Pixel, Pixel, Pixel];

const crossOf = (o: Pixel, a: Pixel, b: Pixel): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Dubbla ytan med tecken: positiv när hörnen går medurs i bild (y nedåt), som kortets hörn sedda framifrån. */
export const turning = (polygon: Pixel[]): number =>
  polygon.reduce((sum, p, k) => {
    const q = polygon[(k + 1) % polygon.length]!;
    return sum + p.x * q.y - q.x * p.y;
  }, 0);

/** Det konvexa höljet kring punkterna, medurs i bild. */
export function convexHull(points: Pixel[]): Pixel[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const lower: Pixel[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && crossOf(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pixel[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && crossOf(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return turning(hull) < 0 ? hull.reverse() : hull;
}

/** Där linjen genom a och b möter linjen genom c och d. Null när de är parallella. */
function meet(a: Pixel, b: Pixel, c: Pixel, d: Pixel): Pixel | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

/**
 * Den fyrhörning som ett konvext hölje (medurs) ligger i, gjord genom att ta bort en kant i taget och förlänga
 * grannkanterna tills de möts, där det lägger till minst yta. Ett hörn som ett finger täcker blir en kort kant, och
 * kommer tillbaka när den tas bort. Null när höljet inte går att göra till fyra hörn.
 */
export function quadOf(hull: Pixel[]): Quad | null {
  const polygon = [...hull];
  while (polygon.length > 4) {
    const n = polygon.length;
    let best = -1;
    let bestArea = Infinity;
    let bestPoint: Pixel | null = null;
    for (let i = 0; i < n; i++) {
      const p0 = polygon[(i + n - 1) % n]!;
      const p1 = polygon[i]!;
      const p2 = polygon[(i + 1) % n]!;
      const p3 = polygon[(i + 2) % n]!;
      const x = meet(p0, p1, p3, p2);
      if (!x) continue;
      // Grannkanterna ska mötas framför kanten, inte bakom: förlängda åt det håll de redan går.
      if ((x.x - p1.x) * (p1.x - p0.x) + (x.y - p1.y) * (p1.y - p0.y) < 0) continue;
      if ((x.x - p2.x) * (p2.x - p3.x) + (x.y - p2.y) * (p2.y - p3.y) < 0) continue;
      const added = Math.abs(crossOf(p1, p2, x)) / 2;
      if (added < bestArea) {
        bestArea = added;
        best = i;
        bestPoint = x;
      }
    }
    if (best < 0 || !bestPoint) return null;
    if (best === n - 1) {
      polygon.splice(best, 1, bestPoint);
      polygon.splice(0, 1);
    } else {
      polygon.splice(best, 2, bestPoint);
    }
  }
  return polygon.length === 4 ? (polygon as Quad) : null;
}

/** Märkkortets framsida i en ruta: fyrhörningen kring det blå, i filmens bildpunkter, och hur många bildpunkter som är blå. */
export type FaceFind = { quad: Quad; pixels: number };

/**
 * Letar upp märkkortets blå i en bild (RGBA, `width` × `height`, rad för rad uppifrån) och ger fyrhörningen kring det.
 * `at` är bildens övre vänstra hörn i filmen, så att hörnen kommer i filmens bildpunkter. Null när det blå är för litet
 * eller inte bildar ett kort.
 */
export function findFace(data: ArrayLike<number>, width: number, height: number, at: Pixel = { x: 0, y: 0 }): FaceFind | null {
  const blue = new Uint8Array(width * height);
  for (let k = 0, p = 0; k < blue.length; k++, p += 4) blue[k] = data[p + 2]! - Math.max(data[p]!, data[p + 1]!) >= FACE_BLUE ? 1 : 0;
  // Bitarna av det blå, grannar åt fyra håll.
  const piece = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < blue.length; start++) {
    if (!blue[start] || piece[start]! >= 0) continue;
    const id = sizes.length;
    let size = 0;
    piece[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const k = stack.pop()!;
      size++;
      const x = k % width;
      const next = [x > 0 ? k - 1 : -1, x < width - 1 ? k + 1 : -1, k - width, k + width];
      for (const m of next) {
        if (m < 0 || m >= blue.length || !blue[m] || piece[m]! >= 0) continue;
        piece[m] = id;
        stack.push(m);
      }
    }
    sizes.push(size);
  }
  if (sizes.length === 0) return null;
  const least = Math.max(FACE_PIECE[0], FACE_PIECE[1] * Math.max(...sizes));
  // Höljet räknas på bildpunkternas rutor: radens första och sista blå punkt med sina hörn.
  const points: Pixel[] = [];
  let pixels = 0;
  for (let y = 0; y < height; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x++) {
      const id = piece[y * width + x]!;
      if (id < 0 || sizes[id]! < least) continue;
      pixels++;
      if (first < 0) first = x;
      last = x;
    }
    if (first < 0) continue;
    for (const [x, side] of [[first, -0.5], [last, 0.5]] as const) {
      points.push({ x: at.x + x + side, y: at.y + y - 0.5 }, { x: at.x + x + side, y: at.y + y + 0.5 });
    }
  }
  if (pixels < FACE_AREA / 2) return null;
  const quad = quadOf(convexHull(points));
  if (!quad) return null;
  const area = turning(quad) / 2;
  if (area < FACE_AREA || pixels < FACE_FILL * area) return null;
  return { quad, pixels };
}

const between = (a: Pixel, b: Pixel): number => Math.hypot(a.x - b.x, a.y - b.y);
const rotate = (quad: Quad, k: number): Quad => [0, 1, 2, 3].map((i) => quad[(i + k) % 4]!) as Quad;

/** Hur långt fyrhörningens hörn ligger från en annans, hörn för hörn: det största avståndet, bp. */
export const quadDistance = (a: Quad, b: Quad): number => Math.max(...a.map((p, i) => between(p, b[i]!)));

/**
 * Hur illa fyrhörningen passar ett kort `width` × `height` (meter) när dess kant från hörn 0 till 1 är kortets bredd,
 * sett med `scale` bildpunkter per meter på kortets avstånd. Kortet är litet mot sitt avstånd, så bilden av det är nära
 * en parallellogram: kortets två kanter är vinkelräta och har sina längder, och bilden av dem är kortare eller lika långa.
 */
export function cardMisfit(quad: Quad, scale: number, width: number, height: number): number {
  const a = { x: (quad[1].x - quad[0].x + quad[2].x - quad[3].x) / 2 / scale, y: (quad[1].y - quad[0].y + quad[2].y - quad[3].y) / 2 / scale };
  const b = { x: (quad[3].x - quad[0].x + quad[2].x - quad[1].x) / 2 / scale, y: (quad[3].y - quad[0].y + quad[2].y - quad[1].y) / 2 / scale };
  const la = Math.hypot(a.x, a.y);
  const lb = Math.hypot(b.x, b.y);
  // Djupet längs varje kant, så att den blir så lång som kortets kant; kanterna är vinkelräta när djupen tar ut bildens lutning.
  const za = Math.sqrt(Math.max(0, width * width - la * la));
  const zb = Math.sqrt(Math.max(0, height * height - lb * lb));
  const long = (Math.max(0, la - width) / width) ** 2 + (Math.max(0, lb - height) / height) ** 2;
  const square = ((za * zb - Math.abs(a.x * b.x + a.y * b.y)) / (width * height)) ** 2;
  return long + square;
}

// Fyrhörningen i rutan innan behåller sin ordning när kortet har flyttat sig mindre än den här andelen av sin storlek.
const FACE_FOLLOW = 1 / 3;
// Inom så här många bildpunkter från scenens kort på kortplatsen (hörn för hörn, det största avståndet) läggs bilden allt
// mer där scenens kort ligger, och helt där inom det första talet: när kortet landar byts filmens kort mot scenens, och
// valören står då redan där scenens kort har den. Mätt 2026-11-18 i plats 2, kort 0: filmens kort ligger 0,5–4 bp från
// kortplatsens hörn när det ligger still (ruta 46), 9 bp när det landar (ruta 44); output/work/scen-bild/prov-fyrhorning.ts.
const FACE_LANDING = [4, 14] as const;

/** Hur lika två fyrhörningar är till formen, hörn för hörn, när båda är flyttade så att deras mitt ligger i origo. */
function shapeDistance(a: Quad, b: Quad): number {
  const mid = (q: Quad): Pixel => ({ x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 });
  const ma = mid(a);
  const mb = mid(b);
  return a.reduce((sum, p, i) => sum + Math.hypot(p.x - ma.x - (b[i]!.x - mb.x), p.y - ma.y - (b[i]!.y - mb.y)), 0);
}

export type FaceGuide = {
  /** Scenens kort på kortplatsen, sett genom filmens öga, med hörnen i kortets ordning. */
  landing: Quad | null;
  /** Fyrhörningen i rutan innan, i kortets ordning, om den rutan låg alldeles före. */
  previous: Quad | null;
  /** Bildpunkter per meter på kortets avstånd, och kortets mått: för ett kort utan kortplats. */
  scale: number;
  card: { width: number; height: number };
};

/**
 * Fyrhörningen kring det blå (medurs) med hörnen i kortets ordning: uppe till vänster, uppe till höger, nere till höger,
 * nere till vänster i kortets bild (cards.ts). Medurs i bild är framsidan sedd framifrån, så bilden blir aldrig spegelvänd.
 *
 * Ordningen följer rutan innan (`previous`) så länge kortet bara har flyttat sig en bit, så att bilden inte vänder sig
 * mellan två rutor. Annars ställs hörnen som på scenens kort på kortplatsen (`landing`), det läge som är mest likt till
 * formen: filmens kort är blankt och bär ingen egen ordning, men när det ligger ska valören stå som på scenens kort.
 * Nära kortplatsen dras hörnen mot scenens kort (FACE_LANDING). Utan kortplats avgör kortets mått vilken kant som är
 * bredden (cardMisfit), och överkanten är den som ligger högst i bild.
 */
export function orientFace(quad: Quad, guide: FaceGuide): Quad {
  const turns = [0, 1, 2, 3].map((k) => rotate(quad, k));
  const { landing, previous } = guide;
  let chosen: Quad | null = null;
  if (previous) {
    const size = (between(previous[0], previous[2]) + between(previous[1], previous[3])) / 2;
    const near = turns.map((turned) => turned.reduce((sum, p, i) => sum + between(p, previous[i]!), 0) / 4);
    const k = near.indexOf(Math.min(...near));
    if (near[k]! < size * FACE_FOLLOW) chosen = turns[k]!;
  }
  if (!chosen && landing) {
    const shapes = turns.map((turned) => shapeDistance(turned, landing));
    chosen = turns[shapes.indexOf(Math.min(...shapes))]!;
  }
  if (!chosen) {
    const even = cardMisfit(turns[0]!, guide.scale, guide.card.width, guide.card.height);
    const odd = cardMisfit(turns[1]!, guide.scale, guide.card.width, guide.card.height);
    const [a, b] = even <= odd ? [turns[0]!, turns[2]!] : [turns[1]!, turns[3]!];
    const top = (q: Quad): number => q[0].y + q[1].y;
    chosen = top(a) <= top(b) ? a : b;
  }
  if (!landing) return chosen;
  // Nära kortplatsen: hörnen dras mot scenens kort, i det läge som ligger närmast.
  const placed = turns.map((turned) => quadDistance(turned, landing));
  const k = placed.indexOf(Math.min(...placed));
  const pull = 1 - smooth(FACE_LANDING[0], FACE_LANDING[1], placed[k]!);
  if (pull <= 0) return chosen;
  return turns[k]!.map((p, i) => ({ x: p.x + (landing[i]!.x - p.x) * pull, y: p.y + (landing[i]!.y - p.y) * pull })) as Quad;
}

/** Som GLSL:s smoothstep. */
const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Avbildningen från filmens bildpunkter till kortets bild: (x, y, 1) gånger matrisen ger (u·w, v·w, w), där u går från
 * kortets vänstra kant till dess högra och v från överkanten nedåt, båda 0–1. Raderna står efter varandra. w är positiv
 * inne i kortet.
 */
export function filmToFace(quad: Quad): number[] {
  const [p0, p1, p2, p3] = quad;
  // Från kortets ruta (u, v) till bilden, som Heckbert: hörnen (0,0), (1,0), (1,1), (0,1) till p0, p1, p2, p3.
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(den) < 1e-12 ? 0 : (sx * dy2 - dx2 * sy) / den;
  const h = Math.abs(den) < 1e-12 ? 0 : (dx1 * sy - sx * dy1) / den;
  const m = [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h, 1];
  const [a, b, c, d, e, f, gg, hh, i] = m as [number, number, number, number, number, number, number, number, number];
  const inverse = [e * i - f * hh, c * hh - b * i, b * f - c * e, f * gg - d * i, a * i - c * gg, c * d - a * f, d * hh - e * gg, b * gg - a * hh, a * e - b * d];
  // Tecknet ställs så att w är positiv i kortets mitt.
  const middle = { x: (p0.x + p1.x + p2.x + p3.x) / 4, y: (p0.y + p1.y + p2.y + p3.y) / 4 };
  const w = inverse[6]! * middle.x + inverse[7]! * middle.y + inverse[8]!;
  return w < 0 ? inverse.map((value) => -value) : inverse;
}

/** Kortets punkt (u, v) för filmens bildpunkt `p` genom avbildningen `m` (filmToFace). */
export function faceAt(m: number[], p: Pixel): Pixel {
  const w = m[6]! * p.x + m[7]! * p.y + m[8]!;
  return { x: (m[0]! * p.x + m[1]! * p.y + m[2]!) / w, y: (m[3]! * p.x + m[4]! * p.y + m[5]!) / w };
}

/** Skuggarens värden för kortets framsida i luften: bilden med valören, om kortet syns, och avbildningen dit ur filmen. */
export function faceUniforms(): { faceMap: { value: THREE.Texture | null }; faceOn: { value: number }; faceFromFilm: { value: THREE.Matrix3 } } {
  return { faceMap: { value: null }, faceOn: { value: 0 }, faceFromFilm: { value: new THREE.Matrix3() } };
}

/** Lägger kortets bild på fyrhörningen `quad` i kortets ordning (orientFace), eller tar bort den med null. */
export function setFaceQuad(uniforms: ReturnType<typeof faceUniforms>, quad: Quad | null): void {
  uniforms.faceOn.value = quad && uniforms.faceMap.value ? 1 : 0;
  if (quad) uniforms.faceFromFilm.value.set(...(filmToFace(quad) as Parameters<THREE.Matrix3['set']>));
}

// Rutan letas först igenom i en fjärdedels storlek, och där det blå finns läses den i full storlek med så här många
// bildpunkters luft runt om. Det blå i den lilla bilden är utspätt med skärmen, så gränsen där är hälften.
const FACE_COARSE = 4;
const FACE_MARGIN = 6;

/** Letar upp märkkortets blå i en ruta (findFace). `width` och `height` är bildens egna mått. */
export type FaceTracker = { find(source: CanvasImageSource, width: number, height: number): FaceFind | null };

/** Letar upp märkkortets framsida i en films rutor, för en film med rutan `frame`. Bara i en webbläsare. */
export function createFaceTracker(frame: { width: number; height: number }): FaceTracker {
  const coarse = document.createElement('canvas');
  coarse.width = Math.ceil(frame.width / FACE_COARSE);
  coarse.height = Math.ceil(frame.height / FACE_COARSE);
  const small = coarse.getContext('2d', { willReadFrequently: true })!;
  const fine = document.createElement('canvas');
  const near = fine.getContext('2d', { willReadFrequently: true })!;
  return {
    find(source, width, height) {
      small.drawImage(source, 0, 0, width, height, 0, 0, coarse.width, coarse.height);
      const { data } = small.getImageData(0, 0, coarse.width, coarse.height);
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -1;
      let y1 = -1;
      for (let k = 0, p = 0; p < data.length; k++, p += 4) {
        if (data[p + 2]! - Math.max(data[p]!, data[p + 1]!) < FACE_BLUE / 2) continue;
        const x = k % coarse.width;
        const y = (k - x) / coarse.width;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      if (x1 < 0) return null;
      const across = frame.width / coarse.width;
      const down = frame.height / coarse.height;
      const left = Math.max(0, Math.floor(x0 * across) - FACE_MARGIN);
      const top = Math.max(0, Math.floor(y0 * down) - FACE_MARGIN);
      const right = Math.min(frame.width, Math.ceil((x1 + 1) * across) + FACE_MARGIN);
      const bottom = Math.min(frame.height, Math.ceil((y1 + 1) * down) + FACE_MARGIN);
      const w = right - left;
      const h = bottom - top;
      if (fine.width < w || fine.height < h) {
        fine.width = Math.max(fine.width, w);
        fine.height = Math.max(fine.height, h);
      }
      const sx = width / frame.width;
      const sy = height / frame.height;
      near.drawImage(source, left * sx, top * sy, w * sx, h * sy, 0, 0, w, h);
      return findFace(near.getImageData(0, 0, w, h).data, w, h, { x: left, y: top });
    },
  };
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
