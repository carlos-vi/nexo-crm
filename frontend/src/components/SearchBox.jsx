import { Building2, CircleDollarSign, Search, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { query } from '../api.js'
import useApiGet from '../hooks/useApiGet.js'
import useDebouncedValue from '../hooks/useDebouncedValue.js'
import { formatMoney } from '../lib/format.js'

const EMPTY = { companies: [], contacts: [], deals: [] }

// Búsqueda global de la barra superior: empresas, contactos y deals a la vez.
export default function SearchBox() {
  const [text, setText] = useState('')
  const q = useDebouncedValue(text.trim())
  // Solo buscamos con 2 o más caracteres (con menos, la API devuelve vacío):
  // pasar `null` al hook significa "no hagas ninguna petición".
  const search = useApiGet(q.length >= 2 ? '/search' + query({ q }) : null)
  const results = search.data ?? EMPTY
  const [open, setOpen] = useState(false)
  // useRef guarda una referencia al elemento del DOM sin provocar re-renders.
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  // Cerrar al hacer clic fuera del buscador. Registramos el listener en el
  // documento y lo quitamos en la limpieza para no dejarlo "colgado".
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Atajo de teclado: Ctrl+K (o Cmd+K en Mac) lleva el foco al buscador.
  useEffect(() => {
    function handleShortcut(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [])

  function select() {
    setText('')
    setOpen(false)
  }

  // Al perder el foco (p. ej. con Tab) cerramos, salvo que el foco pase a
  // otro elemento dentro del propio buscador (un enlace de resultados).
  function handleBlur(e) {
    if (!boxRef.current.contains(e.relatedTarget)) setOpen(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const total = results.companies.length + results.contacts.length + results.deals.length
  const showDropdown = open && q.length >= 2

  return (
    <div className="relative w-full max-w-md" ref={boxRef} onBlur={handleBlur} onKeyDown={handleKeyDown}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        placeholder="Buscar empresas, contactos, deals…"
        aria-label="Búsqueda global"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        className="h-9 w-full rounded-md border border-border bg-muted/60 pr-14 pl-9 text-sm placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:ring-2 focus:ring-ring/50 focus:outline-none"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-border bg-card px-1.5 text-[10px] font-medium text-muted-foreground sm:block">
        Ctrl K
      </kbd>

      {showDropdown && (
        <div
          role="listbox"
          className="animate-pop-in absolute top-full right-0 left-0 z-40 mt-1.5 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card p-1.5 shadow-xl"
        >
          {search.error && <p className="px-3 py-2 text-sm text-danger">{search.error}</p>}
          {search.loading && total === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Buscando…</p>}
          {!search.error && !search.loading && total === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados para “{q}”.</p>
          )}

          <ResultGroup title="Empresas" items={results.companies}>
            {(c) => (
              <ResultLink to={`/companies/${c.id}`} onClick={select} icon={Building2} label={c.name} />
            )}
          </ResultGroup>
          <ResultGroup title="Contactos" items={results.contacts}>
            {(c) => (
              <ResultLink to={`/contacts/${c.id}`} onClick={select} icon={User} label={c.name} meta={c.company_name} />
            )}
          </ResultGroup>
          <ResultGroup title="Deals" items={results.deals}>
            {(d) => (
              <ResultLink to={`/deals/${d.id}`} onClick={select} icon={CircleDollarSign} label={d.title}
                meta={formatMoney(d.value)} />
            )}
          </ResultGroup>
        </div>
      )}
    </div>
  )
}

// Un grupo de resultados con título. `children` es una función que pinta
// cada elemento (patrón "render prop").
function ResultGroup({ title, items, children }) {
  if (items.length === 0) return null
  return (
    <div className="py-1">
      <div className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{children(item)}</li>
        ))}
      </ul>
    </div>
  )
}

function ResultLink({ to, onClick, icon: Icon, label, meta }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-accent focus:bg-accent focus:outline-none"
    >
      <Icon className="size-4 text-muted-foreground" />
      <span className="truncate">{label}</span>
      {meta && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{meta}</span>}
    </Link>
  )
}
