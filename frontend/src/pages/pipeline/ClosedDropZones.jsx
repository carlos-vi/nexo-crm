import { ThumbsDown, Trophy } from 'lucide-react'
import { cn } from '../../lib/cn.js'
import { formatMoney } from '../../lib/format.js'

// Barra inferior con las etapas de cierre (Ganado / Perdido) como zonas de
// destino, al estilo de Pipedrive.
//
// ¿Por qué no son columnas? Un deal cerrado ya no necesita seguimiento, así
// que dedicarle dos columnas enteras resta espacio a las etapas abiertas (las
// que sí se trabajan a diario). Además, la barra está siempre a la misma
// distancia de cualquier columna: cerrar un deal desde "Lead" es tan fácil
// como desde "Negociación", sin arrastrar mientras se hace scroll.
export default function ClosedDropZones({ stages, dealsByStage, dragging, dragOverStageId, dropHandlers }) {
  if (!stages.length) return null
  return (
    <div
      className="mt-3 grid gap-3"
      style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}
    >
      {stages.map((stage) => {
        const deals = dealsByStage.get(stage.id) ?? []
        const total = deals.reduce((sum, d) => sum + d.value, 0)
        const won = stage.is_won
        const isOver = dragOverStageId === stage.id
        const Icon = won ? Trophy : ThumbsDown
        return (
          <section
            key={stage.id}
            aria-label={`Zona para marcar como ${stage.name.toLowerCase()}`}
            {...dropHandlers(stage.id)}
            className={cn(
              'flex min-w-0 items-center gap-3 rounded-xl border-2 px-3 transition-all duration-150',
              // Tamaño normal vs. "modo arrastre": más alta y con borde
              // discontinuo para que se vea claramente que se puede soltar.
              dragging ? 'h-20 border-dashed' : 'h-14',
              won ? 'border-success/30 bg-success-soft text-success' : 'border-danger/30 bg-danger-soft text-danger',
              dragging && (won ? 'border-success/60' : 'border-danger/60'),
              isOver && (won ? 'border-success ring-4 ring-success/25' : 'border-danger ring-4 ring-danger/25'),
              isOver && 'scale-[1.02] shadow-lg',
            )}
          >
            <Icon className={cn('shrink-0 transition-all', dragging ? 'size-6' : 'size-5')} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {dragging ? `Suelta aquí para marcar como ${stage.name.toLowerCase()}` : stage.name}
              </p>
              <p className="truncate text-xs text-muted-foreground tabular-nums">
                {deals.length} {deals.length === 1 ? 'deal' : 'deals'} · {formatMoney(total)}
              </p>
            </div>
          </section>
        )
      })}
    </div>
  )
}
