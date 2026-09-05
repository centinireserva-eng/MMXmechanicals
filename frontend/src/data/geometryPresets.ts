export type GeometryKind = 'cylinder' | 'duct' | 'sphere' | 'elbow' | 'ahmed' | 'cavity' | 'channel' | 'tube' | 'step'
  | 'tjunction' | 'valve' | 'building' | 'room' | 'coolingtower' | 'tubebank' | 'screen' | 'tank' | 'upload' | 'voxel';

export interface GeometryPreset {
  id: string;
  name: string;
  dimension: '2D' | '3D';
  category: 'Internos' | 'Externos' | 'Industriais' | 'Validação';
  difficulty: 'Iniciante' | 'Intermediário' | 'Avançado';
  reynolds: number;
  kind: GeometryKind;
  turbulence: 'LES' | 'Laminar';
  thermal: boolean;
  added: number;
  defaults: {
    viscosity: number;
    inletVelocity: number;
    turbulenceModel: 'les' | 'none';
    enableThermal?: boolean;
  };
}

export const GEOMETRY_PRESETS: GeometryPreset[] = [
  { id: 'cylinder-flow', name: 'Escoamento sobre Cilindro', dimension: '2D', category: 'Externos', difficulty: 'Iniciante', reynolds: 1000, kind: 'cylinder', turbulence: 'LES', thermal: false, added: 6, defaults: { viscosity: 0.02, inletVelocity: 0.1, turbulenceModel: 'none' } },
  { id: '3d-duct', name: 'Duto Retangular 3D', dimension: '3D', category: 'Internos', difficulty: 'Iniciante', reynolds: 5000, kind: 'duct', turbulence: 'LES', thermal: false, added: 5, defaults: { viscosity: 0.03, inletVelocity: 0.08, turbulenceModel: 'les' } },
  { id: 'sphere-3d', name: 'Escoamento sobre Esfera', dimension: '3D', category: 'Externos', difficulty: 'Intermediário', reynolds: 10000, kind: 'sphere', turbulence: 'LES', thermal: false, added: 4, defaults: { viscosity: 0.02, inletVelocity: 0.1, turbulenceModel: 'les' } },
  { id: 'elbow-90', name: 'Curva de 90°', dimension: '3D', category: 'Industriais', difficulty: 'Intermediário', reynolds: 20000, kind: 'elbow', turbulence: 'LES', thermal: false, added: 3, defaults: { viscosity: 0.02, inletVelocity: 0.12, turbulenceModel: 'les' } },
  { id: 'ahmed-body', name: 'Corpo de Ahmed', dimension: '3D', category: 'Validação', difficulty: 'Avançado', reynolds: 40000, kind: 'ahmed', turbulence: 'LES', thermal: false, added: 2, defaults: { viscosity: 0.015, inletVelocity: 0.15, turbulenceModel: 'les' } },
  { id: 'lid-cavity', name: 'Cavidade com Tampa', dimension: '2D', category: 'Validação', difficulty: 'Intermediário', reynolds: 1000, kind: 'cavity', turbulence: 'Laminar', thermal: true, added: 1, defaults: { viscosity: 0.02, inletVelocity: 0.1, turbulenceModel: 'none', enableThermal: true } },
  // These three already existed as backend presets (app/routers/geometries.py PRESETS)
  // but had no frontend card -- ids below must match those dict keys exactly, since
  // that's what GeometryAPI.generate() sends to /api/geometries/{id}/generate.
  { id: 'channel-flow', name: 'Canal Plano 2D', dimension: '2D', category: 'Internos', difficulty: 'Iniciante', reynolds: 800, kind: 'channel', turbulence: 'Laminar', thermal: false, added: 9, defaults: { viscosity: 0.05, inletVelocity: 0.08, turbulenceModel: 'none' } },
  // viscosity 0.01/velocity 0.15 (Re=480, matching the backend's own dormant
  // preset config) diverges to NaN within 3000 iterations on a 32^3 grid --
  // verified via a real run. 0.02/0.1 (Re=160, in line with elbow-90/sphere-3d)
  // completes cleanly.
  { id: 'backward-step', name: 'Degrau Atrás', dimension: '2D', category: 'Validação', difficulty: 'Intermediário', reynolds: 2000, kind: 'step', turbulence: 'LES', thermal: false, added: 8, defaults: { viscosity: 0.02, inletVelocity: 0.1, turbulenceModel: 'les' } },
  { id: 'heat-tube', name: 'Tubo com Troca Térmica', dimension: '3D', category: 'Industriais', difficulty: 'Intermediário', reynolds: 8000, kind: 'tube', turbulence: 'LES', thermal: true, added: 7, defaults: { viscosity: 0.02, inletVelocity: 0.1, turbulenceModel: 'les', enableThermal: true } },
  // Plant/facility-shaped presets (piping, HVAC, process equipment) --
  // ids match new backend PRESETS entries (app/routers/geometries.py).
  // All 8 verified with a real run at grid=32 (the app's default first-run
  // grid size) before shipping the default viscosity/velocity below --
  // curved, only-coarsely-resolved obstacles (tower/tank/tube bank) needed a
  // gentler regime than their first guess to avoid diverging to NaN.
  { id: 't-junction', name: 'Bifurcação em T', dimension: '3D', category: 'Industriais', difficulty: 'Intermediário', reynolds: 3500, kind: 'tjunction', turbulence: 'LES', thermal: false, added: 17, defaults: { viscosity: 0.02, inletVelocity: 0.08, turbulenceModel: 'les' } },
  { id: 'gate-valve', name: 'Válvula Gaveta', dimension: '3D', category: 'Industriais', difficulty: 'Intermediário', reynolds: 3000, kind: 'valve', turbulence: 'LES', thermal: false, added: 16, defaults: { viscosity: 0.025, inletVelocity: 0.08, turbulenceModel: 'les' } },
  { id: 'building', name: 'Prédio', dimension: '3D', category: 'Externos', difficulty: 'Iniciante', reynolds: 6000, kind: 'building', turbulence: 'LES', thermal: false, added: 15, defaults: { viscosity: 0.02, inletVelocity: 0.1, turbulenceModel: 'les' } },
  { id: 'ventilated-room', name: 'Sala Ventilada', dimension: '3D', category: 'Internos', difficulty: 'Iniciante', reynolds: 400, kind: 'room', turbulence: 'Laminar', thermal: true, added: 14, defaults: { viscosity: 0.03, inletVelocity: 0.05, turbulenceModel: 'none', enableThermal: true } },
  { id: 'cooling-tower', name: 'Torre de Resfriamento', dimension: '3D', category: 'Industriais', difficulty: 'Avançado', reynolds: 1200, kind: 'coolingtower', turbulence: 'LES', thermal: true, added: 13, defaults: { viscosity: 0.035, inletVelocity: 0.04, turbulenceModel: 'les', enableThermal: true } },
  { id: 'tube-bank', name: 'Banco de Tubos', dimension: '3D', category: 'Industriais', difficulty: 'Avançado', reynolds: 1500, kind: 'tubebank', turbulence: 'LES', thermal: true, added: 12, defaults: { viscosity: 0.04, inletVelocity: 0.04, turbulenceModel: 'les', enableThermal: true } },
  { id: 'perforated-screen', name: 'Grade Perfurada', dimension: '3D', category: 'Industriais', difficulty: 'Intermediário', reynolds: 1000, kind: 'screen', turbulence: 'LES', thermal: false, added: 11, defaults: { viscosity: 0.03, inletVelocity: 0.06, turbulenceModel: 'les' } },
  { id: 'storage-tank', name: 'Tanque de Armazenamento', dimension: '3D', category: 'Industriais', difficulty: 'Intermediário', reynolds: 5000, kind: 'tank', turbulence: 'LES', thermal: false, added: 10, defaults: { viscosity: 0.03, inletVelocity: 0.06, turbulenceModel: 'les' } },
];

export function getGeometryPreset(id: string | null | undefined) {
  return GEOMETRY_PRESETS.find((preset) => preset.id === id);
}
