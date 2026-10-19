import { ChevronRight } from 'lucide-react'
import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn.js'

/**
 * Cabecera de página: migas de pan, título, descripción y acciones.
 *   <PageHeader title="Empresas" description="..." breadcrumbs={[{label:'Empresas', to:'/companies'}, {label:'Acme'}]}
 *               actions={<Button>...</Button>} />
 */
export function PageHeader({ title, description, breadcrumbs, actions, children }) {
  return (
    <div className="mb-6">
      {breadcrumbs && (
        <nav className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
          {breadcrumbs.map((crumb, i) => (
            <Fragment key={i}>
              {i > 0 && <ChevronRight className="size-3" />}
              {crumb.to ? (
                <Link to={crumb.to} className="hover:text-foreground">{crumb.label}</Link>
              ) : (
                <span className="text-foreground">{crumb.label}</span>
              )}
            </Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {children}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

/** Pantalla vacía con invitación a actuar. */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {Icon && (
        <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Bloque gris animado que ocupa el sitio del contenido mientras carga. */
export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

/** Mensaje de error en línea. */
export function ErrorMessage({ children, className }) {
  if (!children) return null
  return (
    <div className={cn('rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger', className)}>
      {children}
    </div>
  )
}

/**
 * Pestañas controladas.
 *   <Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Resumen', count: 3 }]} />
 */
export function Tabs({ value, onChange, tabs, className }) {
  return (
    <div className={cn('flex gap-1 border-b border-border', className)} role="tablist">
      {tabs.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.icon && <tab.icon className="size-4" />}
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn('rounded-full px-1.5 text-xs', active ? 'bg-primary-soft text-primary' : 'bg-muted')}>
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Tabla de listado. Las cabeceras pueden ordenar:
 *   <Table>
 *     <thead><tr><Th sort={sort} field="name" onSort={setSort}>Nombre</Th></tr></thead>
 *     <tbody><Tr onClick={...}><Td>...</Td></Tr></tbody>
 *   </Table>
 * `sort` es { field, dir: 'asc' | 'desc' }.
 */
export function Table({ className, children }) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-border bg-card shadow-xs', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, field, sort, onSort, className }) {
  const sortable = field && onSort
  const active = sortable && sort?.field === field
  const toggle = () => onSort({ field, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })
  return (
    <th
      className={cn(
        'border-b border-border bg-muted/40 px-4 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground',
        sortable && 'cursor-pointer select-none hover:text-foreground',
        className,
      )}
      onClick={sortable ? toggle : undefined}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      {children}
      {active && <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )
}

export function Tr({ onClick, className, children }) {
  return (
    <tr
      onClick={onClick}
      className={cn('border-b border-border last:border-0', onClick && 'cursor-pointer hover:bg-muted/50', className)}
    >
      {children}
    </tr>
  )
}

export function Td({ className, children }) {
  return <td className={cn('px-4 py-3 align-middle', className)}>{children}</td>
}
