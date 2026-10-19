import { cn } from '../../lib/cn.js'
import { formatMoney } from '../../lib/format.js'

// Color de la barra según el tipo de etapa (clases del sistema de diseño,
// así funcionan también en modo oscuro).
function barColor(stage) {
  if (stage.is_won) return 'bg-success'
  if (stage.is_lost) return 'bg-danger/70'
  return 'bg-primary'
}

function FunnelRow({ stage, max }) {
  // Ancho proporcional al valor; un mínimo para que se vea algo si hay deals de 0 €.
  const width = max > 0 ? Math.max((stage.value / max) * 100, stage.count > 0 ? 2 : 0) : 0
  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className={cn('font-medium', stage.is_won && 'text-success', stage.is_lost && 'text-danger')}>
          {stage.name}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {stage.count} {stage.count === 1 ? 'deal' : 'deals'} ·{' '}
          <span className="font-medium text-foreground">{formatMoney(stage.value)}</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-[width] duration-500', barColor(stage))} style={{ width: `${width}%` }} />
      </div>
    </li>
  )
}

/**
 * Embudo del pipeline: una barra por etapa, de ancho proporcional a su valor.
 * Las etapas cerradas (ganado/perdido) van aparte, debajo de una línea.
 */
export default function PipelineFunnel({ stages }) {
  const max = Math.max(0, ...stages.map((s) => s.value))
  const open = stages.filter((s) => !s.is_won && !s.is_lost)
  const closed = stages.filter((s) => s.is_won || s.is_lost)
  return (
    <div>
      <ul className="space-y-3.5">
        {open.map((stage) => (
          <FunnelRow key={stage.stage_id} stage={stage} max={max} />
        ))}
      </ul>
      {closed.length > 0 && (
        <ul className="mt-4 space-y-3.5 border-t border-border pt-4">
          {closed.map((stage) => (
            <FunnelRow key={stage.stage_id} stage={stage} max={max} />
          ))}
        </ul>
      )}
    </div>
  )
}
