// Visar en 3D-modell ur registret för granskning: vrid med musen, zooma med hjulet.
// Det här är inte spelets scen. Kameran ställs efter modellens egen storlek och bär inga mått.

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const metres = (value: number): string => value.toFixed(3).replace('.', ',');

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

export default function ModelPreview({ url }: { url: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [facts, setFacts] = useState('Läser modellen …');

  useEffect(() => {
    const element = holder.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    element.append(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x15171b);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    let model: THREE.Object3D | null = null;
    let grid: THREE.GridHelper | null = null;
    let closed = false;

    new GLTFLoader().load(
      url,
      (gltf) => {
        if (closed) return disposeModel(gltf.scene);
        model = gltf.scene;
        scene.add(model);

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const distance = size.length() / 2 / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
        camera.position.copy(centre).add(new THREE.Vector3(0.55, 0.45, 1).normalize().multiplyScalar(distance * 1.05));
        camera.near = distance / 100;
        camera.far = distance * 20;
        camera.updateProjectionMatrix();
        controls.target.copy(centre);
        controls.update();

        // Rutnät under modellen med en ruta per decimeter, som skalstock.
        const side = Math.ceil(Math.max(size.x, size.z)) + 1;
        grid = new THREE.GridHelper(side, side * 10, 0x4a4f5a, 0x2a2d34);
        grid.position.set(centre.x, box.min.y, centre.z);
        scene.add(grid);

        let triangles = 0;
        model.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          const { index, attributes } = mesh.geometry;
          triangles += (index ? index.count : (attributes.position?.count ?? 0)) / 3;
        });
        setFacts(
          `Mätt i filen: ${metres(size.x)} × ${metres(size.y)} × ${metres(size.z)} m (bredd × höjd × djup), ` +
            `${Math.round(triangles).toLocaleString('sv-SE')} trianglar. Rutnätet har en ruta per decimeter.`,
        );
      },
      undefined,
      () => setFacts('Modellen gick inte att läsa.'),
    );

    const fit = () => {
      const { clientWidth, clientHeight } = element;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    const watcher = new ResizeObserver(fit);
    watcher.observe(element);
    fit();
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      closed = true;
      watcher.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      if (model) disposeModel(model);
      grid?.dispose();
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url]);

  return (
    <div className="model">
      <div ref={holder} className="modelview" />
      <p className="modelfacts">{facts}</p>
    </div>
  );
}
