"""Router-level tests for the persisted geometry pipeline: upload -> inspect
-> prepare -> voxelize -> link to a simulation. This is the flow that
replaces the old localStorage/router-state-only linkage between an imported
scenario and the simulation that used it."""
import io

import pytest
import trimesh

pytestmark = pytest.mark.anyio


def _box_stl_bytes(extents=(2.0, 1.0, 1.0)):
    mesh = trimesh.creation.box(extents=extents)
    buf = io.BytesIO()
    mesh.export(file_obj=buf, file_type="stl")
    return buf.getvalue()


async def _upload_box(client, headers, filename="part.stl", extents=(2.0, 1.0, 1.0)):
    files = {"file": (filename, _box_stl_bytes(extents), "application/octet-stream")}
    resp = await client.post("/api/files/upload", headers=headers, files=files)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_upload_persists_geometry_with_real_inspection_data(client, auth_headers):
    data = await _upload_box(client, auth_headers)
    assert data["dimension"] == "3D"
    assert data["format"] == "stl"
    assert data["vertex_count"] == 8
    assert data["face_count"] == 12
    assert data["bounds"]["size"] == pytest.approx([2.0, 1.0, 1.0], rel=1e-3)
    assert data["status"] == "analyzed"
    assert data["preview"]["vertices"]
    geometry_id = data["id"]

    fetched = await client.get(f"/api/files/{geometry_id}", headers=auth_headers)
    assert fetched.status_code == 200
    assert fetched.json()["id"] == geometry_id

    preview = await client.get(f"/api/files/{geometry_id}/preview", headers=auth_headers)
    assert preview.status_code == 200
    assert preview.json()["triangles"]


async def test_rejects_unsupported_extension(client, auth_headers):
    files = {"file": ("scene.xyz", b"not a real point cloud", "application/octet-stream")}
    resp = await client.post("/api/files/upload", headers=auth_headers, files=files)
    assert resp.status_code == 400


async def test_rejects_corrupt_file_content_not_just_extension(client, auth_headers):
    files = {"file": ("fake.stl", b"this is not a valid STL body", "application/octet-stream")}
    resp = await client.post("/api/files/upload", headers=auth_headers, files=files)
    assert resp.status_code == 422


async def test_prepare_updates_bounds_and_updates_preview_live(client, auth_headers):
    data = await _upload_box(client, auth_headers, extents=(1000.0, 500.0, 250.0))
    geometry_id = data["id"]
    resp = await client.post(
        f"/api/files/{geometry_id}/prepare", headers=auth_headers,
        json={"unit": "mm", "scale": 1.0, "ground_align": True},
    )
    assert resp.status_code == 200, resp.text
    prepared = resp.json()
    assert prepared["units"] == "m"
    assert prepared["bounds"]["size"] == pytest.approx([1.0, 0.5, 0.25], rel=1e-3)
    assert prepared["status"] == "prepared"
    assert prepared["preview"]["vertices"]


async def test_voxelize_links_grid_to_geometry_and_respects_ownership(client, auth_headers):
    data = await _upload_box(client, auth_headers)
    geometry_id = data["id"]
    resp = await client.post(
        "/api/files/voxelize", headers=auth_headers,
        json={"geometry_id": geometry_id, "resolution": 16, "fill_interior": True},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["geometry_id"] == geometry_id
    assert body["grid_shape"] == [16, 16, 16]
    assert body["solid_cells"] > 0

    fetched = await client.get(f"/api/files/{geometry_id}", headers=auth_headers)
    assert fetched.json()["status"] == "voxelized"
    assert fetched.json()["grid_shape"] == [16, 16, 16]


async def test_geometry_is_isolated_per_user(client, auth_headers):
    data = await _upload_box(client, auth_headers)
    geometry_id = data["id"]

    other_resp = await client.post("/api/auth/register", json={
        "email": "other-user@test.com", "password": "testpass123", "full_name": "Other User",
    })
    other_headers = {"Authorization": f"Bearer {other_resp.json()['access_token']}"}

    resp = await client.get(f"/api/files/{geometry_id}", headers=other_headers)
    assert resp.status_code == 404

    resp = await client.post(
        "/api/files/voxelize", headers=other_headers,
        json={"geometry_id": geometry_id, "resolution": 16},
    )
    assert resp.status_code == 404


async def test_simulation_persists_geometry_link(client, auth_headers):
    data = await _upload_box(client, auth_headers)
    geometry_id = data["id"]
    vox = await client.post(
        "/api/files/voxelize", headers=auth_headers,
        json={"geometry_id": geometry_id, "resolution": 8},
    )
    assert vox.status_code == 200

    sim_resp = await client.post("/api/simulations/", headers=auth_headers, json={
        "project_id": "default", "name": "Teste de continuidade", "geometry_id": geometry_id,
        "grid_x": 8, "grid_y": 8, "grid_z": 8, "max_iterations": 2, "async": True,
    })
    assert sim_resp.status_code == 200, sim_resp.text
    simulation_id = sim_resp.json()["simulation_id"]

    fetched = await client.get(f"/api/simulations/{simulation_id}", headers=auth_headers)
    assert fetched.status_code == 200
    # The whole point of this table: reopening the simulation later still
    # resolves to the exact geometry it was created with, from the backend --
    # not from localStorage or a query string.
    assert fetched.json()["geometry_id"] == geometry_id


async def test_simulation_rejects_geometry_owned_by_another_user(client, auth_headers):
    other_resp = await client.post("/api/auth/register", json={
        "email": "another-user@test.com", "password": "testpass123", "full_name": "Another User",
    })
    other_headers = {"Authorization": f"Bearer {other_resp.json()['access_token']}"}
    other_geometry = await _upload_box(client, other_headers)

    sim_resp = await client.post("/api/simulations/", headers=auth_headers, json={
        "project_id": "default", "name": "Nao deveria funcionar",
        "geometry_id": other_geometry["id"], "grid_x": 8, "grid_y": 8, "grid_z": 8, "async": True,
    })
    assert sim_resp.status_code == 404
