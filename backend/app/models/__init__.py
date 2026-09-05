# MMX
# Imported so every model is registered on Base.metadata (and therefore
# picked up by create_all) as soon as anything imports app.models, instead of
# relying on whichever router happens to import a given model first.
from app.models.user import User
from app.models.project import Project
from app.models.geometry import Geometry
from app.models.simulation import Simulation
