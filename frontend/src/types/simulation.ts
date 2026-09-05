export type SimulationStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ScenarioType = 'generic' | 'gas_dispersion';

export interface BoundaryConditionDef {
  face: string;
  type: string;
  params?: Record<string, number>;
}

export interface SolverStatsMinMaxMean {
  min: number;
  max: number;
  mean: number;
}

// The LBM solver only ever reports max/mean for the velocity magnitude (see
// LBMSolver._save_snapshot in backend/app/services/solver/lbm.py) -- there is
// no "min velocity" figure to show.
export interface SolverVelocityStats {
  max: number;
  mean: number;
}

export interface SimulationFieldSnapshot {
  iteration: number;
  rho_stats: SolverStatsMinMaxMean;
  velocity_stats: SolverVelocityStats;
  temperature_stats?: SolverStatsMinMaxMean;
}

export interface SimulationResultsSummary {
  converged: boolean;
  total_iterations: number;
  compute_time: number;
  grid_size: string;
  gpu_used: boolean;
  scenario_type?: ScenarioType;
  gas_relative_density?: number | null;
}

// The full payload written to disk by LBMSolver.run() -- served by
// GET /api/simulations/{id}/results while the results file is still present.
export interface SimulationResultsFull extends SimulationResultsSummary {
  iterations: number[];
  residuals: number[];
  field_snapshots: SimulationFieldSnapshot[];
  final: SimulationFieldSnapshot;
}

// If the results file is missing, the endpoint falls back to the smaller
// summary persisted on the Simulation row itself.
export type SimulationResultsPayload = SimulationResultsFull | SimulationResultsSummary;

export interface SimulationRecord {
  id: string;
  name: string;
  status: SimulationStatus;
  progress: number;
  geometry_id: string | null;
  iterations_completed: number;
  grid_size: string;
  solver_type: string;
  viscosity: number;
  density: number;
  inlet_velocity: number;
  turbulence_model: string;
  max_iterations: number;
  error_message: string | null;
  results_summary: Partial<SimulationResultsSummary>;
  gpu_used: boolean;
  compute_time_seconds: number | null;
}

// Body of POST /api/simulations/ -- a superset of the generic and gas
// dispersion scenario shapes built by SimulationNew.tsx.
export interface SimulationCreatePayload {
  project_id: string;
  name: string;
  geometry_id?: string;
  grid_x: number;
  grid_y: number;
  grid_z: number;
  viscosity?: number;
  density?: number;
  inlet_velocity?: number;
  max_iterations?: number;
  turbulence_model?: string;
  enable_thermal?: boolean;
  thermal_diffusivity?: number;
  T_inlet?: number;
  T_wall?: number;
  boundary_conditions?: BoundaryConditionDef[];
  scenario_type?: ScenarioType;
  gas_relative_density?: number;
  gravity?: number;
  leak_location?: [number, number, number];
  leak_radius_cells?: number;
  leak_concentration?: number;
  grid_path?: string | null;
  async?: boolean;
}

export interface SimulationCreateResponse {
  simulation_id: string;
  status: string;
  results?: SimulationResultsSummary;
}
