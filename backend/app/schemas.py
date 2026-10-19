"""Esquemas de Pydantic: la forma del JSON que entra y sale de la API.

Por cada recurso hay tres tipos:
- XxxCreate: lo que se acepta en POST (con sus campos obligatorios).
- XxxUpdate: lo que se acepta en PATCH (todo opcional; solo se cambia lo enviado).
- XxxOut:    lo que se devuelve.

Son la versión en código de docs/api.md.
"""
from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from .models import ActivityType

# Texto obligatorio: se le quitan los espacios de los extremos y no puede quedar vacío.
RequiredStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class OrmModel(BaseModel):
    """Permite construir el esquema directamente desde un objeto de SQLAlchemy."""

    model_config = ConfigDict(from_attributes=True)


# --- Usuarios y login -------------------------------------------------------

# Email con formato básico (algo@algo.algo), sin espacios y en minúsculas.
Email = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True,
                                         pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
# Contraseña: mínimo 8 caracteres.
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class UserOut(OrmModel):
    id: int
    name: str
    email: str
    is_admin: bool
    is_active: bool
    created_at: datetime


class UserCreate(BaseModel):
    name: RequiredStr
    email: Email
    password: Password
    is_admin: bool = False


class UserUpdate(BaseModel):
    """Lo que un administrador puede cambiar de un usuario (todo opcional)."""
    name: RequiredStr | None = None
    email: Email | None = None
    is_admin: bool | None = None
    is_active: bool | None = None
    password: Password | None = None  # para restablecer la contraseña


class ProfileUpdate(BaseModel):
    """Lo que cada usuario puede cambiar de sí mismo."""
    name: RequiredStr | None = None
    email: Email | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: Password


class TokenOut(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


# --- Etapas -----------------------------------------------------------------

class StageOut(OrmModel):
    id: int
    name: str
    position: int
    probability: int
    is_won: bool
    is_lost: bool


# --- Empresas ---------------------------------------------------------------

class CompanyCreate(BaseModel):
    name: RequiredStr
    domain: str | None = None
    industry: str | None = None
    owner_id: int | None = None  # None → el usuario que la crea


class CompanyUpdate(BaseModel):
    name: RequiredStr | None = None
    domain: str | None = None
    industry: str | None = None
    owner_id: int | None = None


class CompanyOut(OrmModel):
    id: int
    name: str
    domain: str | None
    industry: str | None
    owner_id: int | None
    owner_name: str | None
    created_at: datetime
    # Estadísticas de solo lectura que calcula el router con consultas
    # agrupadas (no son columnas). "Abierto" = en una etapa ni ganada ni perdida.
    contact_count: int = 0
    open_deal_count: int = 0
    open_deal_value: float = 0


class ImportRowError(BaseModel):
    row: int  # número de línea en el fichero (la cabecera es la 1)
    message: str


class ImportResult(BaseModel):
    """Respuesta de POST /api/companies/import y /api/contacts/import."""

    total: int
    valid: int
    errors: list[ImportRowError]
    created: int


# --- Contactos --------------------------------------------------------------

class ContactCreate(BaseModel):
    first_name: RequiredStr
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    job_title: str | None = None
    company_id: int | None = None
    owner_id: int | None = None  # None → el usuario que lo crea


class ContactUpdate(BaseModel):
    first_name: RequiredStr | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    job_title: str | None = None
    company_id: int | None = None
    owner_id: int | None = None


class ContactOut(OrmModel):
    id: int
    first_name: str
    last_name: str | None
    email: str | None
    phone: str | None
    job_title: str | None
    company_id: int | None
    company_name: str | None  # propiedad calculada en el modelo
    owner_id: int | None
    owner_name: str | None
    created_at: datetime
    open_deal_count: int = 0  # calculado por el router (ver CompanyOut)


# --- Deals ------------------------------------------------------------------

class DealCreate(BaseModel):
    title: RequiredStr
    value: float = Field(default=0, ge=0)
    stage_id: int | None = None  # None → primera etapa
    company_id: int | None = None
    contact_id: int | None = None
    owner_id: int | None = None  # None → el usuario que lo crea
    expected_close_date: date | None = None


class DealUpdate(BaseModel):
    title: RequiredStr | None = None
    value: float | None = Field(default=None, ge=0)
    stage_id: int | None = None
    company_id: int | None = None
    contact_id: int | None = None
    owner_id: int | None = None
    expected_close_date: date | None = None


class DealOut(OrmModel):
    id: int
    title: str
    value: float  # en la BD es Numeric; en JSON sale como número
    stage_id: int
    company_id: int | None
    company_name: str | None
    contact_id: int | None
    contact_name: str | None
    owner_id: int | None
    owner_name: str | None
    expected_close_date: date | None
    closed_at: datetime | None
    stage_changed_at: datetime
    created_at: datetime


# --- Detalles (recurso + listas relacionadas) -------------------------------

class CompanyDetail(CompanyOut):
    contacts: list[ContactOut]
    deals: list[DealOut]


class ContactDetail(ContactOut):
    deals: list[DealOut]


# --- Actividades ------------------------------------------------------------

class ActivityCreate(BaseModel):
    type: ActivityType
    subject: RequiredStr
    body: str | None = None
    occurred_at: datetime | None = None  # None → ahora
    contact_id: int | None = None
    company_id: int | None = None
    deal_id: int | None = None

    @field_validator("type")
    @classmethod
    def not_system(cls, value: ActivityType) -> ActivityType:
        # Las actividades "system" solo las crea la propia API.
        if value == ActivityType.SYSTEM:
            raise ValueError("system activities are created automatically")
        return value


class ActivityOut(OrmModel):
    id: int
    type: ActivityType
    subject: str
    body: str | None
    occurred_at: datetime
    user_id: int | None
    user_name: str | None
    contact_id: int | None
    company_id: int | None
    deal_id: int | None


# --- Tareas -----------------------------------------------------------------

class TaskCreate(BaseModel):
    title: RequiredStr
    due_date: date | None = None
    user_id: int | None = None  # responsable; None → el usuario que la crea
    contact_id: int | None = None
    company_id: int | None = None
    deal_id: int | None = None


class TaskUpdate(BaseModel):
    title: RequiredStr | None = None
    due_date: date | None = None
    done: bool | None = None
    user_id: int | None = None


class TaskOut(OrmModel):
    id: int
    title: str
    due_date: date | None
    done: bool
    user_id: int | None
    user_name: str | None
    contact_id: int | None
    contact_name: str | None
    company_id: int | None
    company_name: str | None
    deal_id: int | None
    deal_title: str | None
    created_at: datetime


# --- Búsqueda global --------------------------------------------------------

class SearchCompany(OrmModel):
    id: int
    name: str


class SearchContact(BaseModel):
    id: int
    name: str
    company_name: str | None


class SearchDeal(OrmModel):
    id: int
    title: str
    value: float


class SearchResults(BaseModel):
    companies: list[SearchCompany]
    contacts: list[SearchContact]
    deals: list[SearchDeal]
