from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    min: list[float]
    max: list[float]
    size: list[float]


class GeometryTransformIn(BaseModel):
    """Preparation step params. Re-applying always starts from the original
    upload (see Geometry.transformations docstring) -- this is a full
    description of the desired state, not a delta."""
    unit: Literal["mm", "cm", "m", "in"] = "mm"
    scale: float = Field(1.0, gt=0, le=1_000_000)
    rotate_x: float = Field(0.0, ge=-360, le=360)
    rotate_y: float = Field(0.0, ge=-360, le=360)
    rotate_z: float = Field(0.0, ge=-360, le=360)
    up_axis: Literal["x", "y", "z"] = "z"
    center_xy: bool = False
    ground_align: bool = False
    invert_normals: bool = False
    simplify_target_faces: Optional[int] = Field(None, gt=3, le=5_000_000)


class VoxelizeIn(BaseModel):
    geometry_id: str
    resolution: int = Field(64, ge=8, le=1024)
    fill_interior: bool = True


class GeometryPreviewPayload(BaseModel):
    vertices: list[list[float]]
    triangles: list[list[int]]
    truncated: bool


class GeometryOut(BaseModel):
    id: str
    project_id: Optional[str] = None
    original_filename: str
    format: str
    status: str
    dimension: str
    units: str
    vertex_count: Optional[int] = None
    face_count: Optional[int] = None
    point_count: Optional[int] = None
    bounds: Optional[BoundingBox] = None
    center: Optional[list[float]] = None
    watertight: Optional[bool] = None
    normals_consistent: Optional[bool] = None
    transformations: dict
    grid_path: Optional[str] = None
    grid_shape: Optional[list[int]] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GeometryUploadOut(GeometryOut):
    size_mb: float
    preview: Optional[GeometryPreviewPayload] = None


class GeometryPrepareOut(GeometryOut):
    preview: Optional[GeometryPreviewPayload] = None
    notes: list[str] = []


class VoxelizeOut(BaseModel):
    geometry_id: str
    grid_id: str
    grid_path: str
    grid_shape: list[int]
    total_cells: int
    solid_cells: int
    fluid_cells: int
