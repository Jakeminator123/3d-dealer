// Dockans ställningar mot talen i content/scene.json och content/doll.json och mot rörelsen i content/moves/.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { readScene, type SceneDescription, type Vec3 } from './description.ts';
import {
  FINGERS,
  armHits,
  fitHand,
  handSize,
  handSkeleton,
  inShoe,
  moveFor,
  isCycle,
  pickUpCard,
  poseAt,
  readCycle,
  readDoll,
  readMove,
  relaxedLeft,
  restPose,
  throughShoe,
  type Action,
  type CardPose,
  type DollCycle,
  type DollDescription,
  type DollMove,
  type DollPose,
  type Life,
  type Seat,
  ACTIONS,
  cardPlace,
  unturned,
  readyGaze,
} from './dollPose.ts';
import { cardCorners, placeOnTable, sceneEye, see, seatsOf, tilted } from './geometry.ts';

const root = resolve(import.meta.dirname, '..', '..');
const read = (file: string): unknown => JSON.parse(readFileSync(join(root, 'content', file), 'utf8'));
const scene: SceneDescription = readScene(read('scene.json'));
const doll: DollDescription = readDoll(read('doll.json'));
const base: DollMove = readMove(read('moves/giv-nyp-plats-4.json'));
const cycle: DollCycle = readCycle(read('moves/cykel-nyp.json'));

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const far = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const near = (actual: number, expected: number, tolerance: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} ligger inte inom ${tolerance} från ${expected}`);

// Den lutade filten: en punkt på den och dess normal. `over` är en punkts höjd över filten, i meter.
const feltPoint = tilted(scene, [0, 0, 0]);
const feltNormal = sub(tilted(scene, [0, 1, 0]), feltPoint);
const over = (point: Vec3): number => dot(sub(point, feltPoint), feltNormal);

/** Avståndet från en punkt till ett korts yta. */
function toCard(point: Vec3, card: CardPose): number {
  const from = sub(point, card.centre);
  const beside = Math.max(0, Math.abs(dot(from, cross(card.face, card.long))) - scene.card.width / 2);
  const beyond = Math.max(0, Math.abs(dot(from, card.long)) - scene.card.height / 2);
  return Math.hypot(beside, beyond, dot(from, card.face));
}

const TIPS = [4, 8, 12, 16, 20];
/** Avståndet från kortet till den fingertopp på givhanden som ligger närmast. */
const nearestTip = (pose: DollPose): number => Math.min(...TIPS.map((k) => toCard(pose.hands.left[k]!, pose.card!)));
const firstPlace = (seat: number): Vec3 => placeOnTable(scene, scene.places.seats.find((entry) => entry.seat === seat)!.cards[0]!);

// Livsstorlek: en kvinnas hand, i meter. Längden från handleden till långfingrets spets och bredden över knogarna.
const HAND_LENGTH = [0.17, 0.18] as const;
const HAND_BREADTH = [0.075, 0.08] as const;
// Så nära kortet ska en fingertopp vara när handen håller i det eller just har lagt det.
const TOUCH = 0.015;
// Spårens upplösning: det som ska ligga på samma ställe gör det inom en tiondels millimeter.
const EXACT = 0.0001;
// Ögonen i ankaret VILA, över filten på dealerns bordskant (content/scene.json, player.source).
const ANCHOR_EYES = 0.58;

/** Rörelsen till varje plats, räknad en gång. */
const moves = new Map<Seat, DollMove>();
const moveTo = (seat: Seat): DollMove => {
  if (!moves.has(seat)) moves.set(seat, moveFor(scene, doll, base, seat));
  return moves.get(seat)!;
};

/** Ställningar genom hela rörelsen: `per` per bildruta, första och sista inräknade. */
function* through(move: DollMove, per: number): Generator<DollPose> {
  const steps = (move.frameCount - 1) * per;
  for (let step = 0; step <= steps; step++) yield poseAt(scene, doll, move, (step / steps) * move.seconds);
}

/** Det som ska gälla i varje ögonblick av en rörelse, och i VILA. */
function checkPose(pose: DollPose, what: string): void {
  const skeleton = handSkeleton(doll);
  for (const side of ['left', 'right'] as const) {
    const hand = pose.hands[side];
    const arm = pose.arms[side];
    assert.equal(hand.length, 21, `${what}: ${side} hand har 21 punkter`);
    const lowest = Math.min(...hand.map(over));
    assert.ok(lowest >= 0, `${what}: ${side} hand går ${(-lowest * 1000).toFixed(1)} mm ned i filten`);
    FINGERS.forEach((chain, finger) => {
      near(far(hand[0]!, hand[chain[0]!]!), Math.hypot(...skeleton.palm[finger]!), 0.001, `${what}: ${side} handflata till punkt ${chain[0]}`);
      for (let j = 0; j < 3; j++) {
        near(far(hand[chain[j]!]!, hand[chain[j + 1]!]!), skeleton.bones[finger]![j]!, 0.001, `${what}: ${side} fingerben ${chain[j]}–${chain[j + 1]}`);
      }
    });
    assert.deepEqual(arm.wrist, hand[0], `${what}: ${side} arm slutar i handens handled`);
    assert.ok(arm.reached, `${what}: ${side} handled ligger ${far(arm.shoulder, arm.wrist).toFixed(3)} m från axeln, längre än armen`);
    near(far(arm.shoulder, arm.elbow), doll.arm.upper, 0.001, `${what}: ${side} överarm`);
    near(far(arm.elbow, arm.wrist), doll.arm.fore, 0.001, `${what}: ${side} underarm`);
  }
  if (pose.card) {
    const lowest = Math.min(...pose.card.corners.map(over));
    assert.ok(lowest >= 0, `${what}: kortet går ${(-lowest * 1000).toFixed(1)} mm ned i filten`);
  }
}

test('dockans beskrivning läses, och ett hål i den sägs på svenska', () => {
  const whole = read('doll.json') as DollDescription;
  assert.throws(() => readDoll({ ...whole, hand: { ...whole.hand, rest: whole.hand.rest.slice(1) } }), /Dockans beskrivning går inte att använda: hand\.rest ska ha 21 punkter/);
  assert.throws(() => readDoll({ ...whole, arm: { ...whole.arm, basis: 'gissat' } }), /arm: basis och source/);
  assert.throws(() => readDoll({ ...whole, arm: { ...whole.arm, reach: 0.6 } }), /arm\.reach ska vara kortare än armens två ben/);
  assert.throws(() => readDoll({ ...whole, sitting: undefined }), /sitting\.behindEdge/);
  assert.throws(() => readDoll(null), /Dockans beskrivning går inte att använda/);
});

test('rörelsen läses, och fel i den sägs på svenska', () => {
  const whole = read('moves/giv-nyp-plats-4.json') as DollMove;
  assert.equal(base.frameCount, 120);
  assert.equal(base.fps, 30);
  near(base.seconds, 119 / 30, 1e-3, 'rörelsens längd');
  assert.equal(base.seat, 4);
  const { tracks } = whole;
  assert.throws(() => readMove({ ...whole, seconds: 4 }), /Rörelsen går inte att använda: seconds ska vara \(frameCount − 1\) \/ fps/);
  assert.throws(() => readMove({ ...whole, tracks: { ...tracks, leftHand: { ...tracks.leftHand, points: tracks.leftHand.points.slice(1) } } }), /tracks\.leftHand ska ha 120 rutor med 21 punkter/);
  assert.throws(() => readMove({ ...whole, tracks: { ...tracks, card: { ...tracks.card, about: '' } } }), /varje spår ska säga vad det är/);
  assert.throws(() => readMove({ ...whole, moments: { ...whole.moments, rests: 200 } }), /moments/);
  assert.throws(() => readMove({ ...whole, source: '' }), /basis och source/);
});

test('handen är i naturlig storlek', () => {
  const { length, breadth } = handSize(doll);
  assert.ok(length >= HAND_LENGTH[0] && length <= HAND_LENGTH[1], `handens längd är ${(length * 100).toFixed(1)} cm`);
  assert.ok(breadth >= HAND_BREADTH[0] && breadth <= HAND_BREADTH[1], `handens bredd över knogarna är ${(breadth * 100).toFixed(1)} cm`);
  // Den lästa handen i rörelsen är större än så: därför har dockan sin egen.
  const read21 = base.tracks.leftHand.points[0]!;
  const readLength = [[0, 9], [9, 10], [10, 11], [11, 12]].reduce((sum, [a, b]) => sum + far(read21[a!]!, read21[b!]!), 0);
  assert.ok(readLength > 0.21, `den lästa handen är ${(readLength * 100).toFixed(1)} cm längs benen`);
});

test('dockan sitter intill bordet, med ögonen där ankaret har dem i bild', () => {
  const pose = restPose(scene, doll);
  const { behindEdge } = doll.sitting;
  // Axlar, nacke och huvud i ett plan bakom dealerns bordskant, och bålens framsida strax bakom kanten.
  for (const point of [pose.arms.left.shoulder, pose.arms.right.shoulder, pose.neck, pose.head, pose.hip]) {
    near(point[2], scene.dealerEdge.z - behindEdge, 1e-9, 'kroppens plan');
  }
  const front = behindEdge - doll.shape.torso.depth;
  assert.ok(front > 0.05 && front < 0.12, `bålens framsida står ${front.toFixed(3)} m bakom bordskanten`);
  near(pose.arms.left.shoulder[1], doll.body.shoulderHeight, 1e-9, 'axelns höjd över filten');
  near((pose.arms.left.shoulder[0] + pose.arms.right.shoulder[0]) / 2, doll.body.centreX, 1e-9, 'axlarnas mitt');
  assert.ok(pose.hip[1] < 0 && pose.neck[1] > doll.body.shoulderHeight && pose.head[1] > pose.neck[1], 'höft under filten, nacke över axlarna, huvud över nacken');
  assert.ok(doll.body.eyeHeight > pose.head[1] - doll.body.head.radius && doll.body.eyeHeight < pose.head[1] + doll.body.head.radius, 'ögonen sitter i huvudet');
  // Dockans ögon och ankarets (0,58 m över filten på bordskantens plan) hamnar på samma rad i filmkamerans bild:
  // dockan sitter 0,18 m längre bak och har därför ögonen lägre räknat i meter.
  const eye = sceneEye(scene);
  const hers = see(eye, [doll.body.centreX, doll.body.eyeHeight, scene.dealerEdge.z - behindEdge])!;
  const anchors = see(eye, [doll.body.centreX, ANCHOR_EYES, scene.dealerEdge.z])!;
  near(hers.y, anchors.y, 10, 'ögonens rad i filmkamerans bild');
  assert.ok(doll.body.eyeHeight < ANCHOR_EYES, 'räknat i meter sitter dockans ögon lägre än ankarets');
});

test('hämtstället räknas ur scenens sko: kortet står i mynningen med baksidan utåt', () => {
  const card = pickUpCard(scene, doll);
  assert.equal(card.up, 'baksida');
  // På ett olutat bord, i skons egna mått: på mittlinjen, i skons främre del, med nedre kanten strax över filten.
  const level: SceneDescription = { ...scene, table: { ...scene.table, tilt: { ...scene.table.tilt, deg: 0 } } };
  const flat = pickUpCard(level, doll);
  const [across, lift, along] = inShoe(level, flat.centre);
  near(across, 0, 1e-9, 'kortet står på skons mittlinje');
  assert.ok(along > scene.shoe.length * 0.25 && along < scene.shoe.length / 2, `kortets mitt står ${along.toFixed(3)} m framför skons mitt`);
  const lower = Math.min(...flat.corners.map((corner) => corner[1]));
  near(lower, doll.pickUp.lift, 1e-9, 'nedre kantens höjd över filten');
  near((Math.asin(flat.long[1]) * 180) / Math.PI, doll.pickUp.leanDeg, 1e-6, 'kortets lutning');
  assert.ok(lift > lower && lift < 0.1, 'kortets mitt över nedre kanten');
  // Mynningen ligger nära x 0,28 och z -1,70 (8,75 cm närmare spelarna än i de första beställningarna, z -1,78, sedan
  // skon flyttades in på bordet 2026-11-18), och kortet står strax innanför nosens spets.
  const yaw = (scene.shoe.yawDeg * Math.PI) / 180;
  const nose: Vec3 = [scene.shoe.at[0] + (Math.sin(yaw) * scene.shoe.length) / 2, 0, scene.shoe.at[1] + (Math.cos(yaw) * scene.shoe.length) / 2];
  near(nose[0], 0.28, 0.01, 'nosens x');
  near(nose[2], -1.6971, 0.01, 'nosens z');
  const lowerMiddle = inShoe(level, [(flat.corners[2]![0] + flat.corners[3]![0]) / 2, 0, (flat.corners[2]![2] + flat.corners[3]![2]) / 2]);
  near(scene.shoe.length / 2 - lowerMiddle[2], 0.0415, 0.001, 'nedre kanten innanför nosens spets');
  // Rörelsens lästa kort står i skon där den stod före flytten 2026-11-18 (8,75 cm längre från spelarna): det ligger
  // högst 2 cm från det hämtstället, så rörelsen flyttades bara litet till skon som den var.
  const before = pickUpCard({ ...level, shoe: { ...level.shoe, at: [0.495, -1.8433] } }, doll);
  assert.ok(far(base.tracks.card.centre[0]!, before.centre) < 0.02, 'det lästa kortet står vid hämtstället i skon före flytten');
});

test('REDO: rörelsen börjar med handen på det gula kortet i skons mynning', () => {
  const pose = poseAt(scene, doll, base, 0);
  const standard = pickUpCard(scene, doll);
  assert.ok(pose.card);
  assert.equal(pose.card.up, 'baksida');
  pose.card.corners.forEach((corner, index) => near(far(corner, standard.corners[index]!), 0, EXACT, `kortets hörn ${index} mot hämtstället`));
  assert.ok(nearestTip(pose) <= TOUCH, `närmaste fingertopp är ${(nearestTip(pose) * 1000).toFixed(1)} mm från kortet`);
  // Nästa kort står kvar i skon, strax innanför det som delas, också det med baksidan utåt.
  assert.equal(pose.shoeCard.up, 'baksida');
  near(far(pose.shoeCard.centre, standard.centre), doll.pickUp.nextBehind, 1e-6, 'nästa kort innanför det delade');
  assert.ok(dot(sub(pose.shoeCard.centre, standard.centre), standard.face) > 0, 'nästa kort står på framsidans sida, inåt i skon');
  // Före rörelsens början gäller första rutan.
  assert.deepEqual(poseAt(scene, doll, base, -1), pose);
  checkPose(pose, 'REDO');
});

test('LAGT 4: rörelsen slutar med fingertopparna vid det blå kortet på plats 4', () => {
  const pose = poseAt(scene, doll, base, base.seconds);
  const place = scene.places.seats.find((entry) => entry.seat === 4)!.cards[0]!;
  assert.ok(pose.card);
  assert.equal(pose.card.up, 'framsida');
  near(far(pose.card.centre, placeOnTable(scene, place)), 0, 0.005, 'kortets mitt mot kortplatsen');
  // Plant på den lutade filten, rakt på platsen: hörn för hörn som scenens egna kort.
  cardCorners(scene, place).forEach((corner, index) => near(far(pose.card!.corners[index]!, corner), 0, 0.001, `kortets hörn ${index}`));
  for (const corner of pose.card.corners) near(over(corner), scene.card.thickness / 2, 0.0005, 'kortets hörn över filten');
  assert.ok(nearestTip(pose) <= TOUCH, `närmaste fingertopp är ${(nearestTip(pose) * 1000).toFixed(1)} mm från kortet`);
  // Handen vilar på filten: dess lägsta fingertopp ligger en fingertopps radie över den.
  near(Math.min(...TIPS.map((k) => over(pose.hands.left[k]!))), doll.hand.radius.tip, 0.001, 'givhandens lägsta fingertopp över filten');
  assert.deepEqual(poseAt(scene, doll, base, base.seconds + 1), pose);
  checkPose(pose, 'LAGT 4');
});

test('kortet vänds en gång under rörelsen, från gul baksida till blå framsida', () => {
  const sides = [...through(base, 1)].map((pose) => pose.card!.up);
  const turns = sides.flatMap((side, frame) => (frame > 0 && side !== sides[frame - 1] ? [frame] : []));
  assert.equal(turns.length, 1, `kortet byter sida i rutorna ${turns.join(', ')}`);
  assert.ok(turns[0]! > base.moments.leavesShoe && turns[0]! < base.moments.rests, `kortet vänds i ruta ${turns[0]}`);
  near(turns[0]!, (base.moments.edge[0] + base.moments.edge[1]) / 2, 3, 'vändningen ligger vid kantläget');
});

test('genom hela rörelsen: benen håller sina längder, armarna når och ingenting går ned i filten', () => {
  let step = 0;
  for (const pose of through(base, 4)) checkPose(pose, `tid ${((step++ / 4 / base.fps)).toFixed(3)} s`);
  // Kroppen följer med: den givande axeln förs fram när hon sträcker sig, men inte mer än en och en halv decimeter. (Med
  // kortplatserna 8,75 cm närmare spelarna, sedan 2026-11-18, flyttas den 0,14 m; förut 0,11.)
  const start = poseAt(scene, doll, base, 0).arms.left.shoulder;
  const end = poseAt(scene, doll, base, base.seconds).arms.left.shoulder;
  // Kortplatsen vid plats 4 ligger sedan 2026-11-18 (kväll) 5,9 cm längre från dealern (content/scene.json, places.arc):
  // axeln flyttas 0,19 m (förr 0,14).
  assert.ok(end[2] - start[2] > 0.03 && far(start, end) < 0.2, `den givande axeln flyttas ${far(start, end).toFixed(3)} m`);
  // Den givande handen går fri från skon när kortet väl är taget.
  assert.deepEqual(throughShoe(scene, doll, base), []);
});

test('rörelsen följer scenen: flyttas skon eller kortplatsen flyttas hämtningen och läggningen med', () => {
  const moved: SceneDescription = {
    ...scene,
    shoe: { ...scene.shoe, at: [scene.shoe.at[0] + 0.04, scene.shoe.at[1] + 0.02], yawDeg: scene.shoe.yawDeg + 8 },
    places: { ...scene.places, seats: scene.places.seats.map((entry) => (entry.seat === 4 ? { ...entry, cards: [[0.01, -1.43], entry.cards[1]!] } : entry)) },
  };
  const first = poseAt(moved, doll, base, 0);
  const standard = pickUpCard(moved, doll);
  first.card!.corners.forEach((corner, index) => near(far(corner, standard.corners[index]!), 0, EXACT, `kortets hörn ${index} vid den flyttade skon`));
  assert.ok(nearestTip(first) <= TOUCH, 'handen följer kortet till den flyttade skon');
  const last = poseAt(moved, doll, base, base.seconds);
  near(far(last.card!.centre, placeOnTable(moved, [0.01, -1.43])), 0, 0.0005, 'kortet på den flyttade kortplatsen');
  assert.ok(nearestTip(last) <= TOUCH, 'handen följer kortet till den flyttade kortplatsen');
});

test('en rörelse som redan är hängd i scenen ändras inte av att hängas en gång till', () => {
  // Grundrörelsen spelad direkt är samma sak som rörelsen till sin egen plats.
  const own = moveTo(base.seat);
  assert.equal(own.swingDeg, 0);
  assert.equal(own.id, base.id);
  for (const time of [0, 1.2, 1.8, 2.5, base.seconds]) assert.deepEqual(poseAt(scene, doll, own, time), poseAt(scene, doll, base, time));
  // En flyttad rörelse som har sparats och lästs igen spelas som den var.
  const kept = moveTo(1);
  const again = readMove(JSON.parse(JSON.stringify(kept)));
  for (const time of [0, 1.8, base.seconds]) {
    const a = poseAt(scene, doll, kept, time);
    const b = poseAt(scene, doll, again, time);
    a.hands.left.forEach((point, k) => near(far(point, b.hands.left[k]!), 0, 1e-6, `punkt ${k} vid ${time} s`));
    near(far(a.card!.centre, b.card!.centre), 0, 1e-6, `kortet vid ${time} s`);
  }
});

test('VILA: båda händerna ligger på filten framför bordskanten, utan kort', () => {
  const pose = restPose(scene, doll);
  assert.equal(pose.card, null);
  assert.equal(pose.shoeCard.up, 'baksida');
  checkPose(pose, 'VILA');
  for (const side of ['left', 'right'] as const) {
    const hand = pose.hands[side];
    // Handen vilar på sina fingertoppar: den lägsta ligger en fingertopps radie över filten.
    near(Math.min(...TIPS.map((k) => over(hand[k]!))), doll.hand.radius.tip, 0.0005, `${side} hands lägsta fingertopp över filten`);
    assert.ok(Math.max(...hand.map(over)) < 0.08, `${side} hand ligger lågt över filten`);
    assert.ok(hand.every((point) => point[2] > scene.dealerEdge.z - 0.03), `${side} hand ligger på bordet, inte bakom kanten`);
  }
  // Långfingrets spets ligger en decimeter framför bordskanten, och händerna ungefär en axelbredd isär.
  const tilt = (scene.table.tilt.deg * Math.PI) / 180;
  near(pose.hands.right[12]![2], scene.dealerEdge.z + doll.rest.fingertipsBeforeEdge * Math.cos(tilt), 0.002, 'högerhandens långfingerspets framför kanten');
  assert.ok(doll.rest.fingertipsBeforeEdge >= 0.08 && doll.rest.fingertipsBeforeEdge <= 0.14, 'fingertopparna ligger kring 12 cm framför kanten');
  near(pose.arms.left.wrist[0] - pose.arms.right.wrist[0], 2 * doll.body.shoulderHalfWidth, 0.04, 'avståndet mellan handlederna mot axelbredden');
  // Vänsterhanden är högerhandens spegelbild i kroppens mitt.
  pose.hands.right.forEach((point, k) => near(far([2 * doll.body.centreX - point[0], point[1], point[2]], pose.hands.left[k]!), 0, 1e-9, `punkt ${k} speglad`));
  // Högerhanden ligger i VILA där den ligger när rörelsen börjar, så att bara vänsterhanden rör sig mellan VILA och REDO.
  const redo = poseAt(scene, doll, base, 0).hands.right;
  pose.hands.right.forEach((point, k) => near(far(point, redo[k]!), 0, 0.01, `högerhandens punkt ${k} mot REDO`));
});

for (const seat of seatsOf(scene)) {
  test(`plats ${seat}: kortet hämtas i skon och hamnar på platsens första kortplats, och ingen hand går ned i filten`, () => {
    const move = moveTo(seat);
    assert.equal(move.seat, seat);
    const standard = pickUpCard(scene, doll);
    const first = poseAt(scene, doll, move, 0);
    first.card!.corners.forEach((corner, index) => near(far(corner, standard.corners[index]!), 0, EXACT, `kortets hörn ${index} mot hämtstället`));
    assert.ok(nearestTip(first) <= TOUCH, 'handen på kortet i skon');
    const last = poseAt(scene, doll, move, move.seconds);
    const place = scene.places.seats.find((entry) => entry.seat === seat)!.cards[0]!;
    assert.equal(last.card!.up, 'framsida');
    near(far(last.card!.centre, firstPlace(seat)), 0, 0.0005, 'kortets mitt mot kortplatsen');
    cardCorners(scene, place).forEach((corner, index) => near(far(last.card!.corners[index]!, corner), 0, 0.001, `kortets hörn ${index}`));
    assert.ok(nearestTip(last) <= TOUCH, `närmaste fingertopp är ${(nearestTip(last) * 1000).toFixed(1)} mm från det lagda kortet`);
    let step = 0;
    for (const pose of through(move, 2)) checkPose(pose, `plats ${seat}, tid ${(step++ / 2 / move.fps).toFixed(3)} s`);
  });
}

// Till platserna på skons sida, 6 och 7, bar den rakt flyttade rörelsen handen genom skons mynning, som i gamla Dealer
// (dealer3d/LASMIG.md: "Plats 6 och 7 finns inte: där går handen genom skon"). Nu bågar bärningen över skons nos.
for (const seat of seatsOf(scene)) {
  test(`plats ${seat}: den givande handen och kortet går fria från skon`, () => {
    const frames = throughShoe(scene, doll, moveTo(seat));
    assert.deepEqual(frames, [], `handen eller kortet är inne i skon i rutorna ${frames[0]}–${frames[frames.length - 1]}`);
  });

  test(`plats ${seat}: den givande armen går inte genom skon, den vilande handen, bålen eller bordet`, () => {
    assert.deepEqual(armHits(scene, doll, moveTo(seat)), { shoe: [], restingHand: [], torso: [], table: [] });
  });
}

test('svängen växer åt sidorna från platsen rörelsen lästes på', () => {
  const swings = seatsOf(scene).map((seat) => moveTo(seat).swingDeg!);
  assert.equal(swings[seatsOf(scene).indexOf(base.seat as number)], 0);
  for (let index = 1; index < swings.length; index++) {
    assert.ok(swings[index]! >= swings[index - 1]!, `svängarna ${swings.join(', ')} grader går inte åt ett håll över platserna`);
  }
  assert.ok(Math.max(...swings.map(Math.abs)) <= 120, `svängarna ${swings.join(', ')} grader`);
});

test('bågen och armbågens vridning finns bara där de behövs, och håller sig små', () => {
  // Platsen rörelsen lästes på spelas som den lästes.
  const own = moveTo(base.seat);
  assert.equal(own.bow, 0);
  assert.equal(own.tracks.leftArm, undefined);
  for (const seat of seatsOf(scene)) {
    const move = moveTo(seat);
    assert.ok(move.bow! >= 0 && move.bow! <= 0.2, `plats ${seat}: bågen är ${move.bow} m`);
    const turns = move.tracks.leftArm?.turnDeg ?? [0];
    // Given utan cykel lutar sig bara där armen inte når. Vid plats 7 på bågen från 2026-11-18 (kväll) kräver den 120
    // grader; cyklerna, som lutar sig mot kortplatsen (planLean), går fri med 80–85 (src/pipeline/rorelse.test.ts).
    const elbowMost = seat === 7 ? 125 : 90;
    assert.ok(Math.max(...turns.map(Math.abs)) <= elbowMost, `plats ${seat}: armbågen vrids ${Math.max(...turns.map(Math.abs))} grader`);
    // Fram till att kortet lämnar skon är alla rörelser samma rörelse: ingen vridning i REDO.
    assert.equal(turns[0], 0);
    // Kroppen böjs och vrids inom sina gränser: axeln flyttas aldrig längre än en böjning på mostLean ger.
    const seated = restPose(scene, doll).arms.left.shoulder;
    const most = Math.max(...[...through(move, 1)].map((pose) => far(pose.arms.left.shoulder, seated)));
    // Plats 1 och 7 ligger sedan 2026-11-18 (kväll) 12 cm längre från dealern, så att plats 7 inte ligger framför skons
    // mynning (content/scene.json, places.arc): vid plats 1 flyttas axeln 0,35 m (förr 0,29).
    assert.ok(most < 0.4, `plats ${seat}: den givande axeln flyttas ${most.toFixed(3)} m`);
  }
  // Intill skon bågar bärningen ut, så att handen går över skons nos i stället för genom mynningen.
  // Plats 6 ligger sedan 2026-11-18 (kväll) längre från skon och behöver en mindre båge (0,04 m).
  assert.ok(moveTo(6).bow! > 0 && moveTo(7).bow! > 0.05, `bågarna till plats 6 och 7 är ${moveTo(6).bow} och ${moveTo(7).bow} m`);
});

// Grundrörelsen är låst: bilder är beställda ur dess ställningar. Punkterna är avlästa ur poseAt 2026-11-18, innan de
// andra platserna fick båge och vridning, och det som görs för dem ska inte flytta något här.
const PINNED: { time: number; wrist: Vec3; elbow: Vec3; shoulder: Vec3; indexTip: Vec3; card: Vec3; rightWrist: Vec3 }[] = [
  {
    time: 0,
    wrist: [0.3875584011916771, 0.11486428825035608, -1.91599227061198],
    elbow: [0.33881167187895517, 0.18443767263921265, -2.161722408295563],
    shoulder: [0.1438, 0.3489, -2.0238],
    indexTip: [0.37754038373537663, 0.06580577658877665, -1.818855315700182],
    card: [0.34447043151892404, 0.04546916639129894, -1.797698921418723],
    rightWrist: [-0.15899350727535716, 0.038753077850376155, -1.8559999141735246],
  },
  {
    time: 1,
    wrist: [0.36165392350306147, 0.16829475396658025, -1.9208979898318168],
    elbow: [0.3195554558262022, 0.19309542067721125, -2.1762656580084454],
    shoulder: [0.139, 0.3503, -2.0126],
    indexTip: [0.335505444865104, 0.17262678080015667, -1.837427174052871],
    card: [0.3175811838307436, 0.13207218765285003, -1.8108969309317533],
    rightWrist: [-0.1555040623179212, 0.03812139837880521, -1.852555713521104],
  },
  {
    time: 1.8,
    wrist: [0.07838499451545396, 0.05496230296348145, -1.7681173376217143],
    elbow: [0.24734999526031495, 0.08501727760914808, -1.9634312567937422],
    shoulder: [0.136, 0.3508, -1.996],
    indexTip: [0.06122506257603377, 0.05216144256633895, -1.6678852207528292],
    card: [0.013501485117924296, 0.03433288820468339, -1.6672276163486495],
    rightWrist: [-0.15800337458893854, 0.037461561539966964, -1.8504956278797702],
  },
  {
    time: 2.5,
    wrist: [0.01981808140271229, 0.03924814359130582, -1.5942232668196135],
    elbow: [0.15697009510719678, 0.10264625531336641, -1.8058125022898568],
    shoulder: [0.13140000000000002, 0.3491, -1.9565000000000001],
    indexTip: [0.011542859337499661, 0.00005544862069234435, -1.490879064296191],
    card: [-0.018601163118756384, -0.00800313136940542, -1.455008863400937],
    rightWrist: [-0.1612114314940516, 0.037312921773501706, -1.857758770520352],
  },
  {
    time: 3.9667,
    wrist: [0.014203983551525677, 0.01037682588075664, -1.5713895397709836],
    elbow: [0.13232231568944325, 0.11116837999902646, -1.7799299968323905],
    shoulder: [0.136, 0.3469, -1.9488],
    indexTip: [0.023467527259834642, -0.02713817051320841, -1.4590301555359182],
    card: [-0.019000000000000003, -0.03445140066610655, -1.4482976314961649],
    rightWrist: [-0.15986685901323833, 0.03586868325576334, -1.8548221207802333],
  },
];
// Ett avstånd under en miljondels millimeter är samma punkt.
const SAME = 1e-9;

test('grundrörelsen till plats 4 är låst: samma punkter som när bilderna beställdes', () => {
  // Skon och plats 4:s kortplatser som de stod när bilderna beställdes (content/scene.json vid commit ab56003). Skon och
  // kortplatserna flyttades 2026-11-18; samma kod ska ge samma rörelse med dem som de var.
  const then: SceneDescription = {
    ...scene,
    shoe: { ...scene.shoe, at: [0.495, -1.8433], yawDeg: -74.6, length: 0.442 },
    places: { ...scene.places, seats: scene.places.seats.map((entry) => (entry.seat === 4 ? { ...entry, cards: [[-0.019, -1.4468], [0.0191, -1.46]] } : entry)) },
  };
  for (const pin of PINNED) {
    const pose = poseAt(then, doll, base, pin.time);
    const what = `vid ${pin.time} s`;
    near(far(pose.arms.left.wrist, pin.wrist), 0, SAME, `vänster handled ${what}`);
    near(far(pose.arms.left.elbow, pin.elbow), 0, SAME, `vänster armbåge ${what}`);
    near(far(pose.arms.left.shoulder, pin.shoulder), 0, SAME, `vänster axel ${what}`);
    near(far(pose.hands.left[8]!, pin.indexTip), 0, SAME, `vänster pekfingerspets ${what}`);
    near(far(pose.card!.centre, pin.card), 0, SAME, `kortets mitt ${what}`);
    near(far(pose.arms.right.wrist, pin.rightWrist), 0, SAME, `höger handled ${what}`);
  }
  const rest = restPose(scene, doll);
  near(far(rest.arms.left.wrist, [0.12899999999999998, 0.03732888702799883, -1.855122711640647]), 0, SAME, 'vänster handled i VILA');
  near(far(rest.arms.left.elbow, [0.29149163784162224, 0.10050302482709952, -2.048009973907722]), 0, SAME, 'vänster armbåge i VILA');
  near(far(rest.hands.right[12]!, [-0.07277933295977736, 0.006924682485274586, -1.7428121850296872]), 0, SAME, 'höger långfingerspets i VILA');
  // Grundrörelsen går fri från allt som den är: den behöver varken båge eller vridning.
  assert.deepEqual(armHits(then, doll, base), { shoe: [], restingHand: [], torso: [], table: [] });
});

// ---------------------------------------------------------------------------------------------------------------------
// Cykeln: REDO → kortet lagt på en kortplats → REDO (content/moves/cykel-nyp.json), till varje plats och kortplats.

const placeOf = (seat: number, index: number) => scene.places.seats.find((entry) => entry.seat === seat)!.cards[index]!;
const cycles = new Map<string, DollMove>();
const cycleTo = (seat: number, index: number): DollMove => {
  const key = `${seat}:${index}`;
  if (!cycles.has(key)) cycles.set(key, moveFor(scene, doll, base, seat, { index, cycle }));
  return cycles.get(key)!;
};
/** Sista ställningen i en rörelse. */
const last = (move: DollMove): DollPose => poseAt(scene, doll, move, move.seconds);
/** Varje plats med sina två första kortplatser: 14 cykler. */
const CYCLES = seatsOf(scene).flatMap((seat) => [0, 1].map((index) => [seat, index] as const));
// Dockans hand från handleden till långfingrets yttersta spets (content/doll.json, hand.source).
const HAND = 0.175;

/** Handens längd i en ställning: handled till långfingrets knoge, långfingrets tre ben och spetsens radie. */
const handLength = (hand: Vec3[]): number => far(hand[0]!, hand[9]!) + far(hand[9]!, hand[10]!) + far(hand[10]!, hand[11]!) + far(hand[11]!, hand[12]!) + doll.hand.radius.tip;

/** Två ställningar är samma ställning: kropp, armar, händer, blick, kortet i handen och kortet i skon, punkt för punkt. */
function samePose(a: DollPose, b: DollPose, what: string): void {
  const pairs: [Vec3, Vec3, string][] = [
    [a.hip, b.hip, 'höften'],
    [a.torso, b.torso, 'bålen'],
    [a.neck, b.neck, 'nacken'],
    [a.head, b.head, 'huvudet'],
    [a.gaze, b.gaze, 'blicken'],
    ...(['left', 'right'] as const).flatMap((side): [Vec3, Vec3, string][] => [
      [a.arms[side].shoulder, b.arms[side].shoulder, `${side} axel`],
      [a.arms[side].elbow, b.arms[side].elbow, `${side} armbåge`],
      ...a.hands[side].map((point, k): [Vec3, Vec3, string] => [point, b.hands[side][k]!, `${side} hand punkt ${k}`]),
    ]),
    ...a.card!.corners.map((corner, k): [Vec3, Vec3, string] => [corner, b.card!.corners[k]!, `kortets hörn ${k}`]),
    ...a.shoeCard.corners.map((corner, k): [Vec3, Vec3, string] => [corner, b.shoeCard.corners[k]!, `skokortets hörn ${k}`]),
  ];
  for (const [p, q, part] of pairs) near(far(p, q), 0, SAME, `${what}: ${part}`);
  assert.equal(a.card!.up, b.card!.up, `${what}: kortets sida`);
}

test('cykeln läses, och fel i den sägs på svenska', () => {
  const whole = read('moves/cykel-nyp.json') as DollCycle;
  assert.ok(isCycle(whole), 'cykeln känns igen');
  assert.ok(!isCycle(read('moves/giv-nyp-plats-4.json')), 'given är ingen cykel');
  assert.equal(cycle.give, base.id);
  assert.equal(cycle.from, 'REDO');
  assert.throws(() => readCycle({ ...whole, seconds: 3.5 }), /Cykeln går inte att använda: seconds ska vara summan av parts/);
  assert.throws(() => readCycle({ ...whole, to: 'LAGT 4' }), /from och to ska vara samma/);
  assert.throws(() => readCycle({ ...whole, back: { ...whole.back, look: 0 } }), /back:/);
  assert.throws(() => readCycle({ ...whole, back: { ...whole.back, close: whole.back.open / 2 } }), /open och close/);
  assert.throws(() => readCycle({ ...whole, basis: 'gissat' }), /basis och source/);
});

test('cykelns takt: 4,0 s, given ungefär dubbelt så fort som den lästa, vila på kortet, tillbaka och stilla i REDO', () => {
  const move = cycleTo(4, 0);
  const frame = 1 / move.fps;
  near(move.seconds, 4, 1e-9, 'cykelns längd');
  near(cycle.seconds, 4, 1e-9, 'cykelns längd i filen');
  assert.equal(move.frameCount, 4 * move.fps + 1);
  const { letsGo, home, pace } = move.back!;
  const { ready, deal, onCard, still } = cycle.parts;
  near(move.moments.rests / move.fps, ready + deal, frame / 2, 'kortet ligger när given är slut');
  near(letsGo / move.fps, ready + deal + onCard, frame / 2, 'handen lämnar kortet');
  near(home / move.fps, cycle.seconds - still, frame / 2, 'handen är tillbaka i skon');
  // En förlaga tar varje ruta mitt i sin tid: den första och den sista rutan ligger där hon står stilla i REDO.
  assert.ok(ready >= frame / 2 && still >= frame / 2, 'stilla i REDO minst en halv ruta i början och slutet');
  // Den lästa given tar 3,2 s från REDO tills kortet ligger; cykelns giv går ungefär dubbelt så fort.
  near(pace, base.moments.rests / (deal * move.fps), 1e-9, 'takten');
  assert.ok(pace >= 1.6 && pace <= 2.1, `given går ${pace.toFixed(2)} gånger så fort som den lästa`);
  assert.equal(move.id, 'cykel-nyp-plats-4-kort-0');
  assert.equal(move.to, 'REDO');
});

test('cykelns giv är den hängda given längs samma väg: samma kod, samma väg, och farten en klocka längs den', () => {
  const grip = (pose: DollPose): Vec3 => pose.hands.left[4]!.map((value, k) => (value + pose.hands.left[8]![k]!) / 2) as Vec3;
  for (const seat of [4, 1, 7]) {
    const move = cycleTo(seat, 0);
    const give = moveTo(seat);
    assert.equal(move.swingDeg, give.swingDeg, `plats ${seat}: svängen`);
    assert.equal(move.bow, give.bow, `plats ${seat}: bågen`);
    // Kortet går givens väg: i REDO och när kortet ligger exakt där given har det, och däremellan på givens väg, lugnad
    // (cycle.life.calm) så att den ligger högst 1,5 cm från den lästa (där kortet vänds).
    const path = Array.from({ length: give.moments.rests * 4 + 1 }, (_, k) => poseAt(scene, doll, give, k / 4 / give.fps).card!.centre);
    for (let frame = 0; frame <= move.moments.rests; frame++) {
      const centre = poseAt(scene, doll, move, frame / move.fps).card!.centre;
      const off = Math.min(...path.map((point) => far(point, centre)));
      assert.ok(off <= 0.015, `plats ${seat}, ruta ${frame}: kortet ${(off * 1000).toFixed(1)} mm från givens väg`);
    }
    near(far(poseAt(scene, doll, move, 0).card!.centre, path[0]!), 0, SAME, `plats ${seat}: kortet i REDO`);
    near(far(poseAt(scene, doll, move, move.moments.rests / move.fps).card!.centre, path.at(-1)!), 0, SAME, `plats ${seat}: kortet när det ligger`);
    // Greppets fart på vägen ut: en topp, som en sträckning med minsta ryck, inte givens egna knyckar.
    const speed: number[] = [];
    for (let frame = 1; frame <= move.moments.rests; frame++) {
      speed.push(far(grip(poseAt(scene, doll, move, frame / move.fps)), grip(poseAt(scene, doll, move, (frame - 1) / move.fps))) * move.fps);
    }
    const top = Math.max(...speed);
    const peaks = speed.filter((value, k) => k > 0 && k < speed.length - 1 && value > speed[k - 1]! && value >= speed[k + 1]! && value > 0.1 * top);
    assert.equal(peaks.length, 1, `plats ${seat}: greppets fart har ${peaks.length} toppar på vägen ut`);
  }
});

test('cykelns kropp lever: ingen ruta är hela kroppen stilla, hon andas, och REDO är exakt REDO', () => {
  for (const seat of [4, 1, 7]) {
    const move = cycleTo(seat, 0);
    const poses = Array.from({ length: move.frameCount }, (_, frame) => poseAt(scene, doll, move, frame / move.fps));
    // Mellan två rutor rör sig något i kroppen minst 0,2 mm (6 mm/s): axlar, huvud, huvudets riktning eller handen.
    for (let frame = 1; frame < poses.length; frame++) {
      const [a, b] = [poses[frame - 1]!, poses[frame]!];
      const moved = Math.max(far(a.arms.left.shoulder, b.arms.left.shoulder), far(a.arms.right.shoulder, b.arms.right.shoulder), far(a.head, b.head), far(a.face, b.face) * 0.1, far(a.hands.left[0]!, b.hands.left[0]!));
      assert.ok(moved >= 0.0002, `plats ${seat}, ruta ${frame}: kroppen rör sig bara ${(moved * 1000).toFixed(2)} mm`);
    }
    // Bålen lutar sig mjukt: lutningen ändras högst lite mellan två rutor och ändrar sin ändring lite (inga knyckar).
    const lean = move.tracks.lean!.amount;
    const steps = lean.slice(1).map((value, k) => value - lean[k]!);
    const most = Math.max(...steps.map(Math.abs));
    const jolt = Math.max(...steps.slice(1).map((value, k) => Math.abs(value - steps[k]!)));
    assert.ok(jolt <= 0.25 * most, `plats ${seat}: bålens lutning knyckar ${jolt.toFixed(4)} rad per ruta² mot största steg ${most.toFixed(4)}`);
    assert.ok(Math.min(...lean.slice(1, -1)) >= 0 && lean[0] === 0 && lean.at(-1) === 0, `plats ${seat}: lutningen börjar och slutar i 0`);
  }
});

for (const [seat, index] of CYCLES) {
  test(`cykel till plats ${seat}, kort ${index}: börjar och slutar i REDO, med kortet i kortplatsens hörn`, () => {
    const move = cycleTo(seat, index);
    const first = poseAt(scene, doll, move, 0);
    const last = poseAt(scene, doll, move, move.seconds);
    // Samma REDO i början och slutet, och samma som given börjar i: vilken cykel som helst kan följa på vilken som helst.
    const redo = poseAt(scene, doll, base, 0);
    samePose(first, redo, 'första rutan');
    samePose(last, redo, 'sista rutan');
    // Bortsett från det lagda kortet: det ligger med den blå framsidan upp i kortplatsens hörn.
    assert.equal(first.laid, null);
    assert.ok(last.laid, 'kortet ligger kvar');
    assert.equal(last.laid.up, 'framsida');
    cardCorners(scene, placeOf(seat, index)).forEach((corner, k) => near(far(last.laid!.corners[k]!, corner), 0, 0.001, `kortets hörn ${k}`));
    for (const corner of last.laid.corners) near(over(corner), scene.card.thickness / 2, 0.0005, 'kortets hörn över filten');
    // Ett nytt gult kort står i skons mynning där det delade stod, med handen på det.
    assert.equal(last.card!.up, 'baksida');
    pickUpCard(scene, doll).corners.forEach((corner, k) => near(far(last.card!.corners[k]!, corner), 0, EXACT, `nästa korts hörn ${k} mot hämtstället`));
    assert.ok(nearestTip(last) <= TOUCH, 'handen på nästa kort');
  });

  test(`cykel till plats ${seat}, kort ${index}: armen går fri, handen håller sin storlek, och kortet släpps en gång`, () => {
    const move = cycleTo(seat, index);
    assert.deepEqual(throughShoe(scene, doll, move), []);
    assert.deepEqual(armHits(scene, doll, move), { shoe: [], restingHand: [], torso: [], table: [] });
    const { letsGo, home } = move.back!;
    // Blicken går före: den lämnar kortet cycle.life.gazeLead innan handen gör det.
    const looksAway = letsGo - Math.round(cycle.life.gazeLead * move.fps);
    for (let frame = 0; frame < move.frameCount; frame++) {
      const pose = poseAt(scene, doll, move, frame / move.fps);
      checkPose(pose, `ruta ${frame}`);
      near(handLength(pose.hands.left), HAND, 0.001, `ruta ${frame}: givhandens längd`);
      near(handLength(pose.hands.right), HAND, 0.001, `ruta ${frame}: den vilande handens längd`);
      // Fingrarna ligger på kortet tills handen släpper det; sedan ligger det kvar och blicken går tillbaka till skon.
      assert.equal(pose.laid === null, frame <= letsGo, `ruta ${frame}: kortet är ${pose.laid ? 'släppt' : 'i handen'}`);
      if (frame >= move.moments.rests && frame <= letsGo) assert.ok(nearestTip(pose) <= TOUCH, `ruta ${frame}: fingrarna på det lagda kortet`);
      if (frame >= move.moments.rests && frame <= looksAway) near(far(pose.gaze, pose.card!.centre), 0, 0.01, `ruta ${frame}: blicken på kortet`);
      if (frame > letsGo) near(far(pose.laid!.centre, last(move).laid!.centre), 0, SAME, `ruta ${frame}: kortet ligger kvar`);
    }
    // Från skon går blicken till REDO:s punkt mitt på bordet (doll.gaze.ready) och är där i sista rutan.
    near(far(last(move).gaze, readyGaze(scene, doll)), 0, SAME, 'blicken på REDO:s punkt i sista rutan');
    assert.ok(home < move.frameCount - 1, 'handen är i skon före sista rutan');
  });
}

test('cykelns hand: fingrarna släpper greppet till en avslappnad hand och sluter sig till nypet först vid skon', () => {
  // Handens form utan läge och vridning: avstånden mellan handled, knogar och fingertoppar.
  const POINTS = [0, 1, 5, 9, 13, 17, ...TIPS];
  const shape = (hand: Vec3[]): number[] => POINTS.flatMap((a, i) => POINTS.slice(i + 1).map((b) => far(hand[a]!, hand[b]!)));
  const apart = (a: number[], b: number[]): number => a.reduce((sum, value, k) => sum + Math.abs(value - b[k]!), 0) / a.length;
  const relaxed = shape(fitHand(handSkeleton(doll), relaxedLeft(doll), 'left', [4, 8]));
  for (const [seat, index] of [[4, 0], [1, 0], [7, 1]] as const) {
    const move = cycleTo(seat, index);
    const { letsGo, home } = move.back!;
    const handAt = (share: number): Vec3[] => poseAt(scene, doll, move, (letsGo + share * (home - letsGo)) / move.fps).hands.left;
    const grip = apart(shape(handAt(0)), relaxed);
    const what = `plats ${seat}, kort ${index}`;
    // Greppet är en annan form än den avslappnade handen, och nypet i skon också.
    assert.ok(grip > 0.004, `${what}: greppet skiljer sig ${(grip * 1000).toFixed(1)} mm från den avslappnade handen`);
    assert.ok(apart(shape(handAt(1)), relaxed) > 0.004, `${what}: nypet i skon`);
    // Mellan open och close är handen avslappnad.
    for (const share of [cycle.back.open + 0.02, (cycle.back.open + cycle.back.close) / 2, cycle.back.close - 0.02]) {
      near(apart(shape(handAt(share)), relaxed), 0, 0.0005, `${what}: handen ${share.toFixed(2)} av vägen tillbaka`);
    }
    // Nypet formas först mot slutet: halvvägs mellan close och skon är handen ännu inte nypet.
    const late = apart(shape(handAt((cycle.back.close + 1) / 2)), shape(handAt(1)));
    assert.ok(late > 0.001, `${what}: handen är redan nypet ${(late * 1000).toFixed(1)} mm före skon`);
  }
});

test('en cykel som har sparats och lästs igen spelas som den var', () => {
  const kept = cycleTo(7, 1);
  const again = readMove(JSON.parse(JSON.stringify(kept)));
  assert.equal(again.index, 1);
  for (const time of [0, 1, 2, 2.5, 3, kept.seconds]) {
    const a = poseAt(scene, doll, kept, time);
    const b = poseAt(scene, doll, again, time);
    a.hands.left.forEach((point, k) => near(far(point, b.hands.left[k]!), 0, 1e-6, `punkt ${k} vid ${time} s`));
    near(far(a.arms.left.elbow, b.arms.left.elbow), 0, 1e-6, `armbågen vid ${time} s`);
    near(far((a.laid ?? a.card)!.centre, (b.laid ?? b.card)!.centre), 0, 1e-6, `kortet vid ${time} s`);
  }
});

test('given utan cykel lägger kortet på platsens andra kortplats när den sägs, och går fri', () => {
  for (const seat of [1, 4, 7]) {
    const move = moveFor(scene, doll, base, seat, { index: 1 });
    assert.equal(move.index, 1);
    assert.equal(move.id, `${base.id}-till-plats-${seat}-kort-1`);
    const end = last(move);
    assert.equal(end.laid, null);
    cardCorners(scene, placeOf(seat, 1)).forEach((corner, k) => near(far(end.card!.corners[k]!, corner), 0, 0.001, `plats ${seat}: kortets hörn ${k}`));
    assert.deepEqual(throughShoe(scene, doll, move), []);
    assert.deepEqual(armHits(scene, doll, move), { shoe: [], restingHand: [], torso: [], table: [] });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Dealerns kort, hålkortet, vändningen och spelarnas tredje kort: samma cykel med en annan kortplats eller handling.

const acted = new Map<string, DollMove>();
/** Cykeln till en kortplats med en handling, räknad en gång. */
const actTo = (seat: Seat, index: number, action: Action): DollMove => {
  const key = `${seat}:${index}:${action}`;
  if (!acted.has(key)) acted.set(key, moveFor(scene, doll, base, seat, { index, cycle, action }));
  return acted.get(key)!;
};
/** Ett korts hörn sedda uppifrån, i cardCorners ordning, vilken sida som än är upp (som cornersIn i src/pipeline/cykel.ts). */
const fromAbove = (card: CardPose): Vec3[] => (card.up === 'baksida' ? [1, 0, 3, 2].map((k) => card.corners[k]!) : card.corners);
const where = (seat: Seat, index: number, action: Action): string => `${action} till ${seat === 'D' ? 'dealern' : `plats ${seat}`}, kort ${index}`;
/** De nya slagen: dealerns öppna kort, hålkortet, vändningen, dealerns extrakort och tredje kortet till plats 1–7. */
const NEW: [Seat, number, Action][] = [
  ['D', 0, 'deal'],
  ['D', 1, 'hole'],
  ['D', 1, 'flip'],
  ['D', 2, 'deal'],
  ['D', 3, 'deal'],
  ...seatsOf(scene).map((seat): [Seat, number, Action] => [seat, 2, 'deal']),
];

test('dealerns kortplatser och handlingarna läses, och fel sägs på svenska', () => {
  assert.deepEqual([...ACTIONS], ['deal', 'hole', 'flip', 'wait']);
  assert.deepEqual(cardPlace(scene, 'D', 1), scene.places.dealer[1]);
  assert.throws(() => cardPlace(scene, 'D', 9), /ingen kortplats 9 för dealern/);
  assert.throws(() => cardPlace(scene, 9, 0), /ingen första kortplats för plats 9/);
  assert.throws(() => moveFor(scene, doll, base, 'D', { index: 1, action: 'hole' }), /Hålkortet görs bara som cykel/);
  assert.throws(() => moveFor(scene, doll, base, 'D', { index: 1, cycle, action: 'peek' as Action }), /Okänd handling: peek/);
  assert.equal(actTo('D', 1, 'hole').id, 'cykel-nyp-hole-dealer-kort-1');
  assert.equal(actTo('D', 0, 'deal').id, 'cykel-nyp-dealer-kort-0');
  assert.equal(actTo('D', 0, 'deal').action, undefined, 'en giv bär ingen handling: deal gäller när inget sägs');
  const whole = read('moves/cykel-nyp.json') as DollCycle;
  assert.throws(() => readCycle({ ...whole, flip: { ...whole.flip, reach: whole.parts.deal } }), /flip:/);
  assert.throws(() => readCycle({ ...whole, flip: undefined }), /flip:/);
  const saved = JSON.parse(JSON.stringify(actTo('D', 1, 'flip'))) as DollMove;
  assert.throws(() => readMove({ ...saved, seat: 0 }), /seat ska vara en plats från 1, eller D/);
  assert.throws(() => readMove({ ...saved, action: 'peek' }), /action ska vara deal, hole, flip/);
  assert.throws(() => readMove({ ...saved, back: { ...saved.back!, out: [40, 30] } }), /back.out/);
});

for (const [seat, index, action] of NEW) {
  const what = where(seat, index, action);
  test(`${what}: börjar och slutar i REDO, med kortet i kortplatsens hörn och rätt sida upp`, () => {
    const move = actTo(seat, index, action);
    near(move.seconds, 4, 1e-9, 'cykelns längd');
    assert.equal(move.frameCount, 4 * move.fps + 1);
    const first = poseAt(scene, doll, move, 0);
    const end = last(move);
    const redo = poseAt(scene, doll, base, 0);
    samePose(first, redo, 'första rutan');
    samePose(end, redo, 'sista rutan');
    const corners = cardCorners(scene, cardPlace(scene, seat, index));
    assert.ok(end.laid, 'kortet ligger kvar');
    assert.equal(end.laid.up, action === 'hole' ? 'baksida' : 'framsida');
    fromAbove(end.laid).forEach((corner, k) => near(far(corner, corners[k]!), 0, 0.001, `kortets hörn ${k}`));
    for (const corner of end.laid.corners) near(over(corner), scene.card.thickness / 2, 0.0005, 'kortets hörn över filten');
    if (action === 'flip') {
      // Hålkortet ligger med baksidan upp på sin plats från början.
      assert.equal(first.laid?.up, 'baksida');
      fromAbove(first.laid!).forEach((corner, k) => near(far(corner, corners[k]!), 0, 0.001, `hålkortets hörn ${k} i första rutan`));
    } else assert.equal(first.laid, null);
    // Ett gult kort står i skons mynning där det delade stod, med handen på det.
    assert.equal(end.card!.up, 'baksida');
    pickUpCard(scene, doll).corners.forEach((corner, k) => near(far(end.card!.corners[k]!, corner), 0, EXACT, `nästa korts hörn ${k} mot hämtstället`));
    assert.ok(nearestTip(end) <= TOUCH, 'handen på nästa kort');
  });

  // Plats 7, kort 2: med bågen från 2026-11-18 (kväll) kräver cykel-nyp 105 graders armbåge där, medan variant D
  // (cykel-nyp-flytande, src/pipeline/rorelse.test.ts) går fri med 85. Väntar på Jakobs val mellan dem.
  const known = seat === 7 && index === 2 ? 'plats 7, kort 2: cykel-nyp kräver 105 graders armbåge med den nya bågen; variant D 85' : undefined;
  test(`${what}: armen går fri från skon, bålen, den vilande handen och bordet, och handen håller sin storlek`, { skip: known }, () => {
    const move = actTo(seat, index, action);
    assert.deepEqual(throughShoe(scene, doll, move), []);
    assert.deepEqual(armHits(scene, doll, move), { shoe: [], restingHand: [], torso: [], table: [] });
    const turns = move.tracks.leftArm?.turnDeg ?? [0];
    assert.ok(Math.max(...turns.map(Math.abs)) <= 90, `armbågen vrids ${Math.max(...turns.map(Math.abs))} grader`);
    assert.ok(move.bow! >= 0 && move.bow! <= 0.2, `bågen är ${move.bow} m`);
    const { letsGo, out } = move.back!;
    const end = last(move);
    for (let frame = 0; frame < move.frameCount; frame++) {
      const pose = poseAt(scene, doll, move, frame / move.fps);
      checkPose(pose, `ruta ${frame}`);
      near(handLength(pose.hands.left), HAND, 0.001, `ruta ${frame}: givhandens längd`);
      near(handLength(pose.hands.right), HAND, 0.001, `ruta ${frame}: den vilande handens längd`);
      // Kortet i handen från att det tas tills handen släpper det; före det i en vändning ligger hålkortet på bordet.
      const holding = frame <= letsGo && !(out && frame < out[1]);
      assert.equal(pose.laid === null, holding, `ruta ${frame}: kortet är ${pose.laid ? 'lagt' : 'i handen'}`);
      if (frame >= move.moments.rests && frame <= letsGo) assert.ok(nearestTip(pose) <= TOUCH, `ruta ${frame}: fingrarna på det lagda kortet`);
      if (frame > letsGo) near(far(pose.laid!.centre, end.laid!.centre), 0, SAME, `ruta ${frame}: kortet ligger kvar`);
    }
  });
}

test('väntan: REDO till REDO utan kort, handen vid kortet i skon, blicken upp mot spelarna och tillbaka, och kroppen lever', () => {
  // Variant D:s andning och sväng (content/moves/cykel-nyp-flytande.json); med cykel-nyp:s mindre står hon still 6 % av väntan.
  const lively = readCycle(read('moves/cykel-nyp-flytande.json'));
  const move = moveFor(scene, doll, base, 'D', { index: 0, cycle: lively, action: 'wait' });
  assert.equal(move.id, 'cykel-nyp-flytande-wait');
  assert.equal(move.action, 'wait');
  near(move.seconds, lively.seconds, 1e-9, 'väntans längd');
  const redo = poseAt(scene, doll, base, 0);
  samePose(poseAt(scene, doll, move, 0), redo, 'första rutan');
  samePose(poseAt(scene, doll, move, move.seconds), redo, 'sista rutan');
  const mouth = pickUpCard(scene, doll);
  const down = sub(redo.gaze, redo.head);
  let highest = 0;
  let previous: DollPose | null = null;
  for (let frame = 0; frame < move.frameCount; frame++) {
    const pose = poseAt(scene, doll, move, frame / move.fps);
    checkPose(pose, `ruta ${frame}`);
    // Inget kort läggs, kortet i mynningen står kvar, och handen är på det.
    assert.equal(pose.laid, null, `ruta ${frame}: inget lagt kort`);
    pose.card!.corners.forEach((corner, k) => near(far(corner, mouth.corners[k]!), 0, EXACT, `ruta ${frame}: kortet i mynningen, hörn ${k}`));
    assert.ok(nearestTip(pose) <= TOUCH, `ruta ${frame}: handen på kortet`);
    near(far(pose.hands.left[0]!, redo.hands.left[0]!), 0, EXACT, `ruta ${frame}: givhanden står i REDO`);
    const look = sub(pose.gaze, pose.head);
    highest = Math.max(highest, Math.atan2(look[1], Math.hypot(look[0], look[2])) - Math.atan2(down[1], Math.hypot(down[0], down[2])));
    if (previous) {
      // Något rör sig mellan två rutor: axlar eller huvud minst 0,2 mm, huvudets riktning minst 0,1°, eller den vilande
      // handens pekfinger minst 0,2 mm.
      const turn = (a: DollPose): Vec3 => sub(a.face, a.head);
      const cos = dot(turn(previous), turn(pose)) / Math.hypot(...turn(previous)) / Math.hypot(...turn(pose));
      const turned = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
      const moved = Math.max(far(previous.arms.left.shoulder, pose.arms.left.shoulder), far(previous.head, pose.head), far(previous.hands.right[8]!, pose.hands.right[8]!));
      assert.ok(moved >= 0.0002 || turned >= 0.1, `ruta ${frame}: kroppen rör sig bara ${(moved * 1000).toFixed(2)} mm och huvudet ${turned.toFixed(2)}°`);
    }
    previous = pose;
  }
  assert.ok(highest > 0.15, `blicken lyfts ${((highest * 180) / Math.PI).toFixed(0)} grader upp mot spelarna`);
  assert.throws(() => moveFor(scene, doll, base, 'D', { index: 0, cycle: { ...lively, wait: undefined }, action: 'wait' }), /säger inte hur hon väntar/);
});

test('hålkortet vänds inte: baksidan är upp hela vägen, och handen gör samma rörelse som när kortet vänds', () => {
  const hole = actTo('D', 1, 'hole');
  const dealt = actTo('D', 1, 'deal');
  for (let frame = 0; frame < hole.frameCount; frame++) {
    const a = poseAt(scene, doll, hole, frame / hole.fps);
    const b = poseAt(scene, doll, dealt, frame / dealt.fps);
    const card = a.laid ?? a.card!;
    assert.equal(card.up, 'baksida', `ruta ${frame}: hålkortet visar baksidan`);
    a.hands.left.forEach((point, k) => near(far(point, b.hands.left[k]!), 0, SAME, `ruta ${frame}: givhanden punkt ${k}`));
    // Samma kort på samma ställe, utom där givens kort står på kant och hålkortet ligger nästan plant: där lyfts de olika
    // mycket från filten (cardOnTable).
    const turning = frame >= hole.moments.edge[0] - 3 && frame <= hole.moments.edge[1] + 3;
    near(far(card.centre, (b.laid ?? b.card)!.centre), 0, turning ? 0.005 : 1e-6, `ruta ${frame}: kortets mitt`);
  }
  // Givens kort vänds en gång; hålkortet är samma kort utan vändningen: samma yta före den, och framsidan nedåt efter.
  const read = base.tracks.card;
  const turned = unturned(read, base.moments);
  const before = base.moments.edge[0] - 4;
  const after = base.moments.edge[1] + 4;
  near(far(turned.face[before]!, read.face[before]!), 0, 1e-12, 'före vändningen');
  const flat = (face: Vec3, long: Vec3): Vec3 => {
    const along = dot(face, long) / dot(long, long);
    return [face[0] - long[0] * along, face[1] - long[1] * along, face[2] - long[2] * along];
  };
  for (const frame of [after, base.frameCount - 1]) {
    const minus = flat(read.face[frame]!, read.long[frame]!).map((value) => -value) as Vec3;
    near(far(flat(turned.face[frame]!, read.long[frame]!), minus), 0, 1e-9, `ruta ${frame}: framsidan nedåt`);
  }
  assert.throws(() => unturned({ ...read, face: read.face.map(() => read.face[0]!), long: read.long.map(() => read.long[0]!) }, base.moments), /vänder inte kortet/);
});

test('vändningen: inget kort dras, hålkortet lyfts, vänds över sin plats och läggs där det låg', () => {
  const move = actTo('D', 1, 'flip');
  const [leaves, arrives] = move.back!.out!;
  const { letsGo } = move.back!;
  assert.ok(leaves >= Math.round(cycle.parts.ready * move.fps) && arrives > leaves && arrives < move.moments.rests);
  const place = placeOnTable(scene, cardPlace(scene, 'D', 1));
  const mouth = pickUpCard(scene, doll);
  const faces: string[] = [];
  for (let frame = 0; frame <= letsGo; frame++) {
    const pose = poseAt(scene, doll, move, frame / move.fps);
    if (frame < arrives) {
      // Nästa kort står kvar i mynningen medan handen går ut, och hålkortet ligger på bordet.
      mouth.corners.forEach((corner, k) => near(far(pose.card!.corners[k]!, corner), 0, EXACT, `ruta ${frame}: kortet i mynningen, hörn ${k}`));
      assert.equal(pose.laid!.up, 'baksida');
      continue;
    }
    // Kortet hålls över sin plats medan det lyfts, vänds och läggs.
    const card = pose.card!;
    const off = Math.hypot(card.centre[0] - place[0], card.centre[2] - place[2]);
    assert.ok(off <= 0.06, `ruta ${frame}: kortet ${off.toFixed(3)} m från sin plats`);
    if (faces.at(-1) !== card.up) faces.push(card.up);
  }
  assert.deepEqual(faces, ['baksida', 'framsida'], 'kortet vänds en gång, i handen');
  // Handen når hålkortet med fingertopparna, och blicken har gått före den dit.
  const reached = poseAt(scene, doll, move, arrives / move.fps);
  assert.ok(Math.min(...TIPS.map((k) => toCard(reached.hands.left[k]!, reached.card!))) <= TOUCH, 'fingrarna på hålkortet');
  near(far(poseAt(scene, doll, move, 0).gaze, readyGaze(scene, doll)), 0, SAME, 'blicken på REDO:s punkt mitt på bordet i REDO');
  // Blicken ligger cycle.life.gazeLead före: den är på hålkortet så långt innan handen når det.
  const early = poseAt(scene, doll, move, arrives / move.fps - cycle.life.gazeLead);
  near(far(early.gaze, reached.card!.centre), 0, 0.005, 'blicken på hålkortet före handen');
});

// ---------------------------------------------------------------------------------------------------------------------
// REDO och variant E (content/moves/cykel-nyp-rask.json): huvudet mot bordets mitt och aldrig mot skon, 3,0 s, knuffen på
// kortet, och hålkortet plant ur skon.

const angleBetween = (a: Vec3, b: Vec3): number => (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b)))) * 180) / Math.PI;

test('REDO: hon ser på kortplatsen mitt på bordet (doll.gaze.ready), inte på kortet i skons mynning', () => {
  const redo = poseAt(scene, doll, base, 0);
  const ready = readyGaze(scene, doll);
  near(far(ready, placeOnTable(scene, cardPlace(scene, doll.gaze.ready.seat, doll.gaze.ready.index))), 0, 1e-9, 'REDO:s punkt är kortplatsen på filten');
  near(far(redo.gaze, ready), 0, SAME, 'blicken');
  near(angleBetween(sub(redo.face, redo.head), sub(ready, redo.head)), 0, 1e-6, 'huvudet vänt mot punkten');
  const shoe = angleBetween(sub(redo.face, redo.head), sub(pickUpCard(scene, doll).centre, redo.head));
  assert.ok(shoe > 30, `huvudet är ${shoe.toFixed(1)}° från kortet i mynningen`);
  // Bara blicken och huvudets riktning ändrades: handen nyper kortet i mynningen som förut.
  assert.ok(nearestTip(redo) <= TOUCH, 'handen på kortet i mynningen');
  assert.throws(() => readDoll({ ...(read('doll.json') as DollDescription), gaze: { ...doll.gaze, ready: { seat: 0, index: 0 } } }), /gaze\.ready/);
});

const rask: DollCycle = readCycle(read('moves/cykel-nyp-rask.json'));
const rasks = new Map<string, DollMove>();
const raskTo = (seat: Seat, index: number, action: Action = 'deal'): DollMove => {
  const key = `${seat}:${index}:${action}`;
  if (!rasks.has(key)) rasks.set(key, moveFor(scene, doll, base, seat, { index, cycle: rask, action }));
  return rasks.get(key)!;
};
/** Varje slag: plats 1–7 med kort 0–2, dealerns öppna kort, hålkortet, vändningen och dealerns extrakort. */
const RASK: [Seat, number, Action][] = [
  ...seatsOf(scene).flatMap((seat) => [0, 1, 2].map((index): [Seat, number, Action] => [seat, index, 'deal'])),
  ['D', 0, 'deal'],
  ['D', 1, 'hole'],
  ['D', 1, 'flip'],
  ['D', 2, 'deal'],
  ['D', 3, 'deal'],
];

test('variant E läses: 3,0 s, blicken mot platsen, knuffen och hålkortet plant, och fel sägs på svenska', () => {
  near(rask.seconds, 3, 1e-9, 'cykelns längd');
  assert.equal(rask.life.look, 'place');
  assert.equal(rask.hole, 'flat');
  assert.ok(rask.push && rask.push.reach > 0 && rask.push.to <= rask.parts.onCard, 'knuffen ryms på kortet');
  const whole = read('moves/cykel-nyp-rask.json') as DollCycle;
  assert.throws(() => readCycle({ ...whole, push: { ...whole.push!, to: whole.parts.onCard + 0.1 } }), /push:/);
  assert.throws(() => readCycle({ ...whole, hole: 'lyft' as DollCycle['hole'] }), /hole ska vara given eller flat/);
  assert.throws(() => readCycle({ ...whole, life: { ...whole.life, look: 'sko' as Life['look'] } }), /life:/);
  assert.throws(() => readCycle({ ...whole, wait: { ...whole.wait!, down: [2.4, 4.5] } }), /wait:/);
});

for (const [seat, index, action] of RASK) {
  const what = `variant E, ${where(seat, index, action)}`;
  test(`${what}: REDO exakt i början och slutet, kortet i kortplatsens hörn, armen fri och huvudet aldrig mot skon`, () => {
    const move = raskTo(seat, index, action);
    near(move.seconds, 3, 1e-9, 'cykelns längd');
    const redo = poseAt(scene, doll, base, 0);
    samePose(poseAt(scene, doll, move, 0), redo, 'första rutan');
    const end = last(move);
    samePose(end, redo, 'sista rutan');
    const corners = cardCorners(scene, cardPlace(scene, seat, index));
    assert.ok(end.laid, 'kortet ligger kvar');
    assert.equal(end.laid.up, action === 'hole' ? 'baksida' : 'framsida');
    fromAbove(end.laid).forEach((corner, k) => near(far(corner, corners[k]!), 0, 0.001, `kortets hörn ${k}`));
    assert.deepEqual(throughShoe(scene, doll, move), []);
    assert.deepEqual(armHits(scene, doll, move), { shoe: [], restingHand: [], torso: [], table: [] });
    const turns = move.tracks.leftArm?.turnDeg ?? [0];
    assert.ok(Math.max(...turns.map(Math.abs)) <= 90, `armbågen vrids ${Math.max(...turns.map(Math.abs))} grader`);
    const mouth = pickUpCard(scene, doll).centre;
    const { letsGo } = move.back!;
    for (let frame = 0; frame < move.frameCount; frame++) {
      const pose = poseAt(scene, doll, move, frame / move.fps);
      checkPose(pose, `ruta ${frame}`);
      near(handLength(pose.hands.left), HAND, 0.001, `ruta ${frame}: givhandens längd`);
      // Fingrarna ligger på kortet medan de knuffar det, tills handen lämnar det.
      if (frame >= move.moments.rests && frame <= letsGo) assert.ok(nearestTip(pose) <= TOUCH, `ruta ${frame}: fingrarna på kortet`);
      const toShoe = angleBetween(sub(pose.face, pose.head), sub(mouth, pose.head));
      assert.ok(toShoe >= 15, `ruta ${frame}: huvudet ${toShoe.toFixed(1)}° från skon`);
    }
  });
}

test('variant E: huvudet vrids mot platsen hon delar till, högst cirka 35° vid ytterplatserna och knappt vid plats 4', () => {
  const sweep = (seat: Seat): number => {
    const move = raskTo(seat, 0);
    const yaw = Array.from({ length: move.frameCount }, (_, frame) => {
      const pose = poseAt(scene, doll, move, frame / move.fps);
      const way = sub(pose.face, pose.head);
      return (Math.atan2(way[0], way[2]) * 180) / Math.PI;
    });
    return Math.max(...yaw) - Math.min(...yaw);
  };
  const outer = Math.max(sweep(1), sweep(7));
  assert.ok(outer > 20 && outer <= 35, `ytterplatserna: ${outer.toFixed(1)}°`);
  assert.ok(sweep(4) < 5, `plats 4: ${sweep(4).toFixed(1)}°`);
  assert.ok(sweep(3) < 12 && sweep(5) < 12, `plats 3 och 5: ${sweep(3).toFixed(1)}° och ${sweep(5).toFixed(1)}°`);
});

test('variant E: kortet landar före sin plats och knuffas dit av fingrarna medan de ligger på det', () => {
  const move = raskTo(4, 0);
  const { letsGo } = move.back!;
  const place = placeOnTable(scene, cardPlace(scene, 4, 0));
  const landed = poseAt(scene, doll, move, move.moments.rests / move.fps).card!.centre;
  const off = Math.hypot(landed[0] - place[0], landed[2] - place[2]);
  assert.ok(off > 0.005 && off <= rask.push!.reach + 1e-6, `kortet landar ${(off * 1000).toFixed(1)} mm från sin plats`);
  const left = poseAt(scene, doll, move, letsGo / move.fps).card!.centre;
  near(Math.hypot(left[0] - place[0], left[2] - place[2]), 0, 0.001, 'kortet på sin plats när handen lämnar det');
});

test('variant E: hålkortet förs plant ur skon längs filten, baksidan upp, och lyfts aldrig', () => {
  const move = raskTo('D', 1, 'hole');
  const { edge, rests } = move.moments;
  for (let frame = 0; frame <= rests; frame++) {
    const card = poseAt(scene, doll, move, frame / move.fps).card!;
    assert.equal(card.up, 'baksida', `ruta ${frame}: baksidan upp`);
    // Från att det är fällt ligger det plant på filten: inget hörn mer än en millimeter över den.
    if (frame >= edge[1]) for (const corner of card.corners) assert.ok(over(corner) < 0.001, `ruta ${frame}: hörnet ${(over(corner) * 1000).toFixed(1)} mm över filten`);
  }
});

test('variant E: väntan är 4,0 s, andas och börjar och slutar stilla, och blicken går upp mot spelarna', () => {
  const move = moveFor(scene, doll, base, 'D', { index: 0, cycle: rask, action: 'wait' });
  near(move.seconds, 4, 1e-9, 'väntans längd');
  const redo = poseAt(scene, doll, base, 0);
  samePose(poseAt(scene, doll, move, 0), redo, 'första rutan');
  samePose(poseAt(scene, doll, move, move.seconds), redo, 'sista rutan');
  // Farten noll i REDO (breath.still): axlarna rör sig knappt första och sista sjättedelen av en sekund jämfört med mitten.
  const shoulder = (time: number): Vec3 => poseAt(scene, doll, move, time).arms.left.shoulder;
  const step = 1 / 24;
  assert.ok(far(shoulder(0), shoulder(step)) < 0.2 * far(shoulder(move.seconds / 4), shoulder(move.seconds / 4 + step)), 'andningen börjar stilla');
  const look = (pose: DollPose) => Math.atan2(pose.gaze[1] - pose.head[1], Math.hypot(pose.gaze[0] - pose.head[0], pose.gaze[2] - pose.head[2]));
  const middle = poseAt(scene, doll, move, 2);
  assert.ok(look(middle) - look(redo) > 0.15, 'blicken upp mot spelarna');
});

test('en vändning och ett hålkort som har sparats och lästs igen spelas som de var', () => {
  for (const action of ['flip', 'hole'] as const) {
    const kept = actTo('D', 1, action);
    const again = readMove(JSON.parse(JSON.stringify(kept)));
    assert.equal(again.action, action);
    assert.equal(again.seat, 'D');
    for (const time of [0, 0.6, 1.3, 1.5, 2, 2.5, 3, kept.seconds]) {
      const a = poseAt(scene, doll, kept, time);
      const b = poseAt(scene, doll, again, time);
      a.hands.left.forEach((point, k) => near(far(point, b.hands.left[k]!), 0, 1e-9, `${action}: punkt ${k} vid ${time} s`));
      near(far(a.arms.left.elbow, b.arms.left.elbow), 0, 1e-9, `${action}: armbågen vid ${time} s`);
      near(far((a.laid ?? a.card)!.centre, (b.laid ?? b.card)!.centre), 0, 1e-9, `${action}: kortet vid ${time} s`);
      assert.equal((a.laid ?? a.card)!.up, (b.laid ?? b.card)!.up);
    }
  }
});
