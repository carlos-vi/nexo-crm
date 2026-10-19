"""Punto de entrada de la API.

Arrancar:  .venv\\Scripts\\uvicorn app.main:app --reload
Docs interactivas (Swagger): http://localhost:8000/docs
"""
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .database import SessionLocal, engine, get_db
from .routers import activities, auth, companies, contacts, dashboard, deals, search, tasks, users
from .schemas import StageOut
from .security import get_current_user, hash_password

# Usuario inicial para poder entrar la primera vez en una base de datos vacía.
DEFAULT_ADMIN = {"name": "Admin", "email": "admin@crm.local", "password": "admin1234"}

DEFAULT_STAGES = [
    # (nombre, probabilidad %, ganado, perdido)
    ("Lead", 10, False, False),
    ("Contactado", 25, False, False),
    ("Propuesta", 50, False, False),
    ("Negociación", 75, False, False),
    ("Ganado", 100, True, False),
    ("Perdido", 0, False, True),
]


def seed_stages(db: Session) -> None:
    """Crea las etapas por defecto si la tabla está vacía."""
    if db.scalar(select(models.Stage).limit(1)):
        return
    for position, (name, probability, is_won, is_lost) in enumerate(DEFAULT_STAGES):
        db.add(models.Stage(name=name, position=position, probability=probability,
                            is_won=is_won, is_lost=is_lost))
    db.commit()


def seed_admin(db: Session) -> None:
    """Crea el usuario inicial si no hay ningún usuario."""
    if db.scalar(select(models.User).limit(1)):
        return
    db.add(models.User(name=DEFAULT_ADMIN["name"], email=DEFAULT_ADMIN["email"], is_admin=True,
                       password_hash=hash_password(DEFAULT_ADMIN["password"])))
    db.commit()


def run_migrations() -> None:
    """Aplica las migraciones pendientes (equivale a `alembic upgrade head`)."""
    config = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    with engine.connect() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
        connection.commit()
        # alembic/env.py desactiva las claves foráneas para migrar; esta
        # conexión vuelve al pool, así que las reactivamos.
        connection.exec_driver_sql("PRAGMA foreign_keys = ON")


def init_db() -> None:
    """Deja la base de datos lista: tablas al día, etapas y usuario inicial."""
    run_migrations()
    with SessionLocal() as db:
        seed_stages(db)
        seed_admin(db)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="CRM", lifespan=lifespan)

# CORS: el navegador bloquea peticiones de una web (localhost:5173, React) a
# otro origen (localhost:8000, esta API) salvo que la API lo permita. En
# desarrollo Vite hace de proxy y no hace falta, pero lo dejamos para que se
# pueda llamar a la API directamente.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cada router agrupa los endpoints de un recurso (ver app/routers/).
# El login es público; todo lo demás exige un token válido (si no, 401).
app.include_router(auth.router)
protected = [Depends(get_current_user)]
for module in (users, companies, contacts, deals, activities, tasks, search, dashboard):
    app.include_router(module.router, dependencies=protected)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/stages", response_model=list[StageOut], dependencies=[Depends(get_current_user)])
def list_stages(db: Session = Depends(get_db)):
    return db.scalars(select(models.Stage).order_by(models.Stage.position)).all()
