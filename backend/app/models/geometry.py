from sqlalchemy import Column, String, DateTime, ForeignKey, JSON, Enum, Integer, Boolean, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base
import enum, uuid


class GeometryStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    ANALYZED = "analyzed"
    PREPARED = "prepared"
    VOXELIZED = "voxelized"
    ERROR = "error"


class Geometry(Base):
    """A real imported 3D/2D scenario (mesh or drawing), persisted so a
    simulation can keep a durable, backend-owned reference to the exact
    scenario it used -- instead of the previous localStorage/router-state
    only linkage."""
    __tablename__ = "geometries"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    original_filename = Column(String(500), nullable=False)
    stored_path = Column(String(500), nullable=False)
    preview_path = Column(String(500), nullable=True)
    format = Column(String(20), nullable=False)
    status = Column(Enum(GeometryStatus), default=GeometryStatus.UPLOADED, nullable=False)
    dimension = Column(String(5), nullable=False)  # "2D" | "3D"
    units = Column(String(10), default="mm", nullable=False)
    vertex_count = Column(Integer, nullable=True)
    face_count = Column(Integer, nullable=True)
    point_count = Column(Integer, nullable=True)
    bounds = Column(JSON, nullable=True)          # {min:[x,y,z], max:[x,y,z], size:[x,y,z]}
    center = Column(JSON, nullable=True)           # [x, y, z]
    watertight = Column(Boolean, nullable=True)
    normals_consistent = Column(Boolean, nullable=True)
    # Last-applied preparation params (unit, scale, rotation, centering,
    # ground alignment, normal inversion, simplification target). Preparing
    # again re-applies from the untouched `stored_path`, it does not stack --
    # so this JSON is always a complete description of the current state,
    # not a diff/history log.
    transformations = Column(JSON, default=dict, nullable=False)
    grid_path = Column(String(500), nullable=True)
    grid_shape = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User")
    project = relationship("Project")
