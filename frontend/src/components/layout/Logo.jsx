// Logotipo de la aplicación (el mismo dibujo que public/favicon.svg).
export default function Logo({ collapsed = false }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path d="M9 23V9l14 14V9" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!collapsed && <span className="text-[15px] font-semibold tracking-tight">Nexo CRM</span>}
    </span>
  )
}
