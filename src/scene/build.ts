// Scenbygget: av beskrivningen och adresserna till tillgångarna byggs three-scenen med bord, sko, dealer på vikt yta och rum.
// Det som kommer tillbaka styr scenen: bakgrund, vy, storlek och städning. Labbet och Casinot visar samma scen genom den.
// Här står inga mått: allt som har en plats i scenen läses ur beskrivningen.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBackdrop, type Background } from './backdrop.ts';
import type { SceneDescription } from './description.ts';
import { createFilm } from './film.ts';
import {
  dealerEdge,
  hull,
  onUpright,
  playerEye,
  sceneEye,
  seatEye,
  see,
  tablePosition,
  tableTilt,
  viewFovDeg,
  type Eye,
  type Pixel,
} from './geometry.ts';

export type { Background } from './backdrop.ts';

/**
 * Varifrån scenen betraktas. Spelaren är spelarens öga på kamerans plats, och en plats är samma sorts öga flyttat dit.
 * Filmkameran är den kamera dealerns bilder är gjorda genom: därifrån ska dealern se ut som i sin bild.
 */
export type View = { kind: 'spelaren' } | { kind: 'plats'; seat: number } | { kind: 'filmkameran' };

export type SceneOptions = {
  /** Adressen till en fil ur registret, given postens `file`. */
  urlOf: (file: string) => string;
  /** Stillbilden som står in för dealern, som registrets `file`. Utan den visas ingen dealer. */
  dealer?: string | null;
  /** Sägs till när något inte gick att läsa. */
  onProblem?: (text: string) => void;
  /** Sägs till när musen har tagit över vyn: man har vridit eller zoomat bort från den valda. */
  onMoved?: () => void;
  /** Skärmens bildpunkter per bildpunkt på ytan. Utelämnad följer den skärmen, högst 2. */
  pixelRatio?: number;
};

export type SceneHandle = {
  canvas: HTMLCanvasElement;
  /** Uppfylls när bord, sko och dealer är lästa, eller har visat sig oläsbara. */
  ready: Promise<void>;
  /** Byter rummet bakom scenen och hur det visas. Null släcker det. */
  setBackground(background: Background | null): void;
  /** Ställer vyn i en av de fasta. Med musen vrider och zoomar man sedan fritt därifrån. */
  setView(view: View): void;
  /** Visar eller döljer skon. Dealerns bild har ingen sko i något av fallen. */
  setShoe(shown: boolean): void;
  /** Ytans storlek på sidan. Hela vyns ruta visas alltid, inpassad på höjden eller bredden. */
  resize(width: number, height: number): void;
  /** Ritar en ruta nu. Annars ritas scenen bara när något har ändrats. */
  draw(): void;
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
    camera.position.set(...from.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(from.position[0] + from.forward[0], from.position[1] + from.forward[1], from.position[2] + from.forward[2]);
    // Musen vrider kring den punkt man ser mot: där blicken möter planet som står på dealerns bordskant.
    const centre = { x: (from.frame.width - 1) / 2, y: (from.frame.height - 1) / 2 };
    orbit.target.set(...(onUpright(from, centre, scene.dealerEdge.z) ?? dealerEdge(scene)));
    orbit.update();
    fit();
  }

  // Rummets oskärpa och den platta bildens kuliss räknas i spelarens ruta: det är vyn rummet ska ses i.
  const backdrop = createBackdrop(player, changed, problem);
  const film = createFilm(scene, renderer.capabilities.getMaxAnisotropy(), changed, problem);
  world.add(backdrop.mesh, film.upright);
  table.add(film.lying);

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

  const board = load(scene.table.file).then((model) => {
    if (!model) return;
    model.position.set(...tablePosition(scene));
    table.add(model);
    changed();
  });

  let shoeShown = true;
  let stand: THREE.Group | null = null;
  const shoe = load(scene.shoe.file).then((model) => {
    if (!model) return;
    const box = new THREE.Box3().setFromObject(model);
    const length = box.max.z - box.min.z;
    const middle = box.getCenter(new THREE.Vector3());
    // Fotens mitt ställs i origo, så att skon vrids och skalas kring den punkt beskrivningen pekar ut.
    model.position.set(-middle.x, -box.min.y, -middle.z);
    stand = new THREE.Group();
    stand.add(model);
    stand.position.set(scene.shoe.at[0], 0, scene.shoe.at[1]);
    stand.rotation.y = THREE.MathUtils.degToRad(scene.shoe.yawDeg);
    stand.scale.setScalar(scene.shoe.length / length);
    stand.visible = shoeShown;
    // Dealerns bild har en egen sko, där filmkameran såg den på ett olutat bord. Den tas bort där scenens sko står,
    // så att skon inte syns dubbelt. Konturen läses därför innan skon ställs på det lutade bordet.
    film.cover(outlineOf(stand, filmEye));
    table.add(stand);
    changed();
  });

  const dealer = options.dealer ? film.show(options.urlOf(options.dealer)) : Promise.resolve();

  aim(standing);
  renderer.setAnimationLoop(() => {
    const moved = free && orbit.update();
    if (moved || stale) draw();
  });

  function draw(): void {
    stale = false;
    renderer.render(world, camera);
  }

  return {
    canvas: renderer.domElement,
    ready: Promise.all([board, shoe, dealer]).then(() => undefined),
    setBackground(background) {
      backdrop.show(background);
    },
    setView(view) {
      aim(view.kind === 'spelaren' ? player : view.kind === 'filmkameran' ? filmEye : seatEye(scene, view.seat, player));
    },
    setShoe(shown) {
      shoeShown = shown;
      if (stand) stand.visible = shown;
      changed();
    },
    resize(width, height) {
      if (!(width > 0 && height > 0)) return;
      size = { width, height };
      renderer.setSize(width, height);
      fit();
    },
    draw,
    dispose() {
      closed = true;
      renderer.setAnimationLoop(null);
      orbit.dispose();
      backdrop.dispose();
      film.dispose();
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
