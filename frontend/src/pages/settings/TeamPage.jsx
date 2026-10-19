import { Lock, Pencil, ShieldCheck, UserPlus, UserX } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../api.js'
import { useAuth } from '../../auth/useAuth.js'
import {
  Avatar, Badge, Button, EmptyState, ErrorMessage, Field, Input, Modal, PageHeader, Select, Skeleton, Table, Td, Th, Tr,
  useToast,
} from '../../components/ui'
import useApiGet from '../../hooks/useApiGet.js'
import { formatDate } from '../../lib/format.js'

/**
 * Equipo: los administradores dan de alta usuarios, cambian su rol, les
 * restablecen la contraseña o les quitan el acceso (desactivar).
 *
 * No hay "borrar": los deals, contactos e historial de esa persona siguen
 * apuntando a ella. Desactivarla conserva todo eso y le impide entrar.
 */
export default function TeamPage() {
  const { user: me } = useAuth()
  const [reloadKey, setReloadKey] = useState(0)
  const { data: users, loading, error } = useApiGet('/users?include_inactive=true', reloadKey)
  // null = cerrado; {} = nuevo usuario; {…usuario} = editar ese usuario.
  const [editing, setEditing] = useState(null)

  if (!me?.is_admin) {
    return <EmptyState icon={Lock} title="Solo para administradores" description="Pide a un administrador que gestione el equipo." />
  }

  const active = (users ?? []).filter((u) => u.is_active).length

  return (
    <>
      <PageHeader
        title="Equipo"
        description={users ? `${active} usuarios activos` : 'Usuarios que pueden entrar en el CRM'}
        actions={
          <Button variant="primary" icon={UserPlus} onClick={() => setEditing({})}>
            Nuevo usuario
          </Button>
        }
      />
      <ErrorMessage className="mb-4">{error}</ErrorMessage>

      <Table>
        <thead>
          <tr>
            <Th>Usuario</Th>
            <Th>Rol</Th>
            <Th>Estado</Th>
            <Th>Alta</Th>
            <Th className="w-0" />
          </tr>
        </thead>
        <tbody>
          {loading && !users
            ? Array.from({ length: 4 }, (_, i) => (
                <Tr key={i}>
                  <Td colSpan={5}><Skeleton className="h-8 w-full" /></Td>
                </Tr>
              ))
            : (users ?? []).map((u) => (
                <Tr key={u.id} className={u.is_active ? undefined : 'opacity-60'}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {u.name}
                          {u.id === me.id && <span className="ml-1.5 text-xs text-muted-foreground">(tú)</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {u.is_admin ? <Badge tone="primary" icon={ShieldCheck}>Administrador</Badge> : <Badge>Vendedor</Badge>}
                  </Td>
                  <Td>
                    {u.is_active ? <Badge tone="green">Activo</Badge> : <Badge tone="gray" icon={UserX}>Desactivado</Badge>}
                  </Td>
                  <Td className="text-muted-foreground">{formatDate(u.created_at)}</Td>
                  <Td>
                    <Button variant="ghost" size="icon" icon={Pencil} aria-label={`Editar ${u.name}`} onClick={() => setEditing(u)} />
                  </Td>
                </Tr>
              ))}
        </tbody>
      </Table>

      {editing && (
        <UserModal
          user={editing.id ? editing : null}
          isMe={editing.id === me.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setReloadKey((k) => k + 1)
          }}
        />
      )}
    </>
  )
}

// Alta o edición de un usuario. En edición la contraseña es opcional: solo se
// cambia si se escribe una nueva.
function UserModal({ user, isMe, onClose, onSaved }) {
  const toast = useToast()
  const [values, setValues] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    password: '',
    role: user?.is_admin ? 'admin' : 'seller',
    active: user?.is_active ?? true,
  })
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }))

  function validate() {
    const next = {}
    if (!values.name.trim()) next.name = 'El nombre es obligatorio'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim())) next.email = 'Escribe un email válido'
    if (!user && values.password.length < 8) next.password = 'Mínimo 8 caracteres'
    if (user && values.password && values.password.length < 8) next.password = 'Mínimo 8 caracteres'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    setApiError(null)
    const payload = { name: values.name.trim(), email: values.email.trim(), is_admin: values.role === 'admin' }
    try {
      if (user) {
        if (values.password) payload.password = values.password
        if (!isMe) payload.is_active = values.active
        await api.patch(`/users/${user.id}`, payload)
        toast.success('Usuario actualizado')
      } else {
        await api.post('/users', { ...payload, password: values.password })
        toast.success(`${payload.name} ya puede iniciar sesión`)
      }
      onSaved()
    } catch (err) {
      setApiError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? `Editar a ${user.name}` : 'Nuevo usuario'}
      description={user ? undefined : 'Podrá entrar con este email y contraseña.'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="user-form" loading={saving}>
            {user ? 'Guardar' : 'Crear usuario'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Nombre" required error={errors.name}>
          <Input value={values.name} onChange={set('name')} autoFocus placeholder="Marta Ruiz" />
        </Field>
        <Field label="Email" required error={errors.email}>
          <Input type="email" value={values.email} onChange={set('email')} placeholder="marta@crm.local" />
        </Field>
        <Field
          label={user ? 'Nueva contraseña' : 'Contraseña'}
          required={!user}
          error={errors.password}
          hint={user ? 'Déjala vacía para no cambiarla.' : 'Mínimo 8 caracteres. Compártela con la persona por un canal seguro.'}
        >
          <Input type="password" autoComplete="new-password" value={values.password} onChange={set('password')} />
        </Field>
        <Field label="Rol" hint={isMe ? 'No puedes quitarte tu propio rol de administrador.' : 'Los administradores gestionan el equipo.'}>
          <Select value={values.role} onChange={set('role')} disabled={isMe}>
            <option value="seller">Vendedor</option>
            <option value="admin">Administrador</option>
          </Select>
        </Field>
        {user && !isMe && (
          <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--primary)]"
              checked={values.active}
              onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))}
            />
            <span>
              <span className="font-medium">Acceso activo</span>
              <span className="block text-muted-foreground">
                Si lo desactivas no podrá entrar, pero se conservan sus deals e historial.
              </span>
            </span>
          </label>
        )}
        <ErrorMessage>{apiError}</ErrorMessage>
      </form>
    </Modal>
  )
}
