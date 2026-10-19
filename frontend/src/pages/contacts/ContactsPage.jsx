import { Download, Plus, Search, Upload, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { download, query } from '../../api.js'
import OwnerFilter from '../../components/OwnerFilter.jsx'
import {
  Avatar, Button, EmptyState, ErrorMessage, Input, PageHeader, Select, Table, Td, Th, Tr, sortBy, useToast,
} from '../../components/ui'
import useApiGet from '../../hooks/useApiGet.js'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import { fullName } from '../companies/helpers.js'
import ImportCsvModal from '../companies/ImportCsvModal.jsx'
import { SkeletonRows } from '../companies/parts.jsx'
import ContactForm from './ContactForm.jsx'

const CONTACT_COLUMNS = ['first_name', 'last_name', 'email', 'phone', 'job_title', 'company', 'owner_email']

// Para ordenar por "nombre" usamos el nombre completo (no es un campo de la API).
const sortValue = (contact, field) => (field === 'name' ? fullName(contact) : contact[field])

export default function ContactsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search.trim())
  const [companyId, setCompanyId] = useState('')
  const [owner, setOwner] = useState('')
  const [sort, setSort] = useState(null)
  const [modal, setModal] = useState(null) // 'create' | 'import' | null
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)

  // Empresas para el filtro. Se recargan tras importar (por si acaso).
  const { data: companies } = useApiGet('/companies', reloadKey)
  // El <select> no necesita debounce: es un solo clic.
  const filters = { q, company_id: companyId, owner_id: owner }
  const { data, loading, error } = useApiGet('/contacts' + query(filters), reloadKey)
  const contacts = sortBy(data ?? [], sort, sortValue)
  const filtering = Boolean(q || companyId || owner)

  async function handleExport() {
    try {
      await download('/contacts/export' + query(filters), 'contactos.csv')
    } catch (err) {
      toast.error(`No se pudo exportar: ${err.message}`)
    }
  }

  function clearFilters() {
    setSearch('')
    setCompanyId('')
    setOwner('')
  }

  const sortProps = { sort, onSort: setSort }

  return (
    <>
      <PageHeader
        title="Contactos"
        description={data ? `${data.length} ${data.length === 1 ? 'contacto' : 'contactos'}` : 'Cargando…'}
        actions={
          <>
            <Button icon={Download} onClick={handleExport} disabled={!data?.length}>Exportar</Button>
            <Button icon={Upload} onClick={() => setModal('import')}>Importar</Button>
            <Button variant="primary" icon={Plus} onClick={() => setModal('create')}>Nuevo contacto</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className="pl-9"
            aria-label="Buscar contactos"
          />
        </div>
        <div className="w-full sm:w-56">
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Empresa">
            <option value="">Todas las empresas</option>
            {(companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-56">
          <OwnerFilter value={owner} onChange={setOwner} className="w-full" />
        </div>
      </div>

      <ErrorMessage className="mb-4">{error}</ErrorMessage>

      {data && contacts.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-xs">
          {filtering ? (
            <EmptyState
              icon={Search}
              title="Sin resultados"
              description="Ningún contacto coincide con los filtros."
              action={<Button onClick={clearFilters}>Limpiar filtros</Button>}
            />
          ) : (
            <EmptyState
              icon={Users}
              title="Aún no hay contactos"
              description="Añade a las personas con las que hablas o impórtalas desde un CSV."
              action={
                <div className="flex gap-2">
                  <Button icon={Upload} onClick={() => setModal('import')}>Importar CSV</Button>
                  <Button variant="primary" icon={Plus} onClick={() => setModal('create')}>Nuevo contacto</Button>
                </div>
              }
            />
          )}
        </div>
      ) : (
        <Table className={loading && data ? 'opacity-60 transition-opacity' : undefined}>
          <thead>
            <tr>
              <Th field="name" {...sortProps}>Nombre</Th>
              <Th field="job_title" {...sortProps}>Cargo</Th>
              <Th field="company_name" {...sortProps}>Empresa</Th>
              <Th field="phone" {...sortProps}>Teléfono</Th>
              <Th field="owner_name" {...sortProps}>Responsable</Th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <SkeletonRows columns={5} />
            ) : (
              contacts.map((c) => (
                <Tr key={c.id} onClick={() => navigate(`/contacts/${c.id}`)}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={fullName(c)} size="md" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{fullName(c)}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.email ?? 'Sin email'}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>{c.job_title ?? <span className="text-muted-foreground">—</span>}</Td>
                  <Td>
                    {c.company_id ? (
                      <Link
                        to={`/companies/${c.company_id}`}
                        // Sin esto, el clic también llegaría a la fila y abriría el contacto.
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-2 hover:text-primary"
                      >
                        <Avatar name={c.company_name} square size="xs" />
                        <span className="truncate">{c.company_name}</span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">{c.phone ?? <span className="text-muted-foreground">—</span>}</Td>
                  <Td>
                    {c.owner_name ? (
                      <div className="flex items-center gap-2">
                        <Avatar name={c.owner_name} size="xs" />
                        <span className="truncate">{c.owner_name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Sin asignar</span>
                    )}
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      )}

      {modal === 'create' && (
        <ContactForm
          defaults={companyId ? { company_id: Number(companyId) } : undefined}
          onClose={() => setModal(null)}
          onSaved={reload}
        />
      )}
      {modal === 'import' && (
        <ImportCsvModal
          title="Importar contactos"
          endpoint="/contacts/import"
          columns={CONTACT_COLUMNS}
          required={['first_name']}
          example={['Ana', 'García', 'ana@acme.example', '+1 555-0100', 'CTO', 'Acme S.L.', '']}
          templateName="plantilla-contactos.csv"
          notes="La columna company debe coincidir con el nombre de una empresa existente."
          onClose={() => setModal(null)}
          onImported={reload}
        />
      )}
    </>
  )
}
