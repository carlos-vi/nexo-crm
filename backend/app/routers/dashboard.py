"""Endpoints de /api/dashboard: métricas para el panel principal. Ver docs/api.md.

Calculamos casi todo en Python sobre la lista de deals: con los volúmenes de
un CRM pequeño es rapidísimo y mucho más fácil de leer que una consulta SQL
con muchos GROUP BY. Si algún día hubiera cientos de miles de deals, cada
métrica se pasaría a una agregación en la base de datos (func.sum, group_by...).
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Activity, ActivityType, Company, Contact, Deal, Stage, User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


# --- Forma de la respuesta ---------------------------------------------------
# Viven aquí y no en schemas.py porque solo los usa este endpoint.

class Kpis(BaseModel):
    open_value: float           # valor de los deals abiertos (ni ganados ni perdidos)
    open_count: int
    weighted_value: float       # previsión: Σ valor × probabilidad de su etapa
    won_this_month: float
    won_this_month_count: int
    won_last_month: float
    win_rate: float | None      # 0–100, deals cerrados en los últimos 90 días
    avg_won_value: float | None
    avg_sales_cycle_days: float | None


class FunnelStage(BaseModel):
    stage_id: int
    name: str
    is_won: bool
    is_lost: bool
    count: int
    value: float


class MonthRevenue(BaseModel):
    month: str  # "2026-10"
    value: float
    count: int


class LeaderboardRow(BaseModel):
    user_id: int
    name: str
    won_value: float  # este año
    won_count: int
    open_value: float
    open_count: int


class RecentActivity(BaseModel):
    id: int
    type: ActivityType
    subject: str
    occurred_at: datetime
    user_name: str | None
    deal_id: int | None
    contact_id: int | None
    company_id: int | None
    # Nombre de lo enlazado (título del deal, nombre del contacto o de la
    # empresa, por ese orden de preferencia) para pintar el enlace.
    target_name: str | None


class DashboardOut(BaseModel):
    kpis: Kpis
    funnel: list[FunnelStage]
    revenue_by_month: list[MonthRevenue]
    leaderboard: list[LeaderboardRow]
    recent_activity: list[RecentActivity]


# --- Utilidades ---------------------------------------------------------------

def _is_open(deal: Deal) -> bool:
    return not (deal.stage.is_won or deal.stage.is_lost)


def _month_key(d: date | datetime) -> str:
    return f"{d.year}-{d.month:02d}"


def _previous_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def _last_12_months(today: date) -> list[str]:
    """Claves "YYYY-MM" de los últimos 12 meses, del más antiguo al actual."""
    keys = []
    year, month = today.year, today.month
    for _ in range(12):
        keys.append(f"{year}-{month:02d}")
        year, month = _previous_month(year, month)
    return list(reversed(keys))


def _average(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


# --- Bloques del dashboard ----------------------------------------------------

def _kpis(deals: list[Deal], now: datetime) -> Kpis:
    open_deals = [d for d in deals if _is_open(d)]
    won = [d for d in deals if d.stage.is_won and d.closed_at]

    this_month = _month_key(now)
    last_month = "{}-{:02d}".format(*_previous_month(now.year, now.month))
    won_this_month = [d for d in won if _month_key(d.closed_at) == this_month]
    won_last_month = [d for d in won if _month_key(d.closed_at) == last_month]

    # Tasa de éxito: de lo que se ha cerrado (ganado o perdido) en 90 días,
    # qué porcentaje se ganó. Sin cierres no hay tasa (None, no 0%).
    since = now - timedelta(days=90)
    closed_recent = [d for d in deals if d.closed_at and d.closed_at >= since
                     and (d.stage.is_won or d.stage.is_lost)]
    won_recent = [d for d in closed_recent if d.stage.is_won]
    win_rate = round(100 * len(won_recent) / len(closed_recent), 1) if closed_recent else None

    return Kpis(
        open_value=sum(float(d.value) for d in open_deals),
        open_count=len(open_deals),
        weighted_value=round(sum(float(d.value) * d.stage.probability / 100 for d in open_deals), 2),
        won_this_month=sum(float(d.value) for d in won_this_month),
        won_this_month_count=len(won_this_month),
        won_last_month=sum(float(d.value) for d in won_last_month),
        win_rate=win_rate,
        avg_won_value=_average([float(d.value) for d in won]),
        # Ciclo de venta: cuánto tarda de media un deal desde que se crea hasta que se gana.
        avg_sales_cycle_days=_average(
            [(d.closed_at - d.created_at).total_seconds() / 86400 for d in won]
        ),
    )


def _funnel(stages: list[Stage], deals: list[Deal]) -> list[FunnelStage]:
    rows = []
    for stage in stages:
        in_stage = [d for d in deals if d.stage_id == stage.id]
        rows.append(FunnelStage(
            stage_id=stage.id, name=stage.name, is_won=stage.is_won, is_lost=stage.is_lost,
            count=len(in_stage), value=sum(float(d.value) for d in in_stage),
        ))
    return rows


def _revenue_by_month(deals: list[Deal], today: date) -> list[MonthRevenue]:
    # Un diccionario con todos los meses a cero, así los meses sin ventas
    # también salen (el gráfico necesita los 12 puntos).
    months = {key: MonthRevenue(month=key, value=0, count=0) for key in _last_12_months(today)}
    for deal in deals:
        if deal.stage.is_won and deal.closed_at:
            row = months.get(_month_key(deal.closed_at))
            if row:
                row.value += float(deal.value)
                row.count += 1
    return list(months.values())


def _leaderboard(db: Session, now: datetime) -> list[LeaderboardRow]:
    users = db.scalars(select(User)).all()
    rows = {u.id: LeaderboardRow(user_id=u.id, name=u.name, won_value=0, won_count=0,
                                 open_value=0, open_count=0) for u in users}
    all_deals = db.scalars(select(Deal).options(joinedload(Deal.stage))).all()
    for deal in all_deals:
        row = rows.get(deal.owner_id)
        if row is None:
            continue  # deals sin responsable
        if deal.stage.is_won and deal.closed_at and deal.closed_at.year == now.year:
            row.won_value += float(deal.value)
            row.won_count += 1
        elif _is_open(deal):
            row.open_value += float(deal.value)
            row.open_count += 1
    return sorted(rows.values(), key=lambda r: (-r.won_value, -r.open_value, r.name))


def _recent_activity(db: Session, limit: int = 8) -> list[RecentActivity]:
    activities = db.scalars(
        select(Activity).options(joinedload(Activity.user))
        .order_by(Activity.occurred_at.desc(), Activity.id.desc()).limit(limit)
    ).all()
    result = []
    for a in activities:
        # db.get usa la caché de la sesión: si dos actividades apuntan al
        # mismo deal, solo se consulta una vez.
        target_name = None
        if a.deal_id and (deal := db.get(Deal, a.deal_id)):
            target_name = deal.title
        elif a.contact_id and (contact := db.get(Contact, a.contact_id)):
            target_name = contact.full_name
        elif a.company_id and (company := db.get(Company, a.company_id)):
            target_name = company.name
        result.append(RecentActivity(
            id=a.id, type=a.type, subject=a.subject, occurred_at=a.occurred_at,
            user_name=a.user_name, deal_id=a.deal_id, contact_id=a.contact_id,
            company_id=a.company_id, target_name=target_name,
        ))
    return result


@router.get("", response_model=DashboardOut)
def get_dashboard(owner_id: int | None = None, db: Session = Depends(get_db)):
    """Todas las métricas del panel en una sola petición.

    `owner_id` filtra las métricas basadas en deals (kpis, embudo, ingresos).
    La clasificación y la actividad reciente son siempre de todo el equipo.
    """
    now = datetime.now()
    stages = db.scalars(select(Stage).order_by(Stage.position)).all()

    stmt = select(Deal).options(joinedload(Deal.stage))
    if owner_id is not None:
        stmt = stmt.where(Deal.owner_id == owner_id)
    deals = db.scalars(stmt).all()

    return DashboardOut(
        kpis=_kpis(deals, now),
        funnel=_funnel(stages, deals),
        revenue_by_month=_revenue_by_month(deals, now.date()),
        leaderboard=_leaderboard(db, now),
        recent_activity=_recent_activity(db),
    )
