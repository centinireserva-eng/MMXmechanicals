import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshPreviewPayload } from '../types/geometry';

export default function MeshPreview({ preview, size }: { preview?: MeshPreviewPayload | null; size?: { x: number; y: number; z: number } | null }) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(2.6, 1.8, 2.8);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 2.2;
    controls.maxDistance = 5.5;
    controls.maxPolarAngle = Math.PI * 0.82;

    scene.add(new THREE.HemisphereLight(0xdcfff4, 0x07100c, 1.5));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(3, 5, 4);
    scene.add(light);

    const group = new THREE.Group();
    scene.add(group);
    const disposables: Array<{ dispose?: () => void }> = [];
    if (preview?.vertices?.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(preview.vertices.flat(), 3));
      geometry.setIndex(preview.triangles.flat());
      geometry.computeVertexNormals();
      geometry.center();
      const material = new THREE.MeshStandardMaterial({ color: 0xc8c9cb, metalness: 0.64, roughness: 0.28, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      const edgeGeometry = new THREE.EdgesGeometry(geometry, 22);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x49655b, transparent: true, opacity: 0.5 });
      group.add(mesh, new THREE.LineSegments(edgeGeometry, edgeMaterial));
      geometry.computeBoundingSphere();
      group.scale.setScalar(1.25 / Math.max(geometry.boundingSphere?.radius || 1, 1e-6));
      disposables.push(geometry, material, edgeGeometry, edgeMaterial);
    } else {
      const dimensions = size ? [size.x || 1, size.y || 1, size.z || 1] : [1, 1, 1];
      const maxDimension = Math.max(...dimensions, 1e-6);
      const geometry = new THREE.BoxGeometry(...dimensions.map((value) => value / maxDimension * 1.8) as [number, number, number]);
      const edgeGeometry = new THREE.EdgesGeometry(geometry);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x8cff70 });
      group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
      disposables.push(geometry, edgeGeometry, edgeMaterial);
    }

    const grid = new THREE.GridHelper(4.5, 14, 0x2f5a49, 0x183127);
    grid.position.y = -1.06;
    grid.material.transparent = true;
    grid.material.opacity = 0.34;
    scene.add(grid);
    disposables.push(grid.geometry, grid.material);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!reduceMotion) group.rotation.y += 0.003;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      disposables.forEach((item) => item.dispose?.());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [preview, size]);

  return (
    <div className="mesh-preview" role="img" aria-label="Prévia tridimensional do arquivo enviado; arraste para rotacionar">
      <div ref={mountRef} />
      <div className="mesh-preview__hint">Arraste para rotacionar</div>
      <div className="axis-labels" aria-hidden="true"><span>X</span><span>Y</span><span>Z</span></div>
    </div>
  );
}
