import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/AuthContext.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import { EmptyState, Skeleton } from './components/ui'
import LoginPage from './pages/LoginPage.jsx'

// Carga bajo demanda: el código de cada página se descarga la primera vez que
// se visita, no al abrir la app. Así el login carga rápido aunque el dashboard
// incluya una librería de gráficos pesada.
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage.jsx'))
const PipelinePage = lazy(() => import('./pages/pipeline/PipelinePage.jsx'))
const CompaniesPage = lazy(() => import('./pages/companies/CompaniesPage.jsx'))
const CompanyDetailPage = lazy(() => import('./pages/companies/CompanyDetailPage.jsx'))
const ContactsPage = lazy(() => import('./pages/contacts/ContactsPage.jsx'))
const ContactDetailPage = lazy(() => import('./pages/contacts/ContactDetailPage.jsx'))
const DealDetailPage = lazy(() => import('./pages/deals/DealDetailPage.jsx'))
const TasksPage = lazy(() => import('./pages/tasks/TasksPage.jsx'))
const TeamPage = lazy(() => import('./pages/settings/TeamPage.jsx'))
const ProfilePage = lazy(() => import('./pages/settings/ProfilePage.jsx'))

function PageFallback() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

// Rutas: /login es pública; el resto va dentro del layout y exige sesión.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        {[
          ['/', DashboardPage],
          ['/pipeline', PipelinePage],
          ['/companies', CompaniesPage],
          ['/companies/:id', CompanyDetailPage],
          ['/contacts', ContactsPage],
          ['/contacts/:id', ContactDetailPage],
          ['/deals/:id', DealDetailPage],
          ['/tasks', TasksPage],
          ['/settings/team', TeamPage],
          ['/settings/profile', ProfilePage],
        ].map(([path, Page]) => (
          <Route
            key={path}
            path={path}
            element={
              // Suspense muestra el esqueleto mientras se descarga el código de la página.
              <Suspense fallback={<PageFallback />}>
                <Page />
              </Suspense>
            }
          />
        ))}
        <Route path="*" element={<EmptyState title="Página no encontrada" description="La dirección no existe." />} />
      </Route>
    </Routes>
  )
}
