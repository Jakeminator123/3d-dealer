// Scenens rena geometri: kameran ur beskrivningen, vägen mellan bildpunkt och punkt i scenen, vecket och ögat för varje plats.
// Inget three och ingen filläsning, så att Node kan pröva allt.
//
// Förd över ur gamla Dealer (C:/Users/jakem/dev/super-feature-sg/dealer, commit 1198340774d8ee78be218506a169faeaa781fa22):
//   src/table-lens.ts        filmEye, see, onPlane, onUpright, orbit, cardCorners
//   dealer3d/src/world.ts    seatEye, dealerEdge
//   src/scene3d-geometry.ts  viewFovDeg, filmToScene (vecket)
// Skillnaden mot förlagan: linsen, rutan och bordskanten läses ur beskrivningen i stället för att stå i koden.
//
// Bildpunkter är punkternas mitt i kamerans ruta, med origo uppe till vänster och y nedåt.

import type { FeltPoint, Frame, SceneDescription, Vec3 } from './description.ts';

export type Pixel = { x: number; y: number };

/** En hålkamera utan rullning: var den står, vart den ser, brännvidden i bildpunkter och rutan den ritar. */
export type Eye = { position: Vec3; forward: Vec3; focalPx: number; frame: Frame };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const radians = (degrees: number): number => (degrees * Math.PI) / 180;
const degrees = (value: number): number => (value * 180) / Math.PI;

const middle = (frame: Frame): Pixel => ({ x: (frame.width - 1) / 2, y: (frame.height - 1) / 2 });

function axes(eye: Eye): { forward: Vec3; right: Vec3; up: Vec3 } {
  const forward = unit(eye.forward);
  const right = unit(cross(forward, [0, 1, 0]));
  return { forward, right, up: cross(right, forward) };
}

function ray(eye: Eye, pixel: Pixel): Vec3 {
  const { forward, right, up } = axes(eye);
  const centre = middle(eye.frame);
  return add(add(forward, mul(right, (pixel.x - centre.x) / eye.focalPx)), mul(up, -(pixel.y - centre.y) / eye.focalPx));
}

/** Filmkameran som öga: den kamera dealerns bilder är gjorda genom och läggs på den vikta ytan genom. */
export function sceneEye(scene: SceneDescription): Eye {
  const { position, pitchDeg, focalPx, frame } = scene.camera;
  const pitch = radians(pitchDeg);
  return { position, forward: [0, -Math.sin(pitch), -Math.cos(pitch)], focalPx, frame };
}

/**
 * Spelarens öga: vyn scenen ses i. Det står mitt för bordet, så långt från dealerns bordskant och så högt över filten
 * som beskrivningen säger, och ritar samma ruta som filmkameran med sin egen bildvinkel.
 */
export function playerEye(scene: SceneDescription): Eye {
  const { height, distance, pitchDeg, fovDeg } = scene.player;
  const { frame } = scene.camera;
  const pitch = radians(pitchDeg);
  return {
    position: [0, height, scene.dealerEdge.z + distance],
    forward: [0, -Math.sin(pitch), -Math.cos(pitch)],
    focalPx: frame.height / 2 / Math.tan(radians(fovDeg) / 2),
    frame,
  };
}

/** Ögats lodräta synfält över hela rutan, i grader. */
export const fovYDeg = (eye: Eye): number => degrees(2 * Math.atan(eye.frame.height / 2 / eye.focalPx));

/**
 * Det lodräta synfält som visar hela rutan på en yta med ett annat sidförhållande:
 * rutan passas in på höjden när ytan är bredare än rutan, annars på bredden.
 */
export function viewFovDeg(eye: Eye, aspect: number): number {
  const { width, height } = eye.frame;
  const half = aspect >= width / height ? height / 2 / eye.focalPx : width / 2 / eye.focalPx / aspect;
  return degrees(2 * Math.atan(half));
}

/** En punkt i scenen så som ögat ser den, i bildpunkter. Null bakom ögat. */
export function see(eye: Eye, point: Vec3): Pixel | null {
  const { forward, right, up } = axes(eye);
  const centre = middle(eye.frame);
  const offset = sub(point, eye.position);
  const depth = dot(offset, forward);
  if (depth <= 1e-9) return null;
  return { x: centre.x + (eye.focalPx * dot(offset, right)) / depth, y: centre.y - (eye.focalPx * dot(offset, up)) / depth };
}

/** Punkten där strålen genom en bildpunkt möter det vågräta planet `lift` meter över filten. Null vid horisonten och över den. */
export function onPlane(eye: Eye, pixel: Pixel, lift = 0): Vec3 | null {
  const direction = ray(eye, pixel);
  if (direction[1] > -1e-9) return null;
  return add(eye.position, mul(direction, (lift - eye.position[1]) / direction[1]));
}

/** Punkten där strålen genom en bildpunkt möter det upprätta planet på djupet `z`. Null om den aldrig gör det. */
export function onUpright(eye: Eye, pixel: Pixel, z: number): Vec3 | null {
  const direction = ray(eye, pixel);
  const along = (z - eye.position[2]) / direction[2];
  return Number.isFinite(along) && along > 0 ? add(eye.position, mul(direction, along)) : null;
}

/** Samma öga fört runt lodlinjen genom `pivot`. En positiv vinkel (radianer) flyttar det åt höger i bild. */
export function orbit(eye: Eye, pivot: Vec3, angle: number): Eye {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const turn = (v: Vec3): Vec3 => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  return { ...eye, position: add(pivot, turn(sub(eye.position, pivot))), forward: turn(eye.forward) };
}

const onFelt = (point: FeltPoint): Vec3 => [point[0], 0, point[1]];

/** Mitten av dealerns bordskant på filten. */
export const dealerEdge = (scene: SceneDescription): Vec3 => [0, 0, scene.dealerEdge.z];

/** Var bordsmodellens origo ska stå för att filten ska ligga på y = 0 och dealerns kant där scenen har den. */
export function tablePosition(scene: SceneDescription): Vec3 {
  const { feltY, dealerEdgeZ } = scene.table.model;
  return [0, -feltY, scene.dealerEdge.z - dealerEdgeZ];
}

/**
 * Bordets lutning som en matris, rad för rad (4 × 4): en vridning kring dealerns bordskant som sänker sidan mot spelaren.
 * Allt som ligger på bordet har sitt läge angivet som på ett olutat bord och flyttas med den här matrisen.
 */
export function tableTilt(scene: SceneDescription): number[] {
  const angle = radians(scene.table.tilt.deg);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const edge = scene.dealerEdge.z;
  return [1, 0, 0, 0, 0, c, -s, s * edge, 0, s, c, edge - c * edge, 0, 0, 0, 1];
}

/** En punkt på det olutade bordet, där den hamnar när bordet lutas. */
export function tilted(scene: SceneDescription, point: Vec3): Vec3 {
  const m = tableTilt(scene);
  const [x, y, z] = point;
  return [x, m[5]! * y + m[6]! * z + m[7]!, m[9]! * y + m[10]! * z + m[11]!];
}

/** En kortplats som punkt i scenen: på filten, där bordets lutning lägger den. */
export const placeOnTable = (scene: SceneDescription, place: FeltPoint): Vec3 => tilted(scene, [place[0], 0, place[1]]);

/** Bordsmodellens låda i scenen: dess åtta hörn, där modellen står och bordets lutning ställer dem. */
function tableBox(scene: SceneDescription): Vec3[] {
  const { min, max } = scene.table.model.box;
  const at = tablePosition(scene);
  const corners: Vec3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) corners.push(tilted(scene, add(at, [x, y, z])));
  return corners;
}

/**
 * Golvets höjd: det lutade bordets lägsta punkt. Bordsmodellens undersida står på golvet när bordet är olutat; lutat
 * sjunker sidan mot spelaren, och golvet läggs där, så att bordet aldrig går ned i det.
 */
export const floorY = (scene: SceneDescription): number => Math.min(...tableBox(scene).map((corner) => corner[1]));

/** Bordets fotavtryck på golvet, sett rakt uppifrån: den minsta och den största punkten i x och z. */
export function tableFootprint(scene: SceneDescription): { min: FeltPoint; max: FeltPoint } {
  const corners = tableBox(scene);
  const xs = corners.map((corner) => corner[0]);
  const zs = corners.map((corner) => corner[2]);
  return { min: [Math.min(...xs), Math.min(...zs)], max: [Math.max(...xs), Math.max(...zs)] };
}

/**
 * Punkten på golvet som en 360-bild antas vara tagen över: rakt under spelarens öga. Då ser spelaren rummet som bilden
 * är tagen, så när som på skillnaden i höjd, och från de andra platserna förskjuts rummet som ett rum gör.
 */
export function roomFoot(scene: SceneDescription): Vec3 {
  const eye = playerEye(scene);
  return [eye.position[0], floorY(scene), eye.position[2]];
}

/**
 * Helfigurens yta: en upprätt fyrhörning bakom dealerns bordskant, mitt för bordet. Hörnen går medurs i bild med början
 * uppe till vänster och täcker hela helfigurens ruta. Raden för händernas underkant står strax över filtens höjd.
 * Ytan lutar inte med bordet: dealern sitter på golvet bakom det.
 */
export function figureCorners(scene: SceneDescription): Vec3[] {
  const { width, height } = scene.figure.frame;
  const [left, top] = onFigure(scene, { x: -0.5, y: -0.5 });
  const [right, bottom, z] = onFigure(scene, { x: width - 0.5, y: height - 0.5 });
  return [[left, top, z], [right, top, z], [right, bottom, z], [left, bottom, z]];
}

/** Var det som helfigurens bild har i en bildpunkt står i scenen. Rutans överkant är rad 0, en halv bildpunkt ovanför översta punktens mitt. */
export function onFigure(scene: SceneDescription, pixel: Pixel): Vec3 {
  const { frame, height, handRow, handLift, behindEdge } = scene.figure;
  const metre = height / frame.height;
  return [(pixel.x + 0.5 - frame.width / 2) * metre, handLift + (handRow - (pixel.y + 0.5)) * metre, scene.dealerEdge.z - behindEdge];
}

/**
 * Vecket: dealerfilmens två ytor, så som filmkameran ser dem. Ovanför bordskantens rad står bilden upprätt på kanten;
 * nedanför ligger den på filten. Hörnen går medurs i bild med början uppe till vänster, och täcker tillsammans hela rutan.
 * Den liggande delen anges som på ett olutat bord; den lutar med bordet.
 */
export type Fold = { row: number; upright: Vec3[]; felt: Vec3[] };

export function fold(scene: SceneDescription): Fold {
  const eye = sceneEye(scene);
  const { width, height } = eye.frame;
  const z = scene.dealerEdge.z;
  const row = see(eye, dealerEdge(scene))?.y;
  // Rutans kanter ligger en halv bildpunkt utanför de yttersta punkternas mitt.
  const left = -0.5;
  const right = width - 0.5;
  const top = -0.5;
  const bottom = height - 0.5;
  if (row === undefined || row <= top || row >= bottom) throw new Error('Dealerns bordskant syns inte i kamerans ruta');
  const upright = [
    onUpright(eye, { x: left, y: top }, z),
    onUpright(eye, { x: right, y: top }, z),
    onUpright(eye, { x: right, y: row }, z),
    onUpright(eye, { x: left, y: row }, z),
  ];
  const lift = scene.film.lift;
  const felt = [
    onPlane(eye, { x: left, y: row }, lift),
    onPlane(eye, { x: right, y: row }, lift),
    onPlane(eye, { x: right, y: bottom }, lift),
    onPlane(eye, { x: left, y: bottom }, lift),
  ];
  if ([...upright, ...felt].some((corner) => corner === null)) throw new Error('Kameran ser inte hela vecket');
  return { row, upright: upright as Vec3[], felt: felt as Vec3[] };
}

/**
 * Var det som dealerns bild har i en bildpunkt ligger i scenen: på det upprätta planet ovanför bordskantens rad,
 * annars på filten, där bordets lutning lägger den. Med olutat bord är det punkten filmkameran ser i den bildpunkten.
 */
export function onFold(scene: SceneDescription, pixel: Pixel): Vec3 | null {
  const eye = sceneEye(scene);
  const row = see(eye, dealerEdge(scene))?.y;
  if (row === undefined) return null;
  if (pixel.y < row) return onUpright(eye, pixel, scene.dealerEdge.z);
  const flat = onPlane(eye, pixel, scene.film.lift);
  return flat && tilted(scene, flat);
}

/** Spelarplatserna i beskrivningens ordning. */
export const seatsOf = (scene: SceneDescription): number[] => scene.places.seats.map((entry) => entry.seat);

function firstCard(scene: SceneDescription, seat: number): Vec3 {
  const place = scene.places.seats.find((entry) => entry.seat === seat)?.cards[0];
  if (!place) throw new Error(`Scenen har ingen första kortplats för plats ${seat}`);
  return onFelt(place);
}

/**
 * Ett öga i `position` som ser punkten `a` i bildpunkten `at` och punkten `b` på raden `row`. `a` ska ligga under bildens
 * mitt och `b` över den. Tre saker bestäms av de tre villkoren: vridningen kring lodlinjen, lutningen och brännvidden.
 * `yawStart` är en vridning i närheten av den sökta, i radianer från -z mot +x.
 */
function aimed(position: Vec3, frame: Frame, a: Vec3, at: Pixel, b: Vec3, row: number, yawStart: number): Eye {
  const centre = middle(frame);
  const toA = sub(a, position);
  const toB = sub(b, position);
  const above = centre.y - row;
  const below = centre.y - at.y;
  if (!(above > 0 && below < 0)) throw new Error('Siktet behöver en punkt över bildens mitt och en under den');

  // För en given vridning: lutningen och brännvidden som lägger de två punkterna på sina rader.
  // En punkt som ses vinkeln e över vågrätt hamnar brännvidden gånger tan(lutning + e) över mitten.
  const pitched = (yaw: number) => {
    const level: Vec3 = [Math.sin(yaw), 0, -Math.cos(yaw)];
    const right: Vec3 = [Math.cos(yaw), 0, Math.sin(yaw)];
    const ea = Math.atan2(toA[1], dot(toA, level));
    const eb = Math.atan2(toB[1], dot(toB, level));
    let low = -eb;
    let high = -ea;
    for (let step = 0; step < 60; step++) {
      const pitch = (low + high) / 2;
      if (Math.tan(pitch + ea) * above - Math.tan(pitch + eb) * below < 0) low = pitch;
      else high = pitch;
    }
    const pitch = (low + high) / 2;
    const focalPx = above / Math.tan(pitch + eb);
    const forward: Vec3 = [level[0] * Math.cos(pitch), -Math.sin(pitch), level[2] * Math.cos(pitch)];
    return { forward, focalPx, column: centre.x + (focalPx * dot(toA, right)) / dot(toA, forward) };
  };

  // Vridningen som lägger `a` i sin kolumn: vrids ögat åt höger flyttas punkten åt vänster i bild.
  let low = yawStart - 0.5;
  let high = yawStart + 0.5;
  for (let step = 0; step < 60; step++) {
    const yaw = (low + high) / 2;
    if (pitched(yaw).column > at.x) low = yaw;
    else high = yaw;
  }
  const { forward, focalPx } = pitched((low + high) / 2);
  return { position, forward, focalPx, frame };
}

/** Mitten av dealerbildens överkant, där den står på vecket. */
function pictureTop(scene: SceneDescription): Vec3 {
  const [left, right] = fold(scene).upright;
  return mul(add(left!, right!), 0.5);
}

/**
 * Ögat för en spelarplats: samma sorts öga som `base`, flyttat till platsen. `base` är ögat för kamerans egen plats,
 * spelarens öga om inget annat sägs, och den platsen får `base` självt.
 *
 * Var ögat står: till platsens första kort som `base` står till sin plats första kort, lika långt bakom och lika högt
 * över filten, vridet runt bordet med vinkeln mellan de två korten sedda från mitten av dealerns bordskant.
 *
 * Vart det siktar: så att två saker hamnar där `base` har dem. Platsens eget första kort ligger på samma ställe i bilden,
 * och mitten av dealerbildens överkant ligger på samma rad. Då ryms hela dealern från varje plats, med samma luft över
 * huvudet. Sidoplatserna står längre från dealern, så de får en något vidare bildvinkel.
 */
export function seatEye(scene: SceneDescription, seat: number, base: Eye = playerEye(scene)): Eye {
  const own = firstCard(scene, seat);
  if (seat === scene.camera.seat) return base;
  const reference = firstCard(scene, scene.camera.seat);
  const pivot = dealerEdge(scene);
  // Platsen räknas på det olutade bordet; siktet tar korten där lutningen lägger dem.
  const bearing = (point: Vec3): number => Math.atan2(point[0] - pivot[0], point[2] - pivot[2]);
  const turned = orbit(base, reference, bearing(own) - bearing(reference));
  const position: Vec3 = [turned.position[0] + own[0] - reference[0], turned.position[1], turned.position[2] + own[2] - reference[2]];
  const top = pictureTop(scene);
  const card = see(base, tilted(scene, reference));
  const topRow = see(base, top)?.y;
  if (!card || topRow === undefined) throw new Error('Ögat ser inte sitt eget kort och dealerbildens överkant');
  return aimed(position, base.frame, tilted(scene, own), card, top, topRow, Math.atan2(turned.forward[0], -turned.forward[2]));
}

/**
 * Dealerns arbetsyta: punkterna en dealerfilm ska rymma. Kroppen är en låda vid och bakom bordskanten, från filten upp
 * till luften över hjässan och i sidled så långt armarna och skon når. På filten är det varje kortplats, dealerns och
 * spelarnas, med handens räckvidd förbi kortet åt sidorna och mot spelaren, där bordets lutning lägger dem.
 */
export function workArea(scene: SceneDescription): Vec3[] {
  const { x, top, behind, past } = scene.film.reach;
  const edge = scene.dealerEdge.z;
  const body = x.flatMap((side): Vec3[] => [
    [side, top, edge - behind],
    [side, top, edge],
    [side, 0, edge - behind],
    [side, 0, edge],
  ]);
  const places = [...scene.places.dealer, ...scene.places.seats.flatMap((seat) => seat.cards)];
  const felt = places.flatMap((place): Vec3[] => [
    tilted(scene, [place[0] - past, 0, place[1] + past]),
    tilted(scene, [place[0] + past, 0, place[1] + past]),
  ]);
  return [...body, ...felt];
}

/**
 * Närbilden av ett öga: samma plats, riktat mot dealern och inzoomat så att hennes arbetsyta (`workArea`) fyller
 * dealerfilmens ruta med `film.margin` luft mot kanten. En dealerfilm görs i närbilden och läggs tillbaka på den vikta
 * ytan genom den. Ögat står kvar, så det närbilden visar är ett utsnitt av det `from` ser: ingenting förskjuts.
 */
export function closeEye(scene: SceneDescription, from: Eye): Eye {
  const { frame, margin } = scene.film;
  const points = workArea(scene);
  const centre = mul(points.reduce(add), 1 / points.length);
  let forward = unit(sub(centre, from.position));
  let wide = 1;
  let tall = 1;
  // Ögat vrids tills arbetsytan ligger mitt i rutan: lika långt till dess yttersta punkter åt båda håll, i sidled och i höjd.
  for (let step = 0; step < 40; step++) {
    const eye = axes({ ...from, forward });
    const seen = points.map((point) => {
      const offset = sub(point, from.position);
      const depth = dot(offset, eye.forward);
      if (depth <= 1e-9) throw new Error('Ögat ser inte hela dealerns arbetsyta');
      return [dot(offset, eye.right) / depth, dot(offset, eye.up) / depth];
    });
    const us = seen.map((point) => point[0]!);
    const vs = seen.map((point) => point[1]!);
    wide = Math.max(...us) - Math.min(...us);
    tall = Math.max(...vs) - Math.min(...vs);
    forward = unit(add(eye.forward, add(mul(eye.right, (Math.max(...us) + Math.min(...us)) / 2), mul(eye.up, (Math.max(...vs) + Math.min(...vs)) / 2))));
  }
  const room = 1 - 2 * margin;
  return { position: from.position, forward, focalPx: Math.min((frame.width * room) / wide, (frame.height * room) / tall), frame };
}

/**
 * Varifrån scenen betraktas. Spelaren är spelarens öga på kamerans plats, och en plats är samma sorts öga flyttat dit.
 * Med `close` är det vyns närbild: samma öga inzoomat på dealern, rutan en dealerfilm görs i.
 * Filmkameran är den kamera de gamla vikta dealerbilderna är gjorda genom: därifrån ska en sådan dealer se ut som i sin bild.
 */
export type SeatView = { kind: 'spelaren'; close?: boolean } | { kind: 'plats'; seat: number; close?: boolean };
export type View = SeatView | { kind: 'filmkameran' };

/** Ögat som en vy står i. */
export function viewEye(scene: SceneDescription, view: View): Eye {
  if (view.kind === 'filmkameran') return sceneEye(scene);
  const eye = view.kind === 'spelaren' ? playerEye(scene) : seatEye(scene, view.seat);
  return view.close ? closeEye(scene, eye) : eye;
}

/** Vyns namn i ett ord, för filnamn och beskrivningar: `spelaren`, `plats-7`, `filmkameran`, och närbilden med `-nara` efter. */
export function viewName(view: View): string {
  if (view.kind === 'filmkameran') return view.kind;
  return `${view.kind === 'plats' ? `plats-${view.seat}` : view.kind}${view.close ? '-nara' : ''}`;
}

/**
 * Den vikta ytan som två rektanglar i scenen, för en dealerfilm ur vilket öga som helst: den upprätta står på dealerns
 * bordskant och den liggande ligger på filten framför kanten, `film.lift` över den. De är större än något öga visar:
 * bilden läggs på dem genom ögat som såg den, och utanför dess ruta ritas ingenting. Hörnen går medurs sedda framifrån
 * respektive uppifrån, med början längst bort till vänster. Den liggande anges som på ett olutat bord och lutar med det.
 */
export function foldSurfaces(scene: SceneDescription): { upright: Vec3[]; felt: Vec3[] } {
  const z = scene.dealerEdge.z;
  const lift = scene.film.lift;
  // Tre meter åt varje håll rymmer bordet, dealern och det en kamera vid en spelarplats kan se av dem.
  const far = 3;
  return {
    upright: [[-far, far, z], [far, far, z], [far, 0, z], [-far, 0, z]],
    felt: [[-far, lift, z], [far, lift, z], [far, lift, z + far], [-far, lift, z + far]],
  };
}

/**
 * Samma öga med en annan ruta: hela den gamla rutan ryms i den nya, inpassad på höjden eller bredden (som `viewFovDeg`).
 * Brännvidden räknas om till den nya rutans bildpunkter. Så ritas en förlaga ur en vy.
 */
export function framed(eye: Eye, frame: Frame): Eye {
  const half = radians(viewFovDeg(eye, frame.width / frame.height)) / 2;
  return { ...eye, focalPx: frame.height / 2 / Math.tan(half), frame };
}

/**
 * De fyra hörnen av ett kort som ligger på bordet med mitten på kortplatsen `place`: bortre vänstra, bortre högra,
 * hitre högra, hitre vänstra när `heading` är 0 (långsidan rakt bort från kameran). `heading` vrider kortet på filten,
 * i radianer, positivt åt höger i bild. Kortet lutar med bordet.
 */
export function cardCorners(scene: SceneDescription, place: FeltPoint, heading = 0): Vec3[] {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const centre = onFelt(place);
  const right: Vec3 = [c, 0, s];
  const away: Vec3 = [s, 0, -c];
  const halfWidth = scene.card.width / 2;
  const halfHeight = scene.card.height / 2;
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b]) =>
    tilted(scene, add(centre, add(mul(right, a! * halfWidth), mul(away, b! * halfHeight)))),
  );
}

/** Den minsta konvexa månghörning som rymmer punkterna, medurs i bild. Används för att se vilken del av rutan ett föremål täcker. */
export function hull(points: Pixel[]): Pixel[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const turn = (o: Pixel, a: Pixel, b: Pixel): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Pixel[]): Pixel[] => {
    const chain: Pixel[] = [];
    for (const point of list) {
      while (chain.length >= 2 && turn(chain[chain.length - 2]!, chain[chain.length - 1]!, point) <= 0) chain.pop();
      chain.push(point);
    }
    chain.pop();
    return chain;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}
