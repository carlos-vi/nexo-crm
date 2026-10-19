import { BarChart3, KanbanSquare, Users } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import Logo from '../components/layout/Logo.jsx'
import { Button, ErrorMessage, Field, Input } from '../components/ui'

const highlights = [
  { icon: KanbanSquare, text: 'Pipeline visual: arrastra cada oportunidad hasta cerrarla' },
  { icon: BarChart3, text: 'Previsión de ventas y métricas del equipo en tiempo real' },
  { icon: Users, text: 'Empresas, contactos e historial de cada relación en un solo sitio' },
]

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      // Vuelve a la página que se intentaba abrir antes de pedir el login.
      navigate(location.state?.from ?? '/', { replace: true })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-16">
        <div className="mx-auto w-full max-w-sm">
          <Logo />
          <h1 className="mt-10 text-2xl font-semibold tracking-tight">Inicia sesión</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Accede a tu pipeline y a tus clientes.</p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <Field label="Email">
              <Input type="email" autoComplete="username" required autoFocus value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.example" />
            </Field>
            <Field label="Contraseña">
              <Input type="password" autoComplete="current-password" required value={password}
                onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <ErrorMessage>{error}</ErrorMessage>
            <Button type="submit" variant="primary" loading={loading} className="mt-2 w-full justify-center">
              Entrar
            </Button>
          </form>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-indigo-950 lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative max-w-md">
          <p className="text-3xl leading-tight font-semibold text-white">
            Todo tu proceso de ventas, de la primera llamada al cierre.
          </p>
          <ul className="mt-10 flex flex-col gap-5">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-indigo-100">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="size-4" />
                </span>
                <span className="pt-1.5 text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
