// Scenbygget: av beskrivningen och adresserna till tillgångarna byggs three-scenen med bord, sko, dealer och rum med golv.
// Dealern är en dealerfilm på den vikta ytan, eller dockan som visar en rörelse.
// Det som kommer tillbaka styr scenen: bakgrund, ateljé, vy, storlek, dealerns film, förlagans rutor och städning.
// Labbet och Casinot visar samma scen genom den.
// Här står inga mått: allt som har en plats i scenen läses ur beskrivningen.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBackdrop, type Background } from './backdrop.ts';
import { createCard, type Card } from './cards.ts';
import { sameSpot, type FilmNote, type Rgb, type Studio } from './dealer.ts';
import type { Frame, SceneDescription } from './description.ts';
import { createDoll } from './doll.ts';
import { pickUpCard, type DollDescription, type DollMove } from './dollPose.ts';
import { createFilm } from './film.ts';
import { flyingAt, lyingAt, markerDown, type Reel } from './reel.ts';
import { spotName, spotPlace } from './round.ts';
import {
  cardCorners,
  dealerEdge,
  fovYDeg,
  framed,
  onUpright,
  placeOnTable,
  playerEye,
  roomFoot,
  tableFootprint,
  tablePosition,
  tableTilt,
  viewEye,
  viewFovDeg,
  type Eye,
  type SeatView,
  type View,
} from './geometry.ts';
import type { Clip } from './picture.ts';

export type { Background } from './backdrop.ts';
export type { CardNote, CardSpot, ClipCard, DealerNote, FilmClip, FilmNote, Rgb, Studio } from './dealer.ts';
export type { Eye, SeatView, View } from './geometry.ts';
export type { Clip } from './picture.ts';
export type { Reel } from './reel.ts';

/**
 * Dealern i scenen: en dealerfilm som en följd av klipp, var och en med kortet den lägger (scene/dealer.ts, FilmNote;
 * ett ensamt klipp är en följd med ett klipp), eller dockan med sina mått och sin rörelse redan lästa (dollPose.ts:
 * readDoll, readMove och moveFor).
 */
export type Dealer = FilmNote | { kind: 'docka'; doll: DollDescription; move: DollMove; pose: 'giv' | 'vila' };

export type SceneOptions = {
  /** Adressen till en fil ur registret, given postens `file`. */
  urlOf: (file: string) => string;
  /** Dealern. Utan den visas ingen. */
  dealer?: Dealer | null;
  /**
   * Dockans mått (content/doll.json, readDoll): där kortet står i skons mynning (pickUpCard). Med dem ritar dealerfilmens
   * nyckel märkkortets kant bara där kortets egen kant syns, inte där en ärm täcker kortet i mynningen (marker.ts).
   */
  doll?: DollDescription | null;
  /** Sägs till när något inte gick att läsa. */
  onProblem?: (text: string) => void;
  /** Sägs till när musen har tagit över vyn: man har vridit eller zoomat bort från den valda. */
  onMoved?: () => void;
  /** Skärmens bildpunkter per bildpunkt på ytan. Utelämnad följer den skärmen, högst 2. */
  pixelRatio?: number;
};

/**
 * En pågående förlaga: scenen ritad ur en fast vy i en ruta med bestämda mått, en bildpunkt per bildpunkt.
 * Medan den pågår ritas scenen bara när en ruta tas.
 */
export type Shoot = {
  /** Ögat förlagan ritas ur: vyns öga med brännvidden räknad i förlagans ruta. */
  eye: Eye;
  /** Ritar scenen som den står nu och ger rutan som PNG. */
  take(): Promise<Blob>;
  /** Ställer tillbaka ytan som den var på sidan. */
  end(): void;
};

export type SceneHandle = {
  canvas: HTMLCanvasElement;
  /** Uppfylls när bord, sko och dealer är lästa, eller har visat sig oläsbara. */
  ready: Promise<void>;
  /**
   * Dealerns följd av klipp som en film, eller dockans rörelse. Null för stillbilder och utan dealer. Scenens kort ligger
   * efter följdens tid: varje klipps kort från att det har landat tills följden är slut.
   */
  clip: Clip | null;
  /** Dealerfilmens tidslinje: var varje del börjar och slutar. Null utan dealerfilm, och tills klippen är lästa. */
  reel(): Reel | null;
  /** Byter rummet bakom scenen och hur det visas. Null släcker det. Löftet uppfylls när rummet visas så. */
  setBackground(background: Background | null): Promise<void>;
  /** Ställer scenen i ateljén, eller tar den ur den med null. Rummet släcks av den som ställer dit den. */
  setStudio(studio: Studio | null): void;
  /**
   * Ställer vyn i en av de fasta. Med musen vrider och flyttar man sedan fritt därifrån, och hjulet zoomar som en närbild:
   * ögat står kvar och bildvinkeln smalnar.
   */
  setView(view: View): void;
  /**
   * Visar eller döljer scenens sko. Dealerfilmen bär sin egen sko i bilden, där scenens står; den döljs inte här. Sedd
   * från platsen där dealerfilmen är gjord, eller nästan, ritas scenens sko inte: där gäller filmens egen, och längre bort
   * tonar scenens in (se placeShoe).
   */
  setShoe(shown: boolean): void;
  /** Visar eller döljer kortplatserna: konturen av ett kort på var och en av beskrivningens platser, på filten. */
  setPlaces(shown: boolean): void;
  /** Ytans storlek på sidan. Hela vyns ruta visas alltid, inpassad på höjden eller bredden. */
  resize(width: number, height: number): void;
  /** Ritar en ruta nu. Annars ritas scenen bara när något har ändrats. */
  draw(): void;
  /** Börjar en förlaga ur den fasta vyn `view` i rutan `frame`, oberoende av hur musen har vridit vyn på sidan. */
  shoot(view: View, frame: Frame): Shoot;
  dispose(): void;
};

// Ritningens gränser i djup och färgen där inget rum visas. Inga mått på scenen.
const NEAR = 0.1;
const FAR = 100;
const EMPTY = 0x0a0b0d;
// Vinkeln vid skon, i grader, mellan ögat och platsen där dealerfilmen är gjord: inom den första gäller filmens egen sko,
// och därifrån tonar scenens sko in tills den är helt framme vid den andra. Filmen är platt, så filmens sko glider mot
// bordet ju längre bort man vrider; valt av agenten 2026-11-18 efter prov i Labbet (output/work/scen-sist/labb-*).
const FILM_SHOE_DEG = [3, 8] as const;
// Scenens sko ritas efter dealerfilmens båda delar medan den tonar in, så att filmen syns genom den.
const FADING_ORDER = 3;
// Hjulets zoom: faktorn för ett hjulsteg (deltaY 100), och hur långt in och ut den går mot vyns egen bildvinkel.
const ZOOM_STEP = 1.15;
const ZOOM_RANGE = [0.5, 12] as const;

function disposeModel(model: THREE.Object3D): void {
  model.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

/** Ställer en kamera där ögat står, vänd dit ögat ser. */
function stand(camera: THREE.PerspectiveCamera, eye: Eye): void {
  camera.position.set(...eye.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(eye.position[0] + eye.forward[0], eye.position[1] + eye.forward[1], eye.position[2] + eye.forward[2]);
}

/** Bygger scenen i `host` och börjar läsa dess tillgångar. Ytan får sin storlek med `resize`. */
export function buildScene(host: HTMLElement, scene: SceneDescription, options: SceneOptions): SceneHandle {
  const problem = options.onProblem ?? (() => {});
  const player = playerEye(scene);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(options.pixelRatio ?? Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(EMPTY);
  host.append(renderer.domElement);

  const world = new THREE.Scene();
  // Bord och sko belyses av ett neutralt rum, samma som i Granska. Bakgrunden lyser inte på dem än.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const light = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  world.environment = light;

  // Allt som ligger på bordet lutar med det. Barnens lägen står som på ett olutat bord.
  const table = new THREE.Group();
  table.matrixAutoUpdate = false;
  table.matrix.set(...(tableTilt(scene) as Parameters<THREE.Matrix4['set']>));
  table.matrixWorldNeedsUpdate = true;
  world.add(table);

  let size = { width: renderer.domElement.width, height: renderer.domElement.height };
  let stale = true;
  let closed = false;
  // Sant medan en förlaga sparas: då ritas scenen bara när en ruta tas.
  let shooting = false;
  const changed = () => {
    stale = true;
  };

  // Ögat som den valda vyn står i. Med musen vrider och zoomar man fritt därifrån, med samma bildvinkel.
  let standing = player;
  let free = false;

  const camera = new THREE.PerspectiveCamera(viewFovDeg(standing, size.width / size.height), size.width / size.height, NEAR, FAR);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  // Hjulet zoomar med bildvinkeln, inte genom att flytta ögat: sedd ur vyn den är gjord i är dealerfilmen då bilden som
  // den är också inzoomad, som i vyns närbild.
  orbit.enableZoom = false;
  const release = (): void => {
    if (free) return;
    free = true;
    options.onMoved?.();
  };
  orbit.addEventListener('start', release);
  function zoomTo(zoom: number): void {
    camera.zoom = THREE.MathUtils.clamp(zoom, ZOOM_RANGE[0], ZOOM_RANGE[1]);
    camera.updateProjectionMatrix();
    // Musen vrider och flyttar lika mycket i bilden hur långt in man än har zoomat.
    orbit.rotateSpeed = orbit.panSpeed = 1 / camera.zoom;
    changed();
  }
  const wheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (shooting) return;
    release();
    zoomTo(camera.zoom * Math.pow(ZOOM_STEP, -event.deltaY / 100));
  };
  renderer.domElement.addEventListener('wheel', wheel, { passive: false });

  function fit(): void {
    camera.aspect = size.width / size.height;
    camera.fov = viewFovDeg(standing, camera.aspect);
    camera.updateProjectionMatrix();
    changed();
  }

  function aim(from: Eye): void {
    standing = from;
    free = false;
    // Rörelsen som fanns kvar i musens styrning töms, så att den inte fortsätter i den nya vyn.
    orbit.enableDamping = false;
    orbit.update();
    orbit.enableDamping = true;
    stand(camera, from);
    // Musen vrider kring den punkt man ser mot: där blicken möter planet som står på dealerns bordskant.
    const centre = { x: (from.frame.width - 1) / 2, y: (from.frame.height - 1) / 2 };
    orbit.target.set(...(onUpright(from, centre, scene.dealerEdge.z) ?? dealerEdge(scene)));
    orbit.update();
    zoomTo(1);
    fit();
  }

  // Rummets oskärpa och den platta bildens kuliss räknas i spelarens ruta: det är vyn rummet ska ses i.
  // Golvet ligger där bordet står, och en 360-bild antas vara tagen rakt över eller under spelarens öga.
  const backdrop = createBackdrop(
    player,
    { foot: roomFoot(scene), shadow: { ...tableFootprint(scene), reach: scene.room.shadowReach, strength: scene.room.shadowStrength } },
    changed,
    problem,
  );
  world.add(backdrop.mesh, backdrop.shadow);

  // Dealerfilmen ligger på den vikta ytan, lagd genom närbilden av vyn den är gjord i. Ytans liggande del lutar med bordet.
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const chosen = options.dealer ?? null;
  // Platsen dealerfilmen är gjord från. Vyn och dess närbild står där båda. Bär följden ögat filmerna gjordes genom
  // (registrets eye) läggs den tillbaka genom det, också om scenen har ändrats sedan; annars genom vyns närbild i dag.
  const filmEye = chosen?.kind === 'film' ? (chosen.eye ? { ...chosen.eye, frame: { ...chosen.eye.frame } } : viewEye(scene, { ...chosen.view, close: true })) : null;
  // Skon som filmerna bär (registrets shoe): kortet i dess mynning är det nyckeln ser i filmen.
  const filmShoeScene = chosen?.kind === 'film' && chosen.shoe ? { ...scene, shoe: { ...scene.shoe, ...chosen.shoe } } : scene;
  const filmPlace = filmEye ? new THREE.Vector3(...filmEye.position) : null;
  const film =
    chosen?.kind === 'film' && filmEye
      ? createFilm(
          scene,
          filmEye,
          chosen.clips.map((clip) =>
            clip.file === null
              ? { url: null, seconds: clip.seconds, card: clip.card, from: clip.from }
              : { url: options.urlOf(clip.file), ...(clip.card ? { card: clip.card } : {}) },
          ),
          chosen.hold ?? 0,
          anisotropy,
          changed,
          problem,
          options.doll ? pickUpCard(filmShoeScene, options.doll).corners : null,
          chosen.loop ?? true,
        )
      : null;
  // Dockans punkter står redan i scenens mått med bordets lutning inräknad: hon läggs olutad i världen.
  const doll = chosen?.kind === 'docka' ? createDoll(scene, chosen.doll, chosen.move, changed) : null;
  if (doll && chosen?.kind === 'docka') {
    world.add(doll.group);
    doll.show(chosen.pose);
    if (chosen.pose === 'giv') doll.clip.play();
  }
  if (film) {
    world.add(film.upright);
    table.add(film.lying);
  }

  const models: THREE.Object3D[] = [];
  const loader = new GLTFLoader();
  const load = (file: string): Promise<THREE.Object3D | null> =>
    new Promise((resolve) => {
      loader.load(
        options.urlOf(file),
        (gltf) => {
          // En modell som kommer efter att scenen är stängd städas bort direkt.
          if (closed) {
            disposeModel(gltf.scene);
            return resolve(null);
          }
          models.push(gltf.scene);
          resolve(gltf.scene);
        },
        undefined,
        () => {
          if (!closed) problem(`Modellen ${file} gick inte att läsa`);
          resolve(null);
        },
      );
    });

  // Bordet i ateljén: varje del ritas enfärgad och utan ljus. Delarnas egna material sparas och sätts tillbaka.
  let board3d: THREE.Object3D | null = null;
  let studio: Studio | null = null;
  const own = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  let flat: THREE.MeshBasicMaterial | null = null;
  const colourOf = (rgb: Rgb): THREE.Color => new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);

  // Ateljéns rutnät på filten (`studio.grid`): smala remsor från dealerns bordskant mot spelaren, strax över filten.
  // Det ligger bland det som lutar med bordet.
  const gridLines = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide });
  const grid = new THREE.Mesh(new THREE.BufferGeometry(), gridLines);
  {
    const { step, line, halfWidth, reach, lift } = scene.studio.grid;
    const half = line / 2;
    const edge = scene.dealerEdge.z;
    const corners: number[] = [];
    const index: number[] = [];
    const strip = (x0: number, z0: number, x1: number, z1: number): void => {
      const at = corners.length / 3;
      corners.push(x0, lift, z0, x1, lift, z0, x1, lift, z1, x0, lift, z1);
      index.push(at, at + 2, at + 1, at, at + 3, at + 2);
    };
    const across = Math.round(halfWidth / step);
    const along = Math.round(reach / step);
    for (let k = -across; k <= across; k++) strip(k * step - half, edge, k * step + half, edge + reach);
    for (let k = 0; k <= along; k++) strip(-halfWidth, edge + k * step - half, halfWidth, edge + k * step + half);
    grid.geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
    grid.geometry.setIndex(index);
  }
  grid.visible = false;
  grid.renderOrder = 1;
  table.add(grid);

  function dress(): void {
    renderer.setClearColor(studio ? colourOf(studio.screen) : EMPTY);
    grid.visible = Boolean(studio?.grid);
    if (studio?.grid) gridLines.color.copy(colourOf(studio.grid));
    const paint = studio?.table ?? null;
    if (paint) {
      flat ??= new THREE.MeshBasicMaterial({ toneMapped: false });
      flat.color.copy(colourOf(paint));
    }
    board3d?.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!own.has(mesh)) own.set(mesh, mesh.material);
      mesh.material = paint ? flat! : own.get(mesh)!;
    });
    changed();
  }

  const board = load(scene.table.file).then((model) => {
    if (!model) return;
    model.position.set(...tablePosition(scene));
    table.add(model);
    board3d = model;
    dress();
  });

  // Kortplatserna som konturer på filten, en halv millimeter över den. De visas bara när någon ber om dem.
  const places = new THREE.Group();
  places.visible = false;
  const outline = new THREE.LineBasicMaterial({ color: 0xffffff, toneMapped: false });
  for (const place of [...scene.places.dealer, ...scene.places.seats.flatMap((seat) => seat.cards)]) {
    const corners = cardCorners(scene, place).map((corner) => new THREE.Vector3(corner[0], corner[1] + 0.0005, corner[2]));
    places.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), outline));
  }
  world.add(places);

  // Scenens kort, ett för varje del som lägger ett, på sin kortplats (spotPlace i round.ts). Vilka som syns, och var ett
  // kort som går självt är på väg, avgörs för varje ritad ruta av var dealerns följd står. Kortets mitt är dess läge, så
  // att det går att flytta och vända kring mitten.
  type Laid = { part: number; card: Card; centre: THREE.Vector3 };
  const laid = new Map<number, Laid>();
  if (chosen?.kind === 'film') {
    chosen.clips.forEach((clip, part) => {
      const note = clip.card;
      if (!note) return;
      const place = spotPlace(scene, note);
      if (!place) return problem(`Scenen har ingen kortplats för ${spotName(note)}`);
      const card = createCard(scene, { place, face: note.face, index: note.index }, anisotropy);
      card.mesh.geometry.computeBoundingBox();
      const centre = card.mesh.geometry.boundingBox!.getCenter(new THREE.Vector3());
      card.mesh.geometry.translate(-centre.x, -centre.y, -centre.z);
      card.mesh.position.copy(centre);
      card.mesh.visible = false;
      world.add(card.mesh);
      laid.set(part, { part, card, centre });
    });
  }
  // Där ett kort som går självt börjar: kortet i skons mynning (hämtstället), eller skons fot utan dockans mått.
  const shoeMouth = new THREE.Vector3(...(options.doll ? pickUpCard(filmShoeScene, options.doll).centre : placeOnTable(scene, filmShoeScene.shoe.at)));

  let shoeShown = true;
  let shoeStand: THREE.Group | null = null;
  // Skons delar och hur deras material ritas när skon är helt framme, så att det går att sätta tillbaka efter en toning.
  const shoeParts: THREE.Mesh[] = [];
  const shoeLooks = new Map<THREE.Material, { transparent: boolean; opacity: number; depthWrite: boolean }>();
  const shoeFoot = new THREE.Vector3();
  let shoeFaded = 1;
  const shoe = load(scene.shoe.file).then((model) => {
    if (!model) return;
    const box = new THREE.Box3().setFromObject(model);
    const length = box.max.z - box.min.z;
    const middle = box.getCenter(new THREE.Vector3());
    // Fotens mitt ställs i origo, så att skon vrids och skalas kring den punkt beskrivningen pekar ut.
    model.position.set(-middle.x, -box.min.y, -middle.z);
    shoeStand = new THREE.Group();
    shoeStand.add(model);
    shoeStand.position.set(scene.shoe.at[0], 0, scene.shoe.at[1]);
    shoeStand.rotation.y = THREE.MathUtils.degToRad(scene.shoe.yawDeg);
    shoeStand.scale.setScalar(scene.shoe.length / length);
    shoeStand.visible = shoeShown;
    table.add(shoeStand);
    shoeStand.updateWorldMatrix(true, false);
    shoeStand.getWorldPosition(shoeFoot);
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      shoeParts.push(mesh);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        shoeLooks.set(material, { transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite });
      }
    });
    changed();
  });

  const dealer = film?.ready ?? Promise.resolve();

  aim(standing);
  renderer.setAnimationLoop(() => {
    if (shooting) return;
    const moved = free && orbit.update();
    if (moved || stale) draw();
  });

  /** Ställer korten och märkkortet efter följdens tid. En stillbild står i slutet: dess kort ligger. Görs före varje ritad ruta. */
  function settle(): void {
    const reel = film?.reel() ?? null;
    if (!film || !reel) return;
    const time = film.clip ? film.clip.time() : reel.seconds;
    const lying = new Set(lyingAt(reel, time));
    for (const { part, card, centre } of laid.values()) {
      card.mesh.visible = lying.has(part);
      card.mesh.position.copy(centre);
      card.mesh.scale.setScalar(1);
    }
    carry(reel, time);
    film.setMarker(markerDown(reel, time));
  }

  /**
   * Kortet som går självt, utan dealerns rörelse (spelkärnans fallback): från skons mynning till sin kortplats, från en
   * kortplats till en annan när en hand delas, eller vänt där det ligger (det nedvända kortet smalnar till en kant och
   * det uppvända breddas ut).
   */
  function carry(reel: Reel, time: number): void {
    const flying = flyingAt(reel, time);
    const moving = flying ? laid.get(flying.part) : undefined;
    if (!flying || !moving) return;
    const from = reel.parts[flying.part]!.from!;
    const left = flying.left === null ? undefined : laid.get(flying.left);
    const eased = THREE.MathUtils.smoothstep(flying.progress, 0, 1);
    if (from !== 'skon' && sameSpot(from, reel.parts[flying.part]!.card!)) {
      const shown = eased < 0.5 && left ? left : moving;
      shown.card.mesh.visible = true;
      shown.card.mesh.scale.x = Math.max(0.001, Math.abs(1 - 2 * eased));
      return;
    }
    moving.card.mesh.visible = true;
    moving.card.mesh.position.lerpVectors(from === 'skon' ? shoeMouth : (left?.centre ?? moving.centre), moving.centre, eased);
  }

  /**
   * Scenens sko, om den inte är dold med setShoe. Sedd från platsen där dealerfilmen är gjord är filmen bilden som den är,
   * med hennes egen sko på samma ställe som scenens: där ritas scenens sko inte, så att det som i filmen rör sig framför
   * skon (arm, hand, kort) syns framför den. Scenens sko står framför den vikta ytan och skulle annars dölja det; en
   * svart ärm över en svart sko går inte att skilja från skon i bilden. Hjulet zoomar utan att flytta ögat, så där gäller
   * filmens sko också inzoomad. Vrider eller flyttar man bort från platsen gäller filmens sko inom FILM_SHOE_DEG[0]
   * grader sedda från skon, och sedan tonar scenens sko in över filmen, så att bytet inte hoppar. Längre bort är filmen
   * platt, och scenens sko står där. Görs före varje ritad ruta.
   */
  function placeShoe(from: THREE.Camera): void {
    if (!shoeStand) return;
    let share = 1;
    if (film !== null && film.upright.visible && filmPlace !== null) {
      const away = THREE.MathUtils.radToDeg(from.position.clone().sub(shoeFoot).angleTo(filmPlace.clone().sub(shoeFoot)));
      share = THREE.MathUtils.smoothstep(away, FILM_SHOE_DEG[0], FILM_SHOE_DEG[1]);
    }
    if (!shoeShown) share = 0;
    shoeStand.visible = share > 0;
    fadeShoe(share);
  }

  /** Skons täckning: 1 är skon som den är, mellan 0 och 1 genomskinlig och ritad efter dealerfilmen. */
  function fadeShoe(share: number): void {
    const fading = share > 0 && share < 1;
    const wasFading = shoeFaded > 0 && shoeFaded < 1;
    shoeFaded = share;
    // Helt framme eller helt borta, före och efter: materialen är som de är, och synligheten sätts av placeShoe.
    if (!fading && !wasFading) return;
    for (const mesh of shoeParts) {
      mesh.renderOrder = fading ? FADING_ORDER : 0;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const own = shoeLooks.get(material);
        if (!own) continue;
        if (fading !== wasFading) {
          material.transparent = fading || own.transparent;
          material.depthWrite = fading ? false : own.depthWrite;
          material.needsUpdate = true;
        }
        material.opacity = fading ? own.opacity * share : own.opacity;
      }
    }
  }

  function draw(): void {
    settle();
    placeShoe(camera);
    stale = false;
    renderer.render(world, camera);
  }

  return {
    canvas: renderer.domElement,
    ready: Promise.all([board, shoe, dealer]).then(() => undefined),
    clip: film?.clip ?? (chosen?.kind === 'docka' && chosen.pose === 'giv' ? doll!.clip : null),
    reel: () => film?.reel() ?? null,
    setBackground(background) {
      return backdrop.show(background);
    },
    setStudio(next) {
      studio = next;
      dress();
    },
    setView(view) {
      aim(viewEye(scene, view));
    },
    setShoe(shown) {
      // Synligheten och toningen sätts av placeShoe före nästa ritade ruta.
      shoeShown = shown;
      changed();
    },
    setPlaces(shown) {
      places.visible = shown;
      changed();
    },
    resize(width, height) {
      if (!(width > 0 && height > 0)) return;
      size = { width, height };
      // Medan en förlaga sparas har ytan förlagans mått; den nya storleken gäller när den är klar.
      if (shooting) return;
      renderer.setSize(width, height);
      fit();
    },
    draw,
    shoot(view, frame) {
      if (shooting) throw new Error('En förlaga sparas redan');
      shooting = true;
      const eye = framed(viewEye(scene, view), frame);
      const shot = new THREE.PerspectiveCamera(fovYDeg(eye), frame.width / frame.height, NEAR, FAR);
      stand(shot, eye);
      shot.updateMatrixWorld();
      // Ytan får förlagans mått, en bildpunkt per bildpunkt. På sidan behåller den sin plats, och bilden passas in i den.
      const ratio = renderer.getPixelRatio();
      const canvas = renderer.domElement;
      const fitBefore = canvas.style.objectFit;
      canvas.style.objectFit = 'contain';
      renderer.setPixelRatio(1);
      renderer.setSize(frame.width, frame.height, false);
      return {
        eye,
        take() {
          settle();
          placeShoe(shot);
          renderer.render(world, shot);
          // Bilden läses av direkt efter ritningen, innan webbläsaren har hunnit tömma ytan.
          return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Rutan gick inte att läsa av'))), 'image/png');
          });
        },
        end() {
          if (!shooting) return;
          shooting = false;
          if (closed) return;
          canvas.style.objectFit = fitBefore;
          renderer.setPixelRatio(ratio);
          renderer.setSize(size.width, size.height);
          fit();
        },
      };
    },
    dispose() {
      closed = true;
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener('wheel', wheel);
      orbit.dispose();
      backdrop.dispose();
      film?.dispose();
      doll?.dispose();
      for (const { card } of laid.values()) card.dispose();
      grid.geometry.dispose();
      gridLines.dispose();
      for (const line of places.children) (line as THREE.LineLoop).geometry.dispose();
      outline.dispose();
      // Delarna får tillbaka sina egna material, så att de städas med modellen.
      for (const [mesh, material] of own) mesh.material = material;
      flat?.dispose();
      models.forEach(disposeModel);
      light.dispose();
      pmrem.dispose();
      renderer.dispose();
      // Grafikkortets yta lämnas tillbaka direkt: en webbläsare håller bara ett fåtal åt gången.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
