import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

function webGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

function createAirfoil() {
  const shape = new THREE.Shape();
  shape.moveTo(-1.45, 0);
  shape.bezierCurveTo(-0.8, 0.25, 0.65, 0.23, 1.5, 0.03);
  shape.bezierCurveTo(0.55, -0.11, -0.7, -0.16, -1.45, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.5,
    bevelEnabled: true,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    bevelSegments: 2,
  });
  geometry.center();
  return geometry;
}

export default function FlowHero3D() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !webGLAvailable()) {
      setFallback(true);
      return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070a09, 0.075);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(7.8, 4.6, 7.8);
    camera.lookAt(0.3, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    mount.appendChild(renderer.domElement);

    const root = new THREE.Group();
    root.rotation.x = -0.08;
    scene.add(root);

    scene.add(new THREE.HemisphereLight(0xc8fff0, 0x07100b, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 3.1);
    key.position.set(3, 7, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0x65d8ff, 24, 18);
    rim.position.set(-4, 2, -2);
    scene.add(rim);

    const disposables: Array<{ dispose?: () => void }> = [];
    const addEdges = (geometry: THREE.BufferGeometry, color = 0x52605a, opacity = 0.52) => {
      const edgesGeometry = new THREE.EdgesGeometry(geometry);
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
      const edges = new THREE.LineSegments(edgesGeometry, material);
      root.add(edges);
      disposables.push(edgesGeometry, material);
      return edges;
    };

    const chamber = new THREE.BoxGeometry(8.7, 3.55, 4.8);
    const chamberEdges = addEdges(chamber, 0x4a5951, 0.55);
    chamberEdges.position.x = 0.25;
    disposables.push(chamber);

    const floor = new THREE.GridHelper(12, 20, 0x34564b, 0x1b2d27);
    floor.position.y = -1.76;
    floor.material.transparent = true;
    floor.material.opacity = 0.35;
    root.add(floor);
    disposables.push(floor.geometry, floor.material);

    const airfoilGeometry = createAirfoil();
    const airfoilMaterial = new THREE.MeshStandardMaterial({
      color: 0xc8c9cb,
      metalness: 0.74,
      roughness: 0.22,
    });
    const airfoil = new THREE.Mesh(airfoilGeometry, airfoilMaterial);
    airfoil.rotation.x = Math.PI / 2;
    airfoil.rotation.z = -0.06;
    airfoil.position.set(0.25, 0, 0);
    root.add(airfoil);
    disposables.push(airfoilGeometry, airfoilMaterial);

    const palette = [0x5cb8ff, 0x5ce1e6, 0x8cff70, 0xffd45e, 0xff784f];
    const curves: THREE.CatmullRomCurve3[] = [];
    const tracers: THREE.Mesh[] = [];
    const tracerGeometry = new THREE.SphereGeometry(0.042, 8, 8);
    disposables.push(tracerGeometry);

    for (let zIndex = 0; zIndex < 5; zIndex += 1) {
      const z = (zIndex - 2) * 0.72;
      for (let row = -3; row <= 3; row += 1) {
        const y = row * 0.38;
        const influence = Math.max(0, 1 - Math.abs(y) / 1.45);
        const deflect = (row >= 0 ? 1 : -1) * 0.72 * influence;
        const points = [
          new THREE.Vector3(-4.05, y, z),
          new THREE.Vector3(-2.2, y, z),
          new THREE.Vector3(-0.9, y + deflect * 0.48, z),
          new THREE.Vector3(0.2, y + deflect, z),
          new THREE.Vector3(1.45, y + deflect * 0.5, z),
          new THREE.Vector3(4.25, y, z),
        ];
        const curve = new THREE.CatmullRomCurve3(points);
        curves.push(curve);
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(38));
        const color = palette[Math.min(4, Math.max(0, row + 3))];
        const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });
        root.add(new THREE.Line(geometry, material));
        disposables.push(geometry, material);

        if ((row + zIndex) % 2 === 0) {
          const tracerMaterial = new THREE.MeshBasicMaterial({ color });
          const tracer = new THREE.Mesh(tracerGeometry, tracerMaterial);
          tracer.userData.curveIndex = curves.length - 1;
          tracer.userData.offset = ((row + 4) * 0.09 + zIndex * 0.13) % 1;
          root.add(tracer);
          tracers.push(tracer);
          disposables.push(tracerMaterial);
        }
      }
    }

    let width = 1;
    let height = 1;
    const resize = () => {
      width = Math.max(1, mount.clientWidth);
      height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let visible = true;
    const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.05 });
    visibilityObserver.observe(mount);

    let targetX = -0.08;
    let targetY = 0;
    const onPointerMove = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      targetY = ((event.clientX - rect.left) / rect.width - 0.5) * 0.16;
      targetX = -0.08 + ((event.clientY - rect.top) / rect.height - 0.5) * 0.08;
    };
    const onPointerLeave = () => { targetX = -0.08; targetY = 0; };
    mount.addEventListener('pointermove', onPointerMove);
    mount.addEventListener('pointerleave', onPointerLeave);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!visible) return;
      const time = clock.getElapsedTime();
      root.rotation.x += (targetX - root.rotation.x) * 0.055;
      root.rotation.y += (targetY - root.rotation.y) * 0.055;
      if (!reduceMotion) {
        tracers.forEach((tracer) => {
          const curve = curves[tracer.userData.curveIndex];
          tracer.position.copy(curve.getPoint((time * 0.11 + tracer.userData.offset) % 1));
        });
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      mount.removeEventListener('pointermove', onPointerMove);
      mount.removeEventListener('pointerleave', onPointerLeave);
      disposables.forEach((item) => item.dispose?.());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="flow-hero" role="img" aria-label="Modelo tridimensional ilustrativo de um aerofólio dentro de um túnel de escoamento CFD">
      <div ref={mountRef} className="absolute inset-0" />
      {fallback && (
        <div className="absolute inset-0 grid place-items-center text-center text-sm text-mmx-muted">
          Visualização 3D indisponível neste dispositivo.
        </div>
      )}
      <div className="flow-hero__legend" aria-hidden="true">
        <span>Velocidade</span>
        <i />
        <div className="flex justify-between font-mono text-[9px] text-mmx-muted"><b>0.0</b><b>5.0 m/s</b></div>
      </div>
      <div className="flow-hero__status">
        <span className="status-dot" />
        Cena demonstrativa · campo ilustrativo
      </div>
    </div>
  );
}
