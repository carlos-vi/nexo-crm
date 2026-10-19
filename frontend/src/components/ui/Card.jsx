import { cn } from '../../lib/cn.js'

/**
 * Panel con borde. Opcionalmente con cabecera (título + acciones).
 *   <Card title="Actividad" actions={<Button .../>}>...</Card>
 *   <Card className="p-0">...</Card>   (sin relleno, p. ej. para tablas)
 */
export default function Card({ title, description, actions, className, bodyClassName, children }) {
  return (
    <section className={cn('rounded-xl border border-border bg-card shadow-xs', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}
