import { Briefcase, Building2, Calendar, Mail, Pencil, Phone, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import ActivityTimeline from '../../components/ActivityTimeline.jsx'
import TaskList from '../../components/TaskList.jsx'
import { Avatar, Button, Card, ErrorMessage, PageHeader, Tabs, useConfirm, useToast } from '../../components/ui'
import useApiGet from '../../hooks/useApiGet.js'
import { formatDate, formatMoney } from '../../lib/format.js'
import { fullName, linkButtonClass, openDeals, wonValue } from '../companies/helpers.js'
import { DealList, DetailList, DetailSkeleton, Stat } from '../companies/parts.jsx'
import ContactForm from './ContactForm.jsx'

export default function ContactDetailPage() {
  // El parámetro de la URL llega como texto: lo convertimos a número.
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: contact, error, setData: setContact } = useApiGet(`/contacts/${id}`)
  const { data: stages } = useApiGet('/stages')
  const [tab, setTab] = useState('activity')
  const [editing, setEditing] = useState(false)

  async function handleDelete() {
    const ok = await confirm({
      title: `¿Borrar a ${fullName(contact)}?`,
      message: 'Se borrarán también sus actividades y tareas. Sus deals se conservan, pero sin contacto.',
      danger: true,
    })
    if (!ok) return
    try {
      await api.delete(`/contacts/${id}`)
      toast.success('Contacto borrado')
      navigate('/contacts')
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (error) return <ErrorMessage>{error}</ErrorMessage>
  if (!contact || contact.id !== id) return <DetailSkeleton />

  const name = fullName(contact)
  const open = openDeals(contact.deals, stages)
  const won = wonValue(contact.deals, stages)
  const companyLink = contact.company_id && (
    <Link to={`/companies/${contact.company_id}`} className="text-primary hover:underline">{contact.company_name}</Link>
  )

  return (
    <>
      <PageHeader
        title={name}
        breadcrumbs={[{ label: 'Contactos', to: '/contacts' }, { label: name }]}
        description={
          contact.job_title || companyLink ? (
            <>
              {contact.job_title}
              {contact.job_title && companyLink && ' en '}
              {companyLink}
            </>
          ) : (
            'Sin cargo ni empresa'
          )
        }
        actions={
          <>
            {/* mailto: y tel: abren el programa de correo o de llamadas del sistema. */}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className={linkButtonClass}>
                <Mail className="size-4" /> Email
              </a>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone.replace(/\s+/g, '')}`} className={linkButtonClass}>
                <Phone className="size-4" /> Llamar
              </a>
            )}
            <Button icon={Pencil} onClick={() => setEditing(true)}>Editar</Button>
            <Button variant="danger-ghost" icon={Trash2} onClick={handleDelete}>Borrar</Button>
          </>
        }
      >
        <Avatar name={name} size="lg" />
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Deals abiertos" value={contact.open_deal_count} />
        <Stat label="Pipeline abierto" value={formatMoney(open.value)} />
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
              { value: 'deals', label: 'Deals', count: contact.deals.length },
              { value: 'tasks', label: 'Tareas' },
            ]}
          />
          <div className="p-5">
            {tab === 'activity' && <ActivityTimeline filter={{ contact_id: id }} />}
            {tab === 'deals' && <DealList deals={contact.deals} stages={stages} />}
            {tab === 'tasks' && <TaskList filter={{ contact_id: id }} />}
          </div>
        </Card>

        <Card title="Detalles" className="self-start">
          <DetailList
            items={[
              {
                label: 'Email',
                icon: Mail,
                value: contact.email && (
                  <a href={`mailto:${contact.email}`} className="text-primary hover:underline">{contact.email}</a>
                ),
              },
              {
                label: 'Teléfono',
                icon: Phone,
                value: contact.phone && (
                  <a href={`tel:${contact.phone.replace(/\s+/g, '')}`} className="hover:text-primary">{contact.phone}</a>
                ),
              },
              { label: 'Cargo', icon: Briefcase, value: contact.job_title },
              { label: 'Empresa', icon: Building2, value: companyLink },
              { label: 'Responsable', icon: UserRound, value: contact.owner_name },
              { label: 'Creado', icon: Calendar, value: formatDate(contact.created_at) },
            ]}
          />
        </Card>
      </div>

      {editing && (
        <ContactForm
          contact={contact}
          onClose={() => setEditing(false)}
          // El PATCH no devuelve la lista de deals: la conservamos del estado anterior.
          onSaved={(updated) => setContact((prev) => ({ ...prev, ...updated }))}
        />
      )}
    </>
  )
}
