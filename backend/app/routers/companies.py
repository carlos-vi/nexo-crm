"""Endpoints de /api/companies. Ver docs/api.md."""
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..crud import apply_update, ensure_exists, get_or_404, resolve_owner
from ..csv_io import csv_response, read_csv_upload, resolve_owner_email, users_by_email
from ..database import get_db
from ..models import Activity, Company, Contact, Deal, Stage, Task, User
from ..schemas import (
    CompanyCreate,
    CompanyDetail,
    CompanyOut,
    CompanyUpdate,
    DealOut,
    ImportResult,
    ImportRowError,
)
from ..security import CurrentUser

router = APIRouter(prefix="/api/companies", tags=["companies"])

COMPANY_CSV_COLUMNS = ["name", "domain", "industry", "owner_email"]


# --- Estadísticas para los listados -----------------------------------------

def company_stats(db: Session, company_ids: list[int]) -> dict[int, dict]:
    """Nº de contactos y deals abiertos (y su valor) por empresa.

    Dos consultas con GROUP BY para toda la lista, en vez de una por empresa
    (el famoso problema "N+1").
    """
    stats = {cid: {"contact_count": 0, "open_deal_count": 0, "open_deal_value": 0.0} for cid in company_ids}
    if not company_ids:
        return stats
    contact_rows = db.execute(
        select(Contact.company_id, func.count())
        .where(Contact.company_id.in_(company_ids))
        .group_by(Contact.company_id)
    )
    for cid, count in contact_rows:
        stats[cid]["contact_count"] = count
    deal_rows = db.execute(
        select(Deal.company_id, func.count(), func.coalesce(func.sum(Deal.value), 0))
        .join(Stage, Deal.stage_id == Stage.id)
        .where(Deal.company_id.in_(company_ids), Stage.is_won.is_(False), Stage.is_lost.is_(False))
        .group_by(Deal.company_id)
    )
    for cid, count, value in deal_rows:
        stats[cid]["open_deal_count"] = count
        stats[cid]["open_deal_value"] = float(value)
    return stats


def to_company_out(db: Session, companies: list[Company]) -> list[CompanyOut]:
    stats = company_stats(db, [c.id for c in companies])
    # model_copy(update=...) crea una copia del esquema con los campos calculados.
    return [CompanyOut.model_validate(c).model_copy(update=stats[c.id]) for c in companies]


def filtered_companies(db: Session, q: str | None, owner_id: int | None) -> list[Company]:
    stmt = select(Company)
    if owner_id is not None:
        stmt = stmt.where(Company.owner_id == owner_id)
    if q:
        # ilike = LIKE sin distinguir mayúsculas; los % permiten coincidencia parcial.
        stmt = stmt.where(Company.name.ilike(f"%{q}%"))
    # Ordenamos en minúsculas para que "acme" y "Acme" queden juntas.
    return list(db.scalars(stmt.order_by(func.lower(Company.name), Company.id)).all())


# --- Endpoints --------------------------------------------------------------

@router.get("", response_model=list[CompanyOut])
def list_companies(q: str | None = None, owner_id: int | None = None, db: Session = Depends(get_db)):
    return to_company_out(db, filtered_companies(db, q, owner_id))


# Ojo: /export e /import deben declararse ANTES que /{company_id}. FastAPI
# prueba las rutas en orden y "export" encajaría en /{company_id} (y daría 422
# al no ser un número).
@router.get("/export")
def export_companies(q: str | None = None, owner_id: int | None = None, db: Session = Depends(get_db)):
    rows = [
        [c.name, c.domain or "", c.industry or "", c.owner.email if c.owner else ""]
        for c in filtered_companies(db, q, owner_id)
    ]
    return csv_response(COMPANY_CSV_COLUMNS, rows, "empresas")


@router.post("/import", response_model=ImportResult)
def import_companies(
    user: CurrentUser,
    file: UploadFile = File(...),
    dry_run: bool = True,
    db: Session = Depends(get_db),
):
    rows = read_csv_upload(file, required="name")
    users = users_by_email(db)
    # Nombres ya usados (en la BD y en las filas anteriores del propio fichero).
    existing = {name.lower() for name in db.scalars(select(Company.name))}

    errors: list[ImportRowError] = []
    to_create: list[Company] = []
    for line_no, row in rows:
        problems = []
        name = row.get("name", "")
        if not name:
            problems.append("El nombre es obligatorio")
        elif name.lower() in existing:
            problems.append(f"La empresa '{name}' ya existe")
        owner_id, owner_error = resolve_owner_email(row.get("owner_email", ""), users, user)
        if owner_error:
            problems.append(owner_error)
        if problems:
            errors.append(ImportRowError(row=line_no, message=". ".join(problems)))
            continue
        existing.add(name.lower())
        to_create.append(Company(
            name=name,
            domain=row.get("domain") or None,
            industry=row.get("industry") or None,
            owner_id=owner_id,
        ))

    if not dry_run and to_create:
        # Todo en una sola transacción: o se crean todas las válidas o ninguna.
        db.add_all(to_create)
        db.commit()
    return ImportResult(
        total=len(rows),
        valid=len(to_create),
        errors=errors,
        created=0 if dry_run else len(to_create),
    )


@router.post("", response_model=CompanyOut, status_code=201)
def create_company(data: CompanyCreate, user: CurrentUser, db: Session = Depends(get_db)):
    company = Company(**data.model_dump())
    company.owner_id = resolve_owner(db, data.owner_id, user)
    db.add(company)
    db.commit()
    db.refresh(company)  # recarga id y created_at, que los pone la base de datos
    return to_company_out(db, [company])[0]


@router.get("/{company_id}", response_model=CompanyDetail)
def get_company(company_id: int, db: Session = Depends(get_db)):
    company = get_or_404(db, Company, company_id)
    # Pedimos las listas relacionadas con su propio orden (el mismo que en
    # los listados), en vez de usar company.contacts, que no garantiza orden.
    contacts = db.scalars(
        select(Contact)
        .where(Contact.company_id == company_id)
        .order_by(func.lower(Contact.first_name), func.lower(Contact.last_name), Contact.id)
    ).all()
    deals = db.scalars(
        select(Deal)
        .where(Deal.company_id == company_id)
        .order_by(Deal.created_at.desc(), Deal.id.desc())
    ).all()
    # Import aquí para evitar un import circular (contacts.py importa de este módulo).
    from .contacts import to_contact_out

    return CompanyDetail(
        **to_company_out(db, [company])[0].model_dump(),
        contacts=to_contact_out(db, list(contacts)),
        deals=[DealOut.model_validate(d) for d in deals],
    )


@router.patch("/{company_id}", response_model=CompanyOut)
def update_company(company_id: int, data: CompanyUpdate, db: Session = Depends(get_db)):
    company = get_or_404(db, Company, company_id)
    # El esquema permite omitir "name", pero no mandarlo como null: la
    # columna es obligatoria.
    if "name" in data.model_fields_set and data.name is None:
        raise HTTPException(status_code=422, detail="name cannot be null")
    if "owner_id" in data.model_fields_set:
        ensure_exists(db, User, data.owner_id, "user")
    apply_update(company, data)
    db.commit()
    db.refresh(company)
    return to_company_out(db, [company])[0]


@router.delete("/{company_id}", status_code=204)
def delete_company(company_id: int, db: Session = Depends(get_db)):
    company = get_or_404(db, Company, company_id)
    # Regla de integridad: no dejamos contactos ni deals "huérfanos". El
    # usuario debe reasignarlos o borrarlos antes (409 = conflicto).
    has_contacts = db.scalar(select(Contact.id).where(Contact.company_id == company_id).limit(1))
    has_deals = db.scalar(select(Deal.id).where(Deal.company_id == company_id).limit(1))
    if has_contacts is not None or has_deals is not None:
        raise HTTPException(status_code=409, detail="No se puede borrar: la empresa tiene contactos o deals")
    # Las actividades y tareas de la empresa no tienen sentido sin ella: se
    # borran. Hay que hacerlo antes que la empresa porque las claves foráneas
    # están activas y SQLite rechazaría dejar filas apuntando a nada.
    db.execute(delete(Activity).where(Activity.company_id == company_id))
    db.execute(delete(Task).where(Task.company_id == company_id))
    db.delete(company)
    db.commit()
    return Response(status_code=204)
