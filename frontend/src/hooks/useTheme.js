import { useState } from 'react'

// Modo claro/oscuro. El tema inicial lo aplica un script en index.html antes
// de que cargue React; aquí solo lo leemos y lo cambiamos.
export default function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  function toggle() {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('crm_theme', next ? 'dark' : 'light')
    } catch {
      // Sin localStorage (modo privado) el tema simplemente no se recuerda.
    }
    setDark(next)
  }

  return { dark, toggle }
}
