import { Building2, CalendarDays, Check, CheckSquare, Handshake, Plus, Trash2, User } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, query } from '../api.js'
import useApiGet from '../hooks/useApiGet.js'
import { cn } from '../lib/cn.js'
import { formatDate } from '../lib/format.js'
import { dueStatus } from '../lib/taskDates.js'
import { OwnerSelect } from './OwnerFilter.jsx'
import { Avatar, Badge, Button, EmptyState, ErrorMessage, Input, Skeleton, useConfirm, useToast } from './ui'

function DueBadge({ task }) {
  const status = dueStatus(task)
  if (!task.due_date) return null
  if (status === 'overdue') return <Badge tone="red" icon={CalendarDays}>Vencida · {formatDate(task.due_date)}</Badge>
  if (status === 'today') return <Badge tone="amber" icon={CalendarDays}>Hoy</Badge>
  return <Badge tone="gray" icon={CalendarDays}>{formatDate(task.due_date)}</Badge>
}

// Enlace por defecto a lo que está vinculada la tarea (deal, contacto o empresa).
function defaultLink(task) {
  if (task.deal_id) return { to: `/deals/${task.deal_id}`, label: task.deal_title ?? 'Ver deal', icon: Handshake }
  if (task.contact_id) return { to: `/contacts/${task.contact_id}`, label: task.contact_name ?? 'Ver contacto', icon: User }
  if (task.company_id) return { to: `/companies/${task.company_id}`, label: task.company_name ?? 'Ver empresa', icon: Building2 }
  return null
}

/**
 * Una fila de tarea. Se exporta para reutilizarla en la página de Tareas.
 *   <TaskRow task={t} onToggle={fn} onDelete={fn} showLinks link={{ to, label, icon }} />
 * `showLinks` muestra un enlace a lo que está vinculada; `link` permite al
 * padre darle un texto mejor (p. ej. el título del deal).
 */
export function TaskRow({ task, onToggle, onDelete, showLinks = false, link }) {
  const target = showLinks ? (link ?? defaultLink(task)) : null
  return (
    <li className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
      {/* Casilla redonda hecha con un botón: más fácil de estilar que un checkbox nativo. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? 'Marcar como pendiente' : 'Marcar como hecha'}
        onClick={() => onToggle(task)}
        className={cn(
          'flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors',
          task.done
            ? 'border-success bg-success text-white'
            : 'border-input text-transparent hover:border-success hover:text-success',
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', task.done && 'text-muted-foreground line-through')}>{task.title}</p>
        {target && (
          <Link
            to={target.to}
            className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary"
          >
            {target.icon && <target.icon className="size-3 shrink-0" />}
            <span className="truncate">{target.label}</span>
          </Link>
        )}
      </div>

      <DueBadge task={task} />
      <Avatar name={task.user_name} size="xs" title={task.user_name ? `Asignada a ${task.user_name}` : 'Sin asignar'} />
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          icon={Trash2}
          aria-label="Borrar tarea"
          title="Borrar"
          onClick={() => onDelete(task)}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        />
      )}
    </li>
  )
}

/**
 * Tareas de un contacto, empresa o deal, con formulario para añadir.
 *   <TaskList filter={{ deal_id: 3 }} reloadKey={n} />
 * Props:
 *   filter     -> exactamente uno de { contact_id } | { company_id } | { deal_id }
 *   reloadKey  -> al cambiar, se vuelve a pedir la lista
 */
export default function TaskList({ filter, reloadKey = 0 }) {
  const toast = useToast()
  const confirm = useConfirm()
  // Igual que en ActivityTimeline: dependemos de la clave y el valor del
  // filtro (a través de la ruta), no del objeto, que es nuevo en cada render.
  const [filterKey, filterValue] = Object.entries(filter ?? {}).find(([, v]) => v != null) ?? []
  const path = filterKey ? '/tasks' + query({ [filterKey]: filterValue }) : null
  const { data, error, loading, setData } = useApiGet(path, reloadKey)
  const tasks = data ?? []

  const [form, setForm] = useState({ title: '', due_date: '', user_id: '' })
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const title = form.title.trim()
    if (!title) return setFormError('El título es obligatorio.')
    setSaving(true)
    setFormError(null)
    try {
      const created = await api.post('/tasks', {
        title,
        due_date: form.due_date || null,
        user_id: form.user_id || undefined, // vacío → la API asigna al usuario actual
        [filterKey]: Number(filterValue),
      })
      setData((list) => sortTasks([...(list ?? []), created]))
      setForm((f) => ({ ...f, title: '', due_date: '' }))
      toast.success('Tarea creada')
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggle(task) {
    try {
      const updated = await api.patch(`/tasks/${task.id}`, { done: !task.done })
      setData((list) => list.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function remove(task) {
    if (!(await confirm({ title: '¿Borrar la tarea?', message: `"${task.title}" se borrará para siempre.`, danger: true }))) return
    try {
      await api.delete(`/tasks/${task.id}`)
      setData((list) => list.filter((t) => t.id !== task.id))
      toast.success('Tarea borrada')
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (!filterKey) return <ErrorMessage>TaskList necesita contact_id, company_id o deal_id.</ErrorMessage>

  const pending = tasks.filter((t) => !t.done).length

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Nueva tarea…"
            value={form.title}
            onChange={(e) => {
              setForm({ ...form, title: e.target.value })
              setFormError(null)
            }}
            className="sm:flex-1"
            aria-label="Título de la tarea"
            aria-invalid={Boolean(formError)}
          />
          <Input
            type="date"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            className="sm:w-40"
            aria-label="Fecha límite"
          />
          <OwnerSelect
            value={form.user_id}
            onChange={(v) => setForm({ ...form, user_id: v })}
            className="sm:w-44"
            aria-label="Asignar a"
          />
          <Button type="submit" variant="primary" icon={Plus} loading={saving}>Añadir</Button>
        </div>
        {formError && <p className="mt-2 text-xs text-danger">{formError}</p>}
      </form>

      <ErrorMessage>{error}</ErrorMessage>

      {loading && !data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No hay tareas" description="Añade lo siguiente que hay que hacer." className="py-10" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
            {pending} {pending === 1 ? 'pendiente' : 'pendientes'} de {tasks.length}
          </p>
          <ul className="divide-y divide-border">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={toggle} onDelete={remove} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Mismo orden que la API: por fecha ascendente, las que no tienen fecha al final.
function sortTasks(list) {
  return [...list].sort((a, b) => {
    if (a.due_date === b.due_date) return 0
    if (a.due_date == null) return 1
    if (b.due_date == null) return -1
    return a.due_date < b.due_date ? -1 : 1
  })
}
