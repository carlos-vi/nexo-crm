import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { query } from '../../api.js'
import { useAuth } from '../../auth/useAuth.js'
import OwnerFilter from '../../components/OwnerFilter.jsx'
import { Card, ErrorMessage, PageHeader, Skeleton } from '../../components/ui'
import useApiGet from '../../hooks/useApiGet.js'
import { cn } from '../../lib/cn.js'
import { formatMoney } from '../../lib/format.js'
import ActivityFeed from './ActivityFeed.jsx'
import KpiCards, { KpiCardsSkeleton } from './KpiCards.jsx'
import Leaderboard from './Leaderboard.jsx'
import MyTasks from './MyTasks.jsx'
import PipelineFunnel from './PipelineFunnel.jsx'
import RevenueChart from './RevenueChart.jsx'

// "domingo, 19 de octubre de 2026" → con la primera letra en mayúscula.
function todayLabel() {
  const text = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function ViewAll({ to, children = 'Ver todo' }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
      {children}
      <ArrowRight className="size-3" />
    </Link>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  // '' = todo el equipo; si no, el id del vendedor (como texto, viene de un <select>).
  const [owner, setOwner] = useState('')
  const { data, error, loading } = useApiGet(`/dashboard${query({ owner_id: owner })}`)

  const firstName = user?.name?.split(' ')[0] ?? ''
  // Al cambiar el filtro, useApiGet conserva los datos anteriores mientras
  // llegan los nuevos: los mostramos atenuados en vez de volver al esqueleto.
  const refreshing = loading && data
  // El último mes de la serie es el actual: de ahí sacamos el año sin llamar a new Date() en el render.
  const currentYear = data?.revenue_by_month.at(-1)?.month.slice(0, 4)
  const yearRevenue = data?.revenue_by_month.reduce((sum, m) => sum + m.value, 0) ?? 0

  return (
    <div>
      <PageHeader
        title={`Hola, ${firstName}`}
        description={todayLabel()}
        actions={<OwnerFilter value={owner} onChange={setOwner} allLabel="Todo el equipo" />}
      />

      {error && <ErrorMessage className="mb-6">No se pudo cargar el panel: {error}</ErrorMessage>}

      {/* Sin datos y con error no tiene sentido pintar esqueletos que nunca se llenan. */}
      {(data || !error) && (
        <div className={cn('space-y-6 transition-opacity', refreshing && 'opacity-60')}>
          {data ? <KpiCards kpis={data.kpis} /> : <KpiCardsSkeleton />}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card
              className="lg:col-span-2"
              title="Ingresos ganados"
              description={data ? `Últimos 12 meses · ${formatMoney(yearRevenue)} en total` : 'Últimos 12 meses'}
            >
              {data ? <RevenueChart data={data.revenue_by_month} /> : <Skeleton className="h-64 w-full" />}
            </Card>

            <Card title="Embudo del pipeline" description="Valor y número de deals por etapa" actions={<ViewAll to="/pipeline">Pipeline</ViewAll>}>
              {data ? (
                <PipelineFunnel stages={data.funnel} />
              ) : (
                <div className="space-y-4">
                  {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {/* Las tareas no dependen del filtro: siempre son las del usuario actual. */}
            <Card title="Mis tareas" description="Vencidas y para hoy" actions={<ViewAll to="/tasks">Ver todas</ViewAll>}>
              {user && <MyTasks userId={user.id} />}
            </Card>

            <Card title="Clasificación" description={currentYear ? `Ganado en ${currentYear} · todo el equipo` : 'Todo el equipo'}>
              {data ? (
                <Leaderboard rows={data.leaderboard} />
              ) : (
                <div className="space-y-4">
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              )}
            </Card>

            <Card title="Actividad reciente" description="Lo último del equipo" className="md:col-span-2 xl:col-span-1">
              {data ? (
                <ActivityFeed items={data.recent_activity} />
              ) : (
                <div className="space-y-4">
                  {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
