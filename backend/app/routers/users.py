"""Endpoints de /api/users: el equipo de ventas. Ver docs/api.md.

Cualquiera puede ver la lista (hace falta para elegir responsables), pero solo
los administradores crean usuarios o cambian sus datos, roles y acceso.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..crud import get_or_404
from ..database import get_db
from ..models import User
from ..schemas import UserCreate, UserOut, UserUpdate
from ..security import AdminUser, hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


def ensure_email_free(db: Session, email: str, except_id: int | None = None) -> None:
    """Dos usuarios no pueden compartir email (es con lo que se inicia sesión): 409."""
    stmt = select(User).where(func.lower(User.email) == email.lower())
    if except_id is not None:
        stmt = stmt.where(User.id != except_id)
    if db.scalar(stmt):
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese email")


@router.get("", response_model=list[UserOut])
def list_users(include_inactive: bool = False, db: Session = Depends(get_db)):
    """Lista de vendedores, p. ej. para elegir el responsable de un deal.

    Por defecto solo los activos: a un usuario desactivado no se le asignan cosas.
    """
    stmt = select(User).order_by(User.name)
    if not include_inactive:
        stmt = stmt.where(User.is_active.is_(True))
    return db.scalars(stmt).all()


@router.post("", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, admin: AdminUser, db: Session = Depends(get_db)):
    ensure_email_free(db, data.email)
    user = User(name=data.name, email=data.email, is_admin=data.is_admin,
                password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, admin: AdminUser, db: Session = Depends(get_db)):
    user = get_or_404(db, User, user_id)
    sent = data.model_dump(exclude_unset=True)
    for field in ("name", "email", "is_admin", "is_active"):
        if field in sent and sent[field] is None:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null")

    # Un administrador no puede quitarse a sí mismo el rol ni el acceso: así
    # nunca se queda el equipo sin nadie que pueda gestionarlo.
    if user.id == admin.id and (sent.get("is_admin") is False or sent.get("is_active") is False):
        raise HTTPException(status_code=422, detail="No puedes quitarte tu propio rol de administrador ni desactivarte")

    if "email" in sent:
        ensure_email_free(db, data.email, except_id=user.id)
    if sent.get("password"):
        user.password_hash = hash_password(data.password)
    for field in ("name", "email", "is_admin", "is_active"):
        if field in sent:
            setattr(user, field, sent[field])
    db.commit()
    db.refresh(user)
    return user
