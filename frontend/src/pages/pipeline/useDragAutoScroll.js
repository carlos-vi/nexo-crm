import { useCallback, useEffect, useRef } from 'react'

const EDGE = 64 // px desde el borde en los que empieza el auto-scroll
const MAX_SPEED = 18 // px por fotograma en el mismo borde

// Auto-scroll horizontal mientras se arrastra (red de seguridad para
// pantallas estrechas, donde el tablero sí se desborda).
//
// Durante un arrastre nativo la rueda del ratón no siempre funciona, así que
// desplazamos nosotros el contenedor cuando el puntero se acerca a sus bordes:
// - `onDragOver` (en el contenedor) solo calcula la velocidad según la
//   distancia al borde y la guarda en un ref (no provoca renders);
// - un bucle con requestAnimationFrame, activo solo mientras `active` es
//   true, aplica esa velocidad en cada fotograma para un movimiento suave.
export default function useDragAutoScroll(active) {
  const containerRef = useRef(null)
  const speedRef = useRef(0)

  const onDragOver = useCallback((e) => {
    const el = containerRef.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    const { left, right } = el.getBoundingClientRect()
    if (e.clientX < left + EDGE) speedRef.current = -MAX_SPEED * (1 - Math.max(0, e.clientX - left) / EDGE)
    else if (e.clientX > right - EDGE) speedRef.current = MAX_SPEED * (1 - Math.max(0, right - e.clientX) / EDGE)
    else speedRef.current = 0
  }, [])

  const stop = useCallback(() => {
    speedRef.current = 0
  }, [])

  useEffect(() => {
    if (!active) return
    let frame
    const tick = () => {
      if (speedRef.current && containerRef.current) containerRef.current.scrollLeft += speedRef.current
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      speedRef.current = 0
    }
  }, [active])

  return { containerRef, onDragOver, stop }
}
