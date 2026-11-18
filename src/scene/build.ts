// Scenbygget: av beskrivningen och adresserna till tillgångarna byggs three-scenen med bord, sko, dealer och rum med golv.
// Dealern är en dealerfilm eller ett gammalt ankare på den vikta ytan, en helfigur på en upprätt yta bakom bordet,
// eller dockan som visar en rörelse.
// Det som kommer tillbaka styr scenen: bakgrund, ateljé, vy, storlek, dealerns film, förlagans rutor och städning.
// Labbet och Casinot visar samma scen genom den.
// Här står inga mått: allt som har en plats i scenen läses ur beskrivningen.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBackdrop, type Background } from './backdrop.ts';
import { createCard, type Card } from './cards.ts';
import type { CardNote, Rgb, Studio } from './dealer.ts';
import type { Frame, SceneDescription } from './description.ts';
import { createDoll } from './doll.ts';
import type { DollDescription, DollMove } from './dollPose.ts';
import { createFigure, type Clip } from './figure.ts';
import { createFilm } from './film.ts';
import {
  cardCorners,
  dealerEdge,
  fovYDeg,
  framed,
  hull,
  onUpright,
  playerEye,
  roomFoot,
  sceneEye,
  see,
  tableFootprint,
  tablePosition,
  tableTilt,
  viewEye,
  viewFovDeg,
  type Eye,
  type Pixel,
  type SeatView,
  type View,
} from './geometry.ts';

export type { Background } from './backdrop.ts';
export type { CardNote, DealerNote, Rgb, Studio } from './dealer.ts';
export type { Clip } from './figure.ts';
export type { Eye, SeatView, View } from './geometry.ts';

/**
 * Dealern i scenen: det som pekas ut i scene/dealer.ts, med bilderna som registrets `file`, och dockan med sina mått
 * och sin rörelse redan lästa (dollPose.ts: readDoll, readMove och moveFor).
 */
export type Dealer =
  | { kind: 'helfigur' | 'ankare'; file: string }
  | { kind: 'film'; file: string; view: SeatView }
  | { kind: 'docka'; doll: DollDescription; move: DollMove; pose: 'giv' | 'vila' };

export type SceneOptions = {
  /** Adressen till en fil ur registret, given postens `file`. */
  urlOf: (file: string) => string;
  /** Dealern. Utan den visas ingen. */
  dealer?: Dealer | null;
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
  /** Dealerns film eller dockans rörelse. Null för stillbilder och utan dealer. */
  clip: Clip | null;
  /** Byter rummet bakom scenen och hur det visas. Null släcker det. Löftet uppfylls när rummet visas så. */
  setBackground(background: Background | null): Promise<void>;
  /** Ställer scenen i ateljén, eller tar den ur den med null. Rummet släcks av den som ställer dit den. */
  setStudio(studio: Studio | null): void;
  /** Ställer vyn i en av de fasta. Med musen vrider och zoomar man sedan fritt därifrån. */
  setView(view: View): void;
  /** Visar eller döljer skon. Dealerns bild har ingen sko i något av fallen. */
  setShoe(shown: boolean): void;
  /** Visar eller döljer kortplatserna: konturen av ett kort på var och en av beskrivningens platser, på filten. */
  setPlaces(shown: boolean): void;
  /**
   * Lägger scenens kort på en kortplats, eller tar bort det med null. Kortet syns från tiden `from` i dealerns film, och
   * från samma tid tas filmens blå märkkort bort, så att kortet syns under handen. Utan film syns kortet hela tiden.
   */
  setCard(card: CardNote | null): void;
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

/** Den del av ögats ruta som ett föremål täcker: den minsta konvexa månghörningen kring alla dess punkter. */
function outlineOf(object: THREE.Object3D, eye: Eye): Pixel[] {
  object.updateMatrixWorld(true);
  const seen: Pixel[] = [];
  const point = new THREE.Vector3();
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
      const pixel = see(eye, [point.x, point.y, point.z]);
      if (pixel) seen.push(pixel);
    }
  });
  return hull(seen);
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
  const filmEye = sceneEye(scene);
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
  orbit.addEventListener('start', () => {
    if (free) return;
    free = true;
    options.onMoved?.();
  });

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

  // Dealern: helfiguren står upprätt bakom bordet; ankaret ligger på den vikta ytan, vars liggande del lutar med bordet.
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const chosen = options.dealer ?? null;
  const figure = chosen?.kind === 'helfigur' ? createFigure(scene, options.urlOf(chosen.file), anisotropy, changed, problem) : null;
  const film =
    chosen?.kind === 'ankare'
      ? createFilm(scene, { eye: filmEye, level: true }, options.urlOf(chosen.file), anisotropy, changed, problem)
      : chosen?.kind === 'film'
        ? createFilm(scene, { eye: viewEye(scene, { ...chosen.view, close: true }), level: false }, options.urlOf(chosen.file), anisotropy, changed, problem)
        : null;
  // Dockans punkter står redan i scenens mått med bordets lutning inräknad: hon läggs olutad i världen.
  const doll = chosen?.kind === 'docka' ? createDoll(scene, chosen.doll, chosen.move, changed) : null;
  if (doll && chosen?.kind === 'docka') {
    world.add(doll.group);
    doll.show(chosen.pose);
    if (chosen.pose === 'giv') doll.clip.play();
  }
  if (figure) world.add(figure.mesh);
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

  // Ateljéns rutnät på filten: smala remsor var tionde centimeter, från dealerns bordskant och en meter mot spelaren,
  // en millimeter över filten. Det ligger bland det som lutar med bordet.
  const gridLines = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide });
  const grid = new THREE.Mesh(new THREE.BufferGeometry(), gridLines);
  {
    const STEP = 0.1;
    const HALF = 0.003;
    const edge = scene.dealerEdge.z;
    const corners: number[] = [];
    const index: number[] = [];
    const strip = (x0: number, z0: number, x1: number, z1: number): void => {
      const at = corners.length / 3;
      corners.push(x0, 0.001, z0, x1, 0.001, z0, x1, 0.001, z1, x0, 0.001, z1);
      index.push(at, at + 2, at + 1, at, at + 3, at + 2);
    };
    for (let k = -9; k <= 9; k++) strip(k * STEP - HALF, edge, k * STEP + HALF, edge + 1);
    for (let k = 0; k <= 10; k++) strip(-0.9, edge + k * STEP - HALF, 0.9, edge + k * STEP + HALF);
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

  // Scenens kort på en kortplats. Om det syns avgörs för varje ritad ruta av var dealerns film står.
  let laid: { note: CardNote; card: Card } | null = null;

  let shoeShown = true;
  let shoeStand: THREE.Group | null = null;
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
    // Ankarets bild har en egen sko, där filmkameran såg den på ett olutat bord. Den tas bort där scenens sko står,
    // så att skon inte syns dubbelt. Konturen läses därför innan skon ställs på det lutade bordet.
    // Helfiguren och dealerfilmen har ingen sko i bilden.
    if (chosen?.kind === 'ankare') film?.cover(outlineOf(shoeStand, filmEye));
    table.add(shoeStand);
    changed();
  });

  const dealer = figure?.ready ?? film?.ready ?? Promise.resolve();

  aim(standing);
  renderer.setAnimationLoop(() => {
    if (shooting) return;
    const moved = free && orbit.update();
    if (moved || stale) draw();
  });

  /** Ställer kortet och märkkortet efter filmens tid. Görs före varje ritad ruta. */
  function settle(): void {
    if (!laid) return;
    const playing = figure?.clip ?? film?.clip ?? null;
    const down = !playing || playing.time() >= laid.note.from;
    laid.card.mesh.visible = down;
    film?.setMarker(down);
  }

  function draw(): void {
    settle();
    stale = false;
    renderer.render(world, camera);
  }

  return {
    canvas: renderer.domElement,
    ready: Promise.all([board, shoe, dealer]).then(() => undefined),
    clip: figure?.clip ?? film?.clip ?? (chosen?.kind === 'docka' && chosen.pose === 'giv' ? doll!.clip : null),
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
      shoeShown = shown;
      if (shoeStand) shoeStand.visible = shown;
      changed();
    },
    setPlaces(shown) {
      places.visible = shown;
      changed();
    },
    setCard(note) {
      if (laid) {
        world.remove(laid.card.mesh);
        laid.card.dispose();
        laid = null;
        film?.setMarker(false);
      }
      const place = note && scene.places.seats.find((entry) => entry.seat === note.seat)?.cards[note.index];
      if (note && !place) problem(`Scenen har ingen kortplats ${note.index + 1} för plats ${note.seat}`);
      if (note && place) {
        laid = { note, card: createCard(scene, { place, face: note.face }, anisotropy) };
        world.add(laid.card.mesh);
      }
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
      orbit.dispose();
      backdrop.dispose();
      figure?.dispose();
      film?.dispose();
      doll?.dispose();
      laid?.card.dispose();
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
