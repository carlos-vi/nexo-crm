import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Proxy: el frontend pide /api/... a sí mismo (localhost:5173) y Vite lo
    // reenvía a FastAPI (localhost:8000). Así el navegador ve un solo origen.
    proxy: {
      // API_URL permite apuntar a otro backend (p. ej. uno de pruebas en otro puerto).
      '/api': process.env.API_URL ?? 'http://localhost:8000',
    },
  },
})
