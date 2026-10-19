import { Building2, Download, Plus, Search, Upload } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { download, query } from '../../api.js'
import OwnerFilter from '../../components/OwnerFilter.jsx'
import {
  Avatar, Badge, Button, EmptyState, ErrorMessage, Input, PageHeader, Table, Td, Th, Tr, sortBy, useToast,
} from '../../components/ui'
import useApiGet from '../../hooks/useApiGet.js'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import { formatMoney } from '../../lib/format.js'
import CompanyForm from './CompanyForm.jsx'
import ImportCsvModal from './ImportCsvModal.jsx'
import { SkeletonRows } from './parts.jsx'

const COMPANY_COLUMNS = ['name', 'domain', 'industry', 'owner_email']

export default function CompaniesPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search.trim())
  const [owner, setOwner] = useState('')
  const [sort, setSort] = useState(null) // null = el orden de la API (por nombre)
  const [modal, setModal] = useState(null) // 'create' | 'import' | null
  // Contador que incrementamos para forzar una recarga del listado.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)

  const filters = { q, owner_id: owner }
  const { data, loading, error } = useApiGet('/companies' + query(filters), reloadKey)
  const companies = sortBy(data ?? [], sort)
  const filtering = Boolean(q || owner)

  async function handleExport() {
    try {
      // download() envía el token; un <a href> normal no podría.
      await download('/companies/export' + query(filters), 'empresas.csv')
    } catch (err) {
      toast.error(`No se pudo exportar: ${err.message}`)
    }
  }

  const sortProps = { sort, onSort: setSort }

  return (
    <>
      <PageHeader
        title="Empresas"
        description={data ? `${data.length} ${data.length === 1 ? 'empresa' : 'empresas'}` : 'Cargando…'}
        actions={
          <>
            <Button icon={Download} onClick={handleExport} disabled={!data?.length}>Exportar</Button>
            <Button icon={Upload} onClick={() => setModal('import')}>Importar</Button>
            <Button variant="primary" icon={Plus} onClick={() => setModal('create')}>Nueva empresa</Button>
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
            placeholder="Buscar empresas…"
            className="pl-9"
            aria-label="Buscar empresas"
          />
        </div>
        <div className="w-full sm:w-56">
          <OwnerFilter value={owner} onChange={setOwner} className="w-full" />
        </div>
      </div>

      <ErrorMessage className="mb-4">{error}</ErrorMessage>

      {data && companies.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-xs">
          {filtering ? (
            <EmptyState
              icon={Search}
              title="Sin resultados"
              description="Ninguna empresa coincide con los filtros."
              action={<Button onClick={() => { setSearch(''); setOwner('') }}>Limpiar filtros</Button>}
            />
          ) : (
            <EmptyState
              icon={Building2}
              title="Aún no hay empresas"
              description="Crea tu primera empresa o importa un listado desde un CSV."
              action={
                <div className="flex gap-2">
                  <Button icon={Upload} onClick={() => setModal('import')}>Importar CSV</Button>
                  <Button variant="primary" icon={Plus} onClick={() => setModal('create')}>Nueva empresa</Button>
                </div>
              }
            />
          )}
        </div>
      ) : (
        <Table className={loading && data ? 'opacity-60 transition-opacity' : undefined}>
          <thead>
            <tr>
              <Th field="name" {...sortProps}>Empresa</Th>
              <Th field="industry" {...sortProps}>Sector</Th>
              <Th field="contact_count" {...sortProps} className="text-right">Contactos</Th>
              <Th field="open_deal_value" {...sortProps} className="text-right">Deals abiertos</Th>
              <Th field="owner_name" {...sortProps}>Responsable</Th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <SkeletonRows columns={5} />
            ) : (
              companies.map((c) => (
                <Tr key={c.id} onClick={() => navigate(`/companies/${c.id}`)}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} square size="md" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.domain ?? 'Sin dominio'}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>{c.industry ? <Badge>{c.industry}</Badge> : <span className="text-muted-foreground">—</span>}</Td>
                  <Td className="text-right tabular-nums">{c.contact_count}</Td>
                  <Td className="text-right">
                    {c.open_deal_count > 0 ? (
                      <>
                        <p className="font-medium tabular-nums">{formatMoney(c.open_deal_value)}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.open_deal_count} {c.open_deal_count === 1 ? 'deal' : 'deals'}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Td>
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
        <CompanyForm onClose={() => setModal(null)} onSaved={reload} />
      )}
      {modal === 'import' && (
        <ImportCsvModal
          title="Importar empresas"
          endpoint="/companies/import"
          columns={COMPANY_COLUMNS}
          required={['name']}
          example={['Acme S.L.', 'acme.example', 'Software', '']}
          templateName="plantilla-empresas.csv"
          notes="Las empresas cuyo nombre ya exista se saltan."
          onClose={() => setModal(null)}
          onImported={reload}
        />
      )}
    </>
  )
}
