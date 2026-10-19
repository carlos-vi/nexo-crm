"""Endpoints de /api/tasks. Ver docs/api.md."""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..crud import apply_update, ensure_exists, get_or_404, resolve_owner
from ..database import get_db
from ..models import Company, Contact, Deal, Task, User
from ..schemas import TaskCreate, TaskOut, TaskUpdate
from ..security import CurrentUser

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
def list_tasks(
    done: bool | None = None,
    # Literal: FastAPI rechaza con 422 cualquier otro valor.
    due: Literal["overdue", "today", "upcoming"] | None = None,
    contact_id: int | None = None,
    company_id: int | None = None,
    deal_id: int | None = None,
    user_id: int | None = None,
    db: Session = Depends(get_db),
):
    # Primero las más urgentes. `due_date IS NULL` vale 0/1, así que ordenar
    # por ello primero manda al final las tareas sin fecha.
    stmt = select(Task).order_by(Task.due_date.is_(None), Task.due_date, Task.id)
    if done is not None:
        stmt = stmt.where(Task.done == done)

    today = date.today()
    if due == "overdue":
        # Una tarea hecha ya no está "vencida", aunque su fecha haya pasado.
        stmt = stmt.where(Task.due_date < today, Task.done.is_(False))
    elif due == "today":
        stmt = stmt.where(Task.due_date == today)
    elif due == "upcoming":
        stmt = stmt.where(Task.due_date > today)

    if contact_id is not None:
        stmt = stmt.where(Task.contact_id == contact_id)
    if company_id is not None:
        stmt = stmt.where(Task.company_id == company_id)
    if deal_id is not None:
        stmt = stmt.where(Task.deal_id == deal_id)
    if user_id is not None:
        stmt = stmt.where(Task.user_id == user_id)
    return db.scalars(stmt).all()


@router.post("", response_model=TaskOut, status_code=201)
def create_task(data: TaskCreate, user: CurrentUser, db: Session = Depends(get_db)):
    ensure_exists(db, Contact, data.contact_id, "contact")
    ensure_exists(db, Company, data.company_id, "company")
    ensure_exists(db, Deal, data.deal_id, "deal")
    task = Task(**data.model_dump())
    task.user_id = resolve_owner(db, data.user_id, user)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db)):
    task = get_or_404(db, Task, task_id)
    sent = data.model_dump(exclude_unset=True)
    # due_date sí puede quitarse (null); title y done no admiten null en la BD.
    for field in ("title", "done"):
        if field in sent and sent[field] is None:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null")
    if "user_id" in sent:
        ensure_exists(db, User, data.user_id, "user")
    apply_update(task, data)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = get_or_404(db, Task, task_id)
    db.delete(task)
    db.commit()
    return Response(status_code=204)
