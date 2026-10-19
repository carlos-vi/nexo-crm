import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn.js'

const variants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm',
  secondary: 'bg-card text-foreground border border-input hover:bg-accent shadow-xs',
  ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
  danger: 'bg-danger text-white hover:opacity-90 shadow-sm',
  'danger-ghost': 'text-danger hover:bg-danger-soft',
}

const sizes = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  icon: 'h-8 w-8 justify-center',
}

/**
 * Botón del sistema de diseño.
 *   <Button variant="primary" icon={Plus}>Nuevo deal</Button>
 *   <Button variant="ghost" size="icon" icon={Trash2} aria-label="Borrar" />
 */
export default function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading = false,
  className,
  children,
  type = 'button',
  disabled,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon && <Icon className="size-4" />}
      {children}
    </button>
  )
}
