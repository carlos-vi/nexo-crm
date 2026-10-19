"""Endpoints de /api/search. Ver docs/api.md."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Company, Contact, Deal
from ..schemas import SearchContact, SearchResults

router = APIRouter(prefix="/api/search", tags=["search"])

LIMIT = 5  # resultados por tipo: es un buscador rápido, no un listado


@router.get("", response_model=SearchResults)
def search(q: str = "", db: Session = Depends(get_db)):
    q = q.strip()
    # Con 0 o 1 letras casi todo coincide: no merece la pena consultar.
    if len(q) < 2:
        return SearchResults(companies=[], contacts=[], deals=[])

    companies = db.scalars(
        select(Company)
        .where(Company.name.icontains(q, autoescape=True))
        .order_by(Company.name)
        .limit(LIMIT)
    ).all()

    # Nombre completo "Ana García" para que también encuentre "ana gar".
    full_name = Contact.first_name + " " + func.coalesce(Contact.last_name, "")
    contacts = db.scalars(
        select(Contact)
        .where(or_(
            full_name.icontains(q, autoescape=True),
            Contact.email.icontains(q, autoescape=True),
        ))
        .order_by(Contact.first_name, Contact.last_name)
        .limit(LIMIT)
    ).all()

    deals = db.scalars(
        select(Deal)
        .where(Deal.title.icontains(q, autoescape=True))
        .order_by(Deal.created_at.desc(), Deal.id.desc())
        .limit(LIMIT)
    ).all()

    return SearchResults(
        companies=companies,
        # SearchContact no se corresponde 1:1 con el modelo (name = nombre completo).
        contacts=[
            SearchContact(id=c.id, name=c.full_name, company_name=c.company_name)
            for c in contacts
        ],
        deals=deals,
    )
