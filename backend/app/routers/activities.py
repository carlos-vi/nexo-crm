"""Endpoints de /api/activities. Ver docs/api.md."""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..crud import ensure_exists, get_or_404
from ..database import get_db
from ..models import Activity, Company, Contact, Deal
from ..schemas import ActivityCreate, ActivityOut
from ..security import CurrentUser

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("", response_model=list[ActivityOut])
def list_activities(
    contact_id: int | None = None,
    company_id: int | None = None,
    deal_id: int | None = None,
    db: Session = Depends(get_db),
):
    # El historial (timeline) se lee de lo más reciente a lo más antiguo.
    stmt = select(Activity).order_by(Activity.occurred_at.desc(), Activity.id.desc())
    # Cada filtro añade un WHERE; varios WHERE se combinan con AND.
    if contact_id is not None:
        stmt = stmt.where(Activity.contact_id == contact_id)
    if company_id is not None:
        stmt = stmt.where(Activity.company_id == company_id)
    if deal_id is not None:
        stmt = stmt.where(Activity.deal_id == deal_id)
    return db.scalars(stmt).all()


@router.post("", response_model=ActivityOut, status_code=201)
def create_activity(data: ActivityCreate, user: CurrentUser, db: Session = Depends(get_db)):
    # Una actividad suelta, sin contacto, empresa ni deal, no aparecería en
    # ningún historial: exigimos al menos un enlace.
    if data.contact_id is None and data.company_id is None and data.deal_id is None:
        raise HTTPException(
            status_code=422,
            detail="At least one of contact_id, company_id or deal_id is required",
        )
    ensure_exists(db, Contact, data.contact_id, "contact")
    ensure_exists(db, Company, data.company_id, "company")
    ensure_exists(db, Deal, data.deal_id, "deal")

    values = data.model_dump()
    if values["occurred_at"] is None:
        # Sin fecha, se usa el valor por defecto del modelo (ahora).
        del values["occurred_at"]
    activity = Activity(**values, user_id=user.id)
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


@router.delete("/{activity_id}", status_code=204)
def delete_activity(activity_id: int, db: Session = Depends(get_db)):
    activity = get_or_404(db, Activity, activity_id)
    db.delete(activity)
    db.commit()
    return Response(status_code=204)
