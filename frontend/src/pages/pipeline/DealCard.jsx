import { CalendarClock, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/ui'
import { cn } from '../../lib/cn.js'
import { daysSince, formatDate, formatMoney } from '../../lib/format.js'

// Tarjeta de un deal en el tablero. Está pensada para columnas estrechas
// (desde ~180px): el título ocupa como mucho dos líneas, la empresa se corta
// con "…" y las líneas de datos saltan de línea si no caben.
export default function DealCard({ deal, stage, dragging, onDragStart, onDragEnd }) {
  const navigate = useNavigate()
  const open = () => navigate(`/deals/${deal.id}`)
  const isOpen = !stage.is_won && !stage.is_lost
  const days = daysSince(deal.stage_changed_at)
  // Vencido: la fecha prevista de cierre ya pasó y el deal sigue abierto.
  const overdue = isOpen && deal.expected_close_date && daysSince(deal.expected_close_date) > 0

  return (
    <article
      // draggable convierte el elemento en arrastrable con la API nativa de HTML5.
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      role="link"
      tabIndex={0}
      title={deal.title}
      className={cn(
        'group min-w-0 cursor-grab rounded-lg border border-border bg-card p-2.5 shadow-xs transition',
        'hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'active:cursor-grabbing',
        // Estilo de la tarjeta que se está arrastrando (su "hueco").
        dragging && 'rotate-1 border-dashed border-primary opacity-50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm leading-snug font-medium break-words group-hover:text-primary">
            {deal.title}
          </p>
          {deal.company_name && <p className="mt-0.5 truncate text-xs text-muted-foreground">{deal.company_name}</p>}
        </div>
        <Avatar
          name={deal.owner_name}
          size="xs"
          title={deal.owner_name ? `Responsable: ${deal.owner_name}` : 'Sin responsable'}
        />
      </div>

      <p className="mt-1.5 truncate text-sm font-semibold tabular-nums">{formatMoney(deal.value)}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
        {days !== null && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap" title="Tiempo en la etapa actual">
            <Clock className="size-3 shrink-0" />
            {days === 0 ? 'Hoy' : `${days} ${days === 1 ? 'día' : 'días'}`}
          </span>
        )}
        {deal.expected_close_date && (
          <span
            className={cn('inline-flex items-center gap-1 whitespace-nowrap', overdue && 'font-medium text-warning')}
            title={overdue ? 'Fecha prevista de cierre superada' : 'Fecha prevista de cierre'}
          >
            <CalendarClock className="size-3 shrink-0" />
            {formatDate(deal.expected_close_date)}
          </span>
        )}
      </div>
    </article>
  )
}
