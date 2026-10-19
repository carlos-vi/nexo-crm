import {
  Building2, CheckSquare, ChevronsUpDown, KanbanSquare, LayoutDashboard, LogOut, Menu, Moon, Sun, UserCog,
  UserRound, Users, X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth.js'
import useTheme from '../../hooks/useTheme.js'
import { cn } from '../../lib/cn.js'
import SearchBox from '../SearchBox.jsx'
import Avatar from '../ui/Avatar.jsx'
import Logo from './Logo.jsx'

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/companies', label: 'Empresas', icon: Building2 },
  { to: '/contacts', label: 'Contactos', icon: Users },
  { to: '/tasks', label: 'Tareas', icon: CheckSquare },
]

/**
 * Estructura de todas las páginas privadas: barra lateral, barra superior y,
 * en medio, la página de la ruta actual (<Outlet />).
 */
export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // En móvil, al navegar se cierra el menú lateral.
  const [lastPath, setLastPath] = useState(location.pathname)
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setMobileOpen(false)
  }

  return (
    <div className="min-h-screen lg:pl-60">
      {/* Fondo oscuro en móvil cuando el menú está abierto */}
      {mobileOpen && (
        <div className="animate-fade-in fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur sm:px-6">
        <button className="rounded-md p-1.5 hover:bg-accent lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">
          <Menu className="size-5" />
        </button>
        <SearchBox />
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}

// La sección "Equipo" solo la ven los administradores.
const settings = [{ to: '/settings/team', label: 'Equipo', icon: UserCog, adminOnly: true }]

function Sidebar({ open, onClose }) {
  const { user } = useAuth()
  const visibleSettings = settings.filter((item) => !item.adminOnly || user?.is_admin)
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-sidebar transition-transform lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex h-14 items-center justify-between px-5">
        <Logo />
        <button className="rounded-md p-1 hover:bg-accent lg:hidden" onClick={onClose} aria-label="Cerrar menú">
          <X className="size-4" />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-4">
        <SectionTitle>Ventas</SectionTitle>
        {navigation.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
        {visibleSettings.length > 0 && (
          <>
            <SectionTitle className="mt-5">Configuración</SectionTitle>
            {visibleSettings.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </>
        )}
      </nav>

      <UserMenu />
    </aside>
  )
}

function SectionTitle({ className, children }) {
  return (
    <p className={cn('px-2.5 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase', className)}>
      {children}
    </p>
  )
}

function NavItem({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )
      }
    >
      <Icon className="size-4" />
      {label}
    </NavLink>
  )
}

function ThemeToggle() {
  const { dark, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}

// Usuario actual al pie de la barra lateral, con menú para cerrar sesión.
function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative border-t border-border p-3">
      {open && (
        <div className="animate-pop-in absolute right-3 bottom-full left-3 mb-1 rounded-lg border border-border bg-card p-1 shadow-lg">
          <Link
            to="/settings/profile"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent"
          >
            <UserRound className="size-4" /> Mi perfil
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-danger hover:bg-danger-soft"
          >
            <LogOut className="size-4" /> Cerrar sesión
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-accent"
      >
        <Avatar name={user?.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{user?.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
      </button>
    </div>
  )
}
