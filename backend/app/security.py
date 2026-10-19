"""Autenticación: contraseñas cifradas y tokens JWT.

Flujo:
1. El usuario envía email + contraseña a POST /api/auth/login.
2. Si son correctos, la API devuelve un token JWT firmado.
3. El frontend lo guarda y lo envía en cada petición:
   `Authorization: Bearer <token>`.
4. `get_current_user` comprueba la firma y la caducidad del token y devuelve
   el usuario. Si no es válido, responde 401.

El servidor no guarda sesiones: toda la información (quién eres y hasta
cuándo vale) va dentro del token, firmada para que nadie pueda modificarla.
"""
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import User

# En producción la clave vendría de una variable de entorno secreta.
SECRET_KEY = os.environ.get("CRM_SECRET_KEY", "dev-secret-change-me-in-production-please-0123456789")
ALGORITHM = "HS256"
TOKEN_HOURS = 8

# Le dice a FastAPI (y a Swagger, botón "Authorize") dónde se obtiene el token.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# --- Contraseñas ------------------------------------------------------------
# scrypt (de la librería estándar) es lento a propósito: si alguien roba la
# base de datos, probar millones de contraseñas le costaría muchísimo. La sal
# aleatoria hace que dos usuarios con la misma contraseña tengan hashes distintos.

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
    # compare_digest tarda lo mismo acierte o falle (evita ataques por tiempo).
    return hmac.compare_digest(digest.hex(), digest_hex)


# --- Tokens -----------------------------------------------------------------

def create_access_token(user: User) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)
    payload = {"sub": str(user.id), "exp": expires}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Dependencia que protege un endpoint: sin token válido, 401."""
    unauthorized = HTTPException(
        status_code=401,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized
    user = db.get(User, user_id)
    # Un usuario desactivado pierde el acceso aunque su token no haya caducado.
    if user is None or not user.is_active:
        raise unauthorized
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Dependencia para endpoints solo de administradores: si no lo es, 403."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Solo un administrador puede hacer esto")
    return user


# Atajo para los endpoints: `user: CurrentUser` = "el usuario que hace la petición".
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_admin)]
