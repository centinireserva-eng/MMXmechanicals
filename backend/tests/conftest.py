"""Shared fixtures for router-level tests.

Env vars must be set before the first `import app...` anywhere in the test
session, since app.config.Settings() reads them once at import time -- so
this module does that at collection time, ahead of any test module import.
"""
import os
import tempfile
import uuid

_TEST_DIR = tempfile.mkdtemp(prefix="mmx_test_")
os.environ["UPLOAD_DIR"] = os.path.join(_TEST_DIR, "uploads")
os.environ["RESULTS_DIR"] = os.path.join(_TEST_DIR, "results")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TEST_DIR}/test.db"
os.environ["SECRET_KEY"] = "test-secret-key"
os.makedirs(os.environ["UPLOAD_DIR"], exist_ok=True)
os.makedirs(os.environ["RESULTS_DIR"], exist_ok=True)

import httpx  # noqa: E402
import pytest  # noqa: E402

import app.models  # noqa: E402,F401 -- registers every model on Base.metadata
from app.database import Base, engine, ensure_schema_upgrades  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session", autouse=True)
async def _prepare_database():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await ensure_schema_upgrades(conn)
    yield
    await engine.dispose()


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=fastapi_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def auth_headers(client):
    email = f"user-{uuid.uuid4().hex[:10]}@test.com"
    resp = await client.post("/api/auth/register", json={
        "email": email, "password": "testpass123", "full_name": "Test User",
    })
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
