import { Activity, Mail, Phone, RefreshCw, StickyNote, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/ui'
import { cn } from '../../lib/cn.js'
import { formatDateTime, formatRelative } from '../../lib/format.js'

// Icono y color por tipo de actividad.
const TYPES = {
  call: { icon: Phone, label: 'Llamada', tone: 'bg-primary-soft text-primary' },
  meeting: { icon: Users, label: 'Reunión', tone: 'bg-success-soft text-success' },
  email: { icon: Mail, label: 'Email', tone: 'bg-warning-soft text-warning' },
  note: { icon: StickyNote, label: 'Nota', tone: 'bg-muted text-muted-foreground' },
  system: { icon: RefreshCw, label: 'Sistema', tone: 'bg-muted text-muted-foreground' },
}

function targetPath(item) {
  if (item.deal_id) return `/deals/${item.deal_id}`
  if (item.contact_id) return `/contacts/${item.contact_id}`
  if (item.company_id) return `/companies/${item.company_id}`
  return null
}

/** Últimas actividades de todo el equipo. */
export default function ActivityFeed({ items }) {
  if (items.length === 0) {
    return <EmptyState icon={Activity} title="Sin actividad todavía" description="Las llamadas, reuniones y cambios aparecerán aquí." className="py-8" />
  }
  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const type = TYPES[item.type] ?? TYPES.note
        const path = targetPath(item)
        return (
          <li key={item.id} className="flex gap-3">
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', type.tone)} title={type.label}>
              <type.icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{item.subject}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {item.user_name ?? 'Alguien'}
                {path && item.target_name && (
                  <>
                    {' · '}
                    <Link to={path} className="font-medium text-foreground hover:text-primary">
                      {item.target_name}
                    </Link>
                  </>
                )}
              </p>
            </div>
            <time
              dateTime={item.occurred_at}
              title={formatDateTime(item.occurred_at)}
              className="shrink-0 text-xs whitespace-nowrap text-muted-foreground"
            >
              {formatRelative(item.occurred_at)}
            </time>
          </li>
        )
      })}
    </ul>
  )
}
