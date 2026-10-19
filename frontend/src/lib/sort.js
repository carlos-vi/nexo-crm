/**
 * Ordena una lista según { field, dir } (texto sin distinguir mayúsculas ni acentos).
 * `getValue(item, field)` permite ordenar por valores calculados.
 */
export function sortBy(list, sort, getValue = (item, field) => item[field]) {
  if (!sort?.field) return list
  const dir = sort.dir === 'desc' ? -1 : 1
  return [...list].sort((a, b) => {
    const va = getValue(a, sort.field)
    const vb = getValue(b, sort.field)
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' }) * dir
  })
}
