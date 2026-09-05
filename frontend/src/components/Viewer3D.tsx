import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Maximize2, Pause, Play, RotateCcw } from 'lucide-react';
import { GeometryKind } from '../data/geometryPresets';
import { BoundingBox, MeshPreviewPayload } from '../types/geometry';

export type ResultField = 'velocity' | 'pressure' | 'temperature' | 'concentration';

interface Viewer3DProps {
  field: ResultField;
  simId?: string;
  geometryKind?: GeometryKind;
  geometryLabel?: string;
  // The imported mesh this simulation actually used, and its persisted
  // bounds -- when present, the viewer renders this real geometry instead of
  // picking a stand-in shape from `geometryKind` (continuity requirement:
  // the same scenario shown while configuring must be the one shown here).
  meshPreview?: MeshPreviewPayload | null;
  meshBounds?: BoundingBox | null;
  stats?: {
    velocity_stats?: { min?: number; max?: number; mean?: number };
    rho_stats?: { min?: number; max?: number; mean?: number };
    temperature_stats?: { min?: number; max?: number; mean?: number };
  };
}

// Preset shapes (Ahmed body, duct, elbow...) were hand-tuned to roughly this
// bounding-sphere radius. A real imported mesh can be any absolute size (a
// scanned part in millimeters or a whole facility in meters), so it's
// rescaled to the same apparent radius -- this keeps the existing flow-field
// overlays (built for that scale) visually wrapped around the real object
// instead of dwarfing it or disappearing inside it. It is a display
// normalization, not a physical claim; the per-field legend already labels
// values as solver-derived vs. normalized.
const TARGET_RADIUS = 1.6;

const FIELD_COPY: Record<ResultField, { label: string; unit: string; description: string; colors: string[] }> = {
  velocity: {
    label: 'Magnitude de velocidade',
    unit: 'm/s',
    description: 'Traçadores acompanham o sentido do escoamento e aceleram ao contornar o corpo.',
    colors: ['#2d7fff', '#46c7ff', '#66f0c2', '#b8ff72', '#ffd75a', '#ff754f'],
  },
  pressure: {
    label: 'Pressão relativa',
    unit: 'ρ',
    description: 'Planos de isovalor revelam a compressão a montante e a recuperação na esteira.',
    colors: ['#3157ff', '#4dbbff', '#69f0d0', '#ffd45c', '#ff754f', '#ff476f'],
  },
  temperature: {
    label: 'Temperatura',
    unit: '°C',
    description: 'Partículas térmicas sobem por convecção e deixam visível o gradiente de difusão.',
    colors: ['#224dff', '#43bfff', '#70e7d1', '#ffd65c', '#ff8a45', '#ff4f4f'],
  },
  concentration: {
    label: 'Concentração de gás',
    unit: '%',
    description: 'A pluma sobe ou desce conforme o empuxo do gás liberado e é levada pelo vento.',
    colors: ['#0f2e22', '#1f7a52', '#8ecb3f', '#ffd75a', '#ff8a3d', '#ff4f4f'],
  },
};

function fieldDescription(field: ResultField, kind: GeometryKind) {
  if (field !== 'velocity') return FIELD_COPY[field].description;
  if (kind === 'coolingtower') return 'Traçadores sobem pelo gargalo e evidenciam a aceleração do escoamento vertical.';
  if (kind === 'cavity' || kind === 'room') return 'Traçadores fecham ciclos de recirculação e tornam visíveis as zonas de renovação do fluido.';
  if (kind === 'tjunction') return 'O escoamento se divide entre o ramal principal e a derivação, mantendo a continuidade das trajetórias.';
  if (kind === 'valve') return 'As trajetórias se contraem na passagem da válvula e recuperam área a jusante.';
  if (kind === 'tubebank') return 'As linhas serpenteiam entre os tubos e revelam aceleração local e esteiras sucessivas.';
  if (kind === 'screen') return 'As trajetórias convergem nas passagens da grade e se redistribuem após o obstáculo.';
  if (kind === 'duct' || kind === 'channel' || kind === 'tube') return 'Traçadores percorrem o canal e mostram a direção do escoamento interno.';
  return FIELD_COPY[field].description;
}

function makeBodyGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-1.35, -0.5);
  shape.lineTo(-1.35, 0.38);
  shape.quadraticCurveTo(-1.2, 0.62, -0.88, 0.65);
  shape.lineTo(0.54, 0.65);
  shape.lineTo(1.28, 0.12);
  shape.lineTo(1.28, -0.5);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1.32,
    bevelEnabled: true,
    bevelSize: 0.055,
    bevelThickness: 0.055,
    bevelSegments: 3,
  });
  geometry.center();
  return geometry;
}

function makeVelocityCurve(y: number, z: number, kind: GeometryKind): THREE.Curve<THREE.Vector3> {
  if (kind === 'duct' || kind === 'channel' || kind === 'tube') {
    return new THREE.LineCurve3(new THREE.Vector3(-4.7, y, z), new THREE.Vector3(4.7, y, z));
  }
  if (kind === 'valve') {
    const side = y === 0 ? (z >= 0 ? 1 : -1) : Math.sign(y);
    const throat = Math.max(0.16, Math.abs(y) * 0.48) * side;
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4.7, y, z),
      new THREE.Vector3(-1.2, y, z),
      new THREE.Vector3(-0.45, throat, z * 0.7),
      new THREE.Vector3(0.45, throat, z * 0.7),
      new THREE.Vector3(1.35, y * 0.82, z * 0.9),
      new THREE.Vector3(4.7, y, z),
    ]);
  }
  if (kind === 'tjunction') {
    const entersBranch = y > 0.48;
    return new THREE.CatmullRomCurve3(entersBranch ? [
      new THREE.Vector3(-4.7, y * 0.35, z * 0.55),
      new THREE.Vector3(-1.35, y * 0.25, z * 0.55),
      new THREE.Vector3(-0.2, 0.12, z * 0.48),
      new THREE.Vector3(0, 1.05, z * 0.42),
      new THREE.Vector3(0, 3.5, z * 0.36),
    ] : [
      new THREE.Vector3(-4.7, y, z),
      new THREE.Vector3(-1.1, y, z),
      new THREE.Vector3(0.15, y * 0.72, z),
      new THREE.Vector3(1.35, y * 0.88, z),
      new THREE.Vector3(4.7, y, z),
    ]);
  }
  if (kind === 'room') {
    const radiusX = 1.6 - Math.min(0.4, Math.abs(z) * 0.1);
    const radiusY = 1.05 - Math.min(0.28, Math.abs(y) * 0.07);
    const points = Array.from({ length: 19 }, (_, index) => {
      const angle = (index / 18) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * radiusX, Math.sin(angle) * radiusY, z * 0.46);
    });
    return new THREE.CatmullRomCurve3(points, true);
  }
  if (kind === 'coolingtower') {
    const swirl = y * 0.16;
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(swirl, -2.15, z * 0.35),
      new THREE.Vector3(-z * 0.12, -1.1, z * 0.28),
      new THREE.Vector3(z * 0.1, 0.2, -z * 0.2),
      new THREE.Vector3(-z * 0.16, 1.25, z * 0.28),
      new THREE.Vector3(swirl * 1.4, 2.15, z * 0.4),
    ]);
  }
  if (kind === 'tubebank') {
    const phase = z * 0.9;
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4.7, y, z),
      new THREE.Vector3(-1.5, y + Math.sin(phase) * 0.16, z),
      new THREE.Vector3(-0.65, y + Math.sin(phase + 1.4) * 0.34, z),
      new THREE.Vector3(0.1, y + Math.sin(phase + 2.8) * 0.38, z),
      new THREE.Vector3(0.85, y + Math.sin(phase + 4.2) * 0.3, z),
      new THREE.Vector3(2.0, y + Math.sin(phase + 5.4) * 0.14, z),
      new THREE.Vector3(4.7, y, z),
    ]);
  }
  if (kind === 'screen') {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4.7, y, z),
      new THREE.Vector3(-1.15, y, z),
      new THREE.Vector3(-0.18, y * 0.52, z * 0.52),
      new THREE.Vector3(0.18, y * 0.52, z * 0.52),
      new THREE.Vector3(1.2, y * 0.78, z * 0.78),
      new THREE.Vector3(4.7, y, z),
    ]);
  }
  if (kind === 'step') {
    // Flow separates over the step near the inlet and reattaches downstream.
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4.7, y + 0.55, z), new THREE.Vector3(-2.2, y + 0.55, z),
      new THREE.Vector3(-1.4, y + 0.1, z), new THREE.Vector3(0.2, y - 0.5, z),
      new THREE.Vector3(2.6, y - 0.1, z), new THREE.Vector3(4.7, y + 0.1, z),
    ]);
  }
  if (kind === 'elbow') {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4.5, 1.1 + y * 0.32, z * 0.42),
      new THREE.Vector3(-1.7, 1.1 + y * 0.32, z * 0.42),
      new THREE.Vector3(-0.55, 1.02 + y * 0.3, z * 0.42),
      new THREE.Vector3(0.45, 0.35 + y * 0.24, z * 0.42),
      new THREE.Vector3(0.62, -1.25 + y * 0.2, z * 0.42),
      new THREE.Vector3(0.62, -3.35 + y * 0.18, z * 0.42),
    ]);
  }
  if (kind === 'cavity') {
    const radiusX = 1.45 - Math.min(0.5, Math.abs(z) * 0.12);
    const radiusY = 1.18 - Math.min(0.35, Math.abs(y) * 0.08);
    const points = Array.from({ length: 17 }, (_, index) => {
      const angle = (index / 16) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * radiusX, Math.sin(angle) * radiusY, z * 0.48);
    });
    return new THREE.CatmullRomCurve3(points, true);
  }
  const influence = Math.max(0, 1 - Math.abs(y) / 1.45) * Math.max(0.4, 1 - Math.abs(z) / 2.1);
  const direction = y >= 0 ? 1 : -1;
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4.7, y, z),
    new THREE.Vector3(-2.5, y, z),
    new THREE.Vector3(-1.4, y + direction * influence * 0.42, z),
    new THREE.Vector3(-0.2, y + direction * influence * 0.88, z),
    new THREE.Vector3(1.35, y + direction * influence * 0.5, z),
    new THREE.Vector3(2.6, y + direction * influence * 0.12, z + Math.sin(y * 3) * influence * 0.2),
    new THREE.Vector3(4.7, y, z),
  ]);
}

function addRealMeshGeometry(
  world: THREE.Group,
  disposables: Array<{ dispose?: () => void }>,
  meshPreview: MeshPreviewPayload,
): { material: THREE.MeshStandardMaterial; scale: number } {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshPreview.vertices.flat(), 3));
  geometry.setIndex(meshPreview.triangles.flat());
  geometry.computeVertexNormals();
  geometry.center();
  geometry.computeBoundingSphere();
  const radius = Math.max(geometry.boundingSphere?.radius || 1, 1e-6);

  const material = new THREE.MeshStandardMaterial({ color: 0xc8c9cb, metalness: 0.7, roughness: 0.25, side: THREE.DoubleSide });
  world.add(new THREE.Mesh(geometry, material));
  const edgesGeometry = new THREE.EdgesGeometry(geometry, 24);
  const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x31443b, transparent: true, opacity: 0.55 });
  world.add(new THREE.LineSegments(edgesGeometry, edgesMaterial));
  disposables.push(geometry, material, edgesGeometry, edgesMaterial);
  return { material, scale: TARGET_RADIUS / radius };
}

function addRealBoundsGeometry(
  world: THREE.Group,
  disposables: Array<{ dispose?: () => void }>,
  bounds: BoundingBox,
): { material: THREE.MeshPhysicalMaterial; scale: number } {
  // No triangle preview available (e.g. the preview file is missing) -- show
  // the geometry's real, persisted bounding box rather than an unrelated
  // stand-in shape, so the size/proportions are still the true scenario's.
  const [sx, sy, sz] = bounds.size.map((value) => Math.max(value, 1e-6));
  const geometry = new THREE.BoxGeometry(sx, sy, sz);
  const radius = Math.sqrt(sx * sx + sy * sy + sz * sz) / 2;

  const material = new THREE.MeshPhysicalMaterial({ color: 0x8fd3b7, metalness: 0.22, roughness: 0.34, transparent: true, opacity: 0.16, side: THREE.DoubleSide });
  world.add(new THREE.Mesh(geometry, material));
  const edgesGeometry = new THREE.EdgesGeometry(geometry);
  const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x8bffc3, transparent: true, opacity: 0.8 });
  world.add(new THREE.LineSegments(edgesGeometry, edgesMaterial));
  disposables.push(geometry, material, edgesGeometry, edgesMaterial);
  return { material, scale: TARGET_RADIUS / Math.max(radius, 1e-6) };
}

function addResultGeometry(
  kind: GeometryKind,
  world: THREE.Group,
  disposables: Array<{ dispose?: () => void }>,
  meshPreview?: MeshPreviewPayload | null,
  meshBounds?: BoundingBox | null,
): { material: THREE.Material & { opacity: number; color: THREE.Color }; scale: number } {
  if (kind === 'upload' && meshPreview?.vertices?.length) {
    return addRealMeshGeometry(world, disposables, meshPreview);
  }
  if (kind === 'upload' && meshBounds) {
    return addRealBoundsGeometry(world, disposables, meshBounds);
  }

  let geometry: THREE.BufferGeometry;
  if (kind === 'cylinder') {
    geometry = new THREE.CylinderGeometry(0.78, 0.78, 1.9, 48, 1, false);
    geometry.rotateX(Math.PI / 2);
  } else if (kind === 'sphere') {
    geometry = new THREE.SphereGeometry(0.92, 48, 32);
  } else if (kind === 'duct') {
    geometry = new THREE.BoxGeometry(3.45, 1.65, 1.95);
  } else if (kind === 'elbow') {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.95, 0.85, 0),
      new THREE.Vector3(-0.75, 0.85, 0),
      new THREE.Vector3(0.18, 0.52, 0),
      new THREE.Vector3(0.52, -0.38, 0),
      new THREE.Vector3(0.52, -1.72, 0),
    ]);
    geometry = new THREE.TubeGeometry(path, 72, 0.48, 28, false);
  } else if (kind === 'cavity') {
    geometry = new THREE.BoxGeometry(2.6, 2.25, 2.25);
  } else if (kind === 'channel') {
    geometry = new THREE.BoxGeometry(3.6, 0.75, 2.1);
  } else if (kind === 'tube') {
    geometry = new THREE.CylinderGeometry(0.62, 0.62, 3.6, 40);
    geometry.rotateZ(Math.PI / 2);
  } else if (kind === 'step') {
    const shape = new THREE.Shape();
    shape.moveTo(-2.05, -0.95);
    shape.lineTo(-2.05, -0.2);
    shape.lineTo(-0.2, -0.2);
    shape.lineTo(-0.2, -0.95);
    shape.closePath();
    geometry = new THREE.ExtrudeGeometry(shape, { depth: 2.1, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
    geometry.translate(0, 0, -1.05);
  } else if (kind === 'tjunction' || kind === 'valve') {
    geometry = new THREE.CylinderGeometry(0.5, 0.5, 3.5, 32);
    geometry.rotateZ(Math.PI / 2);
  } else if (kind === 'building') {
    geometry = new THREE.BoxGeometry(1.05, 2.7, 1.05);
  } else if (kind === 'room') {
    geometry = new THREE.BoxGeometry(3.0, 1.9, 2.0);
  } else if (kind === 'coolingtower') {
    const profile = [
      new THREE.Vector2(0.76, -1.2),
      new THREE.Vector2(0.62, -0.72),
      new THREE.Vector2(0.46, -0.05),
      new THREE.Vector2(0.42, 0.38),
      new THREE.Vector2(0.5, 1.18),
    ];
    geometry = new THREE.LatheGeometry(profile, 48);
  } else if (kind === 'tubebank') {
    geometry = new THREE.CylinderGeometry(0.26, 0.26, 1.75, 24);
    geometry.rotateX(Math.PI / 2);
  } else if (kind === 'screen') {
    geometry = new THREE.BoxGeometry(0.14, 2.1, 2.1);
  } else if (kind === 'tank') {
    geometry = new THREE.CylinderGeometry(1.0, 1.0, 1.75, 32);
  } else {
    geometry = makeBodyGeometry();
  }

  const transparentShell = kind === 'duct' || kind === 'cavity' || kind === 'channel' || kind === 'tube'
    || kind === 'tjunction' || kind === 'valve' || kind === 'room' || kind === 'screen';
  const material = new THREE.MeshStandardMaterial({
    color: transparentShell ? 0x8fd3b7 : 0xc8c9cb,
    metalness: transparentShell ? 0.22 : 0.72,
    roughness: transparentShell ? 0.34 : 0.24,
    transparent: transparentShell,
    opacity: transparentShell ? 0.18 : 1,
    depthWrite: !transparentShell,
    side: transparentShell ? THREE.DoubleSide : THREE.FrontSide,
  });
  const body = new THREE.Mesh(geometry, material);
  body.rotation.x = kind === 'ahmed' || kind === 'upload' || kind === 'voxel' ? -0.04 : 0;
  world.add(body);

  const edgesGeometry = new THREE.EdgesGeometry(geometry, transparentShell ? 12 : 24);
  const edgesMaterial = new THREE.LineBasicMaterial({
    color: transparentShell ? 0x8bffc3 : 0x31443b,
    transparent: true,
    opacity: transparentShell ? 0.82 : 0.65,
  });
  world.add(new THREE.LineSegments(edgesGeometry, edgesMaterial));
  disposables.push(geometry, material, edgesGeometry, edgesMaterial);

  if (kind === 'cavity') {
    const lidGeometry = new THREE.BoxGeometry(2.72, 0.09, 2.35);
    const lidMaterial = new THREE.MeshStandardMaterial({ color: 0x73ff8c, emissive: 0x163a20, metalness: 0.35, roughness: 0.28 });
    const lid = new THREE.Mesh(lidGeometry, lidMaterial);
    lid.position.y = 1.18;
    world.add(lid);
    disposables.push(lidGeometry, lidMaterial);
  }

  if (kind === 'step') {
    const floorGeometry = new THREE.BoxGeometry(6.2, 0.1, 2.1);
    const floor = new THREE.Mesh(floorGeometry, material);
    floor.position.set(0.4, -0.98, 0);
    world.add(floor);
    disposables.push(floorGeometry);
  }

  if (kind === 'tjunction') {
    const branchGeometry = new THREE.CylinderGeometry(0.4, 0.4, 1.5, 28);
    const branch = new THREE.Mesh(branchGeometry, material);
    branch.position.y = 1.2;
    world.add(branch);
    const branchEdges = new THREE.EdgesGeometry(branchGeometry, 12);
    const branchEdgesMaterial = new THREE.LineBasicMaterial({ color: 0x8bffc3, transparent: true, opacity: 0.82 });
    world.add(new THREE.LineSegments(branchEdges, branchEdgesMaterial));
    disposables.push(branchGeometry, branchEdges, branchEdgesMaterial);
  }

  if (kind === 'valve') {
    const gateGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.15, 28);
    gateGeometry.rotateZ(Math.PI / 2);
    const gateMaterial = new THREE.MeshStandardMaterial({ color: 0xc8c9cb, metalness: 0.72, roughness: 0.24 });
    const gate = new THREE.Mesh(gateGeometry, gateMaterial);
    gate.position.y = -0.15;
    world.add(gate);
    disposables.push(gateGeometry, gateMaterial);
  }

  if (kind === 'room') {
    const furnitureGeometry = new THREE.BoxGeometry(0.7, 0.6, 0.7);
    const furnitureMaterial = new THREE.MeshStandardMaterial({ color: 0xc8c9cb, metalness: 0.72, roughness: 0.24 });
    const furniture = new THREE.Mesh(furnitureGeometry, furnitureMaterial);
    furniture.position.set(-0.5, -0.65, 0.25);
    world.add(furniture);
    disposables.push(furnitureGeometry, furnitureMaterial);
  }

  if (kind === 'tubebank') {
    [[-0.65, 0.42], [-0.65, -0.42], [0.65, 0.42], [0.65, -0.42]].forEach(([px, py]) => {
      const rod = new THREE.Mesh(geometry, material);
      rod.rotation.x = Math.PI / 2;
      rod.position.set(px, py, 0);
      world.add(rod);
    });
  }

  if (kind === 'screen') {
    const holeGeometry = new THREE.RingGeometry(0.1, 0.13, 16);
    const holeMaterial = new THREE.MeshBasicMaterial({ color: 0x8cff70, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    [[0.6, 0.6], [0.6, -0.6], [0, 0.6], [0, -0.6], [0, 0], [-0.6, 0.6], [-0.6, -0.6]].forEach(([hy, hz]) => {
      const hole = new THREE.Mesh(holeGeometry, holeMaterial);
      hole.position.set(0.08, hy, hz);
      hole.rotation.y = Math.PI / 2;
      world.add(hole);
    });
    disposables.push(holeGeometry, holeMaterial);
  }

  if (kind === 'tank') {
    const roofGeometry = new THREE.ConeGeometry(1.03, 0.26, 32);
    const roof = new THREE.Mesh(roofGeometry, material);
    roof.position.y = 1.0;
    world.add(roof);
    disposables.push(roofGeometry);
  }

  return { material, scale: 1 };
}

function formatNumber(value: number | undefined, fallback: string) {
  if (value === undefined || Number.isNaN(value)) return fallback;
  if (Math.abs(value) >= 100) return value.toFixed(1);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toExponential(2);
}

export default function Viewer3D({ field, simId, stats, geometryKind = 'ahmed', geometryLabel = 'Geometria simulada', meshPreview = null, meshBounds = null }: Viewer3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<ResultField>(field);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  const [paused, setPaused] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const pausedRef = useRef(paused);

  useEffect(() => { fieldRef.current = field; }, [field]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const range = useMemo(() => {
    if (field === 'velocity') return {
      min: formatNumber(stats?.velocity_stats?.min, '0.00'),
      max: formatNumber(stats?.velocity_stats?.max, '1.00'),
      source: stats?.velocity_stats ? 'estatística do solver' : 'escala normalizada',
    };
    if (field === 'pressure') return {
      min: formatNumber(stats?.rho_stats?.min, '0.00'),
      max: formatNumber(stats?.rho_stats?.max, '1.00'),
      source: stats?.rho_stats ? 'densidade do solver' : 'escala normalizada',
    };
    if (field === 'concentration') return {
      // Concentration reuses the thermal/scalar solver field (0=ar limpo,
      // 1=gás puro) -- shown as a percentage here instead of raw 0-1.
      min: formatNumber((stats?.temperature_stats?.min ?? 0) * 100, '0.0'),
      max: formatNumber((stats?.temperature_stats?.max ?? 1) * 100, '100.0'),
      source: stats?.temperature_stats ? 'estatística do solver' : 'escala normalizada',
    };
    return {
      min: formatNumber(stats?.temperature_stats?.min, '0.00'),
      max: formatNumber(stats?.temperature_stats?.max, '1.00'),
      source: stats?.temperature_stats ? 'estatística do solver' : 'escala normalizada',
    };
  }, [field, stats]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setSupported(false);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x070a08, 1);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.touchAction = 'none';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070a08, 0.056);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(8.2, 5.2, 8.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.rotateSpeed = 0.68;
    controls.zoomSpeed = 0.82;
    controls.panSpeed = 0.72;
    controls.minDistance = 4.6;
    controls.maxDistance = 17;
    controls.minPolarAngle = 0.04;
    controls.maxPolarAngle = Math.PI - 0.04;
    controls.target.set(0, 0, 0);
    controls.saveState();
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xdfffee, 0x07100b, 1.65));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
    keyLight.position.set(4, 8, 5);
    scene.add(keyLight);
    const cyanLight = new THREE.PointLight(0x65d8ff, 28, 18);
    cyanLight.position.set(-4, 2, -4);
    scene.add(cyanLight);
    const warmLight = new THREE.PointLight(0xff754f, 0, 15);
    warmLight.position.set(0, 3, 2);
    scene.add(warmLight);

    const world = new THREE.Group();
    scene.add(world);
    const disposables: Array<{ dispose?: () => void }> = [];

    const domainGeometry = new THREE.BoxGeometry(9.2, 4.5, 5.3);
    const domainEdgesGeometry = new THREE.EdgesGeometry(domainGeometry);
    const domainMaterial = new THREE.LineBasicMaterial({ color: 0x4b665a, transparent: true, opacity: 0.55 });
    world.add(new THREE.LineSegments(domainEdgesGeometry, domainMaterial));
    disposables.push(domainGeometry, domainEdgesGeometry, domainMaterial);

    const floor = new THREE.GridHelper(14, 28, 0x315c4b, 0x1a3028);
    floor.position.y = -2.26;
    floor.material.transparent = true;
    floor.material.opacity = 0.38;
    world.add(floor);
    disposables.push(floor.geometry, floor.material);

    const geometryRoot = new THREE.Group();
    world.add(geometryRoot);
    const { material: bodyMaterial, scale: geometryScale } = addResultGeometry(geometryKind, geometryRoot, disposables, meshPreview, meshBounds);
    geometryRoot.scale.setScalar(geometryScale);

    type AnimatedMaterial = { material: THREE.Material & { opacity: number }; baseOpacity: number };
    const groups: Record<ResultField, THREE.Group> = {
      velocity: new THREE.Group(), pressure: new THREE.Group(), temperature: new THREE.Group(), concentration: new THREE.Group(),
    };
    const groupMaterials: Record<ResultField, AnimatedMaterial[]> = { velocity: [], pressure: [], temperature: [], concentration: [] };
    (Object.keys(groups) as ResultField[]).forEach((key) => {
      groups[key].userData.mix = key === fieldRef.current ? 1 : 0;
      world.add(groups[key]);
    });
    const register = (key: ResultField, material: AnimatedMaterial['material'], baseOpacity: number) => {
      material.transparent = true;
      material.opacity = key === fieldRef.current ? baseOpacity : 0;
      groupMaterials[key].push({ material, baseOpacity });
      disposables.push(material);
    };

    const velocityCurves: Array<THREE.Curve<THREE.Vector3>> = [];
    const velocityTracers: THREE.Mesh[] = [];
    const tracerGeometry = new THREE.SphereGeometry(0.055, 8, 8);
    disposables.push(tracerGeometry);
    const velocityPalette = [0x2d7fff, 0x46c7ff, 0x66f0c2, 0xb8ff72, 0xffd75a, 0xff754f];
    for (let zIndex = -3; zIndex <= 3; zIndex += 1) {
      for (let yIndex = -4; yIndex <= 4; yIndex += 1) {
        const y = yIndex * 0.36;
        const z = zIndex * 0.55;
        const curve = makeVelocityCurve(y, z, geometryKind);
        velocityCurves.push(curve);
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(56));
        const speedBand = Math.min(velocityPalette.length - 1, Math.max(0, yIndex + 4));
        const lineMaterial = new THREE.LineBasicMaterial({ color: velocityPalette[speedBand], transparent: true });
        groups.velocity.add(new THREE.Line(lineGeometry, lineMaterial));
        register('velocity', lineMaterial, 0.68);
        disposables.push(lineGeometry);

        if ((zIndex + yIndex + 7) % 3 === 0) {
          const tracerMaterial = new THREE.MeshBasicMaterial({ color: velocityPalette[speedBand], transparent: true });
          const tracer = new THREE.Mesh(tracerGeometry, tracerMaterial);
          tracer.userData.curve = velocityCurves.length - 1;
          tracer.userData.offset = ((zIndex + 3) * 0.11 + (yIndex + 4) * 0.07) % 1;
          groups.velocity.add(tracer);
          velocityTracers.push(tracer);
          register('velocity', tracerMaterial, 1);
        }
      }
    }

    const pressureSlices: THREE.Mesh[] = [];
    const verticalFlow = geometryKind === 'coolingtower';
    for (let index = 0; index < 11; index += 1) {
      const ratio = index / 10;
      const geometry = new THREE.PlaneGeometry(4.0, 4.7, 1, 1);
      const color = new THREE.Color().setHSL(0.68 - ratio * 0.68, 0.88, 0.56);
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const plane = new THREE.Mesh(geometry, material);
      if (verticalFlow) {
        plane.position.y = -2 + ratio * 4;
        plane.rotation.x = Math.PI / 2;
      } else {
        plane.position.x = -4 + ratio * 8;
        plane.rotation.y = Math.PI / 2;
      }
      plane.userData.phase = ratio;
      groups.pressure.add(plane);
      pressureSlices.push(plane);
      register('pressure', material, 0.075);
      disposables.push(geometry);
    }

    const pressureRingGeometry = new THREE.RingGeometry(0.88, 0.94, 48);
    disposables.push(pressureRingGeometry);
    for (let index = 0; index < 6; index += 1) {
      const material = new THREE.MeshBasicMaterial({ color: index < 3 ? 0xff5f59 : 0x4dbbff, transparent: true, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(pressureRingGeometry, material);
      if (verticalFlow) {
        ring.position.y = index < 3 ? -1.25 - index * 0.3 : 1.25 + (index - 3) * 0.32;
        ring.rotation.x = Math.PI / 2;
      } else {
        ring.position.x = index < 3 ? -1.6 - index * 0.42 : 1.5 + (index - 3) * 0.5;
        ring.rotation.y = Math.PI / 2;
      }
      ring.scale.setScalar(1 + (index % 3) * 0.23);
      groups.pressure.add(ring);
      register('pressure', material, 0.68 - (index % 3) * 0.14);
    }

    const particleCount = window.innerWidth < 700 ? 180 : 340;
    const thermalGeometry = new THREE.BufferGeometry();
    const thermalPositions = new Float32Array(particleCount * 3);
    const thermalColors = new Float32Array(particleCount * 3);
    const thermalSeeds: Array<{ speed: number; phase: number }> = [];
    const cold = new THREE.Color(0x43bfff);
    const hot = new THREE.Color(0xff5b45);
    for (let index = 0; index < particleCount; index += 1) {
      const x = (Math.random() - 0.5) * 5.8;
      const y = (Math.random() - 0.5) * 3.7;
      const z = (Math.random() - 0.5) * 3.8;
      thermalPositions.set([x, y, z], index * 3);
      const heat = Math.max(0, 1 - Math.sqrt(x * x + y * y * 0.5 + z * z) / 4.3);
      const color = cold.clone().lerp(hot, heat);
      thermalColors.set([color.r, color.g, color.b], index * 3);
      thermalSeeds.push({ speed: 0.35 + Math.random() * 0.8, phase: Math.random() * Math.PI * 2 });
    }
    thermalGeometry.setAttribute('position', new THREE.BufferAttribute(thermalPositions, 3));
    thermalGeometry.setAttribute('color', new THREE.BufferAttribute(thermalColors, 3));
    // Points aren't affected by the parent group's scale the way meshes are
    // (PointsMaterial.size is a fixed screen-space-ish value) -- scale it
    // manually so particles stay proportionate to a rescaled real mesh.
    const thermalMaterial = new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    groups.temperature.add(new THREE.Points(thermalGeometry, thermalMaterial));
    register('temperature', thermalMaterial, 0.9);
    disposables.push(thermalGeometry);

    const thermalRingGeometry = new THREE.TorusGeometry(1.05, 0.025, 8, 56);
    disposables.push(thermalRingGeometry);
    const thermalRings: THREE.Mesh[] = [];
    for (let index = 0; index < 6; index += 1) {
      const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().lerpColors(hot, cold, index / 5), transparent: true, depthWrite: false });
      const ring = new THREE.Mesh(thermalRingGeometry, material);
      ring.rotation.x = Math.PI / 2;
      ring.scale.setScalar(0.85 + index * 0.2);
      ring.userData.phase = index / 6;
      groups.temperature.add(ring);
      thermalRings.push(ring);
      register('temperature', material, 0.72 - index * 0.08);
    }

    // Gas dispersion plume: particles originate near the leak (west side,
    // matching the wind's west->east inlet convention) and drift downwind
    // while spreading and fading -- a hazard-style green (safe/dilute) to
    // red (concentrated, near the source) gradient, not a literal replot of
    // the solver's per-cell grid (like the other fields' particle systems,
    // this is calibrated to the solver's summary stats only, via the legend).
    const plumeCount = window.innerWidth < 700 ? 160 : 300;
    const plumeGeometry = new THREE.BufferGeometry();
    const plumePositions = new Float32Array(plumeCount * 3);
    const plumeColors = new Float32Array(plumeCount * 3);
    const plumeSeeds: Array<{ speed: number; spread: number; phase: number; rise: number }> = [];
    const plumeNear = new THREE.Color(0xff4f4f);
    const plumeFar = new THREE.Color(0x1f7a52);
    for (let index = 0; index < plumeCount; index += 1) {
      const age = Math.random();
      const x = -4.4 + age * 8.4;
      const y = (Math.random() - 0.5) * 0.6 * (0.4 + age);
      const z = (Math.random() - 0.5) * 0.6 * (0.4 + age);
      plumePositions.set([x, y, z], index * 3);
      const color = plumeNear.clone().lerp(plumeFar, Math.min(1, age * 1.3));
      plumeColors.set([color.r, color.g, color.b], index * 3);
      plumeSeeds.push({ speed: 0.5 + Math.random() * 0.6, spread: 0.4 + Math.random() * 0.9, phase: Math.random() * Math.PI * 2, rise: Math.random() < 0.5 ? 1 : -1 });
    }
    plumeGeometry.setAttribute('position', new THREE.BufferAttribute(plumePositions, 3));
    plumeGeometry.setAttribute('color', new THREE.BufferAttribute(plumeColors, 3));
    const plumeMaterial = new THREE.PointsMaterial({ size: 0.075, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    groups.concentration.add(new THREE.Points(plumeGeometry, plumeMaterial));
    register('concentration', plumeMaterial, 0.85);
    disposables.push(plumeGeometry);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let visible = true;
    const intersectionObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.02 });
    intersectionObserver.observe(mount);
    const onVisibility = () => { visible = !document.hidden; };
    document.addEventListener('visibilitychange', onVisibility);

    setReady(true);
    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!visible) return;
      const delta = Math.min(clock.getDelta(), 0.032);
      const elapsed = clock.elapsedTime;
      const currentField = fieldRef.current;

      (Object.keys(groups) as ResultField[]).forEach((key) => {
        const target = key === currentField ? 1 : 0;
        groups[key].userData.mix += (target - groups[key].userData.mix) * Math.min(1, delta * 8);
        const mix = groups[key].userData.mix;
        groups[key].visible = mix > 0.012;
        groupMaterials[key].forEach(({ material, baseOpacity }) => { material.opacity = baseOpacity * mix; });
      });

      const targetBodyColor = currentField === 'pressure' ? 0xa7b5ae : currentField === 'temperature' ? 0xb9aaa0 : 0xc8c9cb;
      bodyMaterial.color.lerp(new THREE.Color(targetBodyColor), 0.045);
      warmLight.intensity += ((currentField === 'temperature' ? 36 : 0) - warmLight.intensity) * 0.045;

      if (!pausedRef.current) {
        velocityTracers.forEach((tracer) => {
          const t = (elapsed * 0.13 + tracer.userData.offset) % 1;
          tracer.position.copy(velocityCurves[tracer.userData.curve].getPoint(t));
        });
        pressureSlices.forEach((slice) => {
          const wave = (Math.sin(elapsed * 2.2 - slice.userData.phase * Math.PI * 2) + 1) / 2;
          slice.scale.setScalar(0.92 + wave * 0.13);
        });
        const positions = thermalGeometry.attributes.position.array as Float32Array;
        for (let index = 0; index < particleCount; index += 1) {
          const offset = index * 3;
          positions[offset + 1] += thermalSeeds[index].speed * 0.008;
          positions[offset] += Math.sin(elapsed * 0.8 + thermalSeeds[index].phase) * 0.0018;
          if (positions[offset + 1] > 2.05) positions[offset + 1] = -1.95;
        }
        thermalGeometry.attributes.position.needsUpdate = true;
        thermalRings.forEach((ring) => {
          const pulse = (elapsed * 0.12 + ring.userData.phase) % 1;
          ring.position.y = pulse * 2.5 - 0.8;
          ring.scale.setScalar(0.84 + pulse * 0.76);
        });
        const plumePos = plumeGeometry.attributes.position.array as Float32Array;
        const plumeCol = plumeGeometry.attributes.color.array as Float32Array;
        for (let index = 0; index < plumeCount; index += 1) {
          const offset = index * 3;
          const seed = plumeSeeds[index];
          plumePos[offset] += seed.speed * 0.014;
          plumePos[offset + 1] += seed.rise * 0.0015 * seed.spread;
          plumePos[offset + 2] += Math.sin(elapsed * 0.6 + seed.phase) * 0.0012 * seed.spread;
          const age = (plumePos[offset] + 4.4) / 8.4;
          const color = plumeNear.clone().lerp(plumeFar, Math.min(1, Math.max(0, age) * 1.3));
          plumeCol.set([color.r, color.g, color.b], offset);
          if (plumePos[offset] > 4.4) { plumePos[offset] = -4.4; plumePos[offset + 1] = (Math.random() - 0.5) * 0.3; plumePos[offset + 2] = (Math.random() - 0.5) * 0.3; }
        }
        plumeGeometry.attributes.position.needsUpdate = true;
        plumeGeometry.attributes.color.needsUpdate = true;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      setReady(false);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      controls.dispose();
      controlsRef.current = null;
      disposables.forEach((item) => item.dispose?.());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [simId, geometryKind, meshPreview, meshBounds]);

  const resetCamera = () => controlsRef.current?.reset();
  const toggleFullscreen = async () => {
    if (!viewerRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await viewerRef.current.requestFullscreen();
  };

  const copy = { ...FIELD_COPY[field], description: fieldDescription(field, geometryKind) };
  return (
    <div className="result-viewer" ref={viewerRef} data-field={field} role="group" aria-label={`Resultados 3D para ${geometryLabel}. Use os controles para girar, ampliar e alternar a animação.`}>
      <div ref={mountRef} className="result-viewer__canvas" />
      {!supported && <div className="result-viewer__fallback">A visualização WebGL não está disponível neste dispositivo.</div>}
      {!ready && supported && <div className="result-viewer__loading"><span>Reconstruindo domínio tridimensional</span><i /></div>}

      <div className="result-viewer__tools" aria-label="Controles da visualização">
        <button type="button" onClick={resetCamera} title="Restaurar câmera" aria-label="Restaurar câmera"><RotateCcw size={16} /></button>
        <button type="button" onClick={() => setPaused((value) => !value)} title={paused ? 'Retomar animação' : 'Pausar animação'} aria-label={paused ? 'Retomar animação' : 'Pausar animação'}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
        <button type="button" onClick={toggleFullscreen} title="Tela cheia" aria-label="Abrir visualização em tela cheia"><Maximize2 size={16} /></button>
      </div>

      <div className="result-viewer__orientation" aria-hidden="true"><i className="axis-x" />X<i className="axis-y" />Y<i className="axis-z" />Z</div>
      <div className="result-viewer__hint"><span>Arraste</span> para girar 360° · <span>Scroll</span> para zoom</div>

      <div className="result-viewer__legend" key={field}>
        <div><strong>{copy.label}</strong><span>{range.source}</span></div>
        <i style={{ background: `linear-gradient(90deg, ${copy.colors.join(',')})` }} />
        <div className="result-viewer__range"><span>{range.min}</span><small>{copy.unit}</small><span>{range.max}</span></div>
      </div>

      <p className="result-viewer__description" key={`${field}-description`}>{copy.description}</p>
    </div>
  );
}
