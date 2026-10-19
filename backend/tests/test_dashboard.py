"""Tests de GET /api/dashboard.

La base de datos de tests la comparten todos los ficheros, así que creamos un
vendedor propio y consultamos con ?owner_id=: las cifras filtradas solo
dependen de los deals que creamos aquí.
"""
from datetime import datetime, timedelta

import pytest

from app.database import SessionLocal
from app.models import Deal, User
from app.security import hash_password


@pytest.fixture(scope="module")
def seller(client):
    """Un vendedor exclusivo de este fichero. Devuelve su id."""
    with SessionLocal() as db:
        user = User(name="Zoe Dashboard", email="zoe.dashboard@crm.local",
                    password_hash=hash_password("zoe12345"))
        db.add(user)
        db.commit()
        return user.id


@pytest.fixture(scope="module")
def stages(client, auth):
    """Etapas por nombre: {'Lead': {...}, 'Ganado': {...}, ...}."""
    return {s["name"]: s for s in client.get("/api/stages", headers=auth).json()}


def _create_deal(client, auth, owner_id, stage_id, value, title):
    r = client.post("/api/deals", headers=auth,
                    json={"title": title, "value": value, "stage_id": stage_id, "owner_id": owner_id})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _set_dates(deal_id, created_at, closed_at):
    """Fija fechas a mano (la API pone closed_at = ahora y no deja cambiarlas)."""
    with SessionLocal() as db:
        deal = db.get(Deal, deal_id)
        deal.created_at = created_at
        deal.closed_at = closed_at
        db.commit()


def _dashboard(client, auth, owner_id=None):
    url = "/api/dashboard" + (f"?owner_id={owner_id}" if owner_id else "")
    r = client.get(url, headers=auth)
    assert r.status_code == 200, r.text
    return r.json()


def test_requires_auth(client):
    assert client.get("/api/dashboard").status_code == 401


def test_empty_owner_has_null_rates(client, auth, seller):
    data = _dashboard(client, auth, seller)
    kpis = data["kpis"]
    assert kpis["open_count"] == 0 and kpis["open_value"] == 0
    assert kpis["win_rate"] is None
    assert kpis["avg_won_value"] is None
    assert kpis["avg_sales_cycle_days"] is None
    assert len(data["revenue_by_month"]) == 12
    assert data["revenue_by_month"][-1]["month"] == datetime.now().strftime("%Y-%m")


def test_metrics_for_owner(client, auth, seller, stages):
    now = datetime.now()
    first_of_month = now.replace(day=1)
    last_month = first_of_month - timedelta(days=1)  # algún día del mes pasado

    # Dos deals abiertos: 10.000 en Propuesta (50 %) y 4.000 en Lead (10 %).
    _create_deal(client, auth, seller, stages["Propuesta"]["id"], 10000, "Dash abierto 1")
    _create_deal(client, auth, seller, stages["Lead"]["id"], 4000, "Dash abierto 2")
    # Ganado este mes (ciclo de 10 días) y ganado el mes pasado (ciclo de 20 días).
    won_now = _create_deal(client, auth, seller, stages["Ganado"]["id"], 6000, "Dash ganado 1")
    _set_dates(won_now, now - timedelta(days=10), now)
    won_before = _create_deal(client, auth, seller, stages["Ganado"]["id"], 2000, "Dash ganado 2")
    _set_dates(won_before, last_month - timedelta(days=20), last_month)
    # Un perdido reciente → tasa de éxito 2 / 3.
    _create_deal(client, auth, seller, stages["Perdido"]["id"], 9999, "Dash perdido")

    data = _dashboard(client, auth, seller)
    kpis = data["kpis"]
    assert kpis["open_count"] == 2
    assert kpis["open_value"] == 14000
    assert kpis["weighted_value"] == 10000 * 0.5 + 4000 * 0.1
    assert kpis["won_this_month"] == 6000
    assert kpis["won_this_month_count"] == 1
    assert kpis["won_last_month"] == 2000
    assert kpis["win_rate"] == pytest.approx(66.7)
    assert kpis["avg_won_value"] == 4000
    assert kpis["avg_sales_cycle_days"] == pytest.approx(15, abs=0.01)

    funnel = {row["name"]: row for row in data["funnel"]}
    by_position = sorted(stages.values(), key=lambda s: s["position"])
    assert [row["stage_id"] for row in data["funnel"]] == [s["id"] for s in by_position]
    assert funnel["Propuesta"]["count"] == 1 and funnel["Propuesta"]["value"] == 10000
    assert funnel["Ganado"]["is_won"] and funnel["Ganado"]["count"] == 2
    assert funnel["Perdido"]["is_lost"] and funnel["Perdido"]["value"] == 9999

    months = {row["month"]: row for row in data["revenue_by_month"]}
    assert months[now.strftime("%Y-%m")] == {"month": now.strftime("%Y-%m"), "value": 6000, "count": 1}
    assert months[last_month.strftime("%Y-%m")]["value"] == 2000

    # La clasificación es de todo el equipo, aunque se filtre por responsable.
    row = next(r for r in data["leaderboard"] if r["user_id"] == seller)
    assert row["name"] == "Zoe Dashboard"
    assert row["open_value"] == 14000 and row["open_count"] == 2
    expected_won = 6000 + (2000 if last_month.year == now.year else 0)
    assert row["won_value"] == expected_won
    values = [r["won_value"] for r in data["leaderboard"]]
    assert values == sorted(values, reverse=True)


def test_global_view_includes_owner_deals(client, auth, seller, stages):
    before = _dashboard(client, auth)["kpis"]
    _create_deal(client, auth, seller, stages["Negociación"]["id"], 1234, "Dash delta")
    after = _dashboard(client, auth)["kpis"]
    assert after["open_count"] == before["open_count"] + 1
    assert after["open_value"] == pytest.approx(before["open_value"] + 1234)
    assert after["weighted_value"] == pytest.approx(before["weighted_value"] + 1234 * 0.75)


def test_recent_activity(client, auth, seller, stages):
    deal_id = _create_deal(client, auth, seller, stages["Lead"]["id"], 100, "Dash con actividad")
    r = client.post("/api/activities", headers=auth,
                    json={"type": "call", "subject": "Llamada dashboard", "deal_id": deal_id})
    assert r.status_code == 201, r.text

    feed = _dashboard(client, auth)["recent_activity"]
    assert len(feed) <= 8
    # Nuestra llamada es la más reciente (o empata en hora con otra).
    item = next(a for a in feed if a["subject"] == "Llamada dashboard")
    assert item["type"] == "call"
    assert item["deal_id"] == deal_id
    assert item["target_name"] == "Dash con actividad"
    assert item["user_name"] == "Admin"
    times = [a["occurred_at"] for a in feed]
    assert times == sorted(times, reverse=True)
