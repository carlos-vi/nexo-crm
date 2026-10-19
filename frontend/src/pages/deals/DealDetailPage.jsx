import { Activity, Check, CheckSquare, Handshake, Pencil, SearchX, ThumbsDown, Trash2, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import ActivityTimeline from '../../components/ActivityTimeline.jsx'
import TaskList from '../../components/TaskList.jsx'
import {
  Avatar, Badge, Button, Card, EmptyState, PageHeader, Skeleton, Tabs, useConfirm, useToast,
} from '../../components/ui'
import useApiGet from '../../hooks/useApiGet.js'
import { cn } from '../../lib/cn.js'
import { daysSince, formatDate, formatDateTime, formatMoney } from '../../lib/format.js'
import DealFormModal from './DealForm.jsx'

export default function DealDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const { data: deal, error, loading, setData: setDeal } = useApiGet(`/deals/${id}`)
  const { data: stagesData } = useApiGet('/stages')
  const stages = useMemo(() => [...(stagesData ?? [])].sort((a, b) => a.position - b.position), [stagesData])

  const [tab, setTab] = useState('activity')
  const [editing, setEditing] = useState(false)
  const [moving, setMoving] = useState(false)
  // Al cambiar este número, el historial vuelve a pedirse a la API (que
  // habrá añadido una actividad "system" con el cambio de etapa).
  const [reloadKey, setReloadKey] = useState(0)

  async function moveTo(stage) {
    if (!deal || stage.id === deal.stage_id || moving) return
    setMoving(true)
    try {
      setDeal(await api.patch(`/deals/${id}`, { stage_id: stage.id }))
      setReloadKey((k) => k + 1)
      toast.success(stage.is_won ? '¡Deal ganado!' : stage.is_lost ? 'Deal marcado como perdido' : `Movido a ${stage.name}`)
    } catch (err) {
      toast.error(`No se pudo mover el deal: ${err.message}`)
    } finally {
      setMoving(false)
    }
  }

  async function remove() {
    const ok = await confirm({
      title: '¿Borrar el deal?',
      message: `"${deal.title}" se borrará junto con sus actividades y tareas. No se puede deshacer.`,
      danger: true,
    })
    if (!ok) return
    try {
      await api.delete(`/deals/${id}`)
      toast.success('Deal borrado')
      navigate('/pipeline')
    } catch (err) {
      toast.error(err.message)
    }
  }

  function handleSaved(updated) {
    setEditing(false)
    setDeal(updated)
    setReloadKey((k) => k + 1) // un cambio de etapa o responsable deja rastro en el historial
  }

  if (loading && !deal) return <DetailSkeleton />
  if (error && !deal)
    return (
      <EmptyState
        icon={SearchX}
        title="No se encontró el deal"
        description={error}
        action={<Button onClick={() => navigate('/pipeline')}>Volver al pipeline</Button>}
      />
    )
  if (!deal) return null

  const stage = stages.find((s) => s.id === deal.stage_id)
  const wonStage = stages.find((s) => s.is_won)
  const lostStage = stages.find((s) => s.is_lost)
  const status = stage?.is_won ? 'won' : stage?.is_lost ? 'lost' : 'open'
  const days = daysSince(deal.stage_changed_at)

  return (
    <div>
      <PageHeader
        title={deal.title}
        breadcrumbs={[{ label: 'Pipeline', to: '/pipeline' }, { label: deal.title }]}
        actions={
          <>
            <Button icon={Pencil} onClick={() => setEditing(true)}>Editar</Button>
            <Button variant="danger-ghost" icon={Trash2} onClick={remove}>Borrar</Button>
          </>
        }
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Handshake className="size-5" />
        </span>
      </PageHeader>

      {/* Resumen bajo el título: valor, estado y responsable */}
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-lg font-semibold tabular-nums">{formatMoney(deal.value)}</span>
        {status === 'won' && <Badge tone="green" icon={Trophy}>Ganado</Badge>}
        {status === 'lost' && <Badge tone="red" icon={ThumbsDown}>Perdido</Badge>}
        {status === 'open' && <Badge tone="primary">Abierto</Badge>}
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Avatar name={deal.owner_name} size="xs" />
          {deal.owner_name ?? 'Sin responsable'}
        </span>
      </div>

      {/* Barra de etapas */}
      <Card className="mb-6" bodyClassName="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <StageProgress stages={stages} deal={deal} status={status} disabled={moving} onMove={moveTo} />
          <div className="flex shrink-0 gap-2">
            {wonStage && status !== 'won' && (
              <Button
                icon={Trophy}
                onClick={() => moveTo(wonStage)}
                disabled={moving}
                className="border-success/40 text-success hover:bg-success-soft"
              >
                Marcar ganado
              </Button>
            )}
            {lostStage && status !== 'lost' && (
              <Button variant="danger-ghost" icon={ThumbsDown} onClick={() => moveTo(lostStage)} disabled={moving}>
                Marcar perdido
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {stage ? `${stage.name} · ${stage.probability}% de probabilidad` : 'Etapa desconocida'}
          {days !== null && ` · ${days === 0 ? 'entró hoy' : `${days} ${days === 1 ? 'día' : 'días'} en esta etapa`}`}
        </p>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Tabs
            value={tab}
            onChange={setTab}
            className="mb-5"
            tabs={[
              { value: 'activity', label: 'Actividad', icon: Activity },
              { value: 'tasks', label: 'Tareas', icon: CheckSquare },
            ]}
          />
          {tab === 'activity' ? (
            <ActivityTimeline filter={{ deal_id: id }} reloadKey={reloadKey} />
          ) : (
            <TaskList filter={{ deal_id: id }} reloadKey={reloadKey} />
          )}
        </div>

        <aside>
          <Card title="Detalles">
            <dl className="grid gap-3.5 text-sm">
              <Detail label="Empresa">
                {deal.company_id ? (
                  <Link to={`/companies/${deal.company_id}`} className="text-primary hover:underline">{deal.company_name}</Link>
                ) : '—'}
              </Detail>
              <Detail label="Contacto">
                {deal.contact_id ? (
                  <Link to={`/contacts/${deal.contact_id}`} className="text-primary hover:underline">{deal.contact_name}</Link>
                ) : '—'}
              </Detail>
              <Detail label="Responsable">
                <span className="inline-flex items-center gap-2">
                  <Avatar name={deal.owner_name} size="xs" />
                  {deal.owner_name ?? '—'}
                </span>
              </Detail>
              <Detail label="Cierre previsto">
                <span
                  className={cn(
                    status === 'open' && deal.expected_close_date && daysSince(deal.expected_close_date) > 0 && 'font-medium text-warning',
                  )}
                >
                  {formatDate(deal.expected_close_date)}
                </span>
              </Detail>
              <Detail label="En la etapa desde">{formatDateTime(deal.stage_changed_at)}</Detail>
              {deal.closed_at && <Detail label="Cerrado el">{formatDateTime(deal.closed_at)}</Detail>}
              <Detail label="Creado el">{formatDateTime(deal.created_at)}</Detail>
            </dl>
          </Card>
        </aside>
      </div>

      <DealFormModal open={editing} onClose={() => setEditing(false)} deal={deal} stages={stages} onSaved={handleSaved} />
    </div>
  )
}

function Detail({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

// Recorte en forma de flecha para cada segmento (estilo Pipedrive).
const ARROW = 10
const arrowShape = (first) =>
  `polygon(0 0, calc(100% - ${ARROW}px) 0, 100% 50%, calc(100% - ${ARROW}px) 100%, 0 100%${first ? '' : `, ${ARROW}px 50%`})`

/**
 * Una flecha por etapa abierta, rellenas hasta la actual. Pulsar una mueve el
 * deal a esa etapa. Si el deal está ganado, todas se ven en verde; si está
 * perdido, en gris.
 */
function StageProgress({ stages, deal, status, disabled, onMove }) {
  const openStages = stages.filter((s) => !s.is_won && !s.is_lost)
  const currentIndex = openStages.findIndex((s) => s.id === deal.stage_id)

  return (
    <div className="flex min-w-0 flex-1" role="group" aria-label="Etapas del deal">
      {openStages.map((s, i) => {
        const filled = status === 'won' || (status === 'open' && i <= currentIndex)
        const current = s.id === deal.stage_id
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onMove(s)}
            disabled={disabled}
            title={current ? `Etapa actual: ${s.name}` : `Mover a ${s.name}`}
            aria-current={current ? 'step' : undefined}
            style={{ clipPath: arrowShape(i === 0), marginLeft: i === 0 ? 0 : -ARROW + 3 }}
            className={cn(
              'flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 px-4 text-xs font-medium transition-colors',
              'disabled:cursor-wait',
              filled
                ? status === 'won'
                  ? 'bg-success text-white'
                  : 'bg-primary text-primary-foreground hover:bg-primary-hover'
                : 'bg-muted text-muted-foreground hover:bg-primary-soft hover:text-primary',
              i === 0 && 'rounded-l-md',
            )}
          >
            {filled && !current && <Check className="size-3 shrink-0" />}
            <span className="truncate">{s.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div>
      <Skeleton className="mb-3 h-3 w-40" />
      <Skeleton className="mb-2 h-7 w-72" />
      <Skeleton className="mb-6 h-5 w-48" />
      <Skeleton className="mb-6 h-20 w-full" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )
}
