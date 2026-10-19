import { useState } from 'react'
import { api, query } from '../../api.js'
import { OwnerSelect } from '../../components/OwnerFilter.jsx'
import { Button, ErrorMessage, Field, Input, Modal, Select, useToast } from '../../components/ui'
import useApiGet from '../../hooks/useApiGet.js'

/**
 * Modal con el formulario de deal, para crear (Kanban) y editar (detalle).
 *   <DealFormModal open={open} onClose={...} stages={stages} onSaved={(deal) => ...} />
 *   <DealFormModal open={open} onClose={...} stages={stages} deal={deal} onSaved={...} />
 *
 * Props:
 *   deal            -> deal existente (si no viene, se crea uno nuevo)
 *   stages          -> etapas ordenadas (para el selector)
 *   defaultStageId  -> etapa preseleccionada al crear (opcional)
 *   onSaved(deal)   -> se llama con el deal que devuelve la API
 */
export default function DealFormModal({ open, onClose, deal, stages, defaultStageId, onSaved }) {
  return (
    <Modal open={open} onClose={onClose} title={deal ? 'Editar deal' : 'Nuevo deal'} size="lg">
      {/* El formulario solo existe mientras el modal está abierto: así, cada
          vez que se abre, su estado empieza de cero con los datos del deal. */}
      {open && (
        <DealForm deal={deal} stages={stages} defaultStageId={defaultStageId} onSaved={onSaved} onCancel={onClose} />
      )}
    </Modal>
  )
}

export function DealForm({ deal, stages, defaultStageId, onSaved, onCancel }) {
  const toast = useToast()
  // Los inputs HTML trabajan con strings: guardamos todo como string y lo
  // convertimos a número/null solo al enviar.
  const [form, setForm] = useState(() => ({
    title: deal?.title ?? '',
    value: deal?.value != null ? String(deal.value) : '',
    stage_id: String(deal?.stage_id ?? defaultStageId ?? stages[0]?.id ?? ''),
    company_id: deal?.company_id != null ? String(deal.company_id) : '',
    contact_id: deal?.contact_id != null ? String(deal.contact_id) : '',
    owner_id: deal?.owner_id ?? '',
    expected_close_date: deal?.expected_close_date ?? '',
  }))
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [saving, setSaving] = useState(false)

  const { data: companies } = useApiGet('/companies')
  // La ruta depende de la empresa elegida: al cambiarla, useApiGet vuelve a
  // pedir los contactos y solo muestra los de esa empresa.
  const { data: contacts } = useApiGet('/contacts' + query({ company_id: form.company_id }))

  const update = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  // Al cambiar de empresa, el contacto elegido puede dejar de ser válido.
  const changeCompany = (value) => setForm((f) => ({ ...f, company_id: value, contact_id: '' }))

  function validate() {
    const next = {}
    if (!form.title.trim()) next.title = 'El título es obligatorio.'
    const value = form.value === '' ? 0 : Number(form.value)
    if (Number.isNaN(value) || value < 0) next.value = 'Debe ser un número mayor o igual que 0.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    const payload = {
      title: form.title.trim(),
      value: form.value === '' ? 0 : Number(form.value),
      stage_id: form.stage_id ? Number(form.stage_id) : undefined,
      company_id: form.company_id ? Number(form.company_id) : null,
      contact_id: form.contact_id ? Number(form.contact_id) : null,
      // '' = "yo (por defecto)": no lo enviamos y la API decide.
      owner_id: form.owner_id || undefined,
      expected_close_date: form.expected_close_date || null,
    }
    setSaving(true)
    setServerError(null)
    try {
      const saved = deal ? await api.patch(`/deals/${deal.id}`, payload) : await api.post('/deals', payload)
      toast.success(deal ? 'Deal actualizado' : 'Deal creado')
      onSaved?.(saved)
    } catch (err) {
      setServerError(err.message)
      setSaving(false)
    }
  }

  // Si el deal ya tenía un contacto que no aparece en la lista filtrada,
  // lo añadimos para que el selector no quede en blanco.
  const contactList = contacts ?? []
  const contactMissing =
    form.contact_id && deal?.contact_id != null && String(deal.contact_id) === form.contact_id &&
    !contactList.some((c) => String(c.id) === form.contact_id)

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field label="Título" required error={errors.title}>
        <Input value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="p. ej. Licencias 2027" autoFocus />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor (€)" error={errors.value}>
          <Input type="number" min="0" step="any" value={form.value} onChange={(e) => update('value', e.target.value)} placeholder="0" />
        </Field>
        <Field label="Etapa">
          <Select value={form.stage_id} onChange={(e) => update('stage_id', e.target.value)}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.probability}%)</option>
            ))}
          </Select>
        </Field>
        <Field label="Empresa">
          <Select value={form.company_id} onChange={(e) => changeCompany(e.target.value)}>
            <option value="">— Sin empresa —</option>
            {(companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Contacto" hint={form.company_id ? 'Solo contactos de la empresa elegida' : undefined}>
          <Select value={form.contact_id} onChange={(e) => update('contact_id', e.target.value)}>
            <option value="">— Sin contacto —</option>
            {contactMissing && <option value={form.contact_id}>{deal.contact_name}</option>}
            {contactList.map((c) => (
              <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(' ')}</option>
            ))}
          </Select>
        </Field>
        <Field label="Responsable">
          <OwnerSelect value={form.owner_id} onChange={(v) => update('owner_id', v)} />
        </Field>
        <Field label="Cierre previsto">
          <Input type="date" value={form.expected_close_date} onChange={(e) => update('expected_close_date', e.target.value)} />
        </Field>
      </div>

      <ErrorMessage>{serverError}</ErrorMessage>

      {/* Pie del modal: márgenes negativos para ocupar todo el ancho. */}
      <div className="-mx-6 -mb-5 flex justify-end gap-2 rounded-b-xl border-t border-border bg-muted/50 px-6 py-3">
        <Button onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" loading={saving}>
          {deal ? 'Guardar cambios' : 'Crear deal'}
        </Button>
      </div>
    </form>
  )
}
