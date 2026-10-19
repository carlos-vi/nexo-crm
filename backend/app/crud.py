"""Utilidades compartidas por los routers."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import User


def get_or_404(db: Session, model, obj_id: int):
    """Devuelve el objeto o responde 404 (p. ej. "Company not found")."""
    obj = db.get(model, obj_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return obj


def ensure_exists(db: Session, model, obj_id: int | None, field: str) -> None:
    """Valida una clave foránea recibida en el cuerpo: si viene, debe existir (422)."""
    if obj_id is not None and db.get(model, obj_id) is None:
        raise HTTPException(status_code=422, detail=f"{field} {obj_id} does not exist")


def resolve_owner(db: Session, owner_id: int | None, current_user: User) -> int:
    """Responsable de un registro nuevo: el indicado (si existe) o quien lo crea."""
    if owner_id is None:
        return current_user.id
    ensure_exists(db, User, owner_id, "user")
    return owner_id


def apply_update(obj, data) -> None:
    """Copia al objeto solo los campos que el cliente envió en el PATCH."""
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
