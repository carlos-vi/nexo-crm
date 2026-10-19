import { cn } from '../../lib/cn.js'

const tones = {
  gray: 'bg-muted text-muted-foreground',
  primary: 'bg-primary-soft text-primary',
  green: 'bg-success-soft text-success',
  amber: 'bg-warning-soft text-warning',
  red: 'bg-danger-soft text-danger',
}

/** Etiqueta pequeña de estado: <Badge tone="green">Ganado</Badge> */
export default function Badge({ tone = 'gray', icon: Icon, className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3" />}
      {children}
    </span>
  )
}
