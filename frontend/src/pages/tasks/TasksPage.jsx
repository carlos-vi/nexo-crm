import { CheckSquare, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, query } from '../../api.js'
import { useAuth } from '../../auth/useAuth.js'
import { OwnerSelect } from '../../components/OwnerFilter.jsx'
import { TaskRow } from '../../components/TaskList.jsx'
import {
  Button, EmptyState, ErrorMessage, Field, Input, Modal, PageHeader, Select, Skeleton, Tabs, useConfirm, useToast,
} from '../../components/ui'
import useApiGet from '../../hooks/useApiGet.js'
import useUsers from '../../hooks/useUsers.js'
import { dueStatus, todayISO } from '../../lib/taskDates.js'

// Pestañas: cada una agrupa las tareas según dueStatus() (ver TaskList.jsx).
const TABS = [
  { value: 'overdue', label: 'Vencidas', empty: '¡Nada vencido! Vas al día.' },
  { value: 'today', label: 'Hoy', empty: 'No tienes nada para hoy.' },
  { value: 'upcoming', label: 'Próximas', empty: 'No hay tareas programadas.' },
  { value: 'none', label: 'Sin fecha', empty: 'No hay tareas sin fecha.' },
  { value: 'done', label: 'Hechas', empty: 'Todavía no hay tareas hechas.' },
]

export default function TasksPage() {
  const { user } = useAuth()
  const users = useUsers()
  const toast = useToast()
  const confirm = useConfirm()

  // De quién son las tareas, en la URL: sin parámetro = las mías,
  // ?user_id=all = todas, ?user_id=3 = las de ese usuario.
  const [searchParams, setSearchParams] = useSearchParams()
  const who = searchParams.get('user_id') ?? 'me'
  const setWho = (value) => setSearchParams(value === 'me' ? {} : { user_id: value }, { replace: true })
  const userId = who === 'me' ? user?.id : who === 'all' ? undefined : who

  const { data, error, loading, setData } = useApiGet('/tasks' + query({ user_id: userId }))
  const [tab, setTab] = useState(null)
  const [showNew, setShowNew] = useState(false)

  // Una sola petición y repartimos en el navegador: así tenemos los
  // contadores de todas las pestañas a la vez.
  const groups = useMemo(() => {
    const today = todayISO()
    const result = Object.fromEntries(TABS.map((t) => [t.value, []]))
    for (const task of data ?? []) result[dueStatus(task, today)].push(task)
    return result
  }, [data])

  // Pestaña inicial: "Vencidas" si hay alguna, si no "Hoy". Es un valor
  // derivado mientras el usuario no elija otra.
  const currentTab = tab ?? (groups.overdue.length > 0 ? 'overdue' : 'today')
  const current = TABS.find((t) => t.value === currentTab)
  const visible = groups[currentTab]

  async function toggle(task) {
    try {
      const updated = await api.patch(`/tasks/${task.id}`, { done: !task.done })
      setData((list) => list.map((t) => (t.id === updated.id ? updated : t)))
      toast.success(updated.done ? 'Tarea completada' : 'Tarea marcada como pendiente')
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

  function handleCreated(created) {
    setShowNew(false)
    // Solo la añadimos si encaja con el filtro de usuario actual.
    if (userId === undefined || String(created.user_id) === String(userId)) {
      setData((list) => [...(list ?? []), created])
    }
  }

  return (
    <div>
      <PageHeader
        title="Tareas"
        description="Lo que hay que hacer, ordenado por fecha."
        actions={
          <>
            <Select value={who} onChange={(e) => setWho(e.target.value)} className="w-auto" aria-label="De quién">
              <option value="me">Mis tareas</option>
              <option value="all">Todas</option>
              {users
                .filter((u) => u.id !== user?.id)
                .map((u) => (
                  <option key={u.id} value={String(u.id)}>{u.name}</option>
                ))}
            </Select>
            <Button variant="primary" icon={Plus} onClick={() => setShowNew(true)}>Nueva tarea</Button>
          </>
        }
      />

      <Tabs
        value={currentTab}
        onChange={setTab}
        tabs={TABS.map((t) => ({ value: t.value, label: t.label, count: loading ? undefined : groups[t.value].length }))}
        className="mb-4 overflow-x-auto"
      />

      <ErrorMessage className="mb-4">{error}</ErrorMessage>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        {loading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState icon={CheckSquare} title={current.empty} />
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={toggle} onDelete={remove} showLinks />
            ))}
          </ul>
        )}
      </div>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Nueva tarea" size="sm">
        {showNew && <NewTaskForm onCancel={() => setShowNew(false)} onSaved={handleCreated} />}
      </Modal>
    </div>
  )
}

// Tarea suelta (sin deal, contacto ni empresa). Para vincularla, mejor
// crearla desde la ficha correspondiente.
function NewTaskForm({ onCancel, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ title: '', due_date: todayISO(), user_id: '' })
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return setErrors({ title: 'El título es obligatorio.' })
    setSaving(true)
    setServerError(null)
    try {
      const created = await api.post('/tasks', {
        title: form.title.trim(),
        due_date: form.due_date || null,
        user_id: form.user_id || undefined,
      })
      toast.success('Tarea creada')
      onSaved(created)
    } catch (err) {
      setServerError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field label="Título" required error={errors.title}>
        <Input
          value={form.title}
          onChange={(e) => {
            setForm({ ...form, title: e.target.value })
            setErrors({})
          }}
          autoFocus
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha límite">
          <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </Field>
        <Field label="Asignada a">
          <OwnerSelect value={form.user_id} onChange={(v) => setForm({ ...form, user_id: v })} />
        </Field>
      </div>
      <ErrorMessage>{serverError}</ErrorMessage>
      <div className="-mx-6 -mb-5 flex justify-end gap-2 rounded-b-xl border-t border-border bg-muted/50 px-6 py-3">
        <Button onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" loading={saving}>Crear tarea</Button>
      </div>
    </form>
  )
}
