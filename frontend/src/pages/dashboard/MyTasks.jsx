import { Briefcase, Building2, CheckCircle2, User } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, query } from '../../api.js'
import { Badge, EmptyState, ErrorMessage, Skeleton, useToast } from '../../components/ui'
import useApiGet from '../../hooks/useApiGet.js'
import { cn } from '../../lib/cn.js'
import { formatDate } from '../../lib/format.js'

// Enlace al registro del que cuelga la tarea (la API devuelve su nombre).
function TaskLink({ task }) {
  const link = task.deal_id
    ? { to: `/deals/${task.deal_id}`, icon: Briefcase, label: task.deal_title }
    : task.contact_id
      ? { to: `/contacts/${task.contact_id}`, icon: User, label: task.contact_name }
      : task.company_id
        ? { to: `/companies/${task.company_id}`, icon: Building2, label: task.company_name }
        : null
  if (!link) return null
  return (
    <Link to={link.to} className="inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary">
      <link.icon className="size-3 shrink-0" />
      <span className="truncate">{link.label}</span>
    </Link>
  )
}

function TaskItem({ task, overdue, onComplete }) {
  const [saving, setSaving] = useState(false)
  async function handleChange() {
    setSaving(true)
    // Si falla, onComplete lanza el aviso y volvemos a habilitar el checkbox.
    const ok = await onComplete(task)
    if (!ok) setSaving(false)
  }
  return (
    <li className="flex items-start gap-3 py-2.5">
      <input
        type="checkbox"
        checked={saving}
        disabled={saving}
        onChange={handleChange}
        aria-label={`Completar "${task.title}"`}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
      />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', saving && 'text-muted-foreground line-through')}>{task.title}</p>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <TaskLink task={task} />
        </div>
      </div>
      {overdue ? (
        <Badge tone="red">{formatDate(task.due_date)}</Badge>
      ) : (
        <Badge tone="amber">Hoy</Badge>
      )}
    </li>
  )
}

/** Tareas vencidas y de hoy del usuario actual. */
export default function MyTasks({ userId }) {
  const toast = useToast()
  const overdue = useApiGet(`/tasks${query({ user_id: userId, due: 'overdue' })}`)
  const today = useApiGet(`/tasks${query({ user_id: userId, due: 'today', done: false })}`)

  async function complete(task) {
    try {
      await api.patch(`/tasks/${task.id}`, { done: true })
      // Quitamos la tarea de la lista sin volver a pedirla a la API.
      const remove = (list) => list?.filter((t) => t.id !== task.id)
      overdue.setData(remove)
      today.setData(remove)
      toast.success('Tarea completada')
      return true
    } catch (err) {
      toast.error(err.message)
      return false
    }
  }

  if (overdue.loading || today.loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    )
  }
  const error = overdue.error || today.error
  if (error) return <ErrorMessage>{error}</ErrorMessage>

  const items = [
    ...(overdue.data ?? []).map((task) => ({ task, overdue: true })),
    ...(today.data ?? []).map((task) => ({ task, overdue: false })),
  ]
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="¡Todo al día!"
        description="No tienes tareas vencidas ni para hoy."
        className="py-8"
      />
    )
  }
  return (
    <ul className="-my-2.5 divide-y divide-border">
      {items.map(({ task, overdue: isOverdue }) => (
        <TaskItem key={task.id} task={task} overdue={isOverdue} onComplete={complete} />
      ))}
    </ul>
  )
}
