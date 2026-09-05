from sqlalchemy import Column, String, DateTime, ForeignKey, Text, JSON, Enum, Integer, Float, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base
import enum, uuid
class SimulationStatus(str, enum.Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
class Simulation(Base):
    __tablename__ = "simulations"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    # Durable link to the imported scenario this run used (nullable: the
    # built-in synthetic presets have no Geometry row). This is what lets
    # results reopen the *same* geometry instead of a generic stand-in --
    # see docs/geometry continuity requirement.
    geometry_id = Column(String(36), ForeignKey("geometries.id"), nullable=True)
    solver_type = Column(String(50), default="lbm_d3q19")
    grid_size_x = Column(Integer, nullable=False)
    grid_size_y = Column(Integer, nullable=False)
    grid_size_z = Column(Integer, nullable=False)
    viscosity = Column(Float, default=0.01)
    density = Column(Float, default=1.0)
    inlet_velocity = Column(Float, default=1.0)
    outlet_pressure = Column(Float, default=0.0)
    temperature_inlet = Column(Float, default=20.0)
    thermal_conductivity = Column(Float, default=0.026)
    specific_heat = Column(Float, default=1005.0)
    max_iterations = Column(Integer, default=10000)
    convergence_criterion = Column(Float, default=1e-6)
    save_interval = Column(Integer, default=100)
    boundary_conditions = Column(JSON, default=list)
    turbulence_model = Column(String(50), default="les")
    status = Column(Enum(SimulationStatus), default=SimulationStatus.PENDING)
    progress = Column(Float, default=0.0)
    iterations_completed = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    results_path = Column(String(500), nullable=True)
    results_summary = Column(JSON, default=dict)
    gpu_used = Column(Boolean, default=False)
    compute_time_seconds = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    project = relationship("Project", back_populates="simulations")
    geometry = relationship("Geometry")
