"""Configuración común de los tests (pytest la carga automáticamente).

Ejecutar desde backend/:   .venv\\Scripts\\python -m pytest

Cada ejecución usa una base de datos SQLite temporal y nueva, así los tests
nunca tocan backend/crm.db.
"""
import os
import tempfile
from pathlib import Path

# Debe hacerse ANTES de importar la app: database.py lee la variable al importarse.
_tmpdir = tempfile.mkdtemp(prefix="crm-tests-")
os.environ["CRM_DATABASE_URL"] = f"sqlite:///{Path(_tmpdir, 'test.db').as_posix()}"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.main import DEFAULT_ADMIN, app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """Cliente HTTP contra la app (sin servidor real). Arranca el lifespan: migraciones + datos iniciales."""
    with TestClient(app) as c:
        yield c


def _login(client, email, password):
    r = client.post("/api/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def auth(client):
    """Cabeceras con el token del usuario admin: client.get(url, headers=auth)."""
    return _login(client, DEFAULT_ADMIN["email"], DEFAULT_ADMIN["password"])


@pytest.fixture(scope="session")
def other_user(client):
    """Un segundo vendedor, para probar responsables. Devuelve (user_id, headers)."""
    with SessionLocal() as db:
        user = User(name="Bea Vendedora", email="bea@crm.local", password_hash=hash_password("bea12345"))
        db.add(user)
        db.commit()
        user_id = user.id
    return user_id, _login(client, "bea@crm.local", "bea12345")
