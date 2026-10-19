// Piezas pequeñas que comparten las fichas de empresa y de contacto.
import { Briefcase } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, EmptyState, Skeleton } from '../../components/ui'
import { cn } from '../../lib/cn.js'
import { formatDate, formatMoney } from '../../lib/format.js'

/** Caja con una cifra destacada: "Pipeline abierto · 18.000 €". */
export function Stat({ label, value, hint, tone }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums', tone === 'success' && 'text-success')}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Lista de pares etiqueta/valor para la tarjeta "Detalles". */
export function DetailList({ items }) {
  return (
    <dl className="space-y-3 text-sm">
      {items.map(({ label, icon: Icon, value }) => (
        <div key={label} className="flex items-start gap-3">
          {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0 flex-1">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 truncate">{value || <span className="text-muted-foreground">—</span>}</dd>
          </div>
        </div>
      ))}
    </dl>
  )
}

/** Lista de deals con su etapa. `stages` sirve para traducir stage_id → nombre. */
export function DealList({ deals, stages }) {
  if (deals.length === 0) {
    return <EmptyState icon={Briefcase} title="Sin deals" description="Todavía no hay oportunidades asociadas." />
  }
  const byId = Object.fromEntries((stages ?? []).map((s) => [s.id, s]))
  return (
    <ul className="divide-y divide-border">
      {deals.map((deal) => {
        const stage = byId[deal.stage_id]
        const tone = stage?.is_won ? 'green' : stage?.is_lost ? 'red' : 'primary'
        return (
          <li key={deal.id}>
            <Link to={`/deals/${deal.id}`} className="flex items-center gap-3 px-1 py-3 hover:bg-muted/50">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                <Briefcase className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{deal.title}</p>
                <p className="text-xs text-muted-foreground">
                  {deal.expected_close_date ? `Cierre previsto: ${formatDate(deal.expected_close_date)}` : 'Sin fecha de cierre'}
                  {deal.owner_name && ` · ${deal.owner_name}`}
                </p>
              </div>
              {stage && <Badge tone={tone}>{stage.name}</Badge>}
              <span className="w-24 text-right text-sm font-medium tabular-nums">{formatMoney(deal.value)}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** Esqueleto de una ficha mientras carga. */
export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-40" />
      <div className="flex items-center gap-3">
        <Skeleton className="size-12" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

/** Filas grises para la tabla mientras carga. */
export function SkeletonRows({ columns, rows = 6 }) {
  return Array.from({ length: rows }, (_, i) => (
    <tr key={i} className="border-b border-border last:border-0">
      {Array.from({ length: columns }, (_, j) => (
        <td key={j} className="px-4 py-3.5">
          <Skeleton className={cn('h-4', j === 0 ? 'w-40' : 'w-20')} />
        </td>
      ))}
    </tr>
  ))
}
