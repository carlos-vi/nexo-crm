import { useState } from 'react'
import { api } from '../../api.js'
import { OwnerSelect } from '../../components/OwnerFilter.jsx'
import { Button, ErrorMessage, Field, Input, Modal, Select, useToast } from '../../components/ui'
import useApiGet from '../../hooks/useApiGet.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Modal para crear (sin `contact`) o editar (con `contact`) un contacto.
 * `defaults` rellena campos al crear, p. ej. { company_id: 3 } desde la ficha
 * de una empresa. El padre lo monta solo cuando está abierto.
 */
export default function ContactForm({ contact, defaults = {}, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(contact)
  const initial = contact ?? defaults
  // Empresas para el desplegable.
  const { data: companies, error: companiesError } = useApiGet('/companies')
  // Un único objeto de estado; los <input> siempre reciben texto (nunca null)
  // para que sean "controlados".
  const [values, setValues] = useState({
    first_name: initial.first_name ?? '',
    last_name: initial.last_name ?? '',
    email: initial.email ?? '',
    phone: initial.phone ?? '',
    job_title: initial.job_title ?? '',
    company_id: initial.company_id ?? '',
    owner_id: initial.owner_id ?? '',
  })
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }))

  function validate() {
    const next = {}
    if (!values.first_name.trim()) next.first_name = 'El nombre es obligatorio.'
    if (values.email.trim() && !EMAIL_RE.test(values.email.trim())) next.email = 'El email no tiene un formato válido.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    setApiError(null)
    const body = {
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim() || null,
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      job_title: values.job_title.trim() || null,
      // El <select> devuelve texto: lo convertimos a número (o null si "Sin empresa").
      company_id: values.company_id === '' ? null : Number(values.company_id),
    }
    if (values.owner_id !== '') body.owner_id = values.owner_id
    try {
      const saved = editing ? await api.patch(`/contacts/${contact.id}`, body) : await api.post('/contacts', body)
      toast.success(editing ? 'Cambios guardados' : `Contacto «${saved.first_name}» creado`)
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
      title={editing ? 'Editar contacto' : 'Nuevo contacto'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" form="contact-form" variant="primary" loading={saving}>
            {editing ? 'Guardar cambios' : 'Crear contacto'}
          </Button>
        </>
      }
    >
      <form id="contact-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" required error={errors.first_name}>
            <Input value={values.first_name} onChange={set('first_name')} autoFocus />
          </Field>
          <Field label="Apellidos">
            <Input value={values.last_name} onChange={set('last_name')} />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input type="email" value={values.email} onChange={set('email')} placeholder="ana@empresa.example" />
          </Field>
          <Field label="Teléfono">
            <Input type="tel" value={values.phone} onChange={set('phone')} placeholder="600 000 000" />
          </Field>
          <Field label="Cargo">
            <Input value={values.job_title} onChange={set('job_title')} placeholder="Director de compras" />
          </Field>
          <Field label="Empresa" error={companiesError && `No se pudieron cargar las empresas: ${companiesError}`}>
            <Select value={values.company_id} onChange={set('company_id')}>
              <option value="">Sin empresa</option>
              {(companies ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
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
