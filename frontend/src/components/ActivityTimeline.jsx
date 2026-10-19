import { History, Mail, MessageSquare, Phone, StickyNote, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { api, query } from '../api.js'
import useApiGet from '../hooks/useApiGet.js'
import { cn } from '../lib/cn.js'
import { formatRelative, parseDate } from '../lib/format.js'
import { Avatar, Button, EmptyState, ErrorMessage, Input, Skeleton, Textarea, useConfirm, useToast } from './ui'

// Tipos que puede registrar el usuario ("system" solo lo crea la API).
const TYPES = {
  call: { label: 'Llamada', placeholder: '¿De qué hablasteis?', icon: Phone, color: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  meeting: { label: 'Reunión', placeholder: 'Tema de la reunión', icon: Users, color: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  email: { label: 'Email', placeholder: 'Asunto del email', icon: Mail, color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  note: { label: 'Nota', placeholder: 'Título de la nota', icon: StickyNote, color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
}

const fullDate = (iso) =>
  parseDate(iso).toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' })

// "hace 5 días", pero para hoy mostramos la hora: "hoy, 10:30".
function when(iso) {
  const relative = formatRelative(iso)
  if (relative !== 'hoy') return relative
  return `hoy, ${parseDate(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * Historial de actividades de un contacto, empresa o deal, con formulario
 * para registrar una nueva.
 *   <ActivityTimeline filter={{ deal_id: 3 }} reloadKey={n} />
 * Props:
 *   filter     -> exactamente uno de { contact_id } | { company_id } | { deal_id }
 *   reloadKey  -> al cambiar, se vuelve a pedir la lista (p. ej. tras mover
 *                 un deal de etapa, porque la API añade una actividad "system")
 */
export default function ActivityTimeline({ filter, reloadKey = 0 }) {
  const toast = useToast()
  const confirm = useConfirm()
  // `filter` es un objeto nuevo en cada render del padre ({{ deal_id: id }}).
  // Sacamos su clave y valor (strings/números, que se comparan por valor) y
  // construimos la ruta: useApiGet solo repite la petición si cambia.
  const [filterKey, filterValue] = Object.entries(filter ?? {}).find(([, v]) => v != null) ?? []
  const path = filterKey ? '/activities' + query({ [filterKey]: filterValue }) : null
  const { data, error, loading, setData } = useApiGet(path, reloadKey)
  const activities = data ?? []

  const [form, setForm] = useState({ type: 'call', subject: '', body: '' })
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const subject = form.subject.trim()
    if (!subject) return setFormError('El asunto es obligatorio.')
    setSaving(true)
    setFormError(null)
    try {
      const created = await api.post('/activities', {
        type: form.type,
        subject,
        body: form.body.trim() || null,
        [filterKey]: Number(filterValue),
      })
      // La lista va de más reciente a más antigua: la nueva va arriba.
      setData((list) => [created, ...(list ?? [])])
      setForm((f) => ({ ...f, subject: '', body: '' }))
      toast.success('Actividad registrada')
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(activity) {
    const ok = await confirm({ title: '¿Borrar la actividad?', message: `"${activity.subject}" se borrará para siempre.`, danger: true })
    if (!ok) return
    try {
      await api.delete(`/activities/${activity.id}`)
      setData((list) => list.filter((a) => a.id !== activity.id))
      toast.success('Actividad borrada')
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (!filterKey) return <ErrorMessage>ActivityTimeline necesita contact_id, company_id o deal_id.</ErrorMessage>

  const typeInfo = TYPES[form.type]

  return (
    <div className="flex flex-col gap-6">
      {/* Composer */}
      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-4 shadow-xs">
        {/* Botones segmentados: funcionan como un grupo de radio buttons. */}
        <div className="mb-3 inline-flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Tipo de actividad">
          {Object.entries(TYPES).map(([value, t]) => {
            const active = form.type === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setForm((f) => ({ ...f, type: value }))}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <t.icon className="size-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
        <div className="flex flex-col gap-2">
          <Input
            placeholder={typeInfo.placeholder}
            value={form.subject}
            onChange={(e) => {
              setForm({ ...form, subject: e.target.value })
              setFormError(null)
            }}
            aria-invalid={Boolean(formError)}
          />
          <Textarea
            placeholder="Detalles (opcional)"
            rows={2}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-danger">{formError}</span>
          <Button type="submit" variant="primary" size="sm" loading={saving}>Registrar</Button>
        </div>
      </form>

      <ErrorMessage>{error}</ErrorMessage>

      {loading && !data ? (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : activities.length === 0 ? (
        <EmptyState icon={MessageSquare} title="Todavía no hay actividad" description="Registra la primera llamada, reunión, email o nota." />
      ) : (
        // La línea vertical es el borde izquierdo de la lista; cada icono la tapa con su círculo.
        <ol className="relative ml-4 border-l border-border">
          {activities.map((a) =>
            a.type === 'system' ? <SystemItem key={a.id} activity={a} /> : <ActivityItem key={a.id} activity={a} onDelete={remove} />,
          )}
        </ol>
      )}
    </div>
  )
}

function ActivityItem({ activity: a, onDelete }) {
  const t = TYPES[a.type] ?? { label: a.type, icon: MessageSquare, color: 'bg-muted text-muted-foreground' }
  return (
    <li className="group relative pb-6 pl-8 last:pb-0">
      <span
        className={cn('absolute top-0 -left-4 flex size-8 items-center justify-center rounded-full ring-4 ring-background', t.color)}
        title={t.label}
      >
        <t.icon className="size-4" />
      </span>
      <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
            <p className="text-sm font-medium break-words">{a.subject}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            icon={Trash2}
            aria-label="Borrar actividad"
            title="Borrar"
            onClick={() => onDelete(a)}
            className="-mt-1 -mr-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          />
        </div>
        {a.body && <p className="mt-1.5 text-sm whitespace-pre-line text-muted-foreground">{a.body}</p>}
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Avatar name={a.user_name} size="xs" />
          <span>{a.user_name ?? 'Usuario desconocido'}</span>
          <span aria-hidden>·</span>
          <time dateTime={a.occurred_at} title={fullDate(a.occurred_at)}>{when(a.occurred_at)}</time>
        </div>
      </div>
    </li>
  )
}

// Cambios automáticos (creación, etapa, responsable): más discretos y sin borrar.
function SystemItem({ activity: a }) {
  return (
    <li className="relative pb-5 pl-8 last:pb-0">
      <span className="absolute top-0.5 -left-2.5 flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground ring-4 ring-background">
        <History className="size-3" />
      </span>
      <p className="text-xs leading-6 text-muted-foreground">
        <span className="font-medium text-foreground">{a.user_name ?? 'Sistema'}</span>
        {' · '}
        {a.subject}
        {' · '}
        <time dateTime={a.occurred_at} title={fullDate(a.occurred_at)}>{when(a.occurred_at)}</time>
      </p>
    </li>
  )
}
