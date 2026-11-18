// Scenens geometri mot talen i content/scene.json och mot det som mättes i gamla projektet.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { readScene, type FeltPoint, type SceneDescription, type Vec3 } from './description.ts';
import {
  cardCorners,
  dealerEdge,
  fold,
  fovYDeg,
  hull,
  onFold,
  onPlane,
  onUpright,
  orbit,
  placeOnTable,
  playerEye,
  sceneEye,
  seatEye,
  seatsOf,
  see,
  tablePosition,
  tableTilt,
  tilted,
  viewFovDeg,
  type Pixel,
} from './geometry.ts';

const root = resolve(import.meta.dirname, '..', '..');
const scene: SceneDescription = readScene(JSON.parse(readFileSync(join(root, 'content', 'scene.json'), 'utf8')));
// Samma scen med olutat bord: så som filmkameran såg den när dealerns bilder gjordes.
const level: SceneDescription = { ...scene, table: { ...scene.table, tilt: { ...scene.table.tilt, deg: 0 } } };
const eye = sceneEye(scene);
const player = playerEye(scene);
const { width, height } = eye.frame;

const near = (actual: number, expected: number, tolerance: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} ligger inte inom ${tolerance} från ${expected}`);
const distance = (a: Pixel, b: Pixel) => Math.hypot(a.x - b.x, a.y - b.y);
const inFrame = (pixel: Pixel | null): boolean => pixel !== null && pixel.x > 0 && pixel.x < width - 1 && pixel.y > 0 && pixel.y < height - 1;
/** Hur långt ned i rutan en punkt ligger, som andel av rutans höjd. */
const down = (pixel: Pixel): number => (pixel.y + 0.5) / height;

// Gamla standardens rad för dealerns bordskant, och kortet som mättes i film på plats 4 (hitre kant och djup i bildpunkter).
const EDGE_ROW = 831.5;
const FILM_CARD = { nearPx: 84.5, depthPx: 72 };
// Dealern i ankaret VILA, avläst i bilden: hjässan, axlarnas början, armbågarna och fingertopparna.
const CROWN = { x: 857, y: 51 };
const SHOULDERS = { x: 857, y: 395 };
const DEALER = [CROWN, { x: 589, y: 600 }, { x: 1146, y: 600 }, { x: 700, y: 872 }, { x: 1030, y: 872 }];

const places = (): FeltPoint[] => [...scene.places.dealer, ...scene.places.seats.flatMap((entry) => entry.cards)];
const cardsOf = (seat: number): FeltPoint[] => scene.places.seats.find((entry) => entry.seat === seat)!.cards;

test('filmkameran är gamla linsen: 28,2 graders synfält, 1,11 m över filten, lutad 25,06 grader nedåt', () => {
  near(fovYDeg(eye), 28.2, 0.05, 'synfält');
  near(eye.position[1], 1.11, 0.001, 'höjd');
  near((Math.asin(-eye.forward[1]) * 180) / Math.PI, 25.06, 0.01, 'lutning');
  assert.deepEqual([eye.position[0], eye.position[2]], [0, 0], 'origo ligger rakt under kameran');
});

test('en punkt på filten går till sin bildpunkt och tillbaka', () => {
  for (const [x, y] of [[857, 1102], [237, 980], [1500, 900], [881.5, 831.5]]) {
    const point = onPlane(eye, { x: x!, y: y! })!;
    const back = see(eye, point)!;
    near(point[1], 0, 1e-9, 'på filten');
    near(back.x, x!, 1e-6, 'x');
    near(back.y, y!, 1e-6, 'y');
  }
  assert.equal(onPlane(eye, { x: 880, y: -600 }), null, 'ingen filt över horisonten');
  assert.equal(see(eye, [0, 1, 1]), null, 'inget syns bakom kameran');
});

test('dealerns bordskant ritas på gamla standardens rad', () => {
  const edge = see(eye, dealerEdge(scene))!;
  near(edge.x, (width - 1) / 2, 1e-9, 'kantens mitt ligger i bildens mitt');
  near(edge.y, EDGE_ROW, 0.05, 'rad');
  near(fold(scene).row, edge.y, 1e-12, 'vecket ligger på samma rad');
});

test('vecket täcker hela rutan: upprätt ovanför bordskantens rad, liggande nedanför', () => {
  const { row, upright, felt } = fold(scene);
  const corners = (points: Vec3[]) => points.map((point) => see(eye, point)!);
  const expect = (points: Vec3[], pixels: number[][]) =>
    corners(points).forEach((pixel, index) => {
      near(pixel.x, pixels[index]![0]!, 1e-6, 'x');
      near(pixel.y, pixels[index]![1]!, 1e-6, 'y');
    });
  const left = -0.5, right = width - 0.5, top = -0.5, bottom = height - 0.5;
  expect(upright, [[left, top], [right, top], [right, row], [left, row]]);
  // Den liggande delen anges som på ett olutat bord: där täcker den rutans nedre del sedd från filmkameran.
  expect(felt, [[left, row], [right, row], [right, bottom], [left, bottom]]);

  // Den upprätta delen står på bordskanten, i ett plan; den liggande delen ligger strax över filten.
  for (const point of upright) near(point[2], scene.dealerEdge.z, 1e-9, 'den upprätta delens djup');
  near(upright[2]![1], 0, 1e-9, 'den upprätta delens fot står på filten');
  near(upright[3]![1], 0, 1e-9, 'den upprätta delens fot står på filten');
  near(upright[0]![1], 0.75, 0.01, 'den upprätta delen når tre kvarts meter över filten, där rutans överkant möter planet');
  // Filmkameran ser nedåt, så planets överkant ligger närmare den än foten: där ryms mindre av planet i rutan.
  assert.ok(upright[0]![0] > upright[3]![0] && upright[1]![0] < upright[2]![0], 'den upprätta delen är smalast upptill');
  for (const point of felt) near(point[1], scene.film.lift, 1e-12, 'den liggande delens höjd');
  assert.ok(felt[2]![2] > felt[1]![2], 'den liggande delen sträcker sig mot kameran');
});

test('med olutat bord ser filmkameran varje bildpunkt av dealerns bild där bilden har den', () => {
  const { row } = fold(level);
  for (let y = 0; y < height; y += 37) {
    for (let x = 0; x < width; x += 97) {
      const point = onFold(level, { x, y })!;
      const back = see(eye, point)!;
      near(back.x, x, 1e-6, `x i (${x}, ${y})`);
      near(back.y, y, 1e-6, `y i (${x}, ${y})`);
      if (y < row) near(point[2], scene.dealerEdge.z, 1e-9, 'ovanför vecket: på det upprätta planet');
      else near(point[1], scene.film.lift, 1e-12, 'nedanför vecket: på filten');
    }
  }
  // Strax ovanför och strax nedanför vecket möts de två ytorna, så när som på den liggande delens lyft.
  const above = onFold(level, { x: 700, y: row - 1e-6 })!;
  const below = onFold(level, { x: 700, y: row + 1e-6 })!;
  assert.ok(Math.hypot(above[0] - below[0], above[1] - below[1], above[2] - below[2]) < 3 * scene.film.lift, 'ytorna möts i vecket');
});

test('med lutat bord står kroppen kvar för filmkameran, och händerna flyttas högst sex bildpunkter', () => {
  const { row } = fold(scene);
  const moved = (pixel: Pixel): number => distance(see(eye, onFold(scene, pixel)!)!, pixel);
  // Ovanför vecket står bilden på bordskanten, som inte flyttas av lutningen.
  for (const pixel of [CROWN, SHOULDERS, { x: 589, y: 600 }, { x: 860, y: row - 1 }]) near(moved(pixel), 0, 1e-6, `punkten (${pixel.x}, ${pixel.y})`);
  // Nedanför vecket följer bilden filten: avvikelsen växer från vecket ut till fingertopparna.
  const wrist = moved({ x: 860, y: 840 });
  const tips = Math.max(moved({ x: 700, y: 872 }), moved({ x: 1030, y: 872 }));
  assert.ok(wrist < tips, 'avvikelsen växer med avståndet från vecket');
  // Med fem graders lutning är det 5,9 bildpunkter vid fingertopparna: drygt en per grad.
  assert.ok(tips <= 1.25 * scene.table.tilt.deg, `fingertopparna flyttas ${tips} bildpunkter`);
  near(moved({ x: 860, y: row + 0.5 }), 0, 0.5, 'vid vecket');
});

test('bordets lutning sänker sidan mot spelaren kring dealerns bordskant och låter kanten ligga kvar', () => {
  const angle = (scene.table.tilt.deg * Math.PI) / 180;
  assert.deepEqual(tilted(scene, dealerEdge(scene)).map((value) => +value.toFixed(12)), dealerEdge(scene));
  assert.deepEqual(tilted(scene, [0.7, 0, scene.dealerEdge.z]).map((value) => +value.toFixed(12)), [0.7, 0, scene.dealerEdge.z]);
  // En punkt på filten en meter från kanten: lika långt från kanten efteråt, och så mycket lägre som lutningen säger.
  const one = tilted(scene, [0.2, 0, scene.dealerEdge.z + 1]);
  near(one[0], 0.2, 1e-12, 'x');
  near(one[1], -Math.sin(angle), 1e-12, 'höjd');
  near(Math.hypot(one[1], one[2] - scene.dealerEdge.z), 1, 1e-12, 'avstånd från kanten');
  assert.ok(scene.table.tilt.deg >= 0 && scene.table.tilt.deg <= 10, 'lutningen är liten');
  // Matrisen är en ren vridning: utan lutning ändrar den ingenting.
  assert.deepEqual(tableTilt(level).map((value) => +value.toFixed(12)), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  assert.deepEqual(tilted(level, [0.3, 0.1, -1]), [0.3, 0.1, -1]);
});

test('kortplatserna och filmens liggande del ligger i samma lutade plan', () => {
  const angle = (scene.table.tilt.deg * Math.PI) / 180;
  const pivot = dealerEdge(scene);
  // Avståndet från bordets plan: planet går genom dealerns bordskant och lutar som bordet.
  const over = (point: Vec3): number => Math.cos(angle) * (point[1] - pivot[1]) + Math.sin(angle) * (point[2] - pivot[2]);
  for (const place of places()) near(over(placeOnTable(scene, place)), 0, 1e-12, `kortplatsen (${place}) ligger på filten`);
  for (const corner of fold(scene).felt) near(over(tilted(scene, corner)), scene.film.lift, 1e-12, 'filmens liggande del ligger strax över filten');
  for (const pixel of [{ x: 700, y: 872 }, { x: 1030, y: 872 }, { x: 860, y: 1100 }]) {
    near(over(onFold(scene, pixel)!), scene.film.lift, 1e-12, 'det bilden har nedanför vecket ligger strax över filten');
  }
  // Ett kort ligger med alla fyra hörn i planet och behåller sina mått.
  const corners = cardCorners(scene, cardsOf(1)[0]!);
  for (const corner of corners) near(over(corner), 0, 1e-12, 'kortets hörn');
  near(Math.hypot(...corners[0]!.map((value, index) => value - corners[1]![index]!)), scene.card.width, 1e-12, 'kortets bredd');
  near(Math.hypot(...corners[1]!.map((value, index) => value - corners[2]![index]!)), scene.card.height, 1e-12, 'kortets höjd');
  // Spelarens kort ligger lägre än dealerns: bordet lutar mot spelaren.
  assert.ok(placeOnTable(scene, cardsOf(4)[0]!)[1] < placeOnTable(scene, scene.places.dealer[0]!)[1]);
});

test('från sidan ligger händerna kvar på filten och kroppen står kvar på kanten', () => {
  // En punkt på en hand (nedanför vecket) och en på kroppen (ovanför), sedda från ett öga som förts en kvarts varv runt bordskanten.
  const hand = onFold(scene, { x: 760, y: 870 })!;
  const body = onFold(scene, { x: 860, y: 500 })!;
  const side = orbit(eye, dealerEdge(scene), Math.PI / 2);
  near(side.position[2], scene.dealerEdge.z, 1e-9, 'ögat står i linje med bordskanten');
  assert.ok(side.position[0] > 1.8, 'ögat står till höger om bordet');
  const edgeRow = see(side, dealerEdge(scene))!.y;
  // Handen ligger i filtens höjd framför kanten (till vänster i bild härifrån); kroppen står rakt över kanten.
  assert.ok(see(side, hand)!.x < see(side, dealerEdge(scene))!.x, 'handen ligger framför bordskanten');
  near(see(side, body)!.x, see(side, dealerEdge(scene))!.x, 1e-6, 'kroppen står över kanten');
  assert.ok(see(side, body)!.y < edgeRow, 'kroppen är över bordskanten i bild');
});

test('spelarens öga står mitt för bordet, i dealerns ögonhöjd, och ritar samma ruta som filmkameran', () => {
  const { height: over, distance: away, pitchDeg, fovDeg } = scene.player;
  assert.deepEqual(player.position, [0, over, scene.dealerEdge.z + away]);
  assert.deepEqual(player.frame, eye.frame);
  near(fovYDeg(player), fovDeg, 1e-9, 'bildvinkel');
  near((Math.asin(-player.forward[1]) * 180) / Math.PI, pitchDeg, 1e-9, 'lutning nedåt');
  assert.equal(player.forward[0], 0);
  // Dealerns ögon ligger på rad 211 i ankaret VILA: spelarens öga står inom fem centimeter från deras höjd.
  near(over, onFold(scene, { x: 857, y: 211 })![1], 0.05, 'ögats höjd mot dealerns ögon');
  // Lägre, flackare och vidare än filmkameran.
  assert.ok(over < eye.position[1] && pitchDeg < scene.camera.pitchDeg && fovDeg > fovYDeg(eye));
});

test('spelaren ser hela dealern framifrån, horisonten bakom hennes huvud och bordet ned till vallen', () => {
  const seen = (pixel: Pixel): Pixel => see(player, onFold(scene, pixel)!)!;
  for (const pixel of DEALER) assert.ok(inFrame(seen(pixel)), `punkten (${pixel.x}, ${pixel.y}) syns i rutan`);
  const crown = down(seen(CROWN));
  const shoulders = down(seen(SHOULDERS));
  const edge = down(see(player, dealerEdge(scene))!);
  assert.ok(crown > 0.05 && crown < 0.15, `luft över huvudet: hjässan ${crown} ned i rutan`);
  // Olyft ligger horisonten mellan hjässan och axlarna; med scenens lyft ligger den i höjd med axlarna.
  const far = 1000;
  const horizon = (liftDeg: number): number => down(see(player, [0, player.position[1] - far * Math.tan((liftDeg * Math.PI) / 180), -far])!);
  assert.ok(horizon(0) > crown && horizon(0) < shoulders, `horisonten ${horizon(0)} ned i rutan, utan lyft`);
  near(horizon(scene.background.liftDeg), shoulders, 0.04, 'horisonten med scenens lyft, mot axlarna');
  assert.ok(scene.background.liftDeg >= 0 && scene.background.liftDeg <= 8, 'lyftet är litet');
  // Dealern fyller över en tredjedel av rutans höjd, och bordskanten mot henne ligger nära rutans mitt.
  assert.ok(edge - crown > 1 / 3, `dealern är ${edge - crown} av rutans höjd`);
  assert.ok(edge > 0.4 && edge < 0.55, `bordskanten mot dealern ${edge} ned i rutan`);
  // Filten fortsätter mer än en tredjedel av rutans höjd nedanför bordskanten: en punkt på filten 1,2 m från dealerns kant syns.
  const nearFelt = see(player, tilted(scene, [0, 0, scene.dealerEdge.z + 1.2]))!;
  assert.ok(inFrame(nearFelt) && down(nearFelt) - edge > 1 / 3, `filten når ${down(nearFelt)} ned i rutan`);
});

test('platsen spelarens öga hör till är ögat självt, och varje plats ser sitt eget första kort där spelaren ser sitt', () => {
  assert.deepEqual(seatsOf(scene), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(scene.camera.seat, 4);
  assert.deepEqual(seatEye(scene, 4), player);
  assert.deepEqual(seatEye(scene, 4, eye), eye);

  const own = see(player, placeOnTable(scene, cardsOf(4)[0]!))!;
  let before = -Infinity;
  for (const seat of seatsOf(scene)) {
    const at = seatEye(scene, seat);
    const seen = see(at, placeOnTable(scene, cardsOf(seat)[0]!))!;
    near(seen.x, own.x, 1e-6, `plats ${seat}: kortets x`);
    near(seen.y, own.y, 1e-6, `plats ${seat}: kortets y`);
    near(at.position[1], player.position[1], 1e-12, `plats ${seat}: ögats höjd`);
    near(Math.hypot(...at.forward), 1, 1e-12, `plats ${seat}: riktningens längd`);
    assert.ok(at.position[0] > before, `plats ${seat} sitter till höger om platsen före`);
    before = at.position[0];
  }
  assert.throws(() => seatEye(scene, 8), /plats 8/);
});

test('varje kortplats syns i rutan från sin egen plats, och dealerns kortplatser från alla platser', () => {
  for (const seat of seatsOf(scene)) {
    const at = seatEye(scene, seat);
    for (const place of cardsOf(seat)) {
      assert.ok(inFrame(see(at, placeOnTable(scene, place))), `plats ${seat}: kortplatsen (${place})`);
      // Hela kortet ryms, inte bara dess mitt.
      for (const corner of cardCorners(scene, place)) assert.ok(inFrame(see(at, corner)), `plats ${seat}: kortet på (${place})`);
    }
    for (const place of scene.places.dealer) assert.ok(inFrame(see(at, placeOnTable(scene, place))), `plats ${seat}: dealerns kortplats (${place})`);
  }
  // Spelaren ser alla kortplatser på bordet.
  for (const place of places()) assert.ok(inFrame(see(player, placeOnTable(scene, place))), `spelaren: kortplatsen (${place})`);
  // Filmkameran såg dem alla på det olutade bordet, nedanför bordskantens rad.
  for (const place of places()) {
    const seen = see(eye, placeOnTable(level, place))!;
    assert.ok(inFrame(seen) && seen.y > EDGE_ROW, `filmkameran: kortplatsen (${place})`);
  }
});

test('från varje plats ryms hela dealern, med samma luft över huvudet som spelaren har', () => {
  const [left, right] = fold(scene).upright;
  const top: Vec3 = [(left![0] + right![0]) / 2, left![1], left![2]];
  const topRow = see(player, top)!.y;
  const crownForPlayer = see(player, onFold(scene, CROWN)!)!.y;
  near(see(eye, top)!.y, -0.5, 1e-9, 'filmkameran har dealerbildens överkant i rutans överkant');

  for (const seat of seatsOf(scene)) {
    const at = seatEye(scene, seat);
    near(see(at, top)!.y, topRow, 1e-6, `plats ${seat}: dealerbildens överkant ligger på spelarens rad`);
    for (const pixel of DEALER) assert.ok(inFrame(see(at, onFold(scene, pixel)!)), `plats ${seat}: punkten (${pixel.x}, ${pixel.y}) syns i rutan`);
    near(see(at, onFold(scene, CROWN)!)!.y, crownForPlayer, 10, `plats ${seat}: hjässans rad`);
    // Bildvinkeln och lutningen följer avståndet till dealern, men ingen plats skiljer mycket från spelaren.
    assert.ok(Math.abs(at.focalPx / player.focalPx - 1) < 0.05, `plats ${seat}: brännvidd ${at.focalPx}`);
    assert.ok(Math.abs(Math.asin(-at.forward[1]) - Math.asin(-player.forward[1])) < (3 * Math.PI) / 180, `plats ${seat}: lutningen skiljer under tre grader`);
  }

  // Samma regel med filmkameran som grund: dealerbildens överkant i rutans överkant, från varje plats.
  for (const seat of seatsOf(scene)) near(see(seatEye(scene, seat, eye), top)!.y, -0.5, 1e-6, `plats ${seat} genom filmkameran`);
});

test('ett kort på plats 4 ritas som kortet som mättes i film', () => {
  // Kortet mättes genom filmkameran, på bordet som det stod då: olutat.
  const place = cardsOf(4)[0]!;
  const corners = cardCorners(level, place);
  near(Math.hypot(corners[0]![0] - corners[1]![0], corners[0]![2] - corners[1]![2]), scene.card.width, 1e-12, 'bredd i meter');
  near(Math.hypot(corners[1]![0] - corners[2]![0], corners[1]![2] - corners[2]![2]), scene.card.height, 1e-12, 'höjd i meter');
  const [farLeft, farRight, nearRight, nearLeft] = corners.map((corner) => see(eye, corner)!);
  const mid = (a: Pixel, b: Pixel): Pixel => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  near(distance(nearLeft!, nearRight!), FILM_CARD.nearPx, 0.1, 'hitre kant');
  near(distance(mid(farLeft!, farRight!), mid(nearLeft!, nearRight!)), FILM_CARD.depthPx, 0.1, 'djup');
  assert.ok(farLeft!.y < nearLeft!.y && farLeft!.x < farRight!.x, 'bortre kanten överst, vänster före höger');

  // Vridet ett kvarts varv ligger långsidan tvärs över bilden.
  const turned = cardCorners(level, place, Math.PI / 2).map((corner) => see(eye, corner)!);
  assert.ok(distance(turned[1]!, turned[2]!) > 1.3 * distance(nearLeft!, nearRight!));
});

test('kortplatserna ligger på bordet framför dealern, i en båge med plats 4 närmast spelaren', () => {
  const edge = scene.dealerEdge.z;
  for (const [x, z] of places()) assert.ok(z > edge && z < 0, `kortplatsen (${x}, ${z}) ligger mellan dealerns kant och filmkameran`);
  const first = (seat: number) => cardsOf(seat)[0]!;
  for (const [left, right] of [[1, 7], [2, 6], [3, 5]]) {
    near(first(left!)[1], first(right!)[1], 0.0002, `plats ${left} och ${right}: samma djup`);
    assert.ok(first(left!)[0] < 0 && first(right!)[0] > 0, `plats ${left} till vänster och ${right} till höger`);
    assert.ok(first(left!)[1] < first(left! + 1)[1], `plats ${left! + 1} ligger närmare spelaren än plats ${left}`);
  }
});

test('bordsmodellen ställs så att filten hamnar på y = 0 och dealerns kant där scenen har den', () => {
  const at = tablePosition(scene);
  near(at[1] + scene.table.model.feltY, 0, 1e-12, 'filtens höjd');
  near(at[2] + scene.table.model.dealerEdgeZ, scene.dealerEdge.z, 1e-12, 'dealerns kant');
  assert.equal(at[0], 0);
});

test('synfältet visar hela rutan på en yta med annat sidförhållande', () => {
  const own = width / height;
  near(viewFovDeg(eye, own), fovYDeg(eye), 1e-9, 'rutans eget sidförhållande');
  near(viewFovDeg(eye, own * 2), fovYDeg(eye), 1e-9, 'en bredare yta: rutan passas in på höjden');
  // En smalare yta: rutan passas in på bredden, så det vågräta synfältet är detsamma.
  const tall = viewFovDeg(eye, own / 2);
  const horizontal = (fovDeg: number, aspect: number) => 2 * Math.atan(Math.tan((fovDeg * Math.PI) / 360) * aspect);
  near(horizontal(tall, own / 2), horizontal(fovYDeg(eye), own), 1e-9, 'vågrätt synfält');
  assert.ok(tall > fovYDeg(eye));
  near(viewFovDeg(player, own), scene.player.fovDeg, 1e-9, 'spelarens bildvinkel');
});

test('ett öga som förs runt en punkt ser den på samma ställe', () => {
  const pivot = dealerEdge(scene);
  const before = see(eye, pivot)!;
  for (const angle of [-1.2, -0.3, 0.4, Math.PI / 2]) {
    const moved = orbit(eye, pivot, angle);
    const after = see(moved, pivot)!;
    near(after.x, before.x, 1e-6, 'x');
    near(after.y, before.y, 1e-6, 'y');
    assert.equal(Math.sign(moved.position[0]), Math.sign(angle), 'en positiv vinkel för ögat åt höger');
  }
  assert.equal(onUpright(eye, { x: 100, y: 100 }, 5), null, 'ett plan bakom kameran möts aldrig');
});

test('konturen är den minsta konvexa månghörningen, medurs i bild', () => {
  const points = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 0 }];
  assert.deepEqual(hull(points), [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]);
  assert.deepEqual(hull([{ x: 1, y: 1 }, { x: 0, y: 0 }]), [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
});
