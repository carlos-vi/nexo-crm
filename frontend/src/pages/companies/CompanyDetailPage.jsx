import { Calendar, ExternalLink, Factory, Globe, Pencil, Plus, Trash2, UserRound, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import ActivityTimeline from '../../components/ActivityTimeline.jsx'
import TaskList from '../../components/TaskList.jsx'
import {
  Avatar, Badge, Button, Card, EmptyState, ErrorMessage, PageHeader, Tabs, useConfirm, useToast,
} from '../../components/ui'
import useApiGet from '../../hooks/useApiGet.js'
import { formatDate, formatMoney } from '../../lib/format.js'
import ContactForm from '../contacts/ContactForm.jsx'
import CompanyForm from './CompanyForm.jsx'
import { fullName, wonValue } from './helpers.js'
import { DealList, DetailList, DetailSkeleton, Stat } from './parts.jsx'

export default function CompanyDetailPage() {
  // Los parámetros de la URL siempre llegan como texto: lo pasamos a número.
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [reloadKey, setReloadKey] = useState(0)
  // Al cambiar `id` cambia la ruta pedida y el hook vuelve a cargar: React
  // reutiliza este componente si saltamos de una empresa a otra.
  const { data: company, error, setData: setCompany } = useApiGet(`/companies/${id}`, reloadKey)
  const { data: stages } = useApiGet('/stages')
  const [tab, setTab] = useState('activity')
  const [modal, setModal] = useState(null) // 'edit' | 'contact' | null

  async function handleDelete() {
    const ok = await confirm({
      title: `¿Borrar «${company.name}»?`,
      message: 'Se borrarán también sus actividades y tareas. Esta acción no se puede deshacer.',
      danger: true,
    })
    if (!ok) return
    try {
      await api.delete(`/companies/${id}`)
      toast.success('Empresa borrada')
      navigate('/companies')
    } catch (err) {
      // 409: la API no deja borrar si aún tiene contactos o deals; su mensaje lo explica.
      toast.error(err.message)
    }
  }

  if (error) return <ErrorMessage>{error}</ErrorMessage>
  // Mientras carga (o si los datos son de otra empresa, al navegar) mostramos el esqueleto.
  if (!company || company.id !== id) return <DetailSkeleton />

  const won = wonValue(company.deals, stages)
  const website = company.domain ? `https://${company.domain}` : null

  return (
    <>
      <PageHeader
        title={company.name}
        breadcrumbs={[{ label: 'Empresas', to: '/companies' }, { label: company.name }]}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {website && (
              <a href={website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                {company.domain} <ExternalLink className="size-3" />
              </a>
            )}
            {company.industry && <Badge>{company.industry}</Badge>}
            {company.owner_name && (
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={company.owner_name} size="xs" /> {company.owner_name}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Button icon={Pencil} onClick={() => setModal('edit')}>Editar</Button>
            <Button variant="danger-ghost" icon={Trash2} onClick={handleDelete}>Borrar</Button>
          </>
        }
      >
        <Avatar name={company.name} square size="lg" />
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Contactos" value={company.contact_count} />
        <Stat
          label="Pipeline abierto"
          value={formatMoney(company.open_deal_value)}
          hint={`${company.open_deal_count} ${company.open_deal_count === 1 ? 'deal abierto' : 'deals abiertos'}`}
        />
        <Stat label="Ganado" value={formatMoney(won)} tone={won > 0 ? 'success' : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card bodyClassName="p-0">
          <Tabs
            value={tab}
            onChange={setTab}
            className="px-4 pt-2"
            tabs={[
              { value: 'activity', label: 'Actividad' },
              { value: 'contacts', label: 'Contactos', count: company.contacts.length },
              { value: 'deals', label: 'Deals', count: company.deals.length },
              { value: 'tasks', label: 'Tareas' },
            ]}
          />
          <div className="p-5">
            {tab === 'activity' && <ActivityTimeline filter={{ company_id: id }} reloadKey={reloadKey} />}
            {tab === 'contacts' && (
              <ContactsTab contacts={company.contacts} onAdd={() => setModal('contact')} />
            )}
            {tab === 'deals' && <DealList deals={company.deals} stages={stages} />}
            {tab === 'tasks' && <TaskList filter={{ company_id: id }} reloadKey={reloadKey} />}
          </div>
        </Card>

        <Card title="Detalles" className="self-start">
          <DetailList
            items={[
              {
                label: 'Dominio',
                icon: Globe,
                value: website && (
                  <a href={website} target="_blank" rel="noreferrer" className="text-primary hover:underline">{company.domain}</a>
                ),
              },
              { label: 'Sector', icon: Factory, value: company.industry },
              { label: 'Responsable', icon: UserRound, value: company.owner_name },
              { label: 'Creada', icon: Calendar, value: formatDate(company.created_at) },
            ]}
          />
        </Card>
      </div>

      {modal === 'edit' && (
        <CompanyForm
          company={company}
          onClose={() => setModal(null)}
          // El PATCH devuelve la empresa sin las listas: conservamos contactos y deals.
          onSaved={(updated) => setCompany((prev) => ({ ...prev, ...updated }))}
        />
      )}
      {modal === 'contact' && (
        <ContactForm
          defaults={{ company_id: id }}
          onClose={() => setModal(null)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
    </>
  )
}

function ContactsTab({ contacts, onAdd }) {
  if (contacts.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Sin contactos"
        description="Añade a las personas con las que hablas en esta empresa."
        action={<Button variant="primary" icon={Plus} onClick={onAdd}>Nuevo contacto</Button>}
      />
    )
  }
  return (
    <>
      <div className="mb-2 flex justify-end">
        <Button size="sm" icon={Plus} onClick={onAdd}>Nuevo contacto</Button>
      </div>
      <ul className="divide-y divide-border">
        {contacts.map((c) => (
          <li key={c.id}>
            <Link to={`/contacts/${c.id}`} className="flex items-center gap-3 px-1 py-3 hover:bg-muted/50">
              <Avatar name={fullName(c)} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{fullName(c)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[c.job_title, c.email].filter(Boolean).join(' · ') || 'Sin cargo ni email'}
                </p>
              </div>
              {c.open_deal_count > 0 && (
                <Badge tone="primary">{c.open_deal_count} {c.open_deal_count === 1 ? 'deal' : 'deals'}</Badge>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
