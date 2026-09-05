import os
from app.services.importer.mesh_importer import MeshImporter, MeshImportError
from app.services.importer.dxf_importer import DXFImporter

# STEP/IGES also load through trimesh (via the optional `cascadio` bridge to
# OpenCASCADE); PLY and GLB/GLTF are native trimesh readers with no extra
# dependency. Point clouds (LAS/LAZ/XYZ) are not a `trimesh.Trimesh` and need
# a distinct import/voxelize path -- tracked as follow-up, not added here.
MESH_EXTENSIONS = {
    ".stl": "stl", ".obj": "obj", ".ply": "ply",
    ".glb": "glb", ".gltf": "gltf",
    ".step": "step", ".stp": "step", ".iges": "iges", ".igs": "iges",
}


class GeometryImporter:
    SUPPORTED_3D = list(MESH_EXTENSIONS.keys())
    SUPPORTED_2D = [".dxf"]

    @staticmethod
    def get_file_info(filepath):
        ext = os.path.splitext(filepath)[1].lower()
        if ext in MESH_EXTENSIONS:
            return {"format": MESH_EXTENSIONS[ext], "dimension": "3D", "info": MeshImporter.analyze(filepath)}
        if ext == ".dxf":
            data = DXFImporter.read_dxf(filepath)
            return {"format": "dxf", "dimension": "2D", "info": {"num_entities": data["num_entities"], "bounding_box": {**data["bounding_box"], "unit": MeshImporter.UNIT}}}
        raise MeshImportError(f"Formato nao suportado: {ext}")

    @staticmethod
    def get_preview(filepath):
        ext = os.path.splitext(filepath)[1].lower()
        if ext in MESH_EXTENSIONS:
            return MeshImporter.preview(filepath)
        return None

    @staticmethod
    def voxelize(filepath, resolution, dimension="3D", fill_interior=True):
        # fill_interior=True: the mesh is a solid object sitting in the fluid
        # (e.g. a machine part) -- its enclosed volume becomes solid.
        # fill_interior=False: the mesh is the *boundary* of the fluid domain
        # (e.g. a scanned room's interior walls/floor/ceiling) -- only the
        # thin surface shell becomes solid, leaving the enclosed volume
        # (the breathable air) fluid.
        ext = os.path.splitext(filepath)[1].lower()
        if ext in MESH_EXTENSIONS:
            return MeshImporter.voxelize(filepath, resolution, fill_interior=fill_interior)
        if ext == ".dxf":
            return DXFImporter.voxelize_2d(filepath, resolution, resolution)
        raise MeshImportError(f"Formato nao suportado: {ext}")

    @staticmethod
    def is_mesh_format(filepath):
        return os.path.splitext(filepath)[1].lower() in MESH_EXTENSIONS

    @staticmethod
    def prepare(filepath, transform):
        """Applies a preparation/transform step to a 3D mesh and returns the
        updated inspection info + preview payload, computed from the
        transformed mesh (not the original file) so the UI's live preview
        always matches what will actually be voxelized."""
        if not GeometryImporter.is_mesh_format(filepath):
            raise MeshImportError("Preparacao (unidade/escala/rotacao) disponivel apenas para malhas 3D (STL/OBJ/PLY/STEP/IGES/GLB/GLTF).")
        mesh, notes = MeshImporter.apply_transform(filepath, transform)
        unit_applied = transform.get("unit") is not None or transform.get("scale", 1.0) != 1.0
        unit_label = "m" if unit_applied else MeshImporter.UNIT
        info = MeshImporter.analyze_mesh(mesh, unit_label)
        preview = MeshImporter.preview_mesh(mesh)
        return {"info": info, "preview": preview, "notes": notes, "unit": unit_label}

    @staticmethod
    def voxelize_prepared(filepath, resolution, transform=None, fill_interior=True):
        ext = os.path.splitext(filepath)[1].lower()
        if ext in MESH_EXTENSIONS:
            if transform:
                mesh, _ = MeshImporter.apply_transform(filepath, transform)
            else:
                mesh = MeshImporter.load(filepath)
            return MeshImporter.voxelize_mesh(mesh, resolution, fill_interior=fill_interior)
        if ext == ".dxf":
            return DXFImporter.voxelize_2d(filepath, resolution, resolution)
        raise MeshImportError(f"Formato nao suportado: {ext}")
