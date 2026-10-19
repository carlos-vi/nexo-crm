"""Carga datos de demostración para ver el CRM con contenido realista.

Uso (desde backend/):  .venv\\Scripts\\python seed_demo.py

Simula una consultora de software española que vende a otras empresas:
4 comerciales, una docena de clientes, ~45 deals repartidos en el último año
(con su historial de etapas), actividades y tareas.

Solo actúa sobre una base de datos sin empresas, así que ejecutarlo dos veces
no duplica nada. Para empezar de cero: borra crm.db y vuelve a ejecutarlo.

Usa una semilla fija: siempre genera los mismos datos (con fechas relativas a hoy).
"""
import random
import sys
import unicodedata
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import func, select

from app.database import SessionLocal
from app.main import DEFAULT_ADMIN, init_db
from app.models import Activity, ActivityType, Company, Contact, Deal, Stage, Task, User
from app.security import hash_password

T = ActivityType

# --- Datos de partida ---------------------------------------------------------

DEMO_PASSWORD = "demo1234"

# clave → (nombre, email). "admin" es el usuario inicial que crea init_db().
USERS = {
    "laura": ("Laura Méndez", "laura@crm.local"),
    "sergio": ("Sergio Ortega", "sergio@crm.local"),
    "nuria": ("Nuria Campos", "nuria@crm.local"),
}

# Reparto desigual de los deals entre comerciales (para que el ranking tenga gracia).
OWNER_WEIGHTS = {"laura": 40, "sergio": 25, "nuria": 20, "admin": 15}

# clave → (nombre, dominio, sector, responsable)
COMPANIES = {
    "logimed": ("Logística Mediterránea", "logimed.example", "Transporte", "laura"),
    "saludnorte": ("Clínicas Salud Norte", "saludnorte.example", "Sanidad", "sergio"),
    "brisa": ("Grupo Hotelero Brisa", "hotelesbrisa.example", "Hostelería", "laura"),
    "ebro": ("Metalúrgica Ebro", "metalebro.example", "Industria", "nuria"),
    "saber": ("Academia Online Saber+", "saberplus.example", "Educación", "sergio"),
    "cantabrico": ("Seguros Cantábrico", "segcantabrico.example", "Seguros", "laura"),
    "huerta": ("Cooperativa Agrícola La Huerta", "lahuerta.example", "Agroalimentación", "nuria"),
    "vectra": ("Vectra Ingeniería", "vectraing.example", "Ingeniería", "admin"),
    "modaurbana": ("Moda Urbana Retail", "modaurbana.example", "Retail", "laura"),
    "farmaplus": ("Distribuciones FarmaPlus", "farmaplus.example", "Farmacéutica", "sergio"),
    "aldea": ("Ayuntamiento de Villa Aldea", "villaaldea.example", "Administración pública", "admin"),
    "solaris": ("Energías Solaris", "solarisenergia.example", "Energía", "laura"),
}

# (nombre, apellido, cargo, empresa o None)
CONTACTS = [
    ("Lucía", "Martínez", "Directora de Operaciones", "logimed"),
    ("Javier", "Ruiz", "Responsable de IT", "logimed"),
    ("Marta", "López", "Gerente", "saludnorte"),
    ("Iván", "Castro", "Coordinador de Sistemas", "saludnorte"),
    ("Pablo", "Fernández", "Director Financiero", "brisa"),
    ("Elena", "Sánchez", "Jefa de Compras", "brisa"),
    ("Andrés", "Gómez", "Director de Planta", "ebro"),
    ("Rosa", "Vidal", "Responsable de Calidad", "ebro"),
    ("Sara", "Navarro", "CEO", "saber"),
    ("Hugo", "Pascual", "Director Académico", "saber"),
    ("Carmen", "Iglesias", "Directora de Transformación Digital", "cantabrico"),
    ("Óscar", "Domínguez", "Arquitecto de Software", "cantabrico"),
    ("Beatriz", "Rubio", "Responsable de Compras", "cantabrico"),
    ("Antonio", "Serrano", "Presidente", "huerta"),
    ("Pilar", "Molina", "Administración", "huerta"),
    ("Raúl", "Ortiz", "Director Técnico", "vectra"),
    ("Silvia", "Delgado", "Jefa de Proyectos", "vectra"),
    ("Alberto", "Morales", "CTO", "modaurbana"),
    ("Cristina", "Herrera", "Directora de E-commerce", "modaurbana"),
    ("Daniel", "Prieto", "Responsable de Marketing", "modaurbana"),
    ("Patricia", "Romero", "Directora de Logística", "farmaplus"),
    ("Miguel", "Cano", "Responsable de IT", "farmaplus"),
    ("Isabel", "Gil", "Concejala de Innovación", "aldea"),
    ("Francisco", "Vega", "Técnico Informático", "aldea"),
    ("Laura", "Ramos", "Directora General", "solaris"),
    ("Jorge", "Santos", "Responsable de Operaciones", "solaris"),
    ("Teresa", "Marín", "Controller Financiera", "solaris"),
    # Contactos sin empresa: consultores, prescriptores...
    ("Diego", "Moreno", "Consultor independiente", None),
    ("Eva", "Crespo", "Asesora de transformación digital", None),
    ("Manuel", "Peña", "Gestor de fondos europeos", None),
]

# Lo que vende la consultora: (título del deal, valor mínimo, valor máximo)
PRODUCTS = [
    ("Implantación ERP", 25000, 60000),
    ("Integración con el ERP", 12000, 30000),
    ("Portal de clientes", 15000, 40000),
    ("App móvil para comerciales", 18000, 45000),
    ("Migración a la nube", 10000, 35000),
    ("Auditoría de ciberseguridad", 4000, 12000),
    ("Cuadro de mando de BI", 8000, 22000),
    ("Mantenimiento anual de software", 3000, 9000),
    ("Automatización de facturación", 6000, 18000),
    ("Tienda online B2B", 14000, 38000),
    ("Formación en Power BI", 3000, 6000),
    ("Desarrollo de API de integración", 9000, 24000),
    ("Renovación de licencias", 3500, 12000),
    ("Sistema de gestión documental", 10000, 28000),
    ("Consultoría de procesos", 5000, 15000),
]

# Deals ganados por mes, del más antiguo (hace 11 meses) al actual: tendencia al alza.
WON_PER_MONTH = [1, 1, 1, 1, 2, 1, 2, 2, 2, 2, 3, 2]
LOST_COUNT = 8
# Deals abiertos por etapa actual.
OPEN_PER_STAGE = {"Lead": 5, "Contactado": 4, "Propuesta": 4, "Negociación": 4}
OPEN_FLOW = ["Lead", "Contactado", "Propuesta", "Negociación"]

# Actividades manuales típicas: (tipo, asunto, cuerpo)
MANUAL_ACTIVITIES = [
    (T.CALL, "Primera llamada", "Nos cuentan su situación actual y los problemas que quieren resolver."),
    (T.CALL, "Llamada de seguimiento", "Resolvemos dudas sobre plazos y equipo asignado."),
    (T.MEETING, "Reunión de descubrimiento", "Reunión con dirección y el equipo técnico para recoger requisitos."),
    (T.MEETING, "Demo del producto", "Demo de una hora. Buena acogida; piden ver más casos de uso."),
    (T.EMAIL, "Envío de propuesta", "Enviada la propuesta técnica y económica en PDF."),
    (T.EMAIL, "Envío de documentación", "Adjuntamos casos de éxito y la ficha técnica."),
    (T.NOTE, "Comité de compras", "La decisión la toma el comité de compras, que se reúne a final de mes."),
    (T.NOTE, "Presupuesto ajustado", "Tienen el presupuesto cerrado; habría que plantear el proyecto por fases."),
    (T.CALL, "Revisión de condiciones", "Piden pago a 60 días y un 5 % de descuento por firmar este trimestre."),
    (T.MEETING, "Visita a sus oficinas", "Visita presencial para conocer al equipo que usará la herramienta."),
]

LOSS_REASONS = [
    "Eligieron a un competidor más barato.",
    "Han congelado el presupuesto hasta el año que viene.",
    "Prefieren desarrollarlo con su equipo interno.",
    "No vieron claro el retorno de la inversión.",
]

# Plantillas de tareas ({deal} y {contact} se rellenan con datos reales).
TASK_TITLES = [
    "Llamar a {contact} para hacer seguimiento",
    "Enviar propuesta de {deal}",
    "Preparar demo de {deal}",
    "Revisar contrato de {deal}",
    "Confirmar reunión con {contact}",
    "Enviar presupuesto actualizado a {contact}",
    "Mandar casos de éxito a {contact}",
    "Preparar oferta final de {deal}",
]

# Tareas: (responsable, vence en N días o None, hecha). Negativo = vencida.
TASK_PLAN = [
    ("admin", -3, False), ("admin", -1, False), ("admin", 0, False), ("admin", 0, False),
    ("admin", 2, False), ("admin", None, False), ("admin", -6, True),
    ("laura", -2, False), ("laura", 0, False), ("laura", 1, False), ("laura", 4, False),
    ("laura", 9, False), ("laura", None, False), ("laura", -4, True),
    ("sergio", -5, False), ("sergio", 0, False), ("sergio", 3, False), ("sergio", 12, False),
    ("sergio", -8, True),
    ("nuria", -1, False), ("nuria", 2, False), ("nuria", 6, False), ("nuria", None, False),
    ("nuria", -3, True), ("nuria", 15, False),
]


# --- Utilidades ---------------------------------------------------------------

rng = random.Random(42)
now = datetime.now().replace(microsecond=0)
today = date.today()


# Datos de contacto ficticios que NO pueden pertenecer a nadie:
# - Dominios .example: reservados por el estándar RFC 2606 para ejemplos; no
#   existen ni pueden registrarse, así que ningún email llega a nadie.
# - Teléfonos +1 555-0100 a 555-0199: rango reservado en Norteamérica para
#   ficción (películas, libros...). España no tiene un rango equivalente, y un
#   móvil inventado (6xx xxx xxx) podría ser el de una persona real.
def fake_phone(index: int) -> str:
    return f"+1 555-01{index % 100:02d}"


def slug(text: str) -> str:
    """'Lucía Martínez' → 'lucia.martinez' (para inventar emails)."""
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return plain.lower().replace(" ", ".")


def days_ago(days: float, hour_from: int = 9, hour_to: int = 18) -> datetime:
    """Una fecha/hora de oficina de hace `days` días (nunca en el futuro)."""
    day = (now - timedelta(days=days)).date()
    moment = datetime.combine(day, time(rng.randint(hour_from, hour_to - 1), rng.choice([0, 15, 30, 45])))
    return min(moment, now)


def office_hours(moment: datetime) -> datetime:
    """Lleva una hora cualquiera del día al horario de 9 a 18 h, sin cambiar el día.

    Es una escala (00:00 → 9:00, 24:00 → 18:00), así que conserva el orden de
    dos momentos del mismo día.
    """
    seconds = moment.hour * 3600 + moment.minute * 60
    minutes = 9 * 60 + int(seconds / 86400 * 9 * 60)
    return datetime.combine(moment.date(), time(minutes // 60, minutes % 60))


def between(start: datetime, end: datetime) -> datetime:
    """Un instante al azar (en horario de oficina) entre dos fechas."""
    moment = office_hours(start + (end - start) * rng.uniform(0.1, 0.9))
    return max(start, min(end, moment))


def deal_value(low: int, high: int, factor: float = 1.0) -> Decimal:
    """Importe redondeado a 500 €, acotado entre 3.000 y 60.000 €."""
    value = rng.uniform(low, high) * factor
    return Decimal(max(3000, min(60000, round(value / 500) * 500)))


def pick_owner() -> str:
    return rng.choices(list(OWNER_WEIGHTS), weights=list(OWNER_WEIGHTS.values()))[0]


# --- Carga ---------------------------------------------------------------------

def main() -> None:
    # Lo mismo que hace la API al arrancar: migraciones, etapas y usuario admin.
    init_db()

    with SessionLocal() as db:
        if db.scalar(select(func.count()).select_from(Company)):
            print("La base de datos ya tiene empresas; no se cargan datos de demo.")
            print("Para empezar de cero, borra crm.db y vuelve a ejecutar este script.")
            sys.exit(1)

        stages = {s.name: s for s in db.scalars(select(Stage))}

        # --- Usuarios -----------------------------------------------------------
        users = {"admin": db.scalar(select(User).where(User.email == DEFAULT_ADMIN["email"]))}
        if users["admin"] is None:  # por si alguien cambió el admin: usamos el primero
            users["admin"] = db.scalar(select(User).order_by(User.id).limit(1))
        for key, (name, email) in USERS.items():
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                user = User(name=name, email=email, password_hash=hash_password(DEMO_PASSWORD),
                            created_at=days_ago(400))
                db.add(user)
            users[key] = user
        db.flush()

        # --- Empresas y contactos ------------------------------------------------
        companies = {}
        for key, (name, domain, industry, owner) in COMPANIES.items():
            companies[key] = Company(name=name, domain=domain, industry=industry,
                                     owner=users[owner], created_at=days_ago(rng.randint(380, 420)))
        db.add_all(companies.values())

        contacts = []
        for first, last, job_title, company_key in CONTACTS:
            company = companies[company_key] if company_key else None
            # Casi siempre el responsable del contacto es el de su empresa.
            if company and rng.random() < 0.85:
                owner = company.owner
            else:
                owner = users[pick_owner()]
            # Sin empresa (autónomos): un buzón genérico, también en un dominio reservado.
            domain = company.domain if company else "correo.example"
            contacts.append(Contact(
                first_name=first, last_name=last, job_title=job_title, company=company, owner=owner,
                email=f"{slug(first + ' ' + last)}@{domain}",
                phone=fake_phone(len(contacts)),
                created_at=days_ago(rng.randint(360, 380)),
            ))
        db.add_all(contacts)
        db.flush()

        # --- Deals (con su historial de etapas) ---------------------------------
        deals = []          # todos los deals
        history = []        # actividades del historial y manuales
        company_list = list(companies.values())

        def new_deal(final_stage: str, created: datetime, path_times: list[tuple[str, datetime]],
                     factor: float = 1.0, closed: datetime | None = None,
                     expected: date | None = None, target: int | None = None) -> Deal:
            """Crea un deal y su historial automático: "Deal creado en Lead" y cada cambio de etapa.

            `path_times` son las etapas por las que pasó después de Lead, con la fecha de entrada.
            Con `target` el importe ronda esa cifra y se elige un producto que encaje con ella.
            """
            if target is None:
                title, low, high = rng.choice(PRODUCTS)
            else:
                fitting = [p for p in PRODUCTS if p[1] <= target <= p[2]] or PRODUCTS
                title, _, _ = rng.choice(fitting)
                low, high = target * 0.85, target * 1.15
            company = rng.choice(company_list)
            company_contacts = [c for c in contacts if c.company is company]
            # El responsable suele ser el de la empresa; a veces otro comercial.
            owner = company.owner if rng.random() < 0.5 else users[pick_owner()]
            stage_changed = path_times[-1][1] if path_times else created
            deal = Deal(
                title=title, value=deal_value(low, high, factor), stage=stages[final_stage],
                company=company, contact=rng.choice(company_contacts) if company_contacts else None,
                owner=owner, created_at=created, stage_changed_at=stage_changed, closed_at=closed,
                expected_close_date=expected or (closed.date() if closed else None),
            )
            db.add(deal)
            db.flush()  # asigna deal.id para enlazar el historial
            history.append(Activity(type=T.SYSTEM, subject="Deal creado en Lead", occurred_at=created,
                                    deal_id=deal.id, user_id=owner.id))
            previous = "Lead"
            for stage_name, when in path_times:
                # Mismo formato que escribe la API al mover un deal (routers/deals.py).
                history.append(Activity(type=T.SYSTEM, subject=f"Etapa: {previous} → {stage_name}",
                                        occurred_at=when, deal_id=deal.id, user_id=owner.id))
                previous = stage_name
            deals.append(deal)
            return deal

        def spread_path(stages_after_lead: list[str], start: datetime, end: datetime):
            """Reparte los cambios de etapa en orden entre `start` y `end` (el último, en `end`)."""
            n = len(stages_after_lead)
            if n == 0:
                return []
            cuts = sorted(rng.uniform(0.1, 0.95) for _ in range(n - 1))
            times = [max(start, min(end, office_hours(start + (end - start) * c))) for c in cuts]
            return list(zip(stages_after_lead, times + [end]))

        # Ganados: unos cuantos por mes, cada vez más (y algo mayores) hacia el presente.
        month_start = today.replace(day=1)
        for months_back, count in zip(range(11, -1, -1), WON_PER_MONTH):
            first_day = month_start
            for _ in range(months_back):
                first_day = (first_day - timedelta(days=1)).replace(day=1)
            next_month = (first_day + timedelta(days=32)).replace(day=1)
            last_day = min(next_month - timedelta(days=1), today)
            for _ in range(count):
                close_day = first_day + timedelta(days=rng.randint(0, (last_day - first_day).days))
                closed = min(datetime.combine(close_day, time(rng.randint(9, 17), 30)), now)
                # Días desde que entró como lead (más cortos en los más antiguos,
                # para que todos se creen dentro del último año aprox.).
                cycle = rng.randint(15, 80 if months_back < 10 else 30)
                created = datetime.combine((closed - timedelta(days=cycle)).date(), time(rng.randint(9, 12), 0))
                # Algunos se saltan "Contactado" (vinieron recomendados).
                flow = ["Contactado", "Propuesta", "Negociación"]
                if rng.random() < 0.25:
                    flow.remove("Contactado")
                path = spread_path(flow, created, closed - timedelta(days=rng.randint(2, 6)))
                path.append(("Ganado", closed))
                # Tendencia al alza: de ~10.000 € hace un año a ~30.000 € ahora.
                target = rng.randint(8000, 12000) + 1800 * (11 - months_back)
                deal = new_deal("Ganado", created, path, closed=closed, target=target)
                history.append(Activity(
                    type=T.EMAIL, subject="Contrato firmado",
                    body="Recibido el contrato firmado. Pasamos el proyecto al equipo de implantación.",
                    occurred_at=closed, deal_id=deal.id, contact_id=deal.contact_id,
                    company_id=deal.company_id, user_id=deal.owner_id))

        # Perdidos: repartidos por el año (unos 40 días entre uno y otro, así
        # siempre hay alguno reciente para la tasa de éxito), en distintas etapas.
        for i in range(LOST_COUNT):
            closed = days_ago(12 + i * 40 + rng.randint(0, 10))
            created = closed - timedelta(days=rng.randint(10, 60))
            reached = OPEN_FLOW[1:rng.randint(2, 4)]  # hasta Contactado, Propuesta o Negociación
            path = spread_path(reached, created, closed - timedelta(days=rng.randint(1, 5)))
            path.append(("Perdido", closed))
            deal = new_deal("Perdido", created, path, closed=closed)
            history.append(Activity(
                type=T.NOTE, subject="Motivo de pérdida", body=rng.choice(LOSS_REASONS),
                occurred_at=closed, deal_id=deal.id, company_id=deal.company_id, user_id=deal.owner_id))

        # Abiertos: en cada etapa, entraron hace unos días o semanas.
        open_deals = []
        for stage_name, count in OPEN_PER_STAGE.items():
            for i in range(count):
                position = OPEN_FLOW.index(stage_name)
                if position == 0:
                    created = days_ago(rng.randint(2, 30))
                    path = []
                else:
                    entered = days_ago(rng.randint(1, 35))
                    created = entered - timedelta(days=rng.randint(7, 60))
                    path = spread_path(OPEN_FLOW[1:position + 1], created, entered)
                # El primero de cada etapa ya ha superado su fecha prevista de cierre.
                if i == 0:
                    expected = today - timedelta(days=rng.randint(2, 20))
                else:
                    expected = today + timedelta(days=rng.randint(7, 90))
                factor = 1.15  # los deals actuales, algo mayores
                open_deals.append(new_deal(stage_name, created, path, factor=factor, expected=expected))

        # Actividades manuales en cada deal (llamadas, reuniones, emails, notas).
        for deal in deals:
            end = deal.closed_at or now
            for _ in range(rng.randint(1, 3)):
                type_, subject, body = rng.choice(MANUAL_ACTIVITIES)
                history.append(Activity(
                    type=type_, subject=subject, body=body,
                    occurred_at=between(deal.created_at, end),
                    deal_id=deal.id, contact_id=deal.contact_id, company_id=deal.company_id,
                    # Normalmente lo apunta el responsable; a veces un compañero le ayuda.
                    user_id=deal.owner_id if rng.random() < 0.8 else users[pick_owner()].id))

        # Algunas actividades sueltas, solo de contacto o de empresa.
        for contact in rng.sample(contacts, 8):
            type_, subject, body = rng.choice([
                (T.CALL, "Llamada de presentación", "Primera toma de contacto; nos pide más información."),
                (T.EMAIL, "Invitación al webinar", "Le invitamos al webinar sobre automatización de procesos."),
                (T.NOTE, "Cambio de puesto", "Nos comenta que asume también el área de compras."),
                (T.MEETING, "Café en la feria del sector", "Coincidimos en la feria; interesado en hablar en enero."),
            ])
            history.append(Activity(
                type=type_, subject=subject, body=body, occurred_at=days_ago(rng.randint(1, 120)),
                contact_id=contact.id, company_id=contact.company_id,
                user_id=(contact.owner or users["admin"]).id))

        db.add_all(history)

        # --- Tareas -------------------------------------------------------------
        tasks = []
        for user_key, due_in, done in TASK_PLAN:
            user = users[user_key]
            # Mejor un deal abierto del propio comercial; si no tiene, cualquiera abierto.
            own = [d for d in open_deals if d.owner is user] or open_deals
            deal = rng.choice(own)
            contact_name = deal.contact.first_name if deal.contact else deal.company.name
            title = rng.choice(TASK_TITLES).format(deal=deal.title.lower(), contact=contact_name)
            title = title[0].upper() + title[1:]
            due = today + timedelta(days=due_in) if due_in is not None else None
            tasks.append(Task(
                title=title, due_date=due, done=done, user_id=user.id,
                deal_id=deal.id, contact_id=deal.contact_id, company_id=deal.company_id,
                created_at=days_ago(rng.randint(1, 14)),
            ))
        # Un par de tareas solo de empresa, sin deal.
        for company_key, title, due_in in [("vectra", "Revisar notas de la reunión anual con Vectra", None),
                                           ("aldea", "Preparar documentación para el concurso público", 10)]:
            company = companies[company_key]
            tasks.append(Task(title=title, user_id=company.owner.id, company_id=company.id,
                              due_date=today + timedelta(days=due_in) if due_in is not None else None,
                              created_at=days_ago(3)))
        db.add_all(tasks)

        db.commit()

        # --- Resumen ------------------------------------------------------------
        won = [d for d in deals if d.stage.is_won]
        lost = [d for d in deals if d.stage.is_lost]
        overdue = [d for d in open_deals if d.expected_close_date < today]
        print("Datos de demo cargados:")
        print(f"  {len(users)} usuarios")
        print(f"  {len(companies)} empresas")
        print(f"  {len(contacts)} contactos")
        print(f"  {len(deals)} deals: {len(won)} ganados ({sum(d.value for d in won):,.0f} €), "
              f"{len(lost)} perdidos, {len(open_deals)} abiertos ({len(overdue)} con cierre vencido)")
        print(f"  {len(history)} actividades")
        print(f"  {len(tasks)} tareas")
        print()
        print("Usuarios para entrar:")
        print(f"  {DEFAULT_ADMIN['email']:<20} / {DEFAULT_ADMIN['password']}")
        for _, email in USERS.values():
            print(f"  {email:<20} / {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
