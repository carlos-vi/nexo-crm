"""Tests de /api/tasks, /api/activities y /api/search."""
import uuid
from datetime import date, datetime, timedelta

import pytest


def uid(prefix: str) -> str:
    """Nombre único: la BD de tests es compartida con otros ficheros."""
    return f"{prefix} {uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def me(client, auth):
    return client.get("/api/auth/me", headers=auth).json()


@pytest.fixture
def company(client, auth):
    """Una empresa nueva para cada test: sirve para aislar sus tareas y actividades."""
    r = client.post("/api/companies", json={"name": uid("Empresa tareas")}, headers=auth)
    assert r.status_code == 201, r.text
    return r.json()


def create_task(client, headers, **fields):
    fields.setdefault("title", uid("Tarea"))
    r = client.post("/api/tasks", json=fields, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def list_tasks(client, headers, **params):
    r = client.get("/api/tasks", params=params, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


# --- Tareas: responsable ---------------------------------------------------------

def test_tarea_responsable_por_defecto(client, auth, me, company):
    task = create_task(client, auth, company_id=company["id"])
    assert task["user_id"] == me["id"]
    assert task["user_name"] == me["name"]
    assert task["done"] is False


def test_tarea_responsable_explicito_y_cambio(client, auth, me, other_user, company):
    other_id, _ = other_user
    task = create_task(client, auth, company_id=company["id"], user_id=other_id)
    assert task["user_id"] == other_id
    assert task["user_name"] == "Bea Vendedora"

    r = client.patch(f"/api/tasks/{task['id']}", json={"user_id": me["id"]}, headers=auth)
    assert r.status_code == 200
    assert r.json()["user_id"] == me["id"]


def test_tarea_responsable_inexistente_422(client, auth, company):
    r = client.post("/api/tasks", json={"title": "x", "user_id": 999999}, headers=auth)
    assert r.status_code == 422
    task = create_task(client, auth, company_id=company["id"])
    r = client.patch(f"/api/tasks/{task['id']}", json={"user_id": 999999}, headers=auth)
    assert r.status_code == 422


def test_filtro_user_id(client, auth, me, other_user, company):
    other_id, _ = other_user
    mine = create_task(client, auth, company_id=company["id"])
    theirs = create_task(client, auth, company_id=company["id"], user_id=other_id)

    ids = [t["id"] for t in list_tasks(client, auth, user_id=other_id, company_id=company["id"])]
    assert ids == [theirs["id"]]
    ids = [t["id"] for t in list_tasks(client, auth, user_id=me["id"], company_id=company["id"])]
    assert ids == [mine["id"]]
    assert all(t["user_id"] == other_id for t in list_tasks(client, auth, user_id=other_id))


def test_tarea_validacion(client, auth, company):
    assert client.post("/api/tasks", json={"title": "  "}, headers=auth).status_code == 422
    for field in ("contact_id", "company_id", "deal_id"):
        r = client.post("/api/tasks", json={"title": "x", field: 999999}, headers=auth)
        assert r.status_code == 422, field
    task = create_task(client, auth, company_id=company["id"])
    for payload in ({"title": None}, {"done": None}):
        r = client.patch(f"/api/tasks/{task['id']}", json=payload, headers=auth)
        assert r.status_code == 422, payload
    assert client.patch("/api/tasks/999999", json={"done": True}, headers=auth).status_code == 404
    assert client.delete("/api/tasks/999999", headers=auth).status_code == 404


# --- Tareas: vencimiento y orden -----------------------------------------------

@pytest.fixture
def tasks_by_due(client, auth, company):
    """Una tarea de cada tipo en una empresa propia. Devuelve {nombre: tarea}."""
    today = date.today()
    cid = company["id"]
    t = {
        "sin_fecha": create_task(client, auth, company_id=cid),
        "proxima": create_task(client, auth, company_id=cid, due_date=str(today + timedelta(days=3))),
        "hoy": create_task(client, auth, company_id=cid, due_date=str(today)),
        "vencida": create_task(client, auth, company_id=cid, due_date=str(today - timedelta(days=2))),
        "vencida_hecha": create_task(client, auth, company_id=cid, due_date=str(today - timedelta(days=5))),
        "manana": create_task(client, auth, company_id=cid, due_date=str(today + timedelta(days=1))),
    }
    r = client.patch(f"/api/tasks/{t['vencida_hecha']['id']}", json={"done": True}, headers=auth)
    assert r.status_code == 200 and r.json()["done"] is True
    return t


def ids(tasks):
    return [t["id"] for t in tasks]


def test_filtro_due(client, auth, company, tasks_by_due):
    t, cid = tasks_by_due, company["id"]
    # Una tarea hecha no cuenta como vencida.
    assert ids(list_tasks(client, auth, due="overdue", company_id=cid)) == [t["vencida"]["id"]]
    assert ids(list_tasks(client, auth, due="today", company_id=cid)) == [t["hoy"]["id"]]
    assert ids(list_tasks(client, auth, due="upcoming", company_id=cid)) == [t["manana"]["id"], t["proxima"]["id"]]


def test_filtro_due_invalido_422(client, auth):
    assert client.get("/api/tasks", params={"due": "ayer"}, headers=auth).status_code == 422


def test_filtro_done(client, auth, company, tasks_by_due):
    t, cid = tasks_by_due, company["id"]
    assert ids(list_tasks(client, auth, done=True, company_id=cid)) == [t["vencida_hecha"]["id"]]
    assert t["vencida_hecha"]["id"] not in ids(list_tasks(client, auth, done=False, company_id=cid))


def test_orden_por_fecha_y_sin_fecha_al_final(client, auth, company, tasks_by_due):
    t = tasks_by_due
    expected = [t[k]["id"] for k in ("vencida_hecha", "vencida", "hoy", "manana", "proxima", "sin_fecha")]
    assert ids(list_tasks(client, auth, company_id=company["id"])) == expected


def test_quitar_fecha_de_una_tarea(client, auth, company):
    task = create_task(client, auth, company_id=company["id"], due_date=str(date.today()))
    r = client.patch(f"/api/tasks/{task['id']}", json={"due_date": None}, headers=auth)
    assert r.status_code == 200
    assert r.json()["due_date"] is None


# --- Actividades ---------------------------------------------------------------

def test_actividad_requiere_un_enlace(client, auth):
    r = client.post("/api/activities", json={"type": "note", "subject": "Suelta"}, headers=auth)
    assert r.status_code == 422


def test_actividad_enlaces_inexistentes_422(client, auth):
    for field in ("contact_id", "company_id", "deal_id"):
        r = client.post("/api/activities", json={"type": "note", "subject": "x", field: 999999}, headers=auth)
        assert r.status_code == 422, field


def test_actividad_tipo_y_asunto_validos(client, auth, company):
    for payload in ({"type": "fax", "subject": "x"}, {"type": "system", "subject": "x"},
                    {"type": "call", "subject": "  "}):
        r = client.post("/api/activities", json={**payload, "company_id": company["id"]}, headers=auth)
        assert r.status_code == 422, payload


def test_actividad_usuario_es_el_actual(client, auth, me, other_user, company):
    """user_id siempre es quien la registra, aunque el cliente intente enviar otro."""
    other_id, other_headers = other_user
    r = client.post("/api/activities", json={"type": "call", "subject": "Llamada",
                                             "company_id": company["id"], "user_id": me["id"]},
                    headers=other_headers)
    assert r.status_code == 201, r.text
    assert r.json()["user_id"] == other_id
    assert r.json()["user_name"] == "Bea Vendedora"

    r = client.post("/api/activities", json={"type": "email", "subject": "Email",
                                             "company_id": company["id"]}, headers=auth)
    assert r.json()["user_id"] == me["id"]


def test_actividades_orden_y_fecha_por_defecto(client, auth, company):
    cid = company["id"]
    before = datetime.now() - timedelta(seconds=5)
    old = client.post("/api/activities", json={"type": "meeting", "subject": "Antigua", "company_id": cid,
                                               "occurred_at": "2025-01-15T10:00:00"}, headers=auth).json()
    new = client.post("/api/activities", json={"type": "note", "subject": "Ahora", "company_id": cid},
                      headers=auth).json()
    assert datetime.fromisoformat(new["occurred_at"]) >= before
    assert old["occurred_at"] == "2025-01-15T10:00:00"

    r = client.get("/api/activities", params={"company_id": cid}, headers=auth)
    assert [a["id"] for a in r.json()] == [new["id"], old["id"]]


def test_borrar_actividad(client, auth, company):
    act = client.post("/api/activities", json={"type": "note", "subject": "Borrar", "company_id": company["id"]},
                      headers=auth).json()
    assert client.delete(f"/api/activities/{act['id']}", headers=auth).status_code == 204
    assert client.get("/api/activities", params={"company_id": company["id"]}, headers=auth).json() == []
    assert client.delete(f"/api/activities/{act['id']}", headers=auth).status_code == 404


# --- Búsqueda ------------------------------------------------------------------

def search(client, headers, q):
    r = client.get("/api/search", params={"q": q}, headers=headers)
    assert r.status_code == 200
    return r.json()


def test_busqueda_texto_corto_vacia(client, auth):
    empty = {"companies": [], "contacts": [], "deals": []}
    assert search(client, auth, "") == empty
    assert search(client, auth, " a ") == empty


def test_busqueda_encuentra_cada_tipo(client, auth):
    tag = uuid.uuid4().hex[:8]
    company = client.post("/api/companies", json={"name": f"Zafiro {tag} SL"}, headers=auth).json()
    contact = client.post("/api/contacts", json={"first_name": "Ramona", "last_name": f"Q{tag}",
                                                 "email": f"ramona.{tag}@zafiro.es",
                                                 "company_id": company["id"]}, headers=auth).json()
    deal = client.post("/api/deals", json={"title": f"Licencias {tag}", "value": 1500}, headers=auth).json()

    # Sin distinguir mayúsculas y por coincidencia parcial.
    res = search(client, auth, tag.upper())
    assert [c["id"] for c in res["companies"]] == [company["id"]]
    assert [c["id"] for c in res["contacts"]] == [contact["id"]]
    assert res["contacts"][0] == {"id": contact["id"], "name": f"Ramona Q{tag}", "company_name": company["name"]}
    assert res["deals"] == [{"id": deal["id"], "title": deal["title"], "value": 1500}]

    # Nombre completo ("nombre apellido") y email.
    assert [c["id"] for c in search(client, auth, f"ramona q{tag[:4]}")["contacts"]] == [contact["id"]]
    assert [c["id"] for c in search(client, auth, f"ramona.{tag}@")["contacts"]] == [contact["id"]]


def test_busqueda_maximo_cinco_por_tipo(client, auth):
    tag = uuid.uuid4().hex[:8]
    for i in range(7):
        client.post("/api/deals", json={"title": f"Lote {tag} {i}"}, headers=auth)
    assert len(search(client, auth, f"lote {tag}")["deals"]) == 5
