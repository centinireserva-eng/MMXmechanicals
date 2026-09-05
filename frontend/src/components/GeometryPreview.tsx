import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GeometryKind } from '../data/geometryPresets';

interface GeometryPreviewProps {
  kind?: GeometryKind;
  className?: string;
  active?: boolean;
}

const FLOW_COLORS = [0x2d7fff, 0x46c7ff, 0x66f0c2, 0xb8ff72, 0xffd75a, 0xff754f];

function addEdges(group: THREE.Group, geometry: THREE.BufferGeometry, disposables: Array<{ dispose?: () => void }>, color = 0x799087, opacity = 0.6) {
  const edgeGeometry = new THREE.EdgesGeometry(geometry, 22);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  group.add(new THREE.LineSegments(edgeGeometry, material));
  disposables.push(edgeGeometry, material);
}

function makeAhmedGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-1.25, -0.42);
  shape.lineTo(-1.25, 0.34);
  shape.lineTo(0.55, 0.34);
  shape.lineTo(1.2, 0.02);
  shape.lineTo(1.2, -0.42);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.84, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  geometry.center();
  return geometry;
}

function buildObject(kind: GeometryKind, group: THREE.Group, disposables: Array<{ dispose?: () => void }>) {
  const material = new THREE.MeshStandardMaterial({ color: 0xc8c9cb, metalness: 0.62, roughness: 0.28 });
  disposables.push(material);
  let geometry: THREE.BufferGeometry;

  if (kind === 'cylinder') {
    geometry = new THREE.CylinderGeometry(0.62, 0.62, 1.7, 32);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    group.add(mesh);
  } else if (kind === 'sphere') {
    geometry = new THREE.SphereGeometry(0.74, 32, 20);
    group.add(new THREE.Mesh(geometry, material));
  } else if (kind === 'duct') {
    geometry = new THREE.BoxGeometry(3.1, 1.35, 1.35);
    const transparentMaterial = new THREE.MeshPhysicalMaterial({ color: 0x7adcc7, transparent: true, opacity: 0.08, roughness: 0.2, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(geometry, transparentMaterial));
    addEdges(group, geometry, disposables, 0x8cff70, 0.78);
    disposables.push(transparentMaterial);
  } else if (kind === 'elbow') {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.6, 0.9, 0), new THREE.Vector3(-0.55, 0.9, 0),
      new THREE.Vector3(0.1, 0.72, 0), new THREE.Vector3(0.4, 0.1, 0),
      new THREE.Vector3(0.4, -1.15, 0),
    ]);
    geometry = new THREE.TubeGeometry(curve, 48, 0.43, 16, false);
    group.add(new THREE.Mesh(geometry, material));
    addEdges(group, geometry, disposables, 0x5b756b, 0.3);
  } else if (kind === 'ahmed') {
    geometry = makeAhmedGeometry();
    group.add(new THREE.Mesh(geometry, material));
  } else if (kind === 'cavity') {
    geometry = new THREE.BoxGeometry(2.2, 1.7, 1.7);
    const transparentMaterial = new THREE.MeshPhysicalMaterial({ color: 0x84deff, transparent: true, opacity: 0.07, roughness: 0.2, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(geometry, transparentMaterial));
    addEdges(group, geometry, disposables, 0x8ab5aa, 0.75);
    const lidGeometry = new THREE.BoxGeometry(2.18, 0.07, 1.68);
    const lidMaterial = new THREE.MeshBasicMaterial({ color: 0xffd75a });
    const lid = new THREE.Mesh(lidGeometry, lidMaterial);
    lid.position.y = 0.87;
    group.add(lid);
    disposables.push(transparentMaterial, lidGeometry, lidMaterial);
  } else if (kind === 'channel') {
    geometry = new THREE.BoxGeometry(3.3, 0.55, 1.35);
    const transparentMaterial = new THREE.MeshPhysicalMaterial({ color: 0x7adcc7, transparent: true, opacity: 0.08, roughness: 0.2, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(geometry, transparentMaterial));
    addEdges(group, geometry, disposables, 0x8cff70, 0.78);
    disposables.push(transparentMaterial);
  } else if (kind === 'tube') {
    geometry = new THREE.CylinderGeometry(0.5, 0.5, 3.0, 32);
    const transparentMaterial = new THREE.MeshPhysicalMaterial({ color: 0xff9a5a, transparent: true, opacity: 0.1, roughness: 0.2, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, transparentMaterial);
    mesh.rotation.z = Math.PI / 2;
    group.add(mesh);
    addEdges(group, geometry, disposables, 0xffbd8a, 0.7);
    disposables.push(transparentMaterial);
  } else if (kind === 'step') {
    const shape = new THREE.Shape();
    shape.moveTo(-1.6, -0.65);
    shape.lineTo(-1.6, -0.1);
    shape.lineTo(-0.15, -0.1);
    shape.lineTo(-0.15, -0.65);
    shape.closePath();
    geometry = new THREE.ExtrudeGeometry(shape, { depth: 1.3, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
    group.add(new THREE.Mesh(geometry, material));
    const floorGeometry = new THREE.BoxGeometry(3.4, 0.06, 1.3);
    const floor = new THREE.Mesh(floorGeometry, material);
    floor.position.set(0.15, -0.68, 0);
    group.add(floor);
    disposables.push(floorGeometry);
  } else if (kind === 'tjunction') {
    geometry = new THREE.CylinderGeometry(0.42, 0.42, 3.0, 28);
    const transparentMaterial = new THREE.MeshPhysicalMaterial({ color: 0x7adcc7, transparent: true, opacity: 0.09, roughness: 0.2, side: THREE.DoubleSide });
    const main = new THREE.Mesh(geometry, transparentMaterial);
    main.rotation.z = Math.PI / 2;
    group.add(main);
    addEdges(group, geometry, disposables, 0x8cff70, 0.65);
    const branchGeometry = new THREE.CylinderGeometry(0.34, 0.34, 1.3, 24);
    const branch = new THREE.Mesh(branchGeometry, transparentMaterial);
    branch.position.y = 1.05;
    group.add(branch);
    addEdges(group, branchGeometry, disposables, 0x8cff70, 0.65);
    disposables.push(transparentMaterial, branchGeometry);
  } else if (kind === 'valve') {
    geometry = new THREE.CylinderGeometry(0.42, 0.42, 3.0, 28);
    const transparentMaterial = new THREE.MeshPhysicalMaterial({ color: 0x7adcc7, transparent: true, opacity: 0.09, roughness: 0.2, side: THREE.DoubleSide });
    const pipe = new THREE.Mesh(geometry, transparentMaterial);
    pipe.rotation.z = Math.PI / 2;
    group.add(pipe);
    addEdges(group, geometry, disposables, 0x8cff70, 0.6);
    const gateGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.12, 28);
    const gate = new THREE.Mesh(gateGeometry, material);
    gate.rotation.z = Math.PI / 2;
    gate.position.y = -0.12;
    group.add(gate);
    disposables.push(transparentMaterial, gateGeometry);
  } else if (kind === 'building') {
    geometry = new THREE.BoxGeometry(0.9, 2.3, 0.9);
    group.add(new THREE.Mesh(geometry, material));
    addEdges(group, geometry, disposables, 0x475047, 0.4);
  } else if (kind === 'room') {
    geometry = new THREE.BoxGeometry(2.6, 1.6, 1.7);
    const transparentMaterial = new THREE.MeshPhysicalMaterial({ color: 0x84deff, transparent: true, opacity: 0.07, roughness: 0.2, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(geometry, transparentMaterial));
    addEdges(group, geometry, disposables, 0x8ab5aa, 0.7);
    const furnitureGeometry = new THREE.BoxGeometry(0.6, 0.5, 0.6);
    const furniture = new THREE.Mesh(furnitureGeometry, material);
    furniture.position.set(-0.4, -0.55, 0.2);
    group.add(furniture);
    disposables.push(transparentMaterial, furnitureGeometry);
  } else if (kind === 'coolingtower') {
    geometry = new THREE.CylinderGeometry(0.42, 0.62, 2.0, 32);
    const towerMaterial = new THREE.MeshStandardMaterial({ color: 0xb9beb8, metalness: 0.15, roughness: 0.65 });
    group.add(new THREE.Mesh(geometry, towerMaterial));
    disposables.push(towerMaterial);
  } else if (kind === 'tubebank') {
    geometry = new THREE.CylinderGeometry(0.22, 0.22, 1.5, 20);
    [[-0.5, 0.35], [-0.5, -0.35], [0, 0], [0.5, 0.35], [0.5, -0.35]].forEach(([px, py]) => {
      const rod = new THREE.Mesh(geometry, material);
      rod.rotation.x = Math.PI / 2;
      rod.position.set(px, py, 0);
      group.add(rod);
    });
  } else if (kind === 'screen') {
    geometry = new THREE.BoxGeometry(0.12, 1.8, 1.8);
    group.add(new THREE.Mesh(geometry, material));
    const holeGeometry = new THREE.RingGeometry(0.08, 0.11, 16);
    const holeMaterial = new THREE.MeshBasicMaterial({ color: 0x8cff70, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    [[0.5, 0.5], [0.5, -0.5], [0, 0.5], [0, -0.5], [0, 0], [-0.5, 0.5], [-0.5, -0.5]].forEach(([hy, hz]) => {
      const hole = new THREE.Mesh(holeGeometry, holeMaterial);
      hole.position.set(0.07, hy, hz);
      hole.rotation.y = Math.PI / 2;
      group.add(hole);
    });
    disposables.push(holeGeometry, holeMaterial);
  } else if (kind === 'tank') {
    geometry = new THREE.CylinderGeometry(0.85, 0.85, 1.5, 32);
    group.add(new THREE.Mesh(geometry, material));
    const roofGeometry = new THREE.ConeGeometry(0.88, 0.22, 32);
    const roof = new THREE.Mesh(roofGeometry, material);
    roof.position.y = 0.86;
    group.add(roof);
    disposables.push(roofGeometry);
  } else {
    geometry = kind === 'voxel' ? new THREE.IcosahedronGeometry(0.95, 2) : makeAhmedGeometry();
    const uploadMaterial = new THREE.MeshStandardMaterial({ color: 0xc8c9cb, metalness: 0.7, roughness: 0.25, wireframe: kind === 'voxel' });
    group.add(new THREE.Mesh(geometry, uploadMaterial));
    const box = new THREE.BoxGeometry(3.1, 2.25, 2.25);
    addEdges(group, box, disposables, 0x8cff70, 0.52);
    disposables.push(uploadMaterial, box);
  }

  disposables.push(geometry);
}

function createFlowCurves(kind: GeometryKind) {
  const curves: THREE.Curve<THREE.Vector3>[] = [];
  if (kind === 'cavity') {
    for (let z = -0.52; z <= 0.53; z += 0.35) {
      for (let radius = 0.34; radius <= 0.78; radius += 0.22) {
        const curve = new THREE.EllipseCurve(0, 0, radius * 1.22, radius, 0, Math.PI * 2, false, 0) as unknown as THREE.Curve<THREE.Vector3>;
        (curve as any).userData = { z };
        curves.push(curve);
      }
    }
    return curves;
  }
  if (kind === 'elbow') {
    for (let i = -3; i <= 3; i += 1) {
      const offset = i * 0.12;
      curves.push(new THREE.CatmullRomCurve3([
        new THREE.Vector3(-2.25, 0.9 + offset, 0), new THREE.Vector3(-0.75, 0.9 + offset, 0),
        new THREE.Vector3(0.18 + offset, 0.7, 0), new THREE.Vector3(0.4 + offset, 0, 0),
        new THREE.Vector3(0.4 + offset, -1.65, 0),
      ]));
    }
    return curves;
  }
  if (kind === 'step') {
    // Flow separates over the step near the inlet and reattaches downstream.
    for (let i = -3; i <= 3; i += 1) {
      const offset = i * 0.1;
      curves.push(new THREE.CatmullRomCurve3([
        new THREE.Vector3(-2.4, 0.32 + offset * 0.4, offset), new THREE.Vector3(-1.1, 0.32 + offset * 0.4, offset),
        new THREE.Vector3(-0.7, 0.05 + offset * 0.3, offset), new THREE.Vector3(0.1, -0.28 + offset * 0.25, offset),
        new THREE.Vector3(1.3, -0.05 + offset * 0.15, offset), new THREE.Vector3(2.4, 0.05 + offset * 0.1, offset),
      ]));
    }
    return curves;
  }
  for (let row = -3; row <= 3; row += 1) {
    const y = row * 0.27;
    const influence = Math.max(0, 1 - Math.abs(y) / 1.05);
    const bend = (row === 0 ? 1 : Math.sign(row)) * influence * (kind === 'ahmed' ? 0.53 : 0.66);
    if (kind === 'duct' || kind === 'channel' || kind === 'tube' || kind === 'room' || kind === 'valve' || kind === 'tjunction' || kind === 'upload' || kind === 'voxel') {
      curves.push(new THREE.LineCurve3(new THREE.Vector3(-2.35, y, 0), new THREE.Vector3(2.35, y, 0)));
    } else {
      curves.push(new THREE.CatmullRomCurve3([
        new THREE.Vector3(-2.4, y, 0), new THREE.Vector3(-1.25, y, 0),
        new THREE.Vector3(-0.5, y + bend * 0.52, 0), new THREE.Vector3(0.15, y + bend, 0),
        new THREE.Vector3(1.0, y + bend * 0.46, 0), new THREE.Vector3(2.45, y, 0),
      ]));
    }
  }
  return curves;
}

export default function GeometryPreview({ kind = 'duct', className = '', active = false }: GeometryPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setSupported(false);
      return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.touchAction = 'none';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080b0a, 0.12);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    camera.position.set(4.35, 2.55, 4.7);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xcaffee, 0x06100c, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new THREE.PointLight(0x46c7ff, 17, 12);
    rim.position.set(-3, 1, -2);
    scene.add(rim);

    const root = new THREE.Group();
    root.rotation.set(-0.16, -0.34, 0.02);
    scene.add(root);
    const controls = active ? new OrbitControls(camera, renderer.domElement) : null;
    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.075;
      controls.enablePan = false;
      controls.rotateSpeed = 0.72;
      controls.zoomSpeed = 0.8;
      controls.minDistance = 3.1;
      controls.maxDistance = 8;
      controls.minPolarAngle = 0.04;
      controls.maxPolarAngle = Math.PI - 0.04;
      controls.target.set(0, 0, 0);
    }
    const objectGroup = new THREE.Group();
    root.add(objectGroup);
    const disposables: Array<{ dispose?: () => void }> = [];
    buildObject(kind, objectGroup, disposables);

    const flowGroup = new THREE.Group();
    flowGroup.position.z = kind === 'cavity' ? 0 : 0.1;
    root.add(flowGroup);
    const curves = createFlowCurves(kind);
    const tracerGeometry = new THREE.SphereGeometry(0.045, 7, 7);
    disposables.push(tracerGeometry);
    const tracers: THREE.Mesh[] = [];

    curves.forEach((curve, index) => {
      let points: THREE.Vector3[];
      if (kind === 'cavity') {
        const data = (curve as any).userData;
        const points2D = (curve as unknown as THREE.EllipseCurve).getPoints(48);
        points = points2D.map((p) => new THREE.Vector3(p.x, p.y, data.z));
      } else {
        points = curve.getPoints(42);
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const color = FLOW_COLORS[index % FLOW_COLORS.length];
      const lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 });
      flowGroup.add(new THREE.Line(geometry, lineMaterial));
      disposables.push(geometry, lineMaterial);

      if (index % 2 === 0) {
        const tracerMaterial = new THREE.MeshBasicMaterial({ color });
        const tracer = new THREE.Mesh(tracerGeometry, tracerMaterial);
        tracer.userData.index = index;
        tracer.userData.offset = (index * 0.173) % 1;
        flowGroup.add(tracer);
        tracers.push(tracer);
        disposables.push(tracerMaterial);
      }
    });

    const grid = new THREE.GridHelper(6.2, 18, 0x27443a, 0x182a24);
    grid.position.y = -1.18;
    grid.material.transparent = true;
    grid.material.opacity = 0.26;
    root.add(grid);
    disposables.push(grid.geometry, grid.material);

    let targetX = root.rotation.x;
    let targetY = root.rotation.y;
    const onPointerMove = (event: PointerEvent) => {
      if (active) return;
      const rect = mount.getBoundingClientRect();
      targetY = -0.34 + ((event.clientX - rect.left) / rect.width - 0.5) * 0.28;
      targetX = -0.16 + ((event.clientY - rect.top) / rect.height - 0.5) * 0.18;
    };
    const onPointerLeave = () => { targetX = -0.16; targetY = -0.34; };
    mount.addEventListener('pointermove', onPointerMove);
    mount.addEventListener('pointerleave', onPointerLeave);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let visible = true;
    const intersectionObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.02 });
    intersectionObserver.observe(mount);
    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!visible) return;
      const time = clock.getElapsedTime();
      root.rotation.x += (targetX - root.rotation.x) * 0.07;
      root.rotation.y += (targetY - root.rotation.y) * 0.07;
      if (!reduceMotion) {
        tracers.forEach((tracer) => {
          const curveIndex = tracer.userData.index;
          const t = (time * (active ? 0.22 : 0.13) + tracer.userData.offset) % 1;
          if (kind === 'cavity') {
            const curve = curves[curveIndex] as unknown as THREE.EllipseCurve;
            const p = curve.getPoint(t);
            tracer.position.set(p.x, p.y, (curve as any).userData.z);
          } else {
            tracer.position.copy(curves[curveIndex].getPoint(t));
          }
        });
        if (kind === 'upload' || kind === 'voxel') objectGroup.rotation.y += active ? 0.012 : 0.004;
      }
      controls?.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      mount.removeEventListener('pointermove', onPointerMove);
      mount.removeEventListener('pointerleave', onPointerLeave);
      controls?.dispose();
      disposables.forEach((item) => item.dispose?.());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [kind, active]);

  return (
    <div className={`geometry-canvas ${className}`} ref={mountRef} role={active ? 'group' : 'img'} aria-label={`Prévia tridimensional da geometria ${kind}${active ? '; arraste para girar em 360 graus' : ''}`}>
      {!supported && <div className="absolute inset-0 grid place-items-center text-xs text-mmx-muted">Prévia 3D indisponível</div>}
      {active && supported && <span className="geometry-canvas__hint">Arraste para girar 360°</span>}
    </div>
  );
}
