import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui'
import { formatDate, formatMoney } from '../../lib/format.js'

// Listado compacto de los deals cerrados (ganados y perdidos), que ya no
// aparecen como columnas del tablero. Se muestra con "Mostrar cerrados".
export default function ClosedDealsSection({ stages, dealsByStage, sectionRef }) {
  return (
    <section ref={sectionRef} className="mt-6 scroll-mt-20" aria-label="Deals cerrados">
      <h2 className="mb-3 text-sm font-semibold">Deals cerrados</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {stages.map((stage) => {
          // Más recientes primero (por fecha de cierre).
          const deals = [...(dealsByStage.get(stage.id) ?? [])].sort((a, b) =>
            (b.closed_at ?? '').localeCompare(a.closed_at ?? ''),
          )
          return (
            <div key={stage.id} className="min-w-0 rounded-xl border border-border bg-card shadow-xs">
              <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <Badge tone={stage.is_won ? 'green' : 'red'}>{stage.name}</Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {deals.length} · {formatMoney(deals.reduce((sum, d) => sum + d.value, 0))}
                </span>
              </header>
              {deals.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">Ningún deal en esta etapa.</p>
              ) : (
                <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                  {deals.map((deal) => (
                    <li key={deal.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <Link to={`/deals/${deal.id}`} className="block truncate font-medium hover:text-primary">
                          {deal.title}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {deal.company_name ?? 'Sin empresa'} · Cerrado el {formatDate(deal.closed_at)}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">{formatMoney(deal.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
