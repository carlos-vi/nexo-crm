"""Configuración de Alembic (migraciones de la base de datos).

Una migración es un script que lleva la base de datos de una versión a la
siguiente (crear una tabla, añadir una columna...). Alembic guarda en la tabla
`alembic_version` cuál es la última aplicada, así sabe qué falta por aplicar.

Comandos habituales (desde backend/):
    .venv\\Scripts\\alembic revision --autogenerate -m "descripción"   # crear
    .venv\\Scripts\\alembic upgrade head                               # aplicar
"""
from alembic import context
from sqlalchemy import engine_from_config, pool

from app import models  # noqa: F401  (registra las tablas en Base.metadata)
from app.database import DATABASE_URL, Base

config = context.config
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Alembic compara estos modelos con la base de datos para autogenerar migraciones.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(url=DATABASE_URL, target_metadata=target_metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def run_on(connection) -> None:
    # render_as_batch: SQLite no sabe modificar columnas existentes, así que
    # Alembic recrea la tabla por debajo cuando hace falta (crea una copia,
    # borra la original y renombra la copia). Para poder borrar una tabla a la
    # que apuntan otras (p. ej. users), las claves foráneas se desactivan
    # durante la migración. Tiene que hacerse antes de abrir la transacción.
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql("PRAGMA foreign_keys = OFF")
    context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Al arrancar la API, app/main.py nos pasa su propia conexión.
    connection = config.attributes.get("connection")
    if connection is not None:
        run_on(connection)
        return
    engine = engine_from_config(
        config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    with engine.connect() as connection:
        run_on(connection)
        connection.commit()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
