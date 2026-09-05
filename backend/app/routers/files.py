from fastapi import APIRouter, Depends, Form, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.tenant import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.geometry import Geometry, GeometryStatus
from app.services.importer import GeometryImporter, MeshImportError
from app.schemas.geometry import GeometryUploadOut, GeometryOut, GeometryPrepareOut, GeometryTransformIn, VoxelizeIn, VoxelizeOut
from app.config import settings
from typing import Optional
import os, uuid, json, numpy as np

router = APIRouter()
ALLOWED_EXTENSIONS = GeometryImporter.SUPPORTED_3D + GeometryImporter.SUPPORTED_2D


async def _get_owned_geometry(db: AsyncSession, geometry_id: str, user: User) -> Geometry:
    result = await db.execute(select(Geometry).where(Geometry.id == geometry_id, Geometry.user_id == user.id))
    geometry = result.scalar_one_or_none()
    if not geometry:
        raise HTTPException(404, "Geometria nao encontrada")
    return geometry


def _geometry_out(g: Geometry) -> dict:
    return {
        "id": g.id, "project_id": g.project_id, "original_filename": g.original_filename,
        "format": g.format, "status": g.status.value if hasattr(g.status, "value") else g.status,
        "dimension": g.dimension, "units": g.units,
        "vertex_count": g.vertex_count, "face_count": g.face_count, "point_count": g.point_count,
        "bounds": g.bounds, "center": g.center, "watertight": g.watertight,
        "normals_consistent": g.normals_consistent, "transformations": g.transformations or {},
        "grid_path": g.grid_path, "grid_shape": g.grid_shape, "error_message": g.error_message,
        "created_at": g.created_at, "updated_at": g.updated_at,
    }


@router.post("/upload", response_model=GeometryUploadOut)
async def upload_geometry(
    file: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Formato nao suportado: {ext}")
    geometry_id = str(uuid.uuid4())
    filepath = os.path.join(settings.UPLOAD_DIR, f"{geometry_id}{ext}")
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    size = 0
    try:
        with open(filepath, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(413, f"Arquivo excede o limite de {settings.MAX_FILE_SIZE_MB} MB")
                f.write(chunk)
        result = GeometryImporter.get_file_info(filepath)
        info = result["info"]
        if result["dimension"] == "3D" and info.get("num_vertices", 0) > user.vertex_limit:
            raise HTTPException(
                413,
                f"Geometria tem {info['num_vertices']:,} vertices, acima do limite do plano "
                f"({user.vertex_limit:,}). Simplifique a malha antes de enviar.",
            )
        preview = GeometryImporter.get_preview(filepath)
    except HTTPException:
        _cleanup(filepath)
        raise
    except MeshImportError as exc:
        _cleanup(filepath)
        raise HTTPException(422, str(exc))

    preview_path = None
    if preview is not None:
        preview_path = os.path.join(settings.UPLOAD_DIR, f"preview_{geometry_id}.json")
        with open(preview_path, "w") as f:
            json.dump(preview, f)

    bbox = info.get("bounding_box")
    geometry = Geometry(
        id=geometry_id,
        project_id=project_id,
        user_id=user.id,
        original_filename=(file.filename or "arquivo")[:500],
        stored_path=filepath,
        preview_path=preview_path,
        format=result["format"],
        status=GeometryStatus.ANALYZED,
        dimension=result["dimension"],
        units=bbox.get("unit", "mm") if bbox else "mm",
        vertex_count=info.get("num_vertices"),
        face_count=info.get("num_triangles"),
        point_count=None,
        bounds={"min": bbox["min"], "max": bbox["max"], "size": bbox["size"]} if bbox else None,
        center=info.get("center"),
        watertight=info.get("watertight"),
        normals_consistent=info.get("normals_consistent"),
        transformations={},
    )
    db.add(geometry)
    await db.commit()
    await db.refresh(geometry)
    payload = _geometry_out(geometry)
    payload["size_mb"] = round(size / (1024 * 1024), 2)
    payload["preview"] = preview
    return payload


@router.get("/{geometry_id}", response_model=GeometryOut)
async def get_geometry(geometry_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    geometry = await _get_owned_geometry(db, geometry_id, user)
    return _geometry_out(geometry)


@router.get("/{geometry_id}/preview")
async def get_geometry_preview(geometry_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    geometry = await _get_owned_geometry(db, geometry_id, user)
    if not geometry.preview_path or not os.path.isfile(geometry.preview_path):
        raise HTTPException(404, "Previa nao disponivel para esta geometria.")
    with open(geometry.preview_path) as f:
        return json.load(f)


@router.post("/{geometry_id}/prepare", response_model=GeometryPrepareOut)
async def prepare_geometry(
    geometry_id: str, body: GeometryTransformIn,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    geometry = await _get_owned_geometry(db, geometry_id, user)
    if not os.path.isfile(geometry.stored_path):
        raise HTTPException(404, "Arquivo original nao encontrado no armazenamento.")
    try:
        result = GeometryImporter.prepare(geometry.stored_path, body.model_dump())
    except MeshImportError as exc:
        raise HTTPException(422, str(exc))

    info = result["info"]
    bbox = info["bounding_box"]
    preview_path = geometry.preview_path or os.path.join(settings.UPLOAD_DIR, f"preview_{geometry.id}.json")
    with open(preview_path, "w") as f:
        json.dump(result["preview"], f)

    geometry.preview_path = preview_path
    geometry.units = result["unit"]
    geometry.vertex_count = info["num_vertices"]
    geometry.face_count = info["num_triangles"]
    geometry.bounds = {"min": bbox["min"], "max": bbox["max"], "size": bbox["size"]}
    geometry.center = info["center"]
    geometry.watertight = info["watertight"]
    geometry.normals_consistent = info["normals_consistent"]
    geometry.transformations = body.model_dump()
    geometry.status = GeometryStatus.PREPARED
    # A previous voxelization no longer matches the just-transformed mesh.
    geometry.grid_path = None
    geometry.grid_shape = None
    await db.commit()
    await db.refresh(geometry)

    payload = _geometry_out(geometry)
    payload["preview"] = result["preview"]
    payload["notes"] = result["notes"]
    return payload


@router.post("/voxelize", response_model=VoxelizeOut)
async def voxelize_geometry(body: VoxelizeIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    geometry = await _get_owned_geometry(db, body.geometry_id, user)
    if not os.path.isfile(geometry.stored_path):
        raise HTTPException(404, "Arquivo original nao encontrado no armazenamento.")
    if body.resolution > user.grid_limit:
        raise HTTPException(403, f"Grade {body.resolution} excede o limite do plano ({user.grid_limit})")
    try:
        grid = GeometryImporter.voxelize_prepared(
            geometry.stored_path, body.resolution,
            geometry.transformations or None, fill_interior=body.fill_interior,
        )
    except MeshImportError as exc:
        raise HTTPException(422, str(exc))

    grid_id = str(uuid.uuid4())
    grid_path = os.path.join(settings.UPLOAD_DIR, f"grid_{grid_id}.npy")
    np.save(grid_path, grid)
    total_cells = int(grid.size)
    solid_cells = int(grid.sum())

    geometry.grid_path = grid_path
    geometry.grid_shape = list(grid.shape)
    geometry.status = GeometryStatus.VOXELIZED
    await db.commit()

    return {
        "geometry_id": geometry.id, "grid_id": grid_id, "grid_path": grid_path,
        "grid_shape": list(grid.shape), "total_cells": total_cells,
        "solid_cells": solid_cells, "fluid_cells": total_cells - solid_cells,
    }


def _cleanup(filepath):
    if os.path.exists(filepath):
        os.remove(filepath)
