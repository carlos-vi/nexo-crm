"""Tests de empresas y contactos: CRUD, responsables, contadores y CSV.

La base de datos se comparte con otros ficheros de tests, así que usamos
nombres únicos y no comprobamos totales globales.
"""
import csv
import io
import uuid

import pytest


def unique(prefix: str) -> str:
    return f"{prefix} {uuid.uuid4().hex[:8]}"


def parse_csv(response):
    text = response.content.decode("utf-8")
    assert text.startswith("\ufeff"), "el CSV debe empezar por el BOM"
    return list(csv.reader(io.StringIO(text[1:])))


def upload(client, auth, path, content: str, dry_run=True):
    files = {"file": ("datos.csv", content.encode("utf-8"), "text/csv")}
    return client.post(f"{path}?dry_run={str(dry_run).lower()}", headers=auth, files=files)


@pytest.fixture(scope="module")
def stages(client, auth):
    data = client.get("/api/stages", headers=auth).json()
    return {
        "open": next(s["id"] for s in data if not s["is_won"] and not s["is_lost"]),
        "won": next(s["id"] for s in data if s["is_won"]),
        "lost": next(s["id"] for s in data if s["is_lost"]),
    }


# --- Empresas ---------------------------------------------------------------

def test_company_crud_and_owner(client, auth, other_user):
    other_id, _ = other_user
    name = unique("Acme")
    r = client.post("/api/companies", headers=auth, json={"name": name, "domain": "acme.test"})
    assert r.status_code == 201
    company = r.json()
    me = client.get("/api/auth/me", headers=auth).json()
    assert company["owner_id"] == me["id"]
    assert company["contact_count"] == 0 and company["open_deal_count"] == 0

    r = client.patch(f"/api/companies/{company['id']}", headers=auth, json={"owner_id": other_id})
    assert r.status_code == 200
    assert r.json()["owner_name"] == "Bea Vendedora"

    r = client.get(f"/api/companies?owner_id={other_id}&q={name}", headers=auth)
    assert [c["id"] for c in r.json()] == [company["id"]]
    r = client.get(f"/api/companies?owner_id={me['id']}&q={name}", headers=auth)
    assert r.json() == []

    assert client.patch(f"/api/companies/{company['id']}", headers=auth, json={"owner_id": 99999}).status_code == 422
    assert client.delete(f"/api/companies/{company['id']}", headers=auth).status_code == 204
    assert client.get(f"/api/companies/{company['id']}", headers=auth).status_code == 404


def test_company_counts(client, auth, stages):
    name = unique("Contadores")
    company = client.post("/api/companies", headers=auth, json={"name": name}).json()
    cid = company["id"]
    contact = client.post("/api/contacts", headers=auth, json={"first_name": "Ana", "company_id": cid}).json()
    client.post("/api/contacts", headers=auth, json={"first_name": "Luis", "company_id": cid})
    for value, stage in ((1000, "open"), (500.5, "open"), (9000, "won"), (300, "lost")):
        r = client.post("/api/deals", headers=auth, json={
            "title": "Deal", "value": value, "stage_id": stages[stage],
            "company_id": cid, "contact_id": contact["id"],
        })
        assert r.status_code == 201, r.text

    listed = client.get(f"/api/companies?q={name}", headers=auth).json()[0]
    assert listed["contact_count"] == 2
    assert listed["open_deal_count"] == 2
    assert listed["open_deal_value"] == pytest.approx(1500.5)

    detail = client.get(f"/api/companies/{cid}", headers=auth).json()
    assert detail["contact_count"] == 2 and detail["open_deal_count"] == 2
    assert len(detail["contacts"]) == 2 and len(detail["deals"]) == 4
    ana = next(c for c in detail["contacts"] if c["first_name"] == "Ana")
    assert ana["open_deal_count"] == 2

    assert client.get(f"/api/contacts/{contact['id']}", headers=auth).json()["open_deal_count"] == 2
    # Con contactos o deals no se puede borrar.
    r = client.delete(f"/api/companies/{cid}", headers=auth)
    assert r.status_code == 409


def test_company_export(client, auth, other_user):
    other_id, _ = other_user
    tag = uuid.uuid4().hex[:8]
    client.post("/api/companies", headers=auth, json={"name": f"Exp Añandú {tag}", "industry": "Logística"})
    client.post("/api/companies", headers=auth, json={"name": f"Exp Otra {tag}", "owner_id": other_id})

    r = client.get(f"/api/companies/export?q={tag}", headers=auth)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    rows = parse_csv(r)
    assert rows[0] == ["name", "domain", "industry", "owner_email"]
    assert rows[1] == [f"Exp Añandú {tag}", "", "Logística", "admin@crm.local"]
    assert rows[2][0] == f"Exp Otra {tag}" and rows[2][3] == "bea@crm.local"

    rows = parse_csv(client.get(f"/api/companies/export?q={tag}&owner_id={other_id}", headers=auth))
    assert len(rows) == 2


def test_company_import_dry_run_and_real(client, auth):
    tag = uuid.uuid4().hex[:8]
    existing = f"Imp Existe {tag}"
    client.post("/api/companies", headers=auth, json={"name": existing})
    content = (
        "\ufeffname;domain;industry;owner_email;extra\n"   # BOM, ';' y una columna desconocida
        f"Imp Uno {tag};uno.test;Software;bea@crm.local;x\n"
        f"Imp Dos {tag};;;;\n"
        ";sin-nombre.test;;;\n"
        f"{existing.upper()};;;;\n"
        f"Imp Tres {tag};;;nadie@crm.local;\n"
        "\n"
        f"imp uno {tag};;;;\n"   # duplicada dentro del propio fichero
    )
    r = upload(client, auth, "/api/companies/import", content, dry_run=True)
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["total"] == 6
    assert result["valid"] == 2
    assert result["created"] == 0
    assert [e["row"] for e in result["errors"]] == [4, 5, 6, 8]
    assert "ya existe" in result["errors"][1]["message"]
    assert client.get(f"/api/companies?q=Imp Uno {tag}", headers=auth).json() == []

    r = upload(client, auth, "/api/companies/import", content, dry_run=False)
    result = r.json()
    assert result["created"] == 2
    created = client.get(f"/api/companies?q=Imp Uno {tag}", headers=auth).json()
    assert created[0]["domain"] == "uno.test" and created[0]["owner_name"] == "Bea Vendedora"
    dos = client.get(f"/api/companies?q=Imp Dos {tag}", headers=auth).json()
    assert dos[0]["owner_name"] == "Admin"

    # Repetir la importación: ahora todas las válidas "ya existen".
    assert upload(client, auth, "/api/companies/import", content, dry_run=False).json()["created"] == 0


def test_import_bad_files(client, auth):
    assert upload(client, auth, "/api/companies/import", "domain,industry\nx,y\n").status_code == 422
    assert upload(client, auth, "/api/companies/import", "").status_code == 422
    big = "name\n" + ("x" * 100 + "\n") * 11_000
    assert upload(client, auth, "/api/companies/import", big).status_code == 413


# --- Contactos --------------------------------------------------------------

def test_contact_crud_owner_and_filters(client, auth, other_user):
    other_id, _ = other_user
    company = client.post("/api/companies", headers=auth, json={"name": unique("CoContactos")}).json()
    last = unique("Pérez")
    r = client.post("/api/contacts", headers=auth, json={
        "first_name": "Marta", "last_name": last, "company_id": company["id"], "owner_id": other_id,
    })
    assert r.status_code == 201
    contact = r.json()
    assert contact["owner_name"] == "Bea Vendedora" and contact["company_name"] == company["name"]
    assert contact["open_deal_count"] == 0

    assert [c["id"] for c in client.get(f"/api/contacts?q={last}&owner_id={other_id}", headers=auth).json()] == [contact["id"]]
    assert [c["id"] for c in client.get(f"/api/contacts?company_id={company['id']}", headers=auth).json()] == [contact["id"]]

    r = client.patch(f"/api/contacts/{contact['id']}", headers=auth, json={"job_title": "CTO", "company_id": None})
    assert r.json()["job_title"] == "CTO" and r.json()["company_id"] is None
    assert client.delete(f"/api/contacts/{contact['id']}", headers=auth).status_code == 204


def test_contact_export(client, auth):
    company = client.post("/api/companies", headers=auth, json={"name": unique("CoExport")}).json()
    last = unique("Exportado")
    client.post("/api/contacts", headers=auth, json={
        "first_name": "José", "last_name": last, "email": "jose@x.test", "phone": "600",
        "job_title": "CEO", "company_id": company["id"],
    })
    r = client.get(f"/api/contacts/export?company_id={company['id']}", headers=auth)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    rows = parse_csv(r)
    assert rows[0] == ["first_name", "last_name", "email", "phone", "job_title", "company", "owner_email"]
    assert rows[1:] == [["José", last, "jose@x.test", "600", "CEO", company["name"], "admin@crm.local"]]


def test_contact_import(client, auth):
    company = client.post("/api/companies", headers=auth, json={"name": unique("CoImport")}).json()
    last = unique("Importado")
    content = (
        "first_name,last_name,email,company,owner_email\n"
        f"Ana,{last},ana@x.test,{company['name'].lower()},bea@crm.local\n"
        f"Luis,{last},,,\n"
        f",{last},,,\n"
        f"Eva,{last},no-es-un-email,,\n"
        f"Pau,{last},,Empresa Inexistente {last},\n"
    )
    result = upload(client, auth, "/api/contacts/import", content).json()
    assert (result["total"], result["valid"], result["created"]) == (5, 2, 0)
    assert [e["row"] for e in result["errors"]] == [4, 5, 6]
    assert "Email" in result["errors"][1]["message"]
    assert "empresa" in result["errors"][2]["message"]
    assert client.get(f"/api/contacts?q={last}", headers=auth).json() == []

    result = upload(client, auth, "/api/contacts/import", content, dry_run=False).json()
    assert result["created"] == 2
    contacts = client.get(f"/api/contacts?q={last}", headers=auth).json()
    ana = next(c for c in contacts if c["first_name"] == "Ana")
    assert ana["company_id"] == company["id"] and ana["owner_name"] == "Bea Vendedora"
    assert len(contacts) == 2
