// Formato común de importes y fechas para toda la app.

// useGrouping 'always': en español, por defecto 4500 no lleva punto de miles (y 18.000 sí).
const currency = new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always',
})
const compactCurrency = new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1,
})

export const formatMoney = (value) => currency.format(value ?? 0)
// 125.000 € → "125 mil €" (para ejes de gráficos y espacios pequeños).
export const formatMoneyCompact = (value) => compactCurrency.format(value ?? 0)

// Ojo: new Date('2026-10-19') se interpreta como medianoche UTC (y podría
// mostrar el día anterior); con hora y sin zona se interpreta como hora local.
export function parseDate(iso) {
  if (!iso) return null
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
}

export const formatDate = (iso) =>
  iso ? parseDate(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export const formatDateTime = (iso) =>
  iso
    ? parseDate(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

// Días completos transcurridos desde una fecha (negativo si es futura).
export function daysSince(iso) {
  const date = parseDate(iso)
  if (!date) return null
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
}

// "hoy", "ayer", "hace 5 días", "en 3 días"...
const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
export function formatRelative(iso) {
  const days = daysSince(iso)
  if (days === null) return '—'
  if (Math.abs(days) < 30) return relative.format(-days, 'day')
  if (Math.abs(days) < 365) return relative.format(-Math.round(days / 30), 'month')
  return relative.format(-Math.round(days / 365), 'year')
}

// Iniciales para avatares: "Ana García" → "AG".
export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}
