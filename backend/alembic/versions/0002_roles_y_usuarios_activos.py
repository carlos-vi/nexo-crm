"""roles y usuarios activos

Revision ID: 7267fca9d107
Revises: 921a6ce90df1
Create Date: 2026-10-19 17:55:50.800502

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7267fca9d107'
down_revision: Union[str, Sequence[str], None] = '921a6ce90df1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Ajustado a mano sobre lo que generó Alembic: las filas que ya existen
    # necesitan un valor para las columnas nuevas (server_default), si no
    # SQLite no puede añadir columnas NOT NULL.
    # En SQLite, Alembic copia la tabla a "_alembic_tmp_users" y la renombra;
    # si un intento anterior se cortó a medias, esa copia se queda y bloquea
    # el siguiente. La quitamos antes de empezar.
    op.execute("DROP TABLE IF EXISTS _alembic_tmp_users")
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))

    # Migración de datos: el usuario inicial pasa a ser administrador.
    op.execute("UPDATE users SET is_admin = 1 WHERE email = 'admin@crm.local'")


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('is_active')
        batch_op.drop_column('is_admin')
