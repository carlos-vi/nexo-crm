// Une clases de CSS ignorando las vacías: cn('a', cond && 'b') → "a b" o "a".
export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}
