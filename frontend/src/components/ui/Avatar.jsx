import { cn } from '../../lib/cn.js'
import { initials } from '../../lib/format.js'

// Paleta de fondos: cada nombre cae siempre en el mismo color.
const palette = [
  'bg-indigo-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-violet-500', 'bg-teal-500', 'bg-orange-500',
]

function colorFor(name = '') {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return palette[hash % palette.length]
}

const sizes = {
  xs: 'size-5 text-[9px]',
  sm: 'size-7 text-[11px]',
  md: 'size-9 text-xs',
  lg: 'size-12 text-base',
}

/**
 * Círculo con iniciales. `square` para empresas (esquinas redondeadas).
 *   <Avatar name="Ana García" size="sm" />
 */
export default function Avatar({ name, size = 'md', square = false, className, title }) {
  return (
    <span
      title={title ?? name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold text-white select-none',
        square ? 'rounded-md' : 'rounded-full',
        sizes[size],
        name ? colorFor(name) : 'bg-muted-foreground/40',
        className,
      )}
    >
      {name ? initials(name) : '?'}
    </span>
  )
}
