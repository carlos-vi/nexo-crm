import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn.js'
import Button from './Button.jsx'
import { ConfirmContext, ToastContext } from './feedback-context.js'
import Modal from './Modal.jsx'

/*
 * Avisos (toasts) y diálogos de confirmación, disponibles en toda la app.
 *
 * Usan un "contexto" de React: FeedbackProvider envuelve la app y cualquier
 * componente puede pedir las funciones con un hook, sin pasarlas por props:
 *
 *   const toast = useToast()
 *   toast.success('Deal creado')
 *
 *   const confirm = useConfirm()
 *   if (await confirm({ title: '¿Borrar deal?', danger: true })) { ... }
 */

const toastStyles = {
  success: { icon: CheckCircle2, color: 'text-success' },
  error: { icon: XCircle, color: 'text-danger' },
  info: { icon: Info, color: 'text-primary' },
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])
  const show = useCallback(
    (type, message) => {
      const id = nextId.current++
      setToasts((list) => [...list, { id, type, message }])
      setTimeout(() => dismiss(id), 4000)
    },
    [dismiss],
  )
  // useState con función: el objeto se crea una sola vez y su identidad no
  // cambia entre renders (no provoca efectos ni renders innecesarios).
  const [toast] = useState(() => ({
    success: (msg) => show('success', msg),
    error: (msg) => show('error', msg),
    info: (msg) => show('info', msg),
  }))

  // Confirmación basada en promesas: confirm() devuelve una Promise que se
  // resuelve con true/false cuando el usuario pulsa un botón.
  const [dialog, setDialog] = useState(null)
  const confirm = useCallback(
    (options) => new Promise((resolve) => setDialog({ ...options, resolve })),
    [],
  )
  const close = (answer) => {
    dialog.resolve(answer)
    setDialog(null)
  }

  return (
    <ToastContext.Provider value={toast}>
      <ConfirmContext.Provider value={confirm}>
        {children}

        <Modal
          open={Boolean(dialog)}
          onClose={() => close(false)}
          size="sm"
          title={dialog?.title}
          footer={
            <>
              <Button onClick={() => close(false)}>Cancelar</Button>
              <Button variant={dialog?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
                {dialog?.confirmLabel ?? (dialog?.danger ? 'Borrar' : 'Confirmar')}
              </Button>
            </>
          }
        >
          <div className="flex gap-3">
            {dialog?.danger && (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                <AlertTriangle className="size-4" />
              </span>
            )}
            <p className="text-sm text-muted-foreground">{dialog?.message ?? 'Esta acción no se puede deshacer.'}</p>
          </div>
        </Modal>

        {createPortal(
          <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2">
            {toasts.map((t) => {
              const { icon: Icon, color } = toastStyles[t.type]
              return (
                <div
                  key={t.id}
                  role="status"
                  className="animate-pop-in pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-lg"
                >
                  <Icon className={cn('mt-0.5 size-4 shrink-0', color)} />
                  <p className="flex-1 text-sm">{t.message}</p>
                  <button onClick={() => dismiss(t.id)} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
                    <X className="size-3.5" />
                  </button>
                </div>
              )
            })}
          </div>,
          document.body,
        )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  )
}
