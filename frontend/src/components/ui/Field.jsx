import { cn } from '../../lib/cn.js'

// Estilo común de los controles de formulario.
const control =
  'w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs ' +
  'placeholder:text-muted-foreground transition-colors ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/50 ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

export function Input({ className, ...props }) {
  return <input className={cn(control, 'h-9', className)} {...props} />
}

export function Textarea({ className, rows = 3, ...props }) {
  return <textarea rows={rows} className={cn(control, 'py-2', className)} {...props} />
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn(control, 'h-9 pr-8', className)} {...props}>
      {children}
    </select>
  )
}

/**
 * Etiqueta + control + mensaje de error o ayuda.
 *   <Field label="Nombre" required error={errors.name}><Input .../></Field>
 */
export function Field({ label, required, error, hint, className, children }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <span className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : (
        hint && <span className="text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  )
}
