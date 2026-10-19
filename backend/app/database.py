"""Conexión a la base de datos.

Usamos SQLite para no tener que instalar nada: la base de datos es un único
fichero (crm.db). Como trabajamos con SQLAlchemy, pasar a PostgreSQL más
adelante es cambiar DATABASE_URL.
"""
import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# El fichero vive en backend/crm.db, se arranque desde donde se arranque.
# La variable de entorno CRM_DATABASE_URL permite usar otra BD (p. ej. para pruebas).
DB_PATH = Path(__file__).resolve().parent.parent / "crm.db"
DATABASE_URL = os.environ.get("CRM_DATABASE_URL", f"sqlite:///{DB_PATH}")

# check_same_thread=False: FastAPI puede atender peticiones desde varios hilos.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False)


@event.listens_for(engine, "connect")
def _enable_foreign_keys(dbapi_connection, _):
    # SQLite no comprueba las claves foráneas salvo que se le pida en cada conexión.
    dbapi_connection.execute("PRAGMA foreign_keys = ON")


class Base(DeclarativeBase):
    """Clase base de la que heredan todos los modelos (tablas)."""


def get_db():
    """Dependencia de FastAPI: abre una sesión por petición y la cierra al acabar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
