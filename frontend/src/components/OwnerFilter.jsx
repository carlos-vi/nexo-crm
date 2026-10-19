import { useAuth } from '../auth/useAuth.js'
import useUsers from '../hooks/useUsers.js'
import { Select } from './ui'

/**
 * Selector "de quién": todos, solo los míos o los de un vendedor concreto.
 * `value` es '' (todos) o el id del usuario como texto, listo para ?owner_id=.
 *   <OwnerFilter value={owner} onChange={setOwner} />
 */
export default function OwnerFilter({ value, onChange, allLabel = 'Todos los responsables', className }) {
  const { user } = useAuth()
  const users = useUsers()
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className ?? 'w-auto'} aria-label="Responsable">
      <option value="">{allLabel}</option>
      {user && <option value={String(user.id)}>Solo los míos</option>}
      {users
        .filter((u) => u.id !== user?.id)
        .map((u) => (
          <option key={u.id} value={String(u.id)}>{u.name}</option>
        ))}
    </Select>
  )
}

/**
 * Selector de responsable para formularios (sin opción "todos").
 *   <OwnerSelect value={ownerId} onChange={setOwnerId} />   // ownerId: número o ''
 */
export function OwnerSelect({ value, onChange, ...props }) {
  const users = useUsers()
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')} {...props}>
      <option value="">Yo (por defecto)</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </Select>
  )
}
