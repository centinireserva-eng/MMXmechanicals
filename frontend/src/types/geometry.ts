export type GeometryDimension = '2D' | '3D';

export type GeometryStatus = 'uploaded' | 'analyzed' | 'prepared' | 'voxelized' | 'error';

export interface BoundingBox {
  min: number[];
  max: number[];
  size: number[];
}

export interface MeshPreviewPayload {
  vertices: number[][];
  triangles: number[][];
  truncated: boolean;
}

export interface GeometryRecord {
  id: string;
  project_id: string | null;
  original_filename: string;
  format: string;
  status: GeometryStatus;
  dimension: GeometryDimension;
  units: string;
  vertex_count: number | null;
  face_count: number | null;
  point_count: number | null;
  bounds: BoundingBox | null;
  center: number[] | null;
  watertight: boolean | null;
  normals_consistent: boolean | null;
  transformations: GeometryTransform;
  grid_path: string | null;
  grid_shape: number[] | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeometryUploadResult extends GeometryRecord {
  size_mb: number;
  preview: MeshPreviewPayload | null;
}

export interface GeometryPrepareResult extends GeometryRecord {
  preview: MeshPreviewPayload | null;
  notes: string[];
}

export type LengthUnit = 'mm' | 'cm' | 'm' | 'in';
export type UpAxis = 'x' | 'y' | 'z';

export interface GeometryTransform {
  unit: LengthUnit;
  scale: number;
  rotate_x: number;
  rotate_y: number;
  rotate_z: number;
  up_axis: UpAxis;
  center_xy: boolean;
  ground_align: boolean;
  invert_normals: boolean;
  simplify_target_faces: number | null;
}

export const DEFAULT_GEOMETRY_TRANSFORM: GeometryTransform = {
  unit: 'mm',
  scale: 1,
  rotate_x: 0,
  rotate_y: 0,
  rotate_z: 0,
  up_axis: 'z',
  center_xy: false,
  ground_align: false,
  invert_normals: false,
  simplify_target_faces: null,
};

export interface VoxelizeResult {
  geometry_id: string;
  grid_id: string;
  grid_path: string;
  grid_shape: number[];
  total_cells: number;
  solid_cells: number;
  fluid_cells: number;
}
