import { X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn.js'

const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }

/**
 * Ventana modal. Se cierra con Escape, con la X o haciendo clic fuera.
 *   <Modal open={open} onClose={() => setOpen(false)} title="Nuevo deal" footer={...}>
 *     ...contenido...
 *   </Modal>
 *
 * createPortal la pinta directamente en <body>: así ningún contenedor con
 * overflow o z-index de la página puede recortarla.
 */
export default function Modal({ open, onClose, title, description, size = 'md', footer, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    // Evita que la página de detrás haga scroll mientras el modal está abierto.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:pt-[10vh]">
      <div className="animate-fade-in fixed inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('animate-pop-in relative w-full rounded-xl border border-border bg-card shadow-2xl', widths[size])}
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 rounded-b-xl border-t border-border bg-muted/50 px-6 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
