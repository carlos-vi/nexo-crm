import { useEffect, useState } from 'react'

// Devuelve `value` pero con retraso: solo cambia cuando el usuario deja de
// teclear durante `delay` ms. Así no lanzamos una petición por cada tecla.
export default function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    // Si `value` vuelve a cambiar antes de tiempo, React ejecuta esta limpieza
    // y cancela el temporizador anterior.
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
