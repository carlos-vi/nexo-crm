"""Gestión del equipo: alta de usuarios, roles, desactivación y perfil propio."""
import uuid


def _email(prefix="user"):
    return f"{prefix}-{uuid.uuid4().hex[:8]}@crm.local"


def _login(client, email, password):
    return client.post("/api/auth/login", data={"username": email, "password": password})


def test_admin_creates_user_who_can_log_in(client, auth):
    email = _email()
    r = client.post("/api/users", json={"name": "Nuevo Vendedor", "email": email.upper(), "password": "secreta123"},
                    headers=auth)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == email  # se guarda en minúsculas
    assert body["is_admin"] is False and body["is_active"] is True
    assert "password_hash" not in body
    assert _login(client, email, "secreta123").status_code == 200


def test_create_user_validation(client, auth):
    assert client.post("/api/users", json={"name": "X", "email": "no-es-un-email", "password": "secreta123"},
                       headers=auth).status_code == 422
    assert client.post("/api/users", json={"name": "X", "email": _email(), "password": "corta"},
                       headers=auth).status_code == 422
    # Email repetido (sin distinguir mayúsculas) → 409.
    assert client.post("/api/users", json={"name": "X", "email": "ADMIN@crm.local", "password": "secreta123"},
                       headers=auth).status_code == 409


def test_non_admin_cannot_manage_users(client, other_user):
    _, bea = other_user
    assert client.post("/api/users", json={"name": "X", "email": _email(), "password": "secreta123"},
                       headers=bea).status_code == 403
    assert client.patch("/api/users/1", json={"name": "Hackeado"}, headers=bea).status_code == 403
    # Pero sí puede ver la lista (para elegir responsables).
    assert client.get("/api/users", headers=bea).status_code == 200


def test_deactivated_user_loses_access(client, auth):
    email = _email("baja")
    user = client.post("/api/users", json={"name": "Se Va", "email": email, "password": "secreta123"},
                       headers=auth).json()
    token = _login(client, email, "secreta123").json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/auth/me", headers=headers).status_code == 200

    r = client.patch(f"/api/users/{user['id']}", json={"is_active": False}, headers=auth)
    assert r.status_code == 200 and r.json()["is_active"] is False
    # El token que ya tenía deja de valer y no puede volver a entrar.
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert _login(client, email, "secreta123").status_code == 401
    # No aparece en la lista normal, sí en la completa.
    ids = [u["id"] for u in client.get("/api/users", headers=auth).json()]
    all_ids = [u["id"] for u in client.get("/api/users?include_inactive=true", headers=auth).json()]
    assert user["id"] not in ids and user["id"] in all_ids


def test_admin_can_promote_and_reset_password(client, auth):
    email = _email()
    user = client.post("/api/users", json={"name": "Ascendido", "email": email, "password": "secreta123"},
                       headers=auth).json()
    r = client.patch(f"/api/users/{user['id']}", json={"is_admin": True, "password": "nueva12345"}, headers=auth)
    assert r.status_code == 200 and r.json()["is_admin"] is True
    assert _login(client, email, "secreta123").status_code == 401
    assert _login(client, email, "nueva12345").status_code == 200


def test_admin_cannot_demote_or_deactivate_self(client, auth):
    me = client.get("/api/auth/me", headers=auth).json()
    assert client.patch(f"/api/users/{me['id']}", json={"is_admin": False}, headers=auth).status_code == 422
    assert client.patch(f"/api/users/{me['id']}", json={"is_active": False}, headers=auth).status_code == 422


def test_profile_update_and_password_change(client, auth):
    email = _email("perfil")
    client.post("/api/users", json={"name": "Perfil", "email": email, "password": "secreta123"}, headers=auth)
    headers = {"Authorization": f"Bearer {_login(client, email, 'secreta123').json()['access_token']}"}

    r = client.patch("/api/auth/me", json={"name": "Perfil Cambiado"}, headers=headers)
    assert r.status_code == 200 and r.json()["name"] == "Perfil Cambiado"
    # No puede quedarse con el email de otro.
    assert client.patch("/api/auth/me", json={"email": "admin@crm.local"}, headers=headers).status_code == 409

    bad = client.post("/api/auth/password", json={"current_password": "mala", "new_password": "otra12345"},
                      headers=headers)
    assert bad.status_code == 422
    ok = client.post("/api/auth/password", json={"current_password": "secreta123", "new_password": "otra12345"},
                     headers=headers)
    assert ok.status_code == 204
    assert _login(client, email, "otra12345").status_code == 200
