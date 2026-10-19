import { CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { api } from '../../api.js'
import { Button, ErrorMessage, Modal, useToast } from '../../components/ui'
import { cn } from '../../lib/cn.js'
import { downloadTemplate } from './helpers.js'

/**
 * Importación de un CSV en dos pasos:
 *   1. Se sube con ?dry_run=true: la API valida sin guardar y devuelve qué filas fallan.
 *   2. Si hay filas válidas, se vuelve a subir con ?dry_run=false para crearlas.
 *
 *   <ImportCsvModal endpoint="/companies/import" columns={[...]} required={['name']}
 *                   example={[...]} templateName="plantilla-empresas.csv"
 *                   onClose={...} onImported={...} />
 * El padre lo monta solo cuando está abierto, así el estado empieza limpio cada vez.
 */
export default function ImportCsvModal({
  title, endpoint, columns, required = [], example, templateName, notes, onClose, onImported,
}) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState(null) // respuesta del dry run
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function choose(selected) {
    if (!selected) return
    if (!selected.name.toLowerCase().endsWith('.csv')) {
      setError('El fichero debe tener extensión .csv')
      return
    }
    setFile(selected)
    setPreview(null)
    setError(null)
  }

  // FormData es el formato "multipart/form-data" que usan los formularios con ficheros.
  async function send(dryRun) {
    const form = new FormData()
    form.append('file', file)
    return api.post(`${endpoint}?dry_run=${dryRun}`, form)
  }

  async function validate() {
    setBusy(true)
    setError(null)
    try {
      setPreview(await send(true))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmImport() {
    setBusy(true)
    setError(null)
    try {
      const result = await send(false)
      toast.success(`${result.created} ${result.created === 1 ? 'fila importada' : 'filas importadas'}`)
      onImported?.()
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const footer = (
    <>
      <Button onClick={onClose} disabled={busy}>Cancelar</Button>
      {preview && preview.valid > 0 ? (
        <Button variant="primary" icon={Upload} loading={busy} onClick={confirmImport}>
          Importar {preview.valid} {preview.valid === 1 ? 'fila' : 'filas'}
        </Button>
      ) : (
        <Button variant="primary" loading={busy} disabled={!file || Boolean(preview)} onClick={validate}>
          Validar fichero
        </Button>
      )}
    </>
  )

  return (
    <Modal open onClose={onClose} title={title} size="lg" footer={footer}
      description="Sube un CSV con cabecera. Primero lo validamos; nada se guarda hasta que confirmes.">
      <div className="space-y-4">
        <div className="rounded-lg bg-muted/60 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-foreground">Columnas esperadas</p>
            <button
              type="button"
              onClick={() => downloadTemplate(columns, example, templateName)}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <Download className="size-3.5" /> Descargar plantilla
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {columns.map((col) => (
              <code key={col} className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px]">
                {col}
                {required.includes(col) && <span className="text-danger">*</span>}
              </code>
            ))}
          </div>
          <p className="mt-2 text-muted-foreground">
            Separador coma o punto y coma. Las columnas desconocidas se ignoran.
            {' '}<code className="font-mono">owner_email</code> vacío = tú serás el responsable.
            {notes && ` ${notes}`}
          </p>
        </div>

        {/* Zona de arrastrar y soltar: el <input type="file"> real está oculto. */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current.click()}
          onDragOver={(e) => {
            e.preventDefault() // sin esto el navegador abriría el fichero en vez de soltarlo aquí
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            choose(e.dataTransfer.files[0])
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
            dragging ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/50 hover:bg-muted/40',
          )}
        >
          <FileSpreadsheet className={cn('mb-2 size-8', file ? 'text-primary' : 'text-muted-foreground')} />
          {file ? (
            <>
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · haz clic para cambiarlo</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Arrastra aquí tu fichero CSV</p>
              <p className="text-xs text-muted-foreground">o haz clic para elegirlo (máx. 1 MB)</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              choose(e.target.files[0])
              e.target.value = '' // permite volver a elegir el mismo fichero
            }}
          />
        </div>

        <ErrorMessage>{error}</ErrorMessage>

        {preview && <ImportPreview result={preview} />}
      </div>
    </Modal>
  )
}

function ImportPreview({ result }) {
  const errorCount = result.errors.length
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-success-soft px-2.5 py-1 font-medium text-success">
          <CheckCircle2 className="size-4" /> {result.valid} {result.valid === 1 ? 'fila válida' : 'filas válidas'}
        </span>
        {errorCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-danger-soft px-2.5 py-1 font-medium text-danger">
            <XCircle className="size-4" /> {errorCount} con errores
          </span>
        )}
        <span className="self-center text-xs text-muted-foreground">de {result.total} en total</span>
      </div>

      {errorCount > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="w-16 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Fila</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Problema</th>
              </tr>
            </thead>
            <tbody>
              {result.errors.map((e) => (
                <tr key={e.row} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{e.row}</td>
                  <td className="px-3 py-2">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.valid > 0 ? (
        <p className="text-xs text-muted-foreground">
          {errorCount > 0 ? 'Las filas con errores se ignorarán. ' : ''}Pulsa «Importar» para crearlas.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">No hay filas que importar. Corrige el fichero y vuelve a subirlo.</p>
      )}
    </div>
  )
}
