import { useEffect, useState } from 'react'
import { api } from '../api.js'

// Hace un GET a `path` y lo repite cada vez que cambia `path` o `reloadKey`.
// Si `path` es null no se pide nada (útil para "no buscar todavía").
//
// Truco: guardamos junto a los datos la petición de la que vienen (`key`).
// Así `loading` se calcula durante el render (la respuesta guardada no es la
// de la petición actual) en vez de tener que hacer setLoading(true) dentro
// del efecto, que provocaría un render extra.
export default function useApiGet(path, reloadKey = 0) {
  const key = path === null ? null : `${path}#${reloadKey}`
  const [state, setState] = useState({ key: null, data: null, error: null })

  useEffect(() => {
    if (path === null) return
    const requestKey = `${path}#${reloadKey}`
    // Si el componente cambia de petición antes de que llegue la respuesta,
    // la limpieza marca esta como cancelada y su resultado se ignora.
    let cancelled = false
    api
      .get(path)
      .then((data) => !cancelled && setState({ key: requestKey, data, error: null }))
      .catch((err) => !cancelled && setState((s) => ({ key: requestKey, data: s.data, error: err.message })))
    return () => {
      cancelled = true
    }
  }, [path, reloadKey])

  const loading = key !== null && state.key !== key

  // Permite actualizar los datos localmente (p. ej. tras un PATCH) sin volver a pedirlos.
  function setData(updater) {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }))
  }

  return { data: state.data, error: loading ? null : state.error, loading, setData }
}
