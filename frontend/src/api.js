// Cliente de la API: un único sitio donde se hacen las peticiones HTTP.
// Ver docs/api.md para los endpoints y la forma del JSON.

const TOKEN_KEY = 'crm_token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : `HTTP ${status}`)
    this.status = status
    this.detail = detail
  }
}

async function request(method, path, body, { form = false } = {}) {
  const headers = {}
  // Cada petición lleva el token: así la API sabe quién la hace.
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`

  let payload
  if (body instanceof FormData) {
    payload = body // subida de ficheros: el navegador pone el Content-Type
  } else if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    payload = new URLSearchParams(body)
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const res = await fetch(`/api${path}`, { method, headers, body: payload })
  if (res.status === 401 && token) {
    // Token caducado o inválido: avisamos a AuthProvider para que cierre la sesión.
    window.dispatchEvent(new Event('crm:unauthorized'))
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // FastAPI devuelve {"detail": "..."} o, en errores de validación, una lista.
    const detail = data?.detail
    const message = Array.isArray(detail) ? detail.map((d) => d.msg).join('. ') : detail
    throw new ApiError(res.status, message ?? `HTTP ${res.status}`)
  }
  return data
}

// Convierte {q: 'acme', company_id: undefined} en "?q=acme" (ignora vacíos).
export function query(params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return entries.length ? `?${new URLSearchParams(entries)}` : ''
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  postForm: (path, body) => request('POST', path, body, { form: true }),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
}

// Descarga un fichero de la API (p. ej. un CSV) respetando la autenticación:
// un <a href> normal no enviaría el token.
export async function download(path, filename) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } })
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`)
  const url = URL.createObjectURL(await res.blob())
  const link = Object.assign(document.createElement('a'), { href: url, download: filename })
  link.click()
  URL.revokeObjectURL(url)
}

// Compatibilidad: los formatos viven ahora en lib/format.js.
export { formatDate, formatMoney } from './lib/format.js'
