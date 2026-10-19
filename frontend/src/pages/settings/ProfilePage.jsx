import { useState } from 'react'
import { api } from '../../api.js'
import { useAuth } from '../../auth/useAuth.js'
import { Avatar, Badge, Button, Card, ErrorMessage, Field, Input, PageHeader, useToast } from '../../components/ui'

// Mi perfil: cada usuario cambia su nombre, su email y su contraseña.
export default function ProfilePage() {
  const { user } = useAuth()
  return (
    <>
      <PageHeader title="Mi perfil" description="Tus datos y tu contraseña.">
        <Avatar name={user.name} size="lg" />
      </PageHeader>
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <ProfileForm />
        <PasswordForm />
      </div>
    </>
  )
}

function ProfileForm() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      // Actualizamos también la sesión para que el nombre cambie en la barra lateral.
      setUser(await api.patch('/auth/me', { name: name.trim(), email: email.trim() }))
      toast.success('Perfil guardado')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      title="Datos personales"
      actions={user.is_admin ? <Badge tone="primary">Administrador</Badge> : <Badge>Vendedor</Badge>}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nombre" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email" required hint="Es el que usas para iniciar sesión.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <ErrorMessage>{error}</ErrorMessage>
        <div>
          <Button type="submit" variant="primary" loading={saving}>Guardar cambios</Button>
        </div>
      </form>
    </Card>
  )
}

function PasswordForm() {
  const toast = useToast()
  const [values, setValues] = useState({ current: '', next: '', repeat: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (values.next.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres')
    if (values.next !== values.repeat) return setError('Las contraseñas nuevas no coinciden')
    setSaving(true)
    setError(null)
    try {
      await api.post('/auth/password', { current_password: values.current, new_password: values.next })
      setValues({ current: '', next: '', repeat: '' })
      toast.success('Contraseña cambiada')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Cambiar contraseña">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Contraseña actual" required>
          <Input type="password" autoComplete="current-password" value={values.current} onChange={set('current')} required />
        </Field>
        <Field label="Nueva contraseña" required hint="Mínimo 8 caracteres.">
          <Input type="password" autoComplete="new-password" value={values.next} onChange={set('next')} required />
        </Field>
        <Field label="Repite la nueva contraseña" required>
          <Input type="password" autoComplete="new-password" value={values.repeat} onChange={set('repeat')} required />
        </Field>
        <ErrorMessage>{error}</ErrorMessage>
        <div>
          <Button type="submit" variant="primary" loading={saving}>Cambiar contraseña</Button>
        </div>
      </form>
    </Card>
  )
}
