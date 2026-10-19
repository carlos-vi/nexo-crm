"""Endpoints de /api/contacts. Ver docs/api.md."""
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session

from ..crud import apply_update, ensure_exists, get_or_404, resolve_owner
from ..csv_io import EMAIL_RE, csv_response, read_csv_upload, resolve_owner_email, users_by_email
from ..database import get_db
from ..models import Activity, Company, Contact, Deal, Stage, Task, User
from ..schemas import (
    ContactCreate,
    ContactDetail,
    ContactOut,
    ContactUpdate,
    DealOut,
    ImportResult,
    ImportRowError,
)
from ..security import CurrentUser

router = APIRouter(prefix="/api/contacts", tags=["contacts"])

CONTACT_CSV_COLUMNS = ["first_name", "last_name", "email", "phone", "job_title", "company", "owner_email"]


def to_contact_out(db: Session, contacts: list[Contact]) -> list[ContactOut]:
    """Convierte a esquema añadiendo open_deal_count con una sola consulta agrupada."""
    ids = [c.id for c in contacts]
    counts: dict[int, int] = {}
    if ids:
        counts = dict(db.execute(
            select(Deal.contact_id, func.count())
            .join(Stage, Deal.stage_id == Stage.id)
            .where(Deal.contact_id.in_(ids), Stage.is_won.is_(False), Stage.is_lost.is_(False))
            .group_by(Deal.contact_id)
        ).all())
    return [
        ContactOut.model_validate(c).model_copy(update={"open_deal_count": counts.get(c.id, 0)})
        for c in contacts
    ]


def filtered_contacts(db: Session, q: str | None, company_id: int | None, owner_id: int | None) -> list[Contact]:
    stmt = select(Contact)
    if owner_id is not None:
        stmt = stmt.where(Contact.owner_id == owner_id)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(
            Contact.first_name.ilike(pattern),
            Contact.last_name.ilike(pattern),
            Contact.email.ilike(pattern),
        ))
    if company_id is not None:
        stmt = stmt.where(Contact.company_id == company_id)
    stmt = stmt.order_by(func.lower(Contact.first_name), func.lower(Contact.last_name), Contact.id)
    return list(db.scalars(stmt).all())


@router.get("", response_model=list[ContactOut])
def list_contacts(
    q: str | None = None,
    company_id: int | None = None,
    owner_id: int | None = None,
    db: Session = Depends(get_db),
):
    return to_contact_out(db, filtered_contacts(db, q, company_id, owner_id))


# /export e /import van antes que /{contact_id} (ver la nota en companies.py).
@router.get("/export")
def export_contacts(
    q: str | None = None,
    company_id: int | None = None,
    owner_id: int | None = None,
    db: Session = Depends(get_db),
):
    rows = [
        [
            c.first_name, c.last_name or "", c.email or "", c.phone or "", c.job_title or "",
            c.company_name or "", c.owner.email if c.owner else "",
        ]
        for c in filtered_contacts(db, q, company_id, owner_id)
    ]
    return csv_response(CONTACT_CSV_COLUMNS, rows, "contactos")


@router.post("/import", response_model=ImportResult)
def import_contacts(
    user: CurrentUser,
    file: UploadFile = File(...),
    dry_run: bool = True,
    db: Session = Depends(get_db),
):
    rows = read_csv_upload(file, required="first_name")
    users = users_by_email(db)
    # Empresas por nombre en minúsculas, para enlazar la columna "company".
    companies = {name.lower(): cid for cid, name in db.execute(select(Company.id, Company.name))}

    errors: list[ImportRowError] = []
    to_create: list[Contact] = []
    for line_no, row in rows:
        problems = []
        if not row.get("first_name"):
            problems.append("El nombre (first_name) es obligatorio")
        email = row.get("email", "")
        if email and not EMAIL_RE.match(email):
            problems.append(f"Email no válido: '{email}'")
        company_name = row.get("company", "")
        company_id = None
        if company_name:
            company_id = companies.get(company_name.lower())
            if company_id is None:
                problems.append(f"No existe la empresa '{company_name}'")
        owner_id, owner_error = resolve_owner_email(row.get("owner_email", ""), users, user)
        if owner_error:
            problems.append(owner_error)
        if problems:
            errors.append(ImportRowError(row=line_no, message=". ".join(problems)))
            continue
        to_create.append(Contact(
            first_name=row["first_name"],
            last_name=row.get("last_name") or None,
            email=email or None,
            phone=row.get("phone") or None,
            job_title=row.get("job_title") or None,
            company_id=company_id,
            owner_id=owner_id,
        ))

    if not dry_run and to_create:
        db.add_all(to_create)
        db.commit()
    return ImportResult(
        total=len(rows),
        valid=len(to_create),
        errors=errors,
        created=0 if dry_run else len(to_create),
    )


@router.post("", response_model=ContactOut, status_code=201)
def create_contact(data: ContactCreate, user: CurrentUser, db: Session = Depends(get_db)):
    # Si nos dan una empresa, comprobamos que existe y respondemos 422 con un
    # mensaje claro (si no, la clave foránea fallaría con un error 500).
    ensure_exists(db, Company, data.company_id, "company")
    contact = Contact(**data.model_dump())
    contact.owner_id = resolve_owner(db, data.owner_id, user)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return to_contact_out(db, [contact])[0]


@router.get("/{contact_id}", response_model=ContactDetail)
def get_contact(contact_id: int, db: Session = Depends(get_db)):
    contact = get_or_404(db, Contact, contact_id)
    deals = db.scalars(
        select(Deal)
        .where(Deal.contact_id == contact_id)
        .order_by(Deal.created_at.desc(), Deal.id.desc())
    ).all()
    return ContactDetail(
        **to_contact_out(db, [contact])[0].model_dump(),
        deals=[DealOut.model_validate(d) for d in deals],
    )


@router.patch("/{contact_id}", response_model=ContactOut)
def update_contact(contact_id: int, data: ContactUpdate, db: Session = Depends(get_db)):
    contact = get_or_404(db, Contact, contact_id)
    if "first_name" in data.model_fields_set and data.first_name is None:
        raise HTTPException(status_code=422, detail="first_name cannot be null")
    # company_id = null es válido (desvincular el contacto de su empresa).
    ensure_exists(db, Company, data.company_id, "company")
    if "owner_id" in data.model_fields_set:
        ensure_exists(db, User, data.owner_id, "user")
    apply_update(contact, data)
    db.commit()
    db.refresh(contact)
    return to_contact_out(db, [contact])[0]


@router.delete("/{contact_id}", status_code=204)
def delete_contact(contact_id: int, db: Session = Depends(get_db)):
    contact = get_or_404(db, Contact, contact_id)
    # Los deals sobreviven al contacto: la oportunidad sigue siendo de la
    # empresa aunque la persona se vaya. Solo se quita el enlace.
    db.execute(update(Deal).where(Deal.contact_id == contact_id).values(contact_id=None))
    # El historial y las tareas de esa persona, en cambio, se borran.
    db.execute(delete(Activity).where(Activity.contact_id == contact_id))
    db.execute(delete(Task).where(Task.contact_id == contact_id))
    db.delete(contact)
    db.commit()
    return Response(status_code=204)
