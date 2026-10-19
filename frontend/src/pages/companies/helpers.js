// Funciones auxiliares de las páginas de empresas y contactos.

/** "Ana" + "García" → "Ana García" (sin espacios de más si falta el apellido). */
export const fullName = (contact) => [contact.first_name, contact.last_name].filter(Boolean).join(' ')

/** Suma del valor de los deals ganados (según qué etapas son "ganado"). */
export function wonValue(deals, stages) {
  const won = new Set((stages ?? []).filter((s) => s.is_won).map((s) => s.id))
  return deals.filter((d) => won.has(d.stage_id)).reduce((sum, d) => sum + d.value, 0)
}

/** Suma y número de los deals abiertos (ni ganados ni perdidos). */
export function openDeals(deals, stages) {
  const closed = new Set((stages ?? []).filter((s) => s.is_won || s.is_lost).map((s) => s.id))
  const open = deals.filter((d) => !closed.has(d.stage_id))
  return { count: open.length, value: open.reduce((sum, d) => sum + d.value, 0) }
}

// Clases para un <a> con aspecto de botón secundario (mailto:, tel:, enlaces externos).
export const linkButtonClass =
  'inline-flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3.5 text-sm font-medium ' +
  'text-foreground shadow-xs transition-colors hover:bg-accent'

// Descarga una plantilla CSV generada en el navegador (sin pedir nada a la API).
export function downloadTemplate(columns, example, filename) {
  // El \uFEFF inicial (BOM) hace que Excel reconozca el UTF-8 y muestre bien las tildes.
  const csv = '\uFEFF' + [columns, example].map((row) => row.join(',')).join('\r\n') + '\r\n'
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: filename })
  link.click()
  URL.revokeObjectURL(url)
}
