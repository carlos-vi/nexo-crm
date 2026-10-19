import { useCallback, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, tokenStore } from '../api.js'
import { AuthContext, useAuth } from './useAuth.js'

/*
 * Sesión del usuario.
 *
 * AuthProvider guarda quién ha iniciado sesión y lo comparte con toda la app
 * mediante un contexto. El token vive en localStorage para que la sesión
 * sobreviva a recargar la página; al arrancar, si hay token, se pide
 * /auth/me para saber de quién es (y comprobar que sigue siendo válido).
 *
 *   const { user, login, logout } = useAuth()
 */

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // "checking" mientras comprobamos un token guardado; evita mostrar el login un instante.
  const [checking, setChecking] = useState(() => Boolean(tokenStore.get()))

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  useEffect(() => {
    if (!tokenStore.get()) return
    api
      .get('/auth/me')
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setChecking(false))
  }, [])

  // api.js emite este evento cuando la API responde 401 (token caducado).
  useEffect(() => {
    window.addEventListener('crm:unauthorized', logout)
    return () => window.removeEventListener('crm:unauthorized', logout)
  }, [logout])

  const login = useCallback(async (email, password) => {
    const data = await api.postForm('/auth/login', { username: email, password })
    tokenStore.set(data.access_token)
    setUser(data.user)
  }, [])

  // setUser se expone para que "Mi perfil" refresque el nombre tras guardarlo.
  return (
    <AuthContext.Provider value={{ user, checking, login, logout, setUser }}>{children}</AuthContext.Provider>
  )
}

/** Envuelve las rutas privadas: sin sesión, redirige a /login (y vuelve después). */
export function RequireAuth({ children }) {
  const { user, checking } = useAuth()
  const location = useLocation()
  if (checking) return null
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}
