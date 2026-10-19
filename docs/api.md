# Contrato de la API

Este documento es la referencia común entre backend y frontend: el backend
debe responder exactamente así y el frontend puede contar con ello.

## Convenciones

- Todas las rutas empiezan por `/api`.
- Cuerpo de peticiones y respuestas en JSON.
- Fechas (`date`): `"YYYY-MM-DD"`. Fechas con hora (`datetime`): ISO 8601,
  p. ej. `"2026-10-19T10:30:00"`, en hora local del servidor y sin zona
  horaria (la app se usa en local, así que no hace falta más).
- Importes (`value`): número JSON (`12000.5`), nunca string.
- Campos opcionales: pueden venir como `null`.
- `POST` crea y devuelve `201` con el objeto creado.
- `PATCH` actualiza solo los campos enviados y devuelve el objeto actualizado.
- `DELETE` devuelve `204` sin cuerpo.
- Errores:
  - `404` → `{"detail": "Company not found"}` (o el recurso que sea)
  - `409` → `{"detail": "..."}` cuando la operación rompería la integridad
  - `422` → validación (formato estándar de FastAPI, o `{"detail": "..."}`
    para reglas propias como "el contacto 7 no existe")
- Búsqueda de texto (`q`): sin distinguir mayúsculas, coincidencia parcial.
- Listados sin paginación (es un proyecto de aprendizaje).

## Autenticación

Todos los endpoints exigen la cabecera `Authorization: Bearer <token>` salvo
`POST /api/auth/login`. Sin token válido (o caducado, a las 8 h) → `401`.

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/api/auth/login` | formulario `application/x-www-form-urlencoded`: `username` (el email) y `password` | `{access_token, token_type: "bearer", user: User}` |
| GET | `/api/auth/me` | | `User` |

- Credenciales incorrectas → `401` `{"detail": "Email o contraseña incorrectos"}`.
- Usuario inicial (administrador) en una base de datos vacía: `admin@crm.local` / `admin1234`.
- Un usuario desactivado no puede iniciar sesión → `401` `{"detail": "Este usuario está desactivado"}`.

## Usuarios

```json
// User
{ "id": 1, "name": "Ana Torres", "email": "ana@crm.local",
  "is_admin": false, "is_active": true, "created_at": "2026-10-19T10:00:00" }
```

| Método | Ruta | Quién | Cuerpo | Respuesta |
|---|---|---|---|---|
| GET | `/api/users?include_inactive=` | cualquiera | | `User[]` por `name`; por defecto solo activos |
| POST | `/api/users` | admin | `{name, email, password, is_admin?}` | `User` |
| PATCH | `/api/users/{id}` | admin | `{name?, email?, is_admin?, is_active?, password?}` | `User` |
| PATCH | `/api/auth/me` | uno mismo | `{name?, email?}` | `User` |
| POST | `/api/auth/password` | uno mismo | `{current_password, new_password}` | `204` |

- `email` se guarda en minúsculas y debe ser único → si no, `409`.
- `password`: mínimo 8 caracteres (`422`).
- Un no administrador que llama a un endpoint de admin → `403`.
- Un administrador no puede quitarse su propio rol ni desactivarse (`422`).
- No se borran usuarios: se **desactivan** (`is_active: false`). Pierden el
  acceso al momento (su token deja de valer y el login responde `401`), pero
  sus deals e historial se conservan.
- Cambiar la contraseña exige la actual (`422` si no coincide).

## Responsables

Empresas, contactos y deals tienen un responsable (`owner_id`, un `User`):

- En `POST`, si no se envía `owner_id`, el responsable es quien lo crea.
- En `PATCH` se puede cambiar `owner_id` (debe existir → si no, `422`).
- Las respuestas incluyen `owner_id` y `owner_name` (solo lectura).
- Los listados aceptan `?owner_id=` para filtrar ("Mis deals").

Las tareas tienen igual un responsable en `user_id` / `user_name` (por defecto
quien la crea; filtro `?user_id=`). Las actividades guardan quién las registró
en `user_id` / `user_name` (siempre el usuario actual).

## Etapas

`GET /api/stages` → `Stage[]` ordenadas por `position` (ya existe).

```json
{ "id": 1, "name": "Lead", "position": 0, "probability": 10, "is_won": false, "is_lost": false }
```

## Empresas

```json
// Company
{ "id": 1, "name": "Acme", "domain": "acme.example", "industry": "Software",
  "owner_id": 1, "owner_name": "Ana Torres",
  "contact_count": 3, "open_deal_count": 2, "open_deal_value": 18000.0,
  "created_at": "2026-10-19T10:00:00" }

// CompanyDetail = Company + listas relacionadas
{ ...Company, "contacts": [Contact], "deals": [Deal] }
```

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/companies?q=&owner_id=` | | `Company[]` ordenadas por `name` |
| POST | `/api/companies` | `{name, domain?, industry?, owner_id?}` | `Company` |
| GET | `/api/companies/{id}` | | `CompanyDetail` |
| PATCH | `/api/companies/{id}` | cualquier campo de POST | `Company` |
| DELETE | `/api/companies/{id}` | | `204` |
| GET | `/api/companies/export?q=&owner_id=` | | fichero CSV |
| POST | `/api/companies/import?dry_run=true` | `multipart/form-data` con `file` | `ImportResult` |

- `name` obligatorio y no vacío.
- `contact_count`, `open_deal_count` y `open_deal_value` son de solo lectura:
  nº de contactos, nº de deals abiertos (en una etapa que no es ni ganada ni
  perdida) y la suma de su `value`.
- `DELETE` devuelve `409` si la empresa tiene contactos o deals
  (`"No se puede borrar: la empresa tiene contactos o deals"`). Si se borra,
  se borran también sus actividades y tareas.

### CSV (exportar / importar)

- **Exportar**: `text/csv; charset=utf-8` con BOM (para que Excel lea bien las
  tildes) y `Content-Disposition: attachment; filename="empresas-YYYY-MM-DD.csv"`.
  Aplica los mismos filtros que el listado. Columnas:
  `name,domain,industry,owner_email`.
- **Importar**: mismas columnas. La fila de cabecera es obligatoria y debe
  incluir `name` (si no → `422`); las columnas desconocidas se ignoran y las
  filas en blanco se saltan. Separador `,` o `;` (se detecta solo). Codificación
  UTF-8 (con o sin BOM) o Windows-1252. Máximo 1 MB (si no → `413`).
- Cada fila se valida: `name` obligatorio; si ya existe una empresa con ese
  nombre (sin distinguir mayúsculas, también dentro del propio fichero) es un
  error "ya existe"; `owner_email` debe ser el email de un usuario (vacío →
  quien importa).
- `dry_run=true` (por defecto) solo valida, no guarda nada. `dry_run=false`
  crea las filas válidas, todas en una única transacción; las erróneas se
  ignoran.

```json
// ImportResult (row = número de línea del fichero; la cabecera es la 1)
{ "total": 5, "valid": 4, "errors": [{ "row": 3, "message": "El nombre es obligatorio" }],
  "created": 0 }
```

## Contactos

```json
// Contact
{ "id": 1, "first_name": "Ana", "last_name": "García", "email": "ana@acme.example",
  "phone": "+1 555-0100", "job_title": "CTO", "company_id": 1,
  "company_name": "Acme", "owner_id": 1, "owner_name": "Ana Torres",
  "open_deal_count": 1, "created_at": "2026-10-19T10:00:00" }

// ContactDetail
{ ...Contact, "deals": [Deal] }
```

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/contacts?q=&company_id=&owner_id=` | | `Contact[]` ordenados por `first_name`, `last_name` |
| POST | `/api/contacts` | `{first_name, last_name?, email?, phone?, job_title?, company_id?, owner_id?}` | `Contact` |
| GET | `/api/contacts/{id}` | | `ContactDetail` |
| PATCH | `/api/contacts/{id}` | cualquier campo de POST | `Contact` |
| DELETE | `/api/contacts/{id}` | | `204` |
| GET | `/api/contacts/export?q=&company_id=&owner_id=` | | fichero CSV |
| POST | `/api/contacts/import?dry_run=true` | `multipart/form-data` con `file` | `ImportResult` |

- `q` busca en nombre, apellidos y email.
- `first_name` obligatorio y no vacío. `company_id`, si viene, debe existir
  (`422`).
- `company_name` y `open_deal_count` (nº de deals abiertos del contacto) son
  de solo lectura (se calculan).
- `DELETE`: los deals del contacto quedan con `contact_id = null`; sus
  actividades y tareas se borran.
- CSV: mismas reglas que en empresas (fichero `contactos-YYYY-MM-DD.csv`).
  Columnas: `first_name,last_name,email,phone,job_title,company,owner_email`.
  Al importar: `first_name` obligatorio (columna y valor), `email` con formato
  válido si viene, `company` debe coincidir con el nombre de una empresa
  existente (sin distinguir mayúsculas; vacío → sin empresa) y `owner_email`
  como en empresas.

## Deals

```json
// Deal
{ "id": 1, "title": "Licencias 2027", "value": 12000.0, "stage_id": 3,
  "company_id": 1, "company_name": "Acme",
  "contact_id": 1, "contact_name": "Ana García",
  "owner_id": 1, "owner_name": "Ana Torres",
  "expected_close_date": "2026-12-01", "closed_at": null,
  "stage_changed_at": "2026-10-19T10:00:00",
  "created_at": "2026-10-19T10:00:00" }
```

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/deals?q=&stage_id=&company_id=&contact_id=` | | `Deal[]` más recientes primero (`q` busca en `title`) |
| POST | `/api/deals` | `{title, value?, stage_id?, company_id?, contact_id?, expected_close_date?}` | `Deal` |
| GET | `/api/deals/{id}` | | `Deal` |
| PATCH | `/api/deals/{id}` | cualquier campo de POST | `Deal` |
| DELETE | `/api/deals/{id}` | | `204` |

- `title` obligatorio y no vacío. `value >= 0` (por defecto `0`).
- Si no se envía `stage_id`, el deal entra en la primera etapa (menor
  `position`).
- `stage_id`, `company_id` y `contact_id`, si vienen, deben existir (`422`).
- `company_name` y `contact_name` son de solo lectura (`contact_name` =
  nombre + apellidos).
- Mover un deal (cambiar `stage_id`, que es lo que hace el Kanban al
  arrastrar):
  - a una etapa con `is_won` o `is_lost` → `closed_at = ahora`
  - a una etapa abierta → `closed_at = null`
- `stage_changed_at`: cuándo entró en su etapa actual (se actualiza al cambiar
  de etapa). Sirve para mostrar "lleva N días en esta etapa".
- **Historial automático**: al crear un deal, al cambiar su etapa y al cambiar
  su responsable, la API añade una actividad de tipo `"system"` en el deal
  (p. ej. `"Etapa: Propuesta → Negociación"`) con el usuario que lo hizo.
- `DELETE` borra también sus actividades y tareas.

## Actividades

Algo que ya pasó. `type` ∈ `"call" | "meeting" | "email" | "note" | "system"`.
`"system"` solo la crea la API (historial automático); enviarla en un `POST` → `422`.

```json
// Activity
{ "id": 1, "type": "call", "subject": "Primera llamada", "body": "Interesados en 20 licencias",
  "occurred_at": "2026-10-19T10:00:00", "user_id": 1, "user_name": "Ana Torres",
  "contact_id": 1, "company_id": null, "deal_id": 1 }
```

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/activities?contact_id=&company_id=&deal_id=` | | `Activity[]` por `occurred_at` descendente |
| POST | `/api/activities` | `{type, subject, body?, occurred_at?, contact_id?, company_id?, deal_id?}` | `Activity` |
| DELETE | `/api/activities/{id}` | | `204` |

- Debe venir al menos uno de `contact_id`, `company_id`, `deal_id`
  (`422`), y los que vengan deben existir (`422`).
- `occurred_at` por defecto: ahora.
- Filtros: si se pasan varios, se combinan con AND.

## Tareas

Algo que hay que hacer.

```json
// Task
{ "id": 1, "title": "Enviar propuesta", "due_date": "2026-10-21", "done": false,
  "contact_id": 1, "company_id": null, "deal_id": 1,
  "created_at": "2026-10-19T10:00:00" }
```

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/tasks?done=&due=&contact_id=&company_id=&deal_id=` | | `Task[]` |
| POST | `/api/tasks` | `{title, due_date?, contact_id?, company_id?, deal_id?}` | `Task` |
| PATCH | `/api/tasks/{id}` | `{title?, due_date?, done?}` | `Task` |
| DELETE | `/api/tasks/{id}` | | `204` |

- `title` obligatorio y no vacío. Los enlaces son opcionales y, si vienen,
  deben existir (`422`).
- `done`: `true` / `false`.
- `due`: `overdue` (vencidas: `due_date < hoy` y no hechas), `today`
  (`due_date == hoy`), `upcoming` (`due_date > hoy`).
- Orden: `due_date` ascendente, las que no tienen fecha al final.

## Búsqueda global

`GET /api/search?q=` (si `q` tiene menos de 2 caracteres, devuelve listas
vacías). Máximo 5 resultados por tipo.

```json
{
  "companies": [{ "id": 1, "name": "Acme" }],
  "contacts":  [{ "id": 1, "name": "Ana García", "company_name": "Acme" }],
  "deals":     [{ "id": 1, "title": "Licencias 2027", "value": 12000.0 }]
}
```

## Dashboard

`GET /api/dashboard?owner_id=` → todas las métricas del panel principal en una
sola respuesta. `owner_id` (opcional) limita `kpis`, `funnel` y
`revenue_by_month` a los deals de ese responsable; `leaderboard` y
`recent_activity` son siempre de todo el equipo.

```json
{
  "kpis": {
    "open_value": 54000.0,          // deals abiertos (etapa ni ganada ni perdida)
    "open_count": 7,
    "weighted_value": 23100.0,      // Σ value × probability / 100 de los abiertos
    "won_this_month": 12000.0,      // ganados con closed_at en el mes natural actual
    "won_this_month_count": 2,
    "won_last_month": 8000.0,
    "win_rate": 62.5,               // % ganados / (ganados + perdidos) cerrados en 90 días; null si ninguno
    "avg_won_value": 6500.0,        // null si no hay ganados
    "avg_sales_cycle_days": 34.2    // media de closed_at − created_at de los ganados; null si ninguno
  },
  "funnel": [                       // todas las etapas, por position
    { "stage_id": 1, "name": "Lead", "is_won": false, "is_lost": false, "count": 3, "value": 15000.0 }
  ],
  "revenue_by_month": [             // 12 meses hasta el actual, el más antiguo primero
    { "month": "2026-10", "value": 12000.0, "count": 2 }   // ganados por closed_at
  ],
  "leaderboard": [                  // un elemento por usuario, por won_value descendente
    { "user_id": 1, "name": "Ana Torres", "won_value": 40000.0, "won_count": 5,  // ganado este año
      "open_value": 30000.0, "open_count": 4 }
  ],
  "recent_activity": [              // las 8 actividades más recientes (cualquier tipo, también "system")
    { "id": 9, "type": "call", "subject": "Primera llamada", "occurred_at": "2026-10-19T10:00:00",
      "user_name": "Ana Torres", "deal_id": 1, "contact_id": 1, "company_id": null,
      "target_name": "Licencias 2027" }  // título del deal, si no nombre del contacto, si no de la empresa
  ]
}
```
