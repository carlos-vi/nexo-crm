import { ArrowDownRight, ArrowUpRight, Clock, Coins, Target, TrendingUp, Trophy } from 'lucide-react'
import { Skeleton } from '../../components/ui'
import { cn } from '../../lib/cn.js'
import { formatMoney } from '../../lib/format.js'

// Variación porcentual entre dos periodos. Sin base (mes pasado = 0) no hay %.
function percentChange(current, previous) {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}

function Trend({ current, previous }) {
  const change = percentChange(current, previous)
  if (change === null) {
    return <span className="text-muted-foreground">{current > 0 ? 'Sin ventas el mes pasado' : 'Sin ventas aún'}</span>
  }
  const up = change >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('inline-flex items-center font-medium', up ? 'text-success' : 'text-danger')}>
        <Icon className="size-3.5" />
        {Math.abs(change).toFixed(0)} %
      </span>
      <span className="text-muted-foreground">vs. mes pasado</span>
    </span>
  )
}

function KpiCard({ icon: Icon, tone, label, value, footer }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={cn('flex size-8 items-center justify-center rounded-lg', tone)}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <div className="mt-1 text-xs text-muted-foreground">{footer}</div>
    </div>
  )
}

export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-7 w-36" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  )
}

export default function KpiCards({ kpis }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        icon={Coins}
        tone="bg-primary-soft text-primary"
        label="Pipeline abierto"
        value={formatMoney(kpis.open_value)}
        footer={`${kpis.open_count} ${kpis.open_count === 1 ? 'deal abierto' : 'deals abiertos'}`}
      />
      <KpiCard
        icon={TrendingUp}
        tone="bg-primary-soft text-primary"
        label="Previsión ponderada"
        value={formatMoney(kpis.weighted_value)}
        // La previsión ya descuenta la probabilidad de cada etapa.
        footer="Valor × probabilidad de su etapa"
      />
      <KpiCard
        icon={Trophy}
        tone="bg-success-soft text-success"
        label="Ganado este mes"
        value={formatMoney(kpis.won_this_month)}
        footer={<Trend current={kpis.won_this_month} previous={kpis.won_last_month} />}
      />
      <KpiCard
        icon={Target}
        tone="bg-warning-soft text-warning"
        label="Tasa de éxito (90 días)"
        value={kpis.win_rate === null ? '—' : `${kpis.win_rate.toLocaleString('es-ES')} %`}
        footer={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span>Ticket medio {kpis.avg_won_value === null ? '—' : formatMoney(kpis.avg_won_value)}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {kpis.avg_sales_cycle_days === null ? '—' : `${Math.round(kpis.avg_sales_cycle_days)} días de ciclo`}
            </span>
          </span>
        }
      />
    </div>
  )
}
