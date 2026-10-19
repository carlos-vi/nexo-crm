"""Tests de autenticación: login, token y usuarios."""
from datetime import datetime, timedelta, timezone

import jwt

from app.main import DEFAULT_ADMIN
from app.security import ALGORITHM, SECRET_KEY


def login(client, email, password):
    return client.post("/api/auth/login", data={"username": email, "password": password})


def test_sin_token_401(client):
    """Los endpoints protegidos exigen token."""
    for url in ("/api/auth/me", "/api/users", "/api/deals", "/api/stages", "/api/tasks"):
        r = client.get(url)
        assert r.status_code == 401, url


def test_token_basura_401(client):
    """Un token mal formado o firmado con otra clave no vale."""
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer esto-no-es-un-token"})
    assert r.status_code == 401
    forged = jwt.encode({"sub": "1"}, "otra-clave-distinta-de-la-del-servidor-0123456789", algorithm=ALGORITHM)
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401


def test_token_caducado_401(client):
    """Un token correctamente firmado pero caducado no vale."""
    expired = jwt.encode(
        {"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)}, SECRET_KEY, algorithm=ALGORITHM
    )
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401


def test_token_de_usuario_inexistente_401(client):
    """Un token válido de un usuario que no existe no vale."""
    token = jwt.encode(
        {"sub": "999999", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}, SECRET_KEY, algorithm=ALGORITHM
    )
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_login_contrasena_incorrecta(client):
    r = login(client, DEFAULT_ADMIN["email"], "no-es-la-buena")
    assert r.status_code == 401
    assert r.json()["detail"] == "Email o contraseña incorrectos"


def test_login_email_desconocido(client):
    """Mismo mensaje si el email no existe (no revela qué emails hay)."""
    r = login(client, "nadie-existe@crm.local", "lo-que-sea")
    assert r.status_code == 401
    assert r.json()["detail"] == "Email o contraseña incorrectos"


def test_login_ok_email_sin_distinguir_mayusculas(client):
    r = login(client, "  " + DEFAULT_ADMIN["email"].upper() + " ", DEFAULT_ADMIN["password"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["email"] == DEFAULT_ADMIN["email"]
    assert body["user"]["name"] == DEFAULT_ADMIN["name"]
    # El token devuelto sirve para llamar a la API.
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == DEFAULT_ADMIN["email"]


def test_me(client, auth, other_user):
    """/auth/me devuelve el usuario dueño del token, sin la contraseña."""
    r = client.get("/api/auth/me", headers=auth)
    assert r.status_code == 200
    assert r.json()["email"] == DEFAULT_ADMIN["email"]
    assert set(r.json()) == {"id", "name", "email", "is_admin", "is_active", "created_at"}

    other_id, other_headers = other_user
    r = client.get("/api/auth/me", headers=other_headers)
    assert r.json()["id"] == other_id
    assert r.json()["name"] == "Bea Vendedora"


def test_listado_usuarios(client, auth, other_user):
    """/users lista los vendedores ordenados por nombre y sin hashes."""
    r = client.get("/api/users", headers=auth)
    assert r.status_code == 200
    users = r.json()
    emails = [u["email"] for u in users]
    assert DEFAULT_ADMIN["email"] in emails
    assert "bea@crm.local" in emails
    names = [u["name"] for u in users]
    assert names == sorted(names)
    for u in users:
        assert set(u) == {"id", "name", "email", "is_admin", "is_active", "created_at"}
