import { Trophy } from 'lucide-react'
import { Avatar, EmptyState } from '../../components/ui'
import { cn } from '../../lib/cn.js'
import { formatMoney } from '../../lib/format.js'

/** Clasificación de vendedores por lo ganado este año. */
export default function Leaderboard({ rows }) {
  if (rows.length === 0) return <EmptyState icon={Trophy} title="Sin vendedores" className="py-8" />
  // La barra de cada vendedor es relativa al primero (el que más ha ganado).
  const top = rows[0]?.won_value || 0
  return (
    <ol className="space-y-4">
      {rows.map((row, i) => (
        <li key={row.user_id} className="flex items-center gap-3">
          <span
            className={cn(
              'w-4 text-center text-xs font-semibold tabular-nums',
              i === 0 && top > 0 ? 'text-warning' : 'text-muted-foreground',
            )}
          >
            {i + 1}
          </span>
          <Avatar name={row.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-medium">{row.name}</p>
              <p className="text-sm font-semibold tabular-nums">{formatMoney(row.won_value)}</p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success transition-[width] duration-500"
                style={{ width: top > 0 ? `${(row.won_value / top) * 100}%` : '0%' }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.won_count} ganados · {formatMoney(row.open_value)} en {row.open_count} abiertos
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
