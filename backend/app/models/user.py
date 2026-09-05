from sqlalchemy import Column, String, Boolean, DateTime, Enum, Integer
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base
import uuid, enum
class PlanType(str, enum.Enum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"
class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    company = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    plan = Column(Enum(PlanType), default=PlanType.FREE, nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    simulations_used = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")
    @property
    def grid_limit(self):
        return {"free": 128, "pro": 512, "enterprise": 1024}.get(self.plan.value, 128)
    @property
    def sim_limit(self):
        return {"free": 5, "pro": 100, "enterprise": 999999}.get(self.plan.value, 5)
    @property
    def vertex_limit(self):
        # Caps trimesh/point-cloud memory use at import time, independent of
        # the solver's own grid_limit (voxelization already downsamples any
        # mesh to the target resolution regardless of source vertex count).
        return {"free": 500_000, "pro": 5_000_000, "enterprise": 20_000_000}.get(self.plan.value, 500_000)
