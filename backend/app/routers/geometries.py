from fastapi import APIRouter, Depends, HTTPException
from app.core.tenant import get_current_user
from app.models.user import User
from app.config import settings
import numpy as np, os, uuid
router = APIRouter()
def make_cylinder_2d(nx, ny, radius=0.15, cx=0.3, cy=0.5):
    grid = np.zeros((nx, ny), dtype=bool)
    for i in range(nx):
        for j in range(ny):
            x, y = i/nx, j/ny
            if (x-cx)**2 + (y-cy)**2 < radius**2: grid[i, j] = True
    return grid
def make_channel_2d(nx, ny):
    grid = np.zeros((nx, ny), dtype=bool); grid[:, 0:3] = True; grid[:, -3:] = True; return grid
def make_lid_cavity_2d(nx, ny):
    grid = np.zeros((nx, ny), dtype=bool); grid[0, :] = True; grid[-1, :] = True; grid[:, 0] = True; return grid
def make_backward_step_2d(nx, ny, step_ratio=0.4):
    grid = np.zeros((nx, ny), dtype=bool); step_y = int(ny * step_ratio)
    grid[0:int(nx*0.3), 0:step_y] = True; grid[:, 0] = True; return grid
def make_sphere_3d(nx, ny, nz, radius=0.2, cx=0.3, cy=0.5, cz=0.5):
    grid = np.zeros((nx, ny, nz), dtype=bool)
    for i in range(nx):
        for j in range(ny):
            for k in range(nz):
                x, y, z = i/nx, j/ny, k/nz
                if (x-cx)**2 + (y-cy)**2 + (z-cz)**2 < radius**2: grid[i, j, k] = True
    return grid
def make_duct_3d(nx, ny, nz):
    grid = np.zeros((nx, ny, nz), dtype=bool)
    grid[:, 0, :] = True; grid[:, -1, :] = True; grid[:, :, 0] = True; grid[:, :, -1] = True; return grid
def make_tube_3d(nx, ny, nz, radius=0.35):
    grid = np.zeros((nx, ny, nz), dtype=bool); cy, cz = ny/2, nz/2
    for i in range(nx):
        for j in range(ny):
            for k in range(nz):
                if (j-cy)**2 + (k-cz)**2 > (radius*min(ny,nz))**2: grid[i, j, k] = True
    return grid
def make_elbow_3d(nx, ny, nz, radius=0.17):
    x, y, z = np.meshgrid(np.arange(nx)/nx, np.arange(ny)/ny, np.arange(nz)/nz, indexing="ij")
    first = np.sqrt((y - 0.68) ** 2 + (z - 0.5) ** 2)
    second = np.sqrt((x - 0.68) ** 2 + (z - 0.5) ** 2)
    horizontal = (x <= 0.68) & (first <= radius)
    vertical = (y <= 0.68) & (second <= radius)
    fluid_passage = horizontal | vertical
    return ~fluid_passage
def make_ahmed_body_3d(nx, ny, nz):
    x, y, z = np.meshgrid(np.arange(nx)/nx, np.arange(ny)/ny, np.arange(nz)/nz, indexing="ij")
    roof = np.where(x < 0.56, 0.62, np.maximum(0.35, 0.62 - (x - 0.56) * 1.75))
    body = (x >= 0.24) & (x <= 0.76) & (y >= 0.28) & (y <= roof) & (np.abs(z - 0.5) <= 0.2)
    return body
# Industrial piping / HVAC / process-equipment presets -- geometries a
# facility/plant customer is more likely to recognize than the canonical
# aero-validation shapes above. West/east carry the velocity/outflow BCs,
# south/north are solid walls; z has no BC (periodic), so shapes are kept
# clear of the z=0/z=1 edges the same way elbow/ahmed already do.
def make_tjunction_3d(nx, ny, nz, radius=0.14):
    x, y, z = np.meshgrid(np.arange(nx)/nx, np.arange(ny)/ny, np.arange(nz)/nz, indexing="ij")
    main = np.sqrt((y - 0.5) ** 2 + (z - 0.5) ** 2) <= radius
    branch = (np.sqrt((x - 0.5) ** 2 + (z - 0.5) ** 2) <= radius) & (y >= 0.35) & (y <= 0.85)
    return ~(main | branch)
def make_gate_valve_3d(nx, ny, nz, radius=0.32, opening=0.55):
    x, y, z = np.meshgrid(np.arange(nx)/nx, np.arange(ny)/ny, np.arange(nz)/nz, indexing="ij")
    pipe_fluid = np.sqrt((y - 0.5) ** 2 + (z - 0.5) ** 2) <= radius
    gate_top = (0.5 - radius) + (1 - opening) * (2 * radius)
    gate = (np.abs(x - 0.5) <= 0.035) & (y <= gate_top)
    return (~pipe_fluid) | gate
def make_building_3d(nx, ny, nz):
    x, y, z = np.meshgrid(np.arange(nx)/nx, np.arange(ny)/ny, np.arange(nz)/nz, indexing="ij")
    return (x >= 0.4) & (x <= 0.56) & (y >= 0.3) & (y <= 0.7) & (z >= 0.1) & (z <= 0.9)
def make_room_3d(nx, ny, nz):
    grid = np.zeros((nx, ny, nz), dtype=bool)
    grid[:, 0, :] = True; grid[:, -1, :] = True; grid[:, :, 0] = True; grid[:, :, -1] = True
    x, y, z = np.meshgrid(np.arange(nx)/nx, np.arange(ny)/ny, np.arange(nz)/nz, indexing="ij")
    furniture = (x >= 0.35) & (x <= 0.55) & (y >= 0.1) & (y <= 0.35) & (z >= 0.1) & (z <= 0.4)
    grid |= furniture
    return grid
def make_cooling_tower_3d(nx, ny, nz):
    x, y, z = np.meshgrid(np.arange(nx)/nx, np.arange(ny)/ny, np.arange(nz)/nz, indexing="ij")
    radius = np.where(z < 0.5, 0.26 - z * 0.14, 0.19 + (z - 0.5) * 0.08)
    return np.sqrt((x - 0.44) ** 2 + (y - 0.5) ** 2) <= radius
def make_tube_bank_3d(nx, ny, nz, radius=0.07):
    x, y, _ = np.meshgrid(np.arange(nx)/nx, np.arange(ny)/ny, np.arange(nz)/nz, indexing="ij")
    grid = np.zeros((nx, ny, nz), dtype=bool)
    for cx, cy in [(0.35, 0.3), (0.35, 0.7), (0.5, 0.5), (0.65, 0.3), (0.65, 0.7)]:
        grid |= (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
    return grid
def make_screen_3d(nx, ny, nz, hole_radius=0.045, pitch=0.16):
    x, y, z = np.meshgrid(np.arange(nx)/nx, np.arange(ny)/ny, np.arange(nz)/nz, indexing="ij")
    plate = np.abs(x - 0.5) <= 0.025
    hole = np.zeros((nx, ny, nz), dtype=bool)
    for cy in np.arange(0.15, 0.86, pitch):
        for cz in np.arange(0.15, 0.86, pitch):
            hole |= (y - cy) ** 2 + (z - cz) ** 2 <= hole_radius ** 2
    return plate & ~hole
def make_storage_tank_3d(nx, ny, nz, radius=0.22):
    x, y, z = np.meshgrid(np.arange(nx)/nx, np.arange(ny)/ny, np.arange(nz)/nz, indexing="ij")
    return ((x - 0.42) ** 2 + (y - 0.5) ** 2 <= radius ** 2) & (z >= 0.08) & (z <= 0.75)
PRESETS = {
    "cylinder-flow": {"name": "Escoamento sobre Cilindro", "dimension": "2D", "generator": make_cylinder_2d,
        "config": {"viscosity": 0.02, "inlet_velocity": 0.1, "turbulence_model": "none",
            "boundary_conditions": [{"face": "west", "type": "velocity", "params": {"ux": 0.1, "uy": 0}},
                {"face": "east", "type": "outflow"}, {"face": "south", "type": "wall"}, {"face": "north", "type": "wall"}]}},
    "channel-flow": {"name": "Canal Plano 2D", "dimension": "2D", "generator": make_channel_2d,
        "config": {"viscosity": 0.05, "inlet_velocity": 0.08, "turbulence_model": "none"}},
    "lid-cavity": {"name": "Cavidade com Tampa", "dimension": "2D", "generator": make_lid_cavity_2d,
        "config": {"viscosity": 0.02, "inlet_velocity": 0.0, "turbulence_model": "none",
            "boundary_conditions": [{"face": "west", "type": "wall"}, {"face": "east", "type": "wall"},
                {"face": "south", "type": "wall"}, {"face": "north", "type": "velocity", "params": {"ux": 0.1, "uy": 0}}]}},
    "backward-step": {"name": "Degrau Atras", "dimension": "2D", "generator": make_backward_step_2d,
        "config": {"viscosity": 0.02, "inlet_velocity": 0.1, "turbulence_model": "les"}},
    "sphere-3d": {"name": "Esfera em 3D", "dimension": "3D", "generator": make_sphere_3d,
        "config": {"viscosity": 0.02, "inlet_velocity": 0.1, "turbulence_model": "les"}},
    "3d-duct": {"name": "Duto Retangular 3D", "dimension": "3D", "generator": make_duct_3d,
        "config": {"viscosity": 0.03, "inlet_velocity": 0.08, "turbulence_model": "les"}},
    "elbow-90": {"name": "Curva de 90 graus", "dimension": "3D", "generator": make_elbow_3d,
        "config": {"viscosity": 0.02, "inlet_velocity": 0.12, "turbulence_model": "les"}},
    "ahmed-body": {"name": "Corpo de Ahmed", "dimension": "3D", "generator": make_ahmed_body_3d,
        "config": {"viscosity": 0.015, "inlet_velocity": 0.15, "turbulence_model": "les"}},
    "heat-tube": {"name": "Tubo com Troca Termica", "dimension": "3D", "generator": make_tube_3d,
        "config": {"viscosity": 0.02, "inlet_velocity": 0.1, "turbulence_model": "les",
            "enable_thermal": True, "thermal_diffusivity": 0.05, "T_inlet": 1.0, "T_wall": 0.0}},
    "t-junction": {"name": "Bifurcacao em T", "dimension": "3D", "generator": make_tjunction_3d,
        "config": {"viscosity": 0.02, "inlet_velocity": 0.08, "turbulence_model": "les"}},
    "gate-valve": {"name": "Valvula Gaveta", "dimension": "3D", "generator": make_gate_valve_3d,
        "config": {"viscosity": 0.025, "inlet_velocity": 0.08, "turbulence_model": "les"}},
    "building": {"name": "Predio", "dimension": "3D", "generator": make_building_3d,
        "config": {"viscosity": 0.02, "inlet_velocity": 0.1, "turbulence_model": "les"}},
    "ventilated-room": {"name": "Sala Ventilada", "dimension": "3D", "generator": make_room_3d,
        "config": {"viscosity": 0.03, "inlet_velocity": 0.05, "turbulence_model": "none",
            "enable_thermal": True, "thermal_diffusivity": 0.05, "T_inlet": 1.0, "T_wall": 0.0}},
    # cooling-tower/tube-bank/storage-tank: their initial viscosity/velocity
    # guesses (in line with sphere-3d/building) diverged to NaN at the
    # default 32^3 grid -- their curved, only-coarsely-resolved obstacles
    # need a gentler regime. Verified stable via a real run at these values.
    "cooling-tower": {"name": "Torre de Resfriamento", "dimension": "3D", "generator": make_cooling_tower_3d,
        "config": {"viscosity": 0.035, "inlet_velocity": 0.04, "turbulence_model": "les",
            "enable_thermal": True, "thermal_diffusivity": 0.05, "T_inlet": 1.0, "T_wall": 0.0}},
    "tube-bank": {"name": "Banco de Tubos", "dimension": "3D", "generator": make_tube_bank_3d,
        "config": {"viscosity": 0.04, "inlet_velocity": 0.04, "turbulence_model": "les",
            "enable_thermal": True, "thermal_diffusivity": 0.05, "T_inlet": 1.0, "T_wall": 0.0}},
    "perforated-screen": {"name": "Grade Perfurada", "dimension": "3D", "generator": make_screen_3d,
        "config": {"viscosity": 0.03, "inlet_velocity": 0.06, "turbulence_model": "les"}},
    "storage-tank": {"name": "Tanque de Armazenamento", "dimension": "3D", "generator": make_storage_tank_3d,
        "config": {"viscosity": 0.03, "inlet_velocity": 0.06, "turbulence_model": "les"}},
}
@router.get("/")
async def list_geometries(user=Depends(get_current_user)):
    return [{"id": gid, "name": g["name"], "dimension": g["dimension"]} for gid, g in PRESETS.items()]
@router.post("/{geo_id}/generate")
async def generate_geometry(geo_id, body: dict, user=Depends(get_current_user)):
    if geo_id not in PRESETS: raise HTTPException(404, "Geometria nao encontrada")
    preset = PRESETS[geo_id]; grid_size = body.get("grid_size", 64)
    if grid_size > user.grid_limit: raise HTTPException(403, f"Grade {grid_size} excede limite {user.grid_limit}")
    if preset["dimension"] == "2D": grid = preset["generator"](grid_size, grid_size)
    else: grid = preset["generator"](grid_size, grid_size, grid_size)
    grid_id = str(uuid.uuid4()); grid_path = os.path.join(settings.UPLOAD_DIR, f"preset_{grid_id}.npy")
    np.save(grid_path, grid)
    return {"grid_id": grid_id, "grid_path": grid_path, "grid_shape": list(grid.shape),
        "solid_cells": int(grid.sum()), "fluid_cells": grid.size - int(grid.sum()),
        "dimension": preset["dimension"], "preset_config": preset["config"]}
