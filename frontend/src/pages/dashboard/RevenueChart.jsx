import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney, formatMoneyCompact } from '../../lib/format.js'

// "2026-10" → "oct 26" para el eje X.
function monthLabel(key, withYear = false) {
  const [year, month] = key.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString('es-ES', withYear ? { month: 'long', year: 'numeric' } : { month: 'short' })
}

// Tooltip propio: el de recharts trae estilos fijos que no respetan el modo oscuro.
function RevenueTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-medium capitalize">{monthLabel(row.month, true)}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(row.value)}</p>
      <p className="text-muted-foreground">
        {row.count} {row.count === 1 ? 'deal ganado' : 'deals ganados'}
      </p>
    </div>
  )
}

export default function RevenueChart({ data }) {
  return (
    // ResponsiveContainer mide a su padre: el padre necesita una altura fija.
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {/* Degradado bajo la línea: del color primario a transparente. */}
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickFormatter={(m) => monthLabel(m)}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatMoneyCompact}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip content={<RevenueTooltip />} cursor={{ stroke: 'var(--border)' }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#revenueFill)"
            activeDot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--card)', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
