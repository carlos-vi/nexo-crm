"""Endpoints de /api/deals. Ver docs/api.md."""
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..crud import apply_update, ensure_exists, get_or_404, resolve_owner
from ..database import get_db
from ..models import Activity, ActivityType, Company, Contact, Deal, Stage, Task, User
from ..schemas import DealCreate, DealOut, DealUpdate
from ..security import CurrentUser

router = APIRouter(prefix="/api/deals", tags=["deals"])


def _sync_closed_at(deal: Deal, stage: Stage) -> None:
    """Un deal está "cerrado" cuando llega a una etapa final (ganado o perdido).

    Guardar cuándo se cerró permite después medir, por ejemplo, cuánto se ha
    ganado este mes o cuánto tarda de media un deal en cerrarse. Si se vuelve
    a abrir (se arrastra a una etapa abierta), deja de estar cerrado.
    """
    deal.closed_at = datetime.now() if (stage.is_won or stage.is_lost) else None


def _log(db: Session, deal: Deal, user: User, subject: str) -> None:
    """Historial automático: apunta en el timeline del deal lo que ha cambiado.

    Así cualquiera ve en la ficha quién movió el deal y cuándo, sin que nadie
    tenga que escribirlo a mano.
    """
    db.add(Activity(type=ActivityType.SYSTEM, subject=subject, deal_id=deal.id, user_id=user.id))


@router.get("", response_model=list[DealOut])
def list_deals(
    q: str | None = None,
    stage_id: int | None = None,
    company_id: int | None = None,
    contact_id: int | None = None,
    owner_id: int | None = None,
    db: Session = Depends(get_db),
):
    # Más recientes primero; el id desempata deals creados en el mismo segundo.
    stmt = select(Deal).order_by(Deal.created_at.desc(), Deal.id.desc())
    if q:
        stmt = stmt.where(Deal.title.icontains(q, autoescape=True))
    if stage_id is not None:
        stmt = stmt.where(Deal.stage_id == stage_id)
    if company_id is not None:
        stmt = stmt.where(Deal.company_id == company_id)
    if contact_id is not None:
        stmt = stmt.where(Deal.contact_id == contact_id)
    if owner_id is not None:
        stmt = stmt.where(Deal.owner_id == owner_id)
    return db.scalars(stmt).all()


@router.post("", response_model=DealOut, status_code=201)
def create_deal(data: DealCreate, user: CurrentUser, db: Session = Depends(get_db)):
    ensure_exists(db, Company, data.company_id, "company")
    ensure_exists(db, Contact, data.contact_id, "contact")

    if data.stage_id is None:
        # Sin etapa indicada, el deal entra por la primera columna del pipeline.
        stage = db.scalar(select(Stage).order_by(Stage.position).limit(1))
        if stage is None:
            raise HTTPException(status_code=422, detail="No stages defined")
    else:
        ensure_exists(db, Stage, data.stage_id, "stage")
        stage = db.get(Stage, data.stage_id)

    deal = Deal(
        title=data.title,
        # Decimal(str(...)) evita arrastrar los errores de redondeo del float.
        value=Decimal(str(data.value)),
        stage_id=stage.id,
        company_id=data.company_id,
        contact_id=data.contact_id,
        owner_id=resolve_owner(db, data.owner_id, user),
        expected_close_date=data.expected_close_date,
    )
    # Un deal se puede crear directamente como ganado/perdido (p. ej. al importar).
    _sync_closed_at(deal, stage)
    db.add(deal)
    db.flush()  # asigna deal.id para poder enlazar el historial
    _log(db, deal, user, f"Deal creado en {stage.name}")
    db.commit()
    db.refresh(deal)
    return deal


@router.get("/{deal_id}", response_model=DealOut)
def get_deal(deal_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, Deal, deal_id)


@router.patch("/{deal_id}", response_model=DealOut)
def update_deal(deal_id: int, data: DealUpdate, user: CurrentUser, db: Session = Depends(get_db)):
    deal = get_or_404(db, Deal, deal_id)
    sent = data.model_dump(exclude_unset=True)

    # Estos campos no admiten null en la BD: un null explícito es un error del cliente.
    for field in ("title", "value", "stage_id"):
        if field in sent and sent[field] is None:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null")

    if "company_id" in sent:
        ensure_exists(db, Company, data.company_id, "company")
    if "contact_id" in sent:
        ensure_exists(db, Contact, data.contact_id, "contact")

    stage_changed = "stage_id" in sent and sent["stage_id"] != deal.stage_id
    if stage_changed:
        ensure_exists(db, Stage, data.stage_id, "stage")
    owner_changed = "owner_id" in sent and sent["owner_id"] != deal.owner_id
    if owner_changed:
        ensure_exists(db, User, data.owner_id, "user")
    old_stage, old_owner = deal.stage, deal.owner

    apply_update(deal, data)
    if "value" in sent:
        deal.value = Decimal(str(data.value))

    # Esto es lo que ocurre al arrastrar una tarjeta en el Kanban. Solo tocamos
    # closed_at si la etapa cambia de verdad, para no "recerrar" un deal que ya
    # estaba cerrado al reenviar la misma etapa.
    if stage_changed:
        new_stage = db.get(Stage, deal.stage_id)
        _sync_closed_at(deal, new_stage)
        deal.stage_changed_at = datetime.now()
        _log(db, deal, user, f"Etapa: {old_stage.name} → {new_stage.name}")
    if owner_changed:
        new_owner = db.get(User, deal.owner_id) if deal.owner_id else None
        old_name = old_owner.name if old_owner else "nadie"
        new_name = new_owner.name if new_owner else "nadie"
        _log(db, deal, user, f"Responsable: {old_name} → {new_name}")

    db.commit()
    db.refresh(deal)
    return deal


@router.delete("/{deal_id}", status_code=204)
def delete_deal(deal_id: int, db: Session = Depends(get_db)):
    deal = get_or_404(db, Deal, deal_id)
    # SQLite tiene las claves foráneas activadas: hay que borrar primero lo que
    # cuelga del deal (su historial y sus tareas) o el borrado fallaría.
    db.execute(delete(Activity).where(Activity.deal_id == deal_id))
    db.execute(delete(Task).where(Task.deal_id == deal_id))
    db.delete(deal)
    db.commit()
    return Response(status_code=204)
