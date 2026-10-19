// Utilidades de fechas de tareas (las usan TaskList y TasksPage).

// Fecha de hoy en formato "YYYY-MM-DD" (hora local), comparable como texto
// con `due_date` (el orden alfabético de estas fechas es el cronológico).
export function todayISO() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Estado de la fecha límite: 'overdue' | 'today' | 'upcoming' | 'none' | 'done'. */
export function dueStatus(task, today = todayISO()) {
  if (task.done) return 'done'
  if (!task.due_date) return 'none'
  if (task.due_date < today) return 'overdue'
  if (task.due_date === today) return 'today'
  return 'upcoming'
}
