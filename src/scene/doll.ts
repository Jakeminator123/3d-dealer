// Dockan ritad med three.js: en vit, matt provdocka av klot och stavar, med ledade fingrar, som gör en rörelse i scenen.
// Var varje led är räknas i dollPose.ts ur content/doll.json och rörelsen i content/moves/; här får punkterna bara form.
// Dockan visar rörelsen i en förlaga, innan den riktiga filmen görs. Kortet hon delar är ett märkkort: helt gult på
// baksidan och helt blått på framsidan, så att vändningen syns. Ett gult kort till står kvar i skons mynning. I en cykel
// ligger det lagda kortet kvar på platsen när handen går tillbaka och nyper nästa.
//
// Förd över ur gamla Dealer (C:/Users/jakem/dev/super-feature-sg/dealer, commit e6c07124c16a9b8d00ab3435895f94e982516ce9):
//   dealer3d/src/stage.ts  utseendet 'plain': bålen som ett ägg, lemmarna som koner, handen ritad ur sina 21 punkter
//                          (pointHand), kortet med två sidor (cardMesh) och färgerna
//   dealer3d/page/page.ts  uppspelningen i en slinga med en paus på slutet
// Skillnader mot förlagan: scenen har eget bord, egen sko och eget ljus, så här ritas bara dockan och korten, och inga
// skuggor. Punkterna kommer färdiga i scenens mått med bordets lutning inräknad, så gruppen läggs olutad i världen.
// Lemmarnas och ledernas mått läses ur beskrivningen i stället för att stå i koden. Formerna delas mellan delarna.

import * as THREE from 'three';
import type { SceneDescription, Vec3 } from './description.ts';
import { FINGERS, handSkeleton, poseAt, restPose, type CardPose, type DollDescription, type DollMove, type DollPose } from './dollPose.ts';
import { tilted } from './geometry.ts';
import type { Clip } from './picture.ts';

export type Doll = {
  /** Dockan och korten. Läggs i världen som den är: punkterna står redan i scenens mått. */
  group: THREE.Group;
  /** Rörelsen som en film: samma styrning som en dealerfilm har. Att spela eller ställa tiden visar rörelsen. */
  clip: Clip;
  /** Visar rörelsen där den står (`giv`), eller ställer dockan i VILA utan kort (`vila`) och pausar. */
  show(pose: 'giv' | 'vila'): void;
  dispose(): void;
};

// Förlagans färger i utseendet 'plain': dockan, och märkkortets baksida och framsida.
const WHITE = 0xf3f1ec;
// Händerna har hudfärg. En bildmodell som ska sätta en dealer i dockans ställning läser då händerna som händer i rätt
// storlek, och gör dem inte större: mätt 2026-11-18 ritade den händerna 1,4 gånger för stora när de var vita stavar.
const HAND = 0xdfae98;
/** Märkkortets färger: den gula baksidan och den blå framsidan. Samma färger målas i ankarna (src/pipeline/cykel.ts). */
export const MARK_BACK = 0xf4d21c;
export const MARK_FACE = 0x1e8be0;
// Hur länge sista ställningen står kvar innan slingan börjar om, i sekunder.
const HOLD = 0.6;
// En stav mellan två leder är något smalare än den smalaste leden, så att lederna syns som leder.
const SLIM = 0.93;

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (point: Vec3): THREE.Vector3 => new THREE.Vector3(point[0], point[1], point[2]);

/**
 * Dockan för scenen, med rörelsen `move`. `changed` anropas varje gång dockan har fått en ny ställning och ska ritas.
 * Från början står hon i rörelsens första ställning (REDO).
 */
export function createDoll(scene: SceneDescription, doll: DollDescription, move: DollMove, changed: () => void): Doll {
  const group = new THREE.Group();
  const { shape } = doll;
  const skeleton = handSkeleton(doll);

  // Formerna: ett klot och en stav med radien 1, och en kon per sorts lem. Alla delar är skalade kopior av dem.
  const ballShape = new THREE.SphereGeometry(1, 24, 16);
  const rodShape = new THREE.CylinderGeometry(1, 1, 1, 16);
  const cone = (from: number, to: number): THREE.CylinderGeometry => new THREE.CylinderGeometry(to, from, 1, 20);
  const neckShape = cone(...shape.neck);
  const upperShape = cone(...shape.upperArm);
  const foreShape = cone(...shape.forearm);
  const skin = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.85, metalness: 0 });
  const flesh = new THREE.MeshStandardMaterial({ color: HAND, roughness: 0.8, metalness: 0 });
  const palmSkin = new THREE.MeshStandardMaterial({ color: HAND, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  const shapes: THREE.BufferGeometry[] = [ballShape, rodShape, neckShape, upperShape, foreShape];
  const materials: THREE.Material[] = [skin, flesh, palmSkin];

  const ball = (radius: number, material: THREE.Material = skin): THREE.Mesh => {
    const mesh = new THREE.Mesh(ballShape, material);
    mesh.scale.setScalar(radius);
    group.add(mesh);
    return mesh;
  };
  /** En lem mellan två punkter. Staven skalas till sin radie; en kon har sina radier i formen. */
  const limb = (geometry: THREE.BufferGeometry, radius = 1, material: THREE.Material = skin) => {
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    const way = new THREE.Vector3();
    return (a: Vec3, b: Vec3): void => {
      way.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const length = way.length() || 1e-6;
      mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      mesh.quaternion.setFromUnitVectors(UP, way.multiplyScalar(1 / length));
      mesh.scale.set(radius, length, radius);
    };
  };

  // Kroppen: bålen är ett ägg från höften till axlarna, lika brett som de och vänt som de.
  const torso = new THREE.Mesh(ballShape, skin);
  torso.matrixAutoUpdate = false;
  group.add(torso);
  const yoke = limb(rodShape, shape.yoke);
  const neck = limb(neckShape);
  const head = new THREE.Group();
  const skull = new THREE.Mesh(ballShape, skin);
  skull.scale.set(...shape.head.skull);
  const nose = new THREE.Mesh(ballShape, skin);
  nose.scale.setScalar(shape.head.nose.radius);
  nose.position.set(...shape.head.nose.at);
  head.add(skull, nose);
  head.scale.setScalar(doll.body.head.radius * shape.head.scale);
  group.add(head);
  const arms = (['left', 'right'] as const).map((side) => ({
    side,
    shoulder: ball(shape.shoulder),
    elbow: ball(shape.elbow),
    wrist: ball(shape.wrist),
    upper: limb(upperShape),
    fore: limb(foreShape),
  }));

  // Händerna: ett klot i varje led, en stav i varje ben, och handflatan fylld mellan handleden och knogarna.
  const bones: [number, number][] = [];
  for (const chain of FINGERS) {
    bones.push([0, chain[0]!]);
    for (let j = 0; j < 3; j++) bones.push([chain[j]!, chain[j + 1]!]);
  }
  bones.push([5, 9], [9, 13], [13, 17]);
  const PALM = [0, 5, 9, 13, 17, 1];
  const hands = (['left', 'right'] as const).map((side) => {
    const joints = skeleton.radius.map((radius) => ball(radius, flesh));
    const rods = bones.map(([a, b]) => limb(rodShape, Math.min(skeleton.radius[a]!, skeleton.radius[b]!) * SLIM, flesh));
    const corners = new THREE.BufferAttribute(new Float32Array(PALM.length * 3), 3);
    const palmShape = new THREE.BufferGeometry();
    palmShape.setAttribute('position', corners);
    palmShape.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 5, 1]);
    shapes.push(palmShape);
    const palm = new THREE.Mesh(palmShape, palmSkin);
    palm.frustumCulled = false;
    group.add(palm);
    return {
      side,
      set(points: Vec3[]): void {
        joints.forEach((joint, k) => joint.position.set(...points[k]!));
        rods.forEach((rod, index) => rod(points[bones[index]![0]]!, points[bones[index]![1]]!));
        PALM.forEach((k, index) => corners.setXYZ(index, ...points[k]!));
        corners.needsUpdate = true;
        palmShape.computeVertexNormals();
      },
    };
  });

  // Korten: en rundad rektangel, gul sedd från ena hållet och blå från det andra. Formen ligger med långsidan längs z
  // och visar sin framsida nedåt, så baksidans färg ritas på formens framsida och framsidans på dess baksida.
  const { width, height, corner, thickness } = scene.card;
  const outline = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  outline.moveTo(-w + corner, -h);
  outline.lineTo(w - corner, -h);
  outline.absarc(w - corner, -h + corner, corner, -Math.PI / 2, 0, false);
  outline.lineTo(w, h - corner);
  outline.absarc(w - corner, h - corner, corner, 0, Math.PI / 2, false);
  outline.lineTo(-w + corner, h);
  outline.absarc(-w + corner, h - corner, corner, Math.PI / 2, Math.PI, false);
  outline.lineTo(-w, -h + corner);
  outline.absarc(-w + corner, -h + corner, corner, Math.PI, Math.PI * 1.5, false);
  const cardShape = new THREE.ShapeGeometry(outline, 6).rotateX(Math.PI / 2);
  // Sidorna lyser en aning i sin egen färg, så att gult och blått går att läsa vart kortet än vetter mot ljuset.
  const side = (color: number, which: THREE.Side): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, emissive: color, emissiveIntensity: 0.3, side: which });
  const backSide = side(MARK_BACK, THREE.FrontSide);
  const faceSide = side(MARK_FACE, THREE.BackSide);
  shapes.push(cardShape);
  materials.push(backSide, faceSide);
  // Bordets normal: ett kort som ligger ritas en aning över filten, som dealerfilmens liggande del, så att det inte flimrar mot bordet.
  const origin = tilted(scene, [0, 0, 0]);
  const normal = tilted(scene, [0, 1, 0]).map((value, index) => value - origin[index]!) as Vec3;
  const x = new THREE.Vector3();
  const card = (lift: number) => {
    const both = new THREE.Group();
    const back = new THREE.Mesh(cardShape, backSide);
    back.position.y = -thickness / 2;
    const face = new THREE.Mesh(cardShape, faceSide);
    face.position.y = thickness / 2;
    both.add(back, face);
    both.matrixAutoUpdate = false;
    group.add(both);
    return {
      both,
      /** Ställer kortet: formens y dit framsidan ser och dess z längs långsidan mot den hållna kortsidan. */
      set(pose: CardPose): void {
        const y = v3(pose.face);
        const z = v3(pose.long);
        x.crossVectors(y, z);
        both.matrix.makeBasis(x, y, z).setPosition(pose.centre[0] + normal[0] * lift, pose.centre[1] + normal[1] * lift, pose.centre[2] + normal[2] * lift);
        both.matrixWorldNeedsUpdate = true;
      },
    };
  };
  const dealt = card(scene.film.lift);
  const next = card(0);
  // I en cykel: kortet som handen har lagt och släppt.
  const laid = card(scene.film.lift);

  const across = new THREE.Vector3();
  const tall = new THREE.Vector3();
  const deep = new THREE.Vector3();
  function set(pose: DollPose): void {
    const left = pose.arms.left.shoulder;
    const right = pose.arms.right.shoulder;
    const middle: Vec3 = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2, (left[2] + right[2]) / 2];
    across.set(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
    const wide = across.length();
    across.normalize();
    tall.set(middle[0] - pose.hip[0], middle[1] - pose.hip[1], middle[2] - pose.hip[2]);
    const high = tall.length();
    deep.crossVectors(across, tall).normalize();
    tall.crossVectors(deep, across);
    torso.matrix
      .makeBasis(across.multiplyScalar(wide * shape.torso.width), tall.multiplyScalar(high * shape.torso.height), deep.multiplyScalar(shape.torso.depth))
      .setPosition(...pose.torso);
    torso.matrixWorldNeedsUpdate = true;
    yoke(right, left);
    neck(pose.neck, [pose.head[0], pose.head[1] - doll.body.head.radius * shape.head.neckAt, pose.head[2]]);
    head.position.set(...pose.head);
    head.lookAt(...pose.face);
    for (const arm of arms) {
      const { shoulder, elbow, wrist } = pose.arms[arm.side];
      arm.shoulder.position.set(...shoulder);
      arm.elbow.position.set(...elbow);
      arm.wrist.position.set(...wrist);
      arm.upper(shoulder, elbow);
      arm.fore(elbow, wrist);
    }
    for (const hand of hands) hand.set(pose.hands[hand.side]);
    dealt.both.visible = pose.card !== null;
    if (pose.card) dealt.set(pose.card);
    laid.both.visible = pose.laid !== null;
    if (pose.laid) laid.set(pose.laid);
    next.set(pose.shoeCard);
  }

  let time = 0;
  let playing = false;
  let shown: 'giv' | 'vila' = 'giv';
  let waiting = 0;
  let began = 0;
  let closed = false;
  const draw = (): void => {
    set(shown === 'giv' ? poseAt(scene, doll, move, time) : restPose(scene, doll));
    changed();
  };
  const tick = (now: number): void => {
    if (!playing || closed) return;
    // Slingan: rörelsen i verklig tid, sista ställningen kvar en stund, och sedan från början.
    time = Math.min(((now - began) / 1000) % (move.seconds + HOLD), move.seconds);
    draw();
    waiting = requestAnimationFrame(tick);
  };
  const pause = (): void => {
    playing = false;
    cancelAnimationFrame(waiting);
  };
  const clip: Clip = {
    seconds: () => move.seconds,
    time: () => time,
    playing: () => playing,
    play() {
      if (playing || closed) return;
      playing = true;
      shown = 'giv';
      // Från slutet börjar rörelsen om; annars fortsätter den där den står.
      began = performance.now() - (time >= move.seconds ? 0 : time * 1000);
      waiting = requestAnimationFrame(tick);
    },
    pause,
    seek(to) {
      pause();
      time = Math.max(0, Math.min(move.seconds, to));
      shown = 'giv';
      if (!closed) draw();
      return Promise.resolve();
    },
  };

  set(poseAt(scene, doll, move, 0));

  return {
    group,
    clip,
    show(pose) {
      if (closed) return;
      if (pose === 'vila') pause();
      shown = pose;
      draw();
    },
    dispose() {
      closed = true;
      pause();
      group.removeFromParent();
      group.clear();
      for (const geometry of shapes) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
