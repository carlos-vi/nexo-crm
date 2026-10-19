import { ChevronDown, KanbanSquare, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, query } from '../../api.js'
import OwnerFilter from '../../components/OwnerFilter.jsx'
import { Button, EmptyState, ErrorMessage, Input, PageHeader, Skeleton, useToast } from '../../components/ui'
import useApiGet from '../../hooks/useApiGet.js'
import { cn } from '../../lib/cn.js'
import { formatMoney } from '../../lib/format.js'
import DealFormModal from '../deals/DealForm.jsx'
import BoardColumn from './BoardColumn.jsx'
import ClosedDealsSection from './ClosedDealsSection.jsx'
import ClosedDropZones from './ClosedDropZones.jsx'
import DealCard from './DealCard.jsx'
import useDragAutoScroll from './useDragAutoScroll.js'

// Quita acentos y mayúsculas para que "camion" encuentre "Camión".
const normalize = (text = '') => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Ancho mínimo de una columna. Por debajo de esto (tablets en vertical,
// móviles) el tablero deja de encoger columnas y pasa a scroll horizontal.
const MIN_COLUMN_WIDTH = 180

// Kanban del pipeline al estilo de Pipedrive:
// - una columna por cada etapa ABIERTA, repartidas a partes iguales en todo
//   el ancho disponible (sin scroll horizontal en un portátil normal);
// - las etapas de cierre (Ganado / Perdido) son zonas de destino en una barra
//   inferior, y sus deals se consultan en "Mostrar cerrados".
// Las tarjetas se arrastran entre columnas o a la barra para cambiar de etapa.
export default function PipelinePage() {
  const toast = useToast()
  // El filtro de responsable vive en la URL (?owner_id=3): así se puede
  // compartir el enlace y el botón "atrás" del navegador lo respeta.
  const [searchParams, setSearchParams] = useSearchParams()
  const ownerId = searchParams.get('owner_id') ?? ''
  const setOwnerId = (value) => setSearchParams(value ? { owner_id: value } : {}, { replace: true })
  const [text, setText] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const closedRef = useRef(null)

  const stagesReq = useApiGet('/stages')
  const dealsReq = useApiGet('/deals' + query({ owner_id: ownerId }))
  const setDeals = dealsReq.setData

  // Etapa (columna o zona) sobre la que se está arrastrando y tarjeta que se arrastra.
  const [dragOverStageId, setDragOverStageId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const { containerRef: boardRef, onDragOver: autoScrollOnDragOver, stop: stopAutoScroll } = useDragAutoScroll(
    draggingId !== null,
  )

  // Valores derivados: no se guardan en el estado, se calculan a partir de
  // los datos. Así nunca pueden quedar desincronizados. useMemo evita
  // recalcularlos en renders donde los datos no han cambiado.
  const stages = useMemo(
    () => [...(stagesReq.data ?? [])].sort((a, b) => a.position - b.position),
    [stagesReq.data],
  )
  const stagesById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages])
  const openStages = useMemo(() => stages.filter((s) => !s.is_won && !s.is_lost), [stages])
  // Ganado primero y Perdido después, sea cual sea su posición.
  const closedStages = useMemo(
    () => stages.filter((s) => s.is_won || s.is_lost).sort((a, b) => Number(b.is_won) - Number(a.is_won)),
    [stages],
  )

  // El filtro de texto se aplica en el navegador: ya tenemos todos los deals.
  const deals = useMemo(() => {
    const all = dealsReq.data ?? []
    const needle = normalize(text.trim())
    if (!needle) return all
    return all.filter((d) => normalize(`${d.title} ${d.company_name ?? ''}`).includes(needle))
  }, [dealsReq.data, text])

  const summary = useMemo(() => {
    const totals = { open: 0, openCount: 0, weighted: 0, won: 0, wonCount: 0 }
    for (const d of deals) {
      const stage = stagesById.get(d.stage_id)
      if (!stage) continue
      if (stage.is_won) {
        totals.won += d.value
        totals.wonCount++
      } else if (!stage.is_lost) {
        totals.open += d.value
        totals.openCount++
        totals.weighted += (d.value * stage.probability) / 100
      }
    }
    return totals
  }, [deals, stagesById])

  const dealsByStage = useMemo(() => {
    const groups = new Map(stages.map((s) => [s.id, []]))
    for (const d of deals) groups.get(d.stage_id)?.push(d)
    return groups
  }, [deals, stages])

  // Al abrir la sección de cerrados la traemos a la vista (queda bajo el tablero).
  useEffect(() => {
    if (showClosed) closedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showClosed])

  async function moveDeal(dealId, stageId) {
    const original = dealsReq.data?.find((d) => d.id === dealId)
    if (!original || original.stage_id === stageId) return
    const target = stagesById.get(stageId)

    // Actualización optimista: movemos la tarjeta YA, sin esperar al
    // servidor, para que la interfaz responda al instante...
    setDeals((ds) => ds.map((d) => (d.id === dealId ? { ...d, stage_id: stageId } : d)))
    try {
      const updated = await api.patch(`/deals/${dealId}`, { stage_id: stageId })
      // ...y cuando llega la respuesta, la usamos como fuente de verdad
      // (cambian `closed_at` y `stage_changed_at`).
      setDeals((ds) => ds.map((d) => (d.id === dealId ? updated : d)))
      if (target?.is_won) toast.success('Deal marcado como ganado')
      else if (target?.is_lost) toast.success('Deal marcado como perdido')
    } catch (err) {
      // Si falla, deshacemos el cambio (rollback) devolviendo la tarjeta a
      // su estado original, y avisamos con un toast.
      setDeals((ds) => ds.map((d) => (d.id === dealId ? original : d)))
      toast.error(`No se pudo mover "${original.title}": ${err.message}`)
    }
  }

  // --- Arrastrar y soltar (API nativa de HTML5) ---

  // dragstart: al empezar a arrastrar una tarjeta guardamos el id del deal
  // en el dataTransfer, para leerlo después en el drop.
  function handleDragStart(e, deal) {
    e.dataTransfer.setData('text/plain', String(deal.id))
    e.dataTransfer.effectAllowed = 'move'
    // Marcamos el arrastre en el siguiente "tick": si cambiamos el DOM
    // (la barra de Ganado/Perdido crece) dentro del propio dragstart,
    // Chrome puede cancelar el arrastre nada más empezar.
    setTimeout(() => setDraggingId(deal.id), 0)
  }

  // dragover: salta continuamente mientras algo pasa por encima de la
  // columna. Por defecto el navegador NO deja soltar sobre un elemento;
  // preventDefault() lo convierte en zona de destino válida (sin esto, el
  // evento drop nunca llega).
  function handleDragOver(e, stageId) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    // React no vuelve a renderizar si el valor no cambia: no pasa nada por
    // llamarlo muchas veces.
    setDragOverStageId(stageId)
  }

  // dragleave también salta al pasar sobre un hijo (una tarjeta); solo
  // quitamos el resaltado si de verdad salimos de la columna.
  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverStageId(null)
  }

  // drop: se suelta la tarjeta sobre la columna (o sobre Ganado / Perdido).
  function handleDrop(e, stageId) {
    e.preventDefault()
    setDragOverStageId(null)
    stopAutoScroll()
    const dealId = Number(e.dataTransfer.getData('text/plain'))
    if (dealId) moveDeal(dealId, stageId)
  }

  // dragend: termina el arrastre (se haya soltado donde sea o cancelado).
  function handleDragEnd() {
    setDraggingId(null)
    setDragOverStageId(null)
  }

  // Los mismos manejadores sirven para columnas y para las zonas de cierre.
  const dropHandlers = (stageId) => ({
    onDragOver: (e) => handleDragOver(e, stageId),
    onDragLeave: handleDragLeave,
    onDrop: (e) => handleDrop(e, stageId),
  })

  function handleCreated(created) {
    setShowNew(false)
    // La API devuelve los más recientes primero: lo ponemos al principio.
    setDeals((ds) => [created, ...(ds ?? [])])
  }

  const loading = stagesReq.loading || dealsReq.loading
  const error = stagesReq.error || dealsReq.error
  const closedCount = closedStages.reduce((n, s) => n + (dealsByStage.get(s.id)?.length ?? 0), 0)
  const n = openStages.length

  return (
    <>
      {/* La página ocupa el alto de la ventana (menos la barra superior y el
          relleno de <main>) para que el tablero haga scroll por dentro y la
          barra de Ganado/Perdido quede siempre visible abajo. */}
      <div className="flex h-[calc(100dvh-6.5rem)] min-h-[520px] flex-col">
        <PageHeader
          title="Pipeline"
          description={
            loading
              ? 'Cargando…'
              : `${summary.openCount} ${summary.openCount === 1 ? 'deal abierto' : 'deals abiertos'} · ${formatMoney(summary.open)}`
          }
          actions={
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Filtrar por título o empresa"
                  className="w-56 pl-8"
                  aria-label="Filtrar deals"
                />
              </div>
              <OwnerFilter value={ownerId} onChange={setOwnerId} />
              {closedStages.length > 0 && (
                <Button
                  variant="ghost"
                  icon={ChevronDown}
                  onClick={() => setShowClosed((v) => !v)}
                  aria-expanded={showClosed}
                  className={cn('[&>svg]:transition-transform', showClosed && '[&>svg]:rotate-180')}
                >
                  {showClosed ? 'Ocultar cerrados' : `Mostrar cerrados${loading ? '' : ` (${closedCount})`}`}
                </Button>
              )}
              <Button variant="primary" icon={Plus} onClick={() => setShowNew(true)} disabled={!stages.length}>
                Nuevo deal
              </Button>
            </>
          }
        />

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Pipeline abierto" value={formatMoney(summary.open)} detail={`${summary.openCount} deals`} loading={loading} />
          <Stat label="Previsión ponderada" value={formatMoney(summary.weighted)} detail="Valor × probabilidad de la etapa" loading={loading} />
          <Stat
            label="Ganado"
            value={formatMoney(summary.won)}
            detail={`${summary.wonCount} deals`}
            loading={loading}
            valueClassName="text-success"
          />
        </div>

        <ErrorMessage className="mb-4">{error}</ErrorMessage>

        {loading ? (
          <BoardSkeleton />
        ) : stages.length === 0 ? (
          <EmptyState icon={KanbanSquare} title="No hay etapas configuradas" />
        ) : (
          <>
            {/* Contenedor con scroll horizontal SOLO si hace falta. Escucha
                dragover para el auto-scroll cerca de los bordes. */}
            <div
              ref={boardRef}
              onDragOver={autoScrollOnDragOver}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && stopAutoScroll()}
              className="-mx-4 min-h-0 flex-1 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
            >
              {/* Grid de columnas iguales. `minmax(0, 1fr)` (y no solo `1fr`)
                  es clave: `1fr` equivale a `minmax(auto, 1fr)` y una columna
                  con un título largo se ensancharía empujando a las demás;
                  con mínimo 0 todas miden exactamente lo mismo y el texto se
                  recorta. El minWidth fija el punto a partir del cual ya no
                  merece la pena encoger más y aparece el scroll horizontal. */}
              <div
                className="grid h-full gap-3"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(n, 1)}, minmax(0, 1fr))`,
                  minWidth: `calc(${n} * ${MIN_COLUMN_WIDTH}px + ${Math.max(n - 1, 0)} * 0.75rem)`,
                }}
              >
                {openStages.map((stage) => {
                  const stageDeals = dealsByStage.get(stage.id) ?? []
                  return (
                    <BoardColumn
                      key={stage.id}
                      stage={stage}
                      deals={stageDeals}
                      isOver={dragOverStageId === stage.id}
                      {...dropHandlers(stage.id)}
                    >
                      {stageDeals.map((deal) => (
                        <DealCard
                          key={deal.id}
                          deal={deal}
                          stage={stage}
                          dragging={draggingId === deal.id}
                          onDragStart={(e) => handleDragStart(e, deal)}
                          onDragEnd={handleDragEnd}
                        />
                      ))}
                    </BoardColumn>
                  )
                })}
              </div>
            </div>

            <ClosedDropZones
              stages={closedStages}
              dealsByStage={dealsByStage}
              dragging={draggingId !== null}
              dragOverStageId={dragOverStageId}
              dropHandlers={dropHandlers}
            />
          </>
        )}

        <DealFormModal open={showNew} onClose={() => setShowNew(false)} stages={stages} onSaved={handleCreated} />
      </div>

      {showClosed && !loading && (
        <ClosedDealsSection stages={closedStages} dealsByStage={dealsByStage} sectionRef={closedRef} />
      )}
    </>
  )
}

function Stat({ label, value, detail, loading, valueClassName }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-28" />
      ) : (
        <p className={cn('mt-0.5 text-lg font-semibold tabular-nums', valueClassName)}>{value}</p>
      )}
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function BoardSkeleton() {
  const columns = [4, 2, 3, 1]
  return (
    <>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          className="grid h-full gap-3"
          style={{
            gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
            minWidth: `calc(${columns.length} * ${MIN_COLUMN_WIDTH}px + ${columns.length - 1} * 0.75rem)`,
          }}
        >
          {columns.map((cards, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/60 p-2.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mb-2 h-1 w-full" />
              {Array.from({ length: cards }, (_, j) => (
                <div key={j} className="h-24 w-full animate-pulse rounded-lg border border-border bg-card" />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    </>
  )
}
