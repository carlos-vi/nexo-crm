"""Utilidades de CSV para importar y exportar (las usan empresas y contactos)."""
import csv
import io
import re
from datetime import date

from fastapi import HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import User

MAX_CSV_BYTES = 1_000_000  # 1 MB: de sobra para un CSV de prueba
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def csv_response(columns: list[str], rows: list[list], prefix: str) -> Response:
    """Devuelve un CSV descargable.

    Empieza por el BOM de UTF-8 (\\ufeff): sin él, Excel abre el fichero como
    si fuera Windows-1252 y "García" aparece como "GarcÃ­a".
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(columns)
    writer.writerows(rows)
    filename = f"{prefix}-{date.today().isoformat()}.csv"
    return Response(
        content="\ufeff" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        # "attachment" le dice al navegador que lo descargue en vez de mostrarlo.
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def read_csv_upload(file: UploadFile, required: str) -> list[tuple[int, dict[str, str]]]:
    """Lee el fichero subido y devuelve [(número de fila, {columna: valor})].

    - Rechaza ficheros de más de 1 MB (413).
    - Acepta UTF-8 (con o sin BOM) y, si no lo es, Windows-1252 (lo que
      suele guardar Excel en español).
    - Detecta si el separador es ";" o ",".
    - Las columnas se comparan en minúsculas; las desconocidas se ignoran.
    """
    raw = file.file.read(MAX_CSV_BYTES + 1)  # leemos 1 byte de más para saber si se pasa
    if len(raw) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="El fichero supera el máximo de 1 MB")
    try:
        text = raw.decode("utf-8-sig")  # "-sig" quita el BOM si lo hay
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")

    first_line = text.split("\n", 1)[0]
    delimiter = ";" if first_line.count(";") > first_line.count(",") else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    header = next(reader, None)
    if not header:
        raise HTTPException(status_code=422, detail="El fichero está vacío")
    header = [h.strip().lower() for h in header]
    if required not in header:
        raise HTTPException(status_code=422, detail=f"Falta la columna obligatoria '{required}'")

    rows = []
    # La cabecera es la fila 1, así que los datos empiezan en la 2 (como en Excel).
    for line_no, values in enumerate(reader, start=2):
        if not any(v.strip() for v in values):
            continue  # filas en blanco: se ignoran
        rows.append((line_no, {col: (values[i].strip() if i < len(values) else "") for i, col in enumerate(header)}))
    return rows


def users_by_email(db: Session) -> dict[str, int]:
    return {email.lower(): user_id for user_id, email in db.execute(select(User.id, User.email))}


def resolve_owner_email(email: str, users: dict[str, int], current_user: User) -> tuple[int | None, str | None]:
    """owner_email vacío → el usuario actual. Devuelve (owner_id, error)."""
    if not email:
        return current_user.id, None
    owner_id = users.get(email.lower())
    if owner_id is None:
        return None, f"No existe ningún usuario con email '{email}'"
    return owner_id, None
