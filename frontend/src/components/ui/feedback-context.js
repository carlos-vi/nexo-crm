import { createContext, useContext } from 'react'

// Contextos de avisos y confirmaciones (el proveedor está en Feedback.jsx).
export const ToastContext = createContext(null)
export const ConfirmContext = createContext(null)

export const useToast = () => useContext(ToastContext)
export const useConfirm = () => useContext(ConfirmContext)
