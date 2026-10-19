"""Modelo de datos del CRM. Cada clase es una tabla.

    User ──< Company ──< Contact
      │         │           │
      └──< Deal >┴──────────┘     (un deal pertenece a una etapa del pipeline)
             │
           Stage

    Activity y Task pueden colgar de un Contact, una Company o un Deal.
"""
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    """Un usuario del CRM (un vendedor). Inicia sesión con email y contraseña.

    Nunca guardamos la contraseña: solo su hash (ver app/security.py).
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # Los administradores gestionan el equipo (crear usuarios, cambiar roles...).
    is_admin: Mapped[bool] = mapped_column(default=False)
    # En vez de borrar a alguien que se va (sus deals y su historial le siguen
    # apuntando), se le desactiva: ya no puede entrar ni se le asignan cosas.
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.now)


def _name(user: "User | None") -> str | None:
    return user.name if user else None


class Company(Base):
    """Una empresa cliente o potencial cliente (en B2B se vende a empresas)."""

    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    domain: Mapped[str | None] = mapped_column(String(200))  # ej. acme.com
    industry: Mapped[str | None] = mapped_column(String(100))
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(default=datetime.now)

    owner: Mapped[User | None] = relationship()
    contacts: Mapped[list["Contact"]] = relationship(back_populates="company")
    deals: Mapped[list["Deal"]] = relationship(back_populates="company")

    @property
    def owner_name(self) -> str | None:
        return _name(self.owner)


class Contact(Base):
    """Una persona. Normalmente trabaja en una Company, pero no es obligatorio."""

    __tablename__ = "contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    job_title: Mapped[str | None] = mapped_column(String(100))
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"))
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(default=datetime.now)

    company: Mapped[Company | None] = relationship(back_populates="contacts")
    owner: Mapped[User | None] = relationship()

    # Propiedades calculadas: no son columnas, pero Pydantic las lee igual al
    # convertir el objeto a JSON.
    @property
    def full_name(self) -> str:
        return " ".join(p for p in (self.first_name, self.last_name) if p)

    @property
    def company_name(self) -> str | None:
        return self.company.name if self.company else None

    @property
    def owner_name(self) -> str | None:
        return _name(self.owner)


class Stage(Base):
    """Una columna del pipeline: Nuevo, Contactado, Propuesta...

    `position` ordena las columnas en el Kanban. `probability` es la
    probabilidad estimada de cerrar un deal que está en esta etapa; sirve para
    calcular la previsión de ventas (valor × probabilidad).
    """

    __tablename__ = "stages"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    position: Mapped[int]
    probability: Mapped[int]  # 0–100
    is_won: Mapped[bool] = mapped_column(default=False)
    is_lost: Mapped[bool] = mapped_column(default=False)

    deals: Mapped[list["Deal"]] = relationship(back_populates="stage")


class Deal(Base):
    """Una oportunidad de venta: lo que se mueve por el pipeline."""

    __tablename__ = "deals"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    # Numeric y no float: con dinero no queremos errores de redondeo.
    value: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    stage_id: Mapped[int] = mapped_column(ForeignKey("stages.id"))
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"))
    contact_id: Mapped[int | None] = mapped_column(ForeignKey("contacts.id"))
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    expected_close_date: Mapped[date | None]
    closed_at: Mapped[datetime | None]
    # Cuándo entró en su etapa actual: permite mostrar "lleva 12 días en Propuesta".
    stage_changed_at: Mapped[datetime] = mapped_column(default=datetime.now)
    created_at: Mapped[datetime] = mapped_column(default=datetime.now)

    stage: Mapped[Stage] = relationship(back_populates="deals")
    company: Mapped[Company | None] = relationship(back_populates="deals")
    contact: Mapped[Contact | None] = relationship()
    owner: Mapped[User | None] = relationship()

    @property
    def company_name(self) -> str | None:
        return self.company.name if self.company else None

    @property
    def contact_name(self) -> str | None:
        return self.contact.full_name if self.contact else None

    @property
    def owner_name(self) -> str | None:
        return _name(self.owner)


class ActivityType(str, Enum):
    CALL = "call"
    MEETING = "meeting"
    EMAIL = "email"
    NOTE = "note"
    # Apuntada automáticamente por el sistema (p. ej. "cambió de etapa").
    SYSTEM = "system"


class Activity(Base):
    """Algo que YA ha pasado: una llamada, una reunión, un email, una nota.

    Forma el historial (timeline) de un contacto, empresa o deal. Usamos tres
    claves foráneas opcionales en vez de un enlace genérico para que la base
    de datos garantice que lo enlazado existe.
    """

    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[ActivityType]
    subject: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(default=datetime.now)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    contact_id: Mapped[int | None] = mapped_column(ForeignKey("contacts.id"))
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"))
    deal_id: Mapped[int | None] = mapped_column(ForeignKey("deals.id"))

    user: Mapped[User | None] = relationship()

    @property
    def user_name(self) -> str | None:
        return _name(self.user)


class Task(Base):
    """Algo que HAY QUE hacer: "llamar a Ana el martes". `user_id` es el responsable."""

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    due_date: Mapped[date | None]
    done: Mapped[bool] = mapped_column(default=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    contact_id: Mapped[int | None] = mapped_column(ForeignKey("contacts.id"))
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"))
    deal_id: Mapped[int | None] = mapped_column(ForeignKey("deals.id"))
    created_at: Mapped[datetime] = mapped_column(default=datetime.now)

    user: Mapped[User | None] = relationship()
    deal: Mapped[Deal | None] = relationship()
    contact: Mapped[Contact | None] = relationship()
    company: Mapped[Company | None] = relationship()

    @property
    def user_name(self) -> str | None:
        return _name(self.user)

    # Nombres de lo enlazado, para mostrar "Llamar a Ana · Deal: Licencias 2027".
    @property
    def deal_title(self) -> str | None:
        return self.deal.title if self.deal else None

    @property
    def contact_name(self) -> str | None:
        return self.contact.full_name if self.contact else None

    @property
    def company_name(self) -> str | None:
        return self.company.name if self.company else None
