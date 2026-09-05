"""Unified 3D mesh import, analysis, preview, preparation and voxelization
for STL, OBJ, PLY, GLB/GLTF, STEP and IGES.

Loading is delegated to `trimesh`, which already ships fast, well-tested
readers for STL/OBJ/PLY/GLB/GLTF and (when the optional `cascadio` package is
installed) bridges to OpenCASCADE for STEP/IGES. This replaces the previous
hand-rolled per-format parsers and triangle-by-triangle voxelizer, which
duplicated what trimesh already does correctly and did not scale to
industrial part counts.

Voxelization preserves the true aspect ratio of the part (as FluidX3D does
for its lattice-Boltzmann grids) instead of stretching it to fill a cube: the
part is scaled uniformly so its longest side spans `resolution` cells, and
the result is centered inside a fixed `resolution^3` array so the UI's simple
"N^3 cells" grid-size model still holds exactly.

Every public entry point comes in two forms: `xxx(filepath, ...)` loads from
disk, and `xxx_mesh(mesh, ...)` operates on an already-loaded trimesh object.
The split exists so `apply_transform` (the preparation step) can feed its
in-memory, transformed mesh straight into analysis/preview/voxelization
without a round trip through a temporary file.
"""
from math import radians

import numpy as np
import trimesh


class MeshImportError(Exception):
    """Raised when a CAD/mesh file can't be read into a valid 3D mesh."""


# STL/OBJ/PLY/STEP/IGES carry no unit metadata; mm is the CAD-industry
# default assumed until the user tells us otherwise via the preparation step.
UNIT_TO_METERS = {"mm": 0.001, "cm": 0.01, "m": 1.0, "in": 0.0254}


class MeshImporter:
    UNIT = "mm"

    @staticmethod
    def load(filepath):
        try:
            mesh = trimesh.load(filepath, force="mesh")
        except Exception as exc:
            raise MeshImportError(
                f"Falha ao ler o arquivo de geometria: {exc}. Formatos STEP/IGES "
                "exigem o pacote opcional 'cascadio' instalado no backend."
            ) from exc
        if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) == 0:
            raise MeshImportError("O arquivo nao contem uma malha 3D valida.")
        return mesh

    @staticmethod
    def analyze(filepath):
        return MeshImporter.analyze_mesh(MeshImporter.load(filepath), MeshImporter.UNIT)

    @staticmethod
    def analyze_mesh(mesh, unit):
        bmin, bmax = mesh.bounds
        return {
            "num_vertices": int(len(mesh.vertices)),
            "num_triangles": int(len(mesh.faces)),
            "normals_consistent": bool(mesh.is_winding_consistent),
            "watertight": bool(mesh.is_watertight),
            "volume": float(mesh.volume) if mesh.is_watertight else None,
            "surface_area": float(mesh.area),
            "center": mesh.centroid.tolist(),
            "bounding_box": {
                "min": bmin.tolist(),
                "max": bmax.tolist(),
                "size": (bmax - bmin).tolist(),
                "unit": unit,
            },
        }

    @staticmethod
    def preview(filepath, max_triangles=50_000):
        return MeshImporter.preview_mesh(MeshImporter.load(filepath), max_triangles)

    @staticmethod
    def preview_mesh(mesh, max_triangles=50_000):
        """Lightweight vertex/triangle payload for a client-side 3D thumbnail.
        Large industrial meshes are decimated by stride sampling of faces so
        the preview never ships more than `max_triangles` to the browser."""
        faces = mesh.faces
        truncated = len(faces) > max_triangles
        if truncated:
            stride = int(np.ceil(len(faces) / max_triangles))
            faces = faces[::stride]
        return {
            "vertices": mesh.vertices.astype(np.float32).tolist(),
            "triangles": faces.astype(np.int32).tolist(),
            "truncated": bool(truncated),
        }

    @staticmethod
    def voxelize(filepath, resolution, fill_interior=True):
        return MeshImporter.voxelize_mesh(MeshImporter.load(filepath), resolution, fill_interior)

    @staticmethod
    def voxelize_mesh(mesh, resolution, fill_interior=True):
        """Returns a (resolution, resolution, resolution) boolean solid mask,
        aspect-ratio preserved and centered."""
        extent = np.maximum(mesh.extents, 1e-6)
        pitch = float(extent.max()) / float(resolution)
        voxel = mesh.voxelized(pitch=pitch)
        if fill_interior:
            voxel = voxel.fill()
        occupied = np.asarray(voxel.matrix, dtype=bool)
        grid = np.zeros((resolution, resolution, resolution), dtype=bool)
        crop = tuple(min(s, resolution) for s in occupied.shape)
        occupied = occupied[: crop[0], : crop[1], : crop[2]]
        offset = [(resolution - s) // 2 for s in crop]
        grid[
            offset[0]: offset[0] + crop[0],
            offset[1]: offset[1] + crop[1],
            offset[2]: offset[2] + crop[2],
        ] = occupied
        return grid

    @staticmethod
    def apply_transform(filepath, transform):
        """Loads the *original* file fresh and applies a preparation step
        (unit/scale, rotation, up-axis correction, centering, ground
        alignment, normal inversion, simplification). Always starts from
        `filepath` rather than a previously-transformed mesh, so repeated
        calls are idempotent from the source instead of compounding drift.
        Returns (mesh, notes) where notes are human-readable strings
        describing what was actually applied (e.g. when simplification was
        skipped because the optional decimation backend isn't available)."""
        mesh = MeshImporter.load(filepath)
        notes = []

        up_axis = transform.get("up_axis", "z")
        if up_axis == "y":
            mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
            notes.append("Eixo vertical Y convertido para Z")
        elif up_axis == "x":
            mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
            notes.append("Eixo vertical X convertido para Z")

        rx, ry, rz = transform.get("rotate_x", 0.0), transform.get("rotate_y", 0.0), transform.get("rotate_z", 0.0)
        if rx:
            mesh.apply_transform(trimesh.transformations.rotation_matrix(radians(rx), [1, 0, 0]))
        if ry:
            mesh.apply_transform(trimesh.transformations.rotation_matrix(radians(ry), [0, 1, 0]))
        if rz:
            mesh.apply_transform(trimesh.transformations.rotation_matrix(radians(rz), [0, 0, 1]))

        unit = transform.get("unit", MeshImporter.UNIT)
        scale = transform.get("scale", 1.0)
        factor = UNIT_TO_METERS.get(unit, 1.0) * scale
        if abs(factor - 1.0) > 1e-9:
            mesh.apply_scale(factor)

        if transform.get("invert_normals"):
            mesh.invert()
            notes.append("Normais invertidas")

        if transform.get("center_xy"):
            bmin, bmax = mesh.bounds
            cx, cy = (bmin[0] + bmax[0]) / 2.0, (bmin[1] + bmax[1]) / 2.0
            mesh.apply_translation([-cx, -cy, 0.0])
            notes.append("Centralizada em X/Y")

        if transform.get("ground_align"):
            bmin, _ = mesh.bounds
            mesh.apply_translation([0.0, 0.0, -bmin[2]])
            notes.append("Alinhada ao nivel do solo (Z minimo = 0)")

        target = transform.get("simplify_target_faces")
        if target and len(mesh.faces) > target:
            try:
                mesh = mesh.simplify_quadric_decimation(face_count=int(target))
                notes.append(f"Malha simplificada para {len(mesh.faces)} triangulos")
            except Exception as exc:  # optional decimation backend may be missing
                notes.append(f"Simplificacao nao aplicada: {exc}")

        return mesh, notes
