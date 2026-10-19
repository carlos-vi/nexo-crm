import { createContext, useContext } from 'react'

// Contexto de la sesión (el proveedor está en AuthContext.jsx).
export const AuthContext = createContext(null)

/** const { user, login, logout } = useAuth() */
export const useAuth = () => useContext(AuthContext)
