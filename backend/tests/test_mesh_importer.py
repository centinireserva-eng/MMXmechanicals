"""Unit tests for the mesh importer: format coverage (STL/PLY/GLB) and the
preparation/transform pipeline added for scenario continuity."""
import numpy as np
import pytest
import trimesh

from app.services.importer import GeometryImporter, MeshImportError
from app.services.importer.mesh_importer import MeshImporter


def _write_box(tmp_path, ext, extents=(2.0, 1.0, 1.0)):
    mesh = trimesh.creation.box(extents=extents)
    path = tmp_path / f"box{ext}"
    mesh.export(str(path))
    return str(path)


@pytest.mark.parametrize("ext", [".stl", ".obj", ".ply", ".glb", ".gltf"])
def test_supported_formats_load_and_analyze(tmp_path, ext):
    path = _write_box(tmp_path, ext)
    assert GeometryImporter.is_mesh_format(path)
    info = GeometryImporter.get_file_info(path)
    assert info["dimension"] == "3D"
    assert info["info"]["num_vertices"] > 0
    assert info["info"]["num_triangles"] > 0


def test_unsupported_extension_raises():
    with pytest.raises(MeshImportError):
        GeometryImporter.get_file_info("/tmp/does-not-matter.xyz")


def test_preview_is_decimated_for_large_meshes(tmp_path):
    mesh = trimesh.creation.icosphere(subdivisions=5)  # far more than 50k faces target
    path = tmp_path / "sphere.stl"
    mesh.export(str(path))
    preview = MeshImporter.preview(str(path), max_triangles=1000)
    assert len(preview["triangles"]) <= 1000
    assert preview["truncated"] is True


def test_voxelize_preserves_aspect_ratio(tmp_path):
    path = _write_box(tmp_path, ".stl", extents=(4.0, 1.0, 1.0))
    grid = GeometryImporter.voxelize(path, resolution=32, fill_interior=True)
    assert grid.shape == (32, 32, 32)
    assert grid.any()
    occupied = np.argwhere(grid)
    span = occupied.max(axis=0) - occupied.min(axis=0) + 1
    # Longest side (x, ratio 4:1:1) should span far more cells than the others.
    assert span[0] > span[1] * 2


def test_apply_transform_scale_and_unit(tmp_path):
    path = _write_box(tmp_path, ".stl", extents=(1000.0, 1000.0, 1000.0))  # 1000mm cube
    mesh, notes = MeshImporter.apply_transform(path, {"unit": "mm", "scale": 1.0})
    # mm -> m canonicalization: 1000mm cube becomes a 1m cube.
    assert mesh.extents == pytest.approx([1.0, 1.0, 1.0], rel=1e-3)


def test_apply_transform_ground_align(tmp_path):
    mesh = trimesh.creation.box(extents=(1.0, 1.0, 1.0))
    mesh.apply_translation([0, 0, 5.0])  # floats at z=[4.5, 5.5]
    path = tmp_path / "floating.stl"
    mesh.export(str(path))
    transformed, notes = MeshImporter.apply_transform(str(path), {"ground_align": True})
    assert transformed.bounds[0][2] == pytest.approx(0.0, abs=1e-6)
    assert any("solo" in n for n in notes)


def test_apply_transform_center_xy(tmp_path):
    mesh = trimesh.creation.box(extents=(1.0, 1.0, 1.0))
    mesh.apply_translation([10.0, -5.0, 0.0])
    path = tmp_path / "offset.stl"
    mesh.export(str(path))
    transformed, _ = MeshImporter.apply_transform(str(path), {"center_xy": True})
    bmin, bmax = transformed.bounds
    center_xy = [(bmin[0] + bmax[0]) / 2, (bmin[1] + bmax[1]) / 2]
    assert center_xy == pytest.approx([0.0, 0.0], abs=1e-6)


def test_apply_transform_up_axis_y_to_z(tmp_path):
    # A box tall along Y (as if authored with a Y-up convention). unit="m"
    # (a no-op factor) isolates the axis swap from the default mm->m
    # canonicalization exercised separately in test_apply_transform_scale_and_unit.
    mesh = trimesh.creation.box(extents=(1.0, 3.0, 1.0))
    path = tmp_path / "yup.stl"
    mesh.export(str(path))
    transformed, notes = MeshImporter.apply_transform(str(path), {"up_axis": "y", "unit": "m"})
    # After the Y->Z correction, the long axis should now be Z, not Y.
    assert transformed.extents[2] == pytest.approx(3.0, rel=1e-3)
    assert any("Y convertido para Z" in n for n in notes)


def test_apply_transform_simplify(tmp_path):
    mesh = trimesh.creation.icosphere(subdivisions=4)
    path = tmp_path / "sphere.stl"
    mesh.export(str(path))
    original_faces = len(mesh.faces)
    transformed, notes = MeshImporter.apply_transform(str(path), {"simplify_target_faces": 200})
    assert len(transformed.faces) < original_faces
    assert any("simplificada" in n for n in notes)


def test_geometry_importer_prepare_rejects_2d(tmp_path):
    dxf_path = tmp_path / "drawing.dxf"
    dxf_path.write_text("0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n")
    with pytest.raises(MeshImportError):
        GeometryImporter.prepare(str(dxf_path), {})
