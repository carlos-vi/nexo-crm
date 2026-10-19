"""Endpoints de /api/auth: login y usuario actual. Ver docs/api.md."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import PasswordChange, ProfileUpdate, TokenOut, UserOut
from ..security import CurrentUser, create_access_token, get_current_user, hash_password, verify_password
from .users import ensure_email_free

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # El estándar OAuth2 llama "username" al campo; nosotros metemos el email.
    user = db.scalar(select(User).where(func.lower(User.email) == form.username.strip().lower()))
    # Mismo mensaje si el email no existe o la contraseña falla: así no se
    # revela qué emails están registrados.
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Este usuario está desactivado")
    return {"access_token": create_access_token(user), "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(data: ProfileUpdate, user: CurrentUser, db: Session = Depends(get_db)):
    """Mi perfil: cada usuario puede cambiar su nombre y su email."""
    if data.email is not None and data.email != user.email:
        ensure_email_free(db, data.email)
    for field, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/password", status_code=204)
def change_password(data: PasswordChange, user: CurrentUser, db: Session = Depends(get_db)):
    """Cambiar la propia contraseña: hay que saber la actual."""
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=422, detail="La contraseña actual no es correcta")
    user.password_hash = hash_password(data.new_password)
    db.commit()
