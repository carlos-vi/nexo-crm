"""Tests de /api/deals: etapas, responsables, cierre e historial automático."""
import uuid
from datetime import datetime

import pytest


def uid(prefix: str) -> str:
    """Nombre único: la BD de tests es compartida con otros ficheros."""
    return f"{prefix} {uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def stages(client, auth):
    """Etapas por nombre: stages["Ganado"]["id"]."""
    return {s["name"]: s for s in client.get("/api/stages", headers=auth).json()}


@pytest.fixture(scope="module")
def me(client, auth):
    return client.get("/api/auth/me", headers=auth).json()


def create_deal(client, headers, **fields):
    fields.setdefault("title", uid("Deal test"))
    r = client.post("/api/deals", json=fields, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def move(client, headers, deal_id, **fields):
    r = client.patch(f"/api/deals/{deal_id}", json=fields, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def deal_activities(client, headers, deal_id):
    r = client.get("/api/activities", params={"deal_id": deal_id}, headers=headers)
    assert r.status_code == 200
    return r.json()


def system_subjects(client, headers, deal_id):
    """Asuntos del historial automático, del más antiguo al más reciente."""
    acts = deal_activities(client, headers, deal_id)
    return [a["subject"] for a in reversed(acts) if a["type"] == "system"]


# --- Creación -------------------------------------------------------------------

def test_crear_entra_en_la_primera_etapa(client, auth, stages):
    deal = create_deal(client, auth)
    first = min(stages.values(), key=lambda s: s["position"])
    assert deal["stage_id"] == first["id"]
    assert deal["closed_at"] is None
    assert deal["value"] == 0
    assert deal["stage_changed_at"]


def test_responsable_por_defecto_es_quien_crea(client, auth, me, other_user):
    deal = create_deal(client, auth)
    assert deal["owner_id"] == me["id"]
    assert deal["owner_name"] == me["name"]

    other_id, other_headers = other_user
    deal = create_deal(client, other_headers)
    assert deal["owner_id"] == other_id


def test_responsable_explicito(client, auth, other_user):
    other_id, _ = other_user
    deal = create_deal(client, auth, owner_id=other_id)
    assert deal["owner_id"] == other_id
    assert deal["owner_name"] == "Bea Vendedora"


def test_responsable_inexistente_422(client, auth):
    r = client.post("/api/deals", json={"title": uid("Deal"), "owner_id": 999999}, headers=auth)
    assert r.status_code == 422
    deal = create_deal(client, auth)
    r = client.patch(f"/api/deals/{deal['id']}", json={"owner_id": 999999}, headers=auth)
    assert r.status_code == 422


def test_filtro_owner_id(client, auth, me, other_user):
    other_id, _ = other_user
    tag = uid("Filtro owner")
    mine = create_deal(client, auth, title=f"{tag} A")
    theirs = create_deal(client, auth, title=f"{tag} B", owner_id=other_id)

    r = client.get("/api/deals", params={"owner_id": other_id, "q": tag}, headers=auth)
    assert r.status_code == 200
    assert [d["id"] for d in r.json()] == [theirs["id"]]

    r = client.get("/api/deals", params={"owner_id": me["id"], "q": tag}, headers=auth)
    assert [d["id"] for d in r.json()] == [mine["id"]]

    # Sin filtro de q: todos los devueltos son de ese responsable.
    r = client.get("/api/deals", params={"owner_id": other_id}, headers=auth)
    assert r.json() and all(d["owner_id"] == other_id for d in r.json())


def test_crear_con_empresa_y_contacto(client, auth):
    company = client.post("/api/companies", json={"name": uid("Empresa deals")}, headers=auth).json()
    contact = client.post("/api/contacts", json={"first_name": "Nora", "last_name": uid("Test"),
                                                 "company_id": company["id"]}, headers=auth).json()
    deal = create_deal(client, auth, company_id=company["id"], contact_id=contact["id"], value=12000.5)
    assert deal["company_name"] == company["name"]
    assert deal["contact_name"] == f"Nora {contact['last_name']}"
    assert deal["value"] == 12000.5

    for field in ("company_id", "contact_id", "stage_id"):
        r = client.post("/api/deals", json={"title": uid("Deal"), field: 999999}, headers=auth)
        assert r.status_code == 422, field


# --- Validación ----------------------------------------------------------------

@pytest.mark.parametrize("payload", [
    {"title": "Negativo", "value": -1},
    {"title": "Texto", "value": "mucho"},
    {"title": "   "},
    {"title": ""},
    {"value": 100},
])
def test_validacion_al_crear(client, auth, payload):
    r = client.post("/api/deals", json=payload, headers=auth)
    assert r.status_code == 422


@pytest.mark.parametrize("payload", [
    {"value": -5},
    {"value": None},
    {"title": None},
    {"title": "  "},
    {"stage_id": None},
    {"stage_id": 999999},
])
def test_validacion_al_editar(client, auth, payload):
    deal = create_deal(client, auth)
    r = client.patch(f"/api/deals/{deal['id']}", json=payload, headers=auth)
    assert r.status_code == 422


def test_404(client, auth):
    assert client.get("/api/deals/999999", headers=auth).status_code == 404
    r = client.patch("/api/deals/999999", json={"title": "x"}, headers=auth)
    assert r.status_code == 404
    assert r.json()["detail"] == "Deal not found"
    assert client.delete("/api/deals/999999", headers=auth).status_code == 404


# --- Cierre y cambios de etapa -------------------------------------------------

def test_closed_at_al_ganar_perder_y_reabrir(client, auth, stages):
    deal = create_deal(client, auth)

    won = move(client, auth, deal["id"], stage_id=stages["Ganado"]["id"])
    assert won["closed_at"] is not None

    lost = move(client, auth, deal["id"], stage_id=stages["Perdido"]["id"])
    assert lost["closed_at"] is not None

    reopened = move(client, auth, deal["id"], stage_id=stages["Propuesta"]["id"])
    assert reopened["closed_at"] is None


def test_crear_directamente_ganado_queda_cerrado(client, auth, stages):
    deal = create_deal(client, auth, stage_id=stages["Ganado"]["id"])
    assert deal["closed_at"] is not None
    assert system_subjects(client, auth, deal["id"]) == ["Deal creado en Ganado"]


def test_reenviar_misma_etapa_no_recierra(client, auth, stages):
    """Reenviar la etapa en la que ya está no cambia closed_at ni stage_changed_at."""
    deal = create_deal(client, auth)
    won = move(client, auth, deal["id"], stage_id=stages["Ganado"]["id"])
    again = move(client, auth, deal["id"], stage_id=stages["Ganado"]["id"], title="Renombrado")
    assert again["closed_at"] == won["closed_at"]
    assert again["stage_changed_at"] == won["stage_changed_at"]
    assert again["title"] == "Renombrado"


def test_stage_changed_at_solo_con_cambio_real(client, auth, stages):
    deal = create_deal(client, auth)
    original = deal["stage_changed_at"]

    edited = move(client, auth, deal["id"], title=uid("Otro título"), value=500)
    assert edited["stage_changed_at"] == original

    same = move(client, auth, deal["id"], stage_id=deal["stage_id"])
    assert same["stage_changed_at"] == original

    moved = move(client, auth, deal["id"], stage_id=stages["Contactado"]["id"])
    assert datetime.fromisoformat(moved["stage_changed_at"]) > datetime.fromisoformat(original)


# --- Historial automático ------------------------------------------------------

def test_historial_al_crear(client, auth, me):
    deal = create_deal(client, auth)
    acts = deal_activities(client, auth, deal["id"])
    assert len(acts) == 1
    assert acts[0]["type"] == "system"
    assert acts[0]["subject"] == "Deal creado en Lead"
    assert acts[0]["user_id"] == me["id"]
    assert acts[0]["user_name"] == me["name"]


def test_historial_cambios_de_etapa(client, auth, stages):
    deal = create_deal(client, auth)
    move(client, auth, deal["id"], stage_id=stages["Propuesta"]["id"])
    move(client, auth, deal["id"], stage_id=stages["Propuesta"]["id"])  # sin cambio: no apunta nada
    move(client, auth, deal["id"], stage_id=stages["Negociación"]["id"])
    move(client, auth, deal["id"], title=uid("Solo título"))             # no apunta nada
    assert system_subjects(client, auth, deal["id"]) == [
        "Deal creado en Lead",
        "Etapa: Lead → Propuesta",
        "Etapa: Propuesta → Negociación",
    ]


def test_historial_cambio_de_responsable(client, auth, me, other_user):
    """Apunta el cambio y quién lo hizo (el usuario de la petición)."""
    other_id, other_headers = other_user
    deal = create_deal(client, auth)

    updated = move(client, other_headers, deal["id"], owner_id=other_id)
    assert updated["owner_name"] == "Bea Vendedora"
    move(client, other_headers, deal["id"], owner_id=other_id)  # mismo responsable: nada
    move(client, auth, deal["id"], owner_id=None)

    acts = [a for a in reversed(deal_activities(client, auth, deal["id"])) if a["type"] == "system"]
    assert [a["subject"] for a in acts] == [
        "Deal creado en Lead",
        f"Responsable: {me['name']} → Bea Vendedora",
        "Responsable: Bea Vendedora → nadie",
    ]
    assert acts[1]["user_id"] == other_id
    assert acts[1]["user_name"] == "Bea Vendedora"
    assert acts[2]["user_name"] == me["name"]


def test_no_se_puede_crear_actividad_system(client, auth):
    deal = create_deal(client, auth)
    r = client.post("/api/activities", json={"type": "system", "subject": "Falsa", "deal_id": deal["id"]},
                    headers=auth)
    assert r.status_code == 422


# --- Borrado --------------------------------------------------------------------

def test_borrar_deal_borra_actividades_y_tareas(client, auth):
    deal = create_deal(client, auth)
    r = client.post("/api/activities", json={"type": "call", "subject": "Llamada", "deal_id": deal["id"]},
                    headers=auth)
    assert r.status_code == 201
    r = client.post("/api/tasks", json={"title": "Seguimiento", "deal_id": deal["id"]}, headers=auth)
    assert r.status_code == 201

    r = client.delete(f"/api/deals/{deal['id']}", headers=auth)
    assert r.status_code == 204
    assert client.get(f"/api/deals/{deal['id']}", headers=auth).status_code == 404
    assert deal_activities(client, auth, deal["id"]) == []
    assert client.get("/api/tasks", params={"deal_id": deal["id"]}, headers=auth).json() == []
