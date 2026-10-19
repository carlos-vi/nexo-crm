import { useState } from 'react'
import { api } from '../../api.js'
import { OwnerSelect } from '../../components/OwnerFilter.jsx'
import { Button, ErrorMessage, Field, Input, Modal, useToast } from '../../components/ui'

// Sectores sugeridos (el campo admite cualquier texto; <datalist> solo propone).
const INDUSTRIES = ['Software', 'Consultoría', 'Retail', 'Industria', 'Logística', 'Salud', 'Educación', 'Finanzas', 'Marketing']

/**
 * Modal para crear (sin `company`) o editar (con `company`) una empresa.
 * `onSaved(empresa)` recibe la respuesta de la API. El padre lo monta solo
 * cuando está abierto, así los campos empiezan limpios cada vez.
 */
export default function CompanyForm({ company, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(company)
  const [values, setValues] = useState({
    name: company?.name ?? '',
    domain: company?.domain ?? '',
    industry: company?.industry ?? '',
    owner_id: company?.owner_id ?? '',
  })
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }))

  function validate() {
    const next = {}
    if (!values.name.trim()) next.name = 'El nombre es obligatorio.'
    // Un dominio no lleva espacios ni "http://": "acme.example".
    const domain = values.domain.trim()
    if (domain && !/^[^\s/]+\.[^\s/]+$/.test(domain)) next.domain = 'Escribe solo el dominio, p. ej. acme.example'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault() // evita que el navegador recargue la página al enviar
    if (!validate()) return
    setSaving(true)
    setApiError(null)
    const body = {
      name: values.name.trim(),
      domain: values.domain.trim().replace(/^www\./, '') || null,
      industry: values.industry.trim() || null,
    }
    // Al crear, sin responsable = "yo" (la API lo decide). Al editar solo lo
    // enviamos si se eligió alguien.
    if (values.owner_id !== '') body.owner_id = values.owner_id
    try {
      const saved = editing ? await api.patch(`/companies/${company.id}`, body) : await api.post('/companies', body)
      toast.success(editing ? 'Cambios guardados' : `Empresa «${saved.name}» creada`)
      onSaved?.(saved)
      onClose()
    } catch (err) {
      setApiError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Editar empresa' : 'Nueva empresa'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancelar</Button>
          {/* form="company-form": el botón está fuera del <form> (en el pie del modal) pero lo envía igual. */}
          <Button type="submit" form="company-form" variant="primary" loading={saving}>
            {editing ? 'Guardar cambios' : 'Crear empresa'}
          </Button>
        </>
      }
    >
      <form id="company-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Nombre" required error={errors.name}>
          <Input value={values.name} onChange={set('name')} placeholder="Acme S.L." autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dominio" error={errors.domain}>
            <Input value={values.domain} onChange={set('domain')} placeholder="acme.example" />
          </Field>
          <Field label="Sector">
            <Input value={values.industry} onChange={set('industry')} list="industries" placeholder="Software" />
            <datalist id="industries">
              {INDUSTRIES.map((i) => <option key={i} value={i} />)}
            </datalist>
          </Field>
        </div>
        <Field label="Responsable">
          <OwnerSelect value={values.owner_id} onChange={(id) => setValues((v) => ({ ...v, owner_id: id }))} />
        </Field>
        <ErrorMessage>{apiError}</ErrorMessage>
      </form>
    </Modal>
  )
}
