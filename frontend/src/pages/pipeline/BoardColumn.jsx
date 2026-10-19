import { cn } from '../../lib/cn.js'
import { formatMoney } from '../../lib/format.js'

// Columna de una etapa abierta. No tiene ancho fijo: ocupa la fracción que
// le da el grid del tablero, así que todo su contenido debe poder encogerse
// (min-w-0 + truncate).
export default function BoardColumn({ stage, deals, isOver, children, ...dropHandlers }) {
  const total = deals.reduce((sum, d) => sum + d.value, 0)
  return (
    <section
      {...dropHandlers}
      aria-label={`Etapa ${stage.name}`}
      className={cn(
        'flex min-h-0 min-w-0 flex-col rounded-xl border border-border bg-muted/60 transition-colors',
        // Resaltado de la columna de destino mientras se arrastra encima.
        isOver && 'border-primary bg-primary-soft ring-2 ring-primary/40',
      )}
    >
      <header className="px-2.5 pt-2.5 pb-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold" title={stage.name}>{stage.name}</h2>
          <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
            {deals.length}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate font-medium tabular-nums">{formatMoney(total)}</span>
          <span className="shrink-0">{stage.probability}%</span>
        </div>
        {/* Barra fina con la probabilidad de la etapa */}
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-border" title={`Probabilidad: ${stage.probability}%`}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${stage.probability}%` }} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {children}
        {deals.length === 0 && (
          <div
            className={cn(
              'flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground',
              isOver ? 'border-primary text-primary' : 'border-input',
            )}
          >
            {isOver ? 'Suelta aquí' : 'Sin deals. Arrastra uno aquí'}
          </div>
        )}
      </div>
    </section>
  )
}
