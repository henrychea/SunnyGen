import type { StudioKind } from '@sunnygen/core'
import { Button, Dialog, DialogSurface, Label, cn } from '@sunnygen/ui'
import { FileArchive, FolderUp, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { PackImportResult } from '~/server/pack-import.server'

type FolderPick = { files: File[]; paths: string[] }

const KINDS: StudioKind[] = ['pose', 'garment', 'scene', 'avatar']

export function StudioPackDialog({
  open,
  onOpenChange,
  kind,
  onImported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: StudioKind
  onImported: () => void
}) {
  const [zip, setZip] = useState<File | null>(null)
  const [folder, setFolder] = useState<FolderPick | null>(null)
  const [mapping, setMapping] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PackImportResult | null>(null)
  const zipRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const mappingRef = useRef<HTMLInputElement>(null)

  const pickZip = (file: File | undefined) => {
    if (!file) return
    setFolder(null)
    setResult(null)
    setError(null)
    setZip(file)
  }

  const pickFolder = (list: FileList | null) => {
    if (!list?.length) return
    const files = Array.from(list)
    setZip(null)
    setResult(null)
    setError(null)
    setFolder({
      files,
      paths: files.map((file) => {
        const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
        return relative && relative.length > 0 ? relative : file.name
      }),
    })
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('kind', kind)
      if (zip) form.set('pack', zip)
      if (folder) {
        for (const file of folder.files) form.append('files', file)
        form.set('paths', JSON.stringify(folder.paths))
      }
      if (mapping) form.set('mapping', mapping)

      const response = await fetch('/api/studio-import', { method: 'POST', body: form })
      const payload = (await response.json()) as PackImportResult & { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Import failed')
      setResult(payload)
      onImported()
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const source = zip?.name ?? (folder ? `${folder.files.length} files` : null)
  const canSubmit = Boolean(zip || folder) && !busy

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <DialogSurface className="w-[min(94vw,600px)]">
        <div className="flex items-center justify-between">
          <Dialog.Title className="font-display text-[16px] font-semibold">Import {kind} pack</Dialog.Title>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-ink/40 hover:bg-ink/5 grid size-8 place-items-center rounded-lg"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <p className="text-ink/50 mt-1 text-[11.5px]">
          Drop in a <strong>.zip</strong> or a folder of images. A{' '}
          <code className="bg-ink/[0.05] rounded px-1 py-0.5">sunnygen-pack.json</code> at the pack root is
          read automatically; items without a kind fall back to <strong>{kind}</strong>.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => zipRef.current?.click()}
              className={cn(
                'border-line bg-surface/60 text-ink/55 hover:border-accent/40 hover:text-accent flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 text-center transition-colors',
                zip ? 'border-accent/50 text-accent' : '',
              )}
            >
              <FileArchive size={18} />
              <span className="text-[11.5px] font-medium">{zip ? zip.name : 'Choose .zip'}</span>
              <span className="text-ink/35 text-[10px]">images + manifest</span>
            </button>
            <button
              type="button"
              onClick={() => folderRef.current?.click()}
              className={cn(
                'border-line bg-surface/60 text-ink/55 hover:border-accent/40 hover:text-accent flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 text-center transition-colors',
                folder ? 'border-accent/50 text-accent' : '',
              )}
            >
              <FolderUp size={18} />
              <span className="text-[11.5px] font-medium">
                {folder ? `${folder.files.length} files` : 'Choose folder'}
              </span>
              <span className="text-ink/35 text-[10px]">images on disk</span>
            </button>
          </div>

          <div className="border-line flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
            <div>
              <Label>Mapping file</Label>
              <p className="text-ink/40 text-[10px]">Optional JSON that overrides names, kinds, and data.</p>
            </div>
            <div className="flex items-center gap-2">
              {mapping ? (
                <span className="text-ink/50 max-w-32 truncate text-[10.5px]">{mapping.name}</span>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => mappingRef.current?.click()}>
                {mapping ? 'Change' : 'Attach'}
              </Button>
              {mapping ? (
                <Button size="sm" variant="ghost" onClick={() => setMapping(null)}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="border-error/20 bg-error/5 text-error rounded-xl border px-3 py-2 text-[11.5px]">
              {error}
            </div>
          ) : null}

          {result ? (
            <div className="border-line bg-canvas/60 rounded-xl border px-3 py-2.5 text-[11.5px]">
              <p className="text-ink/80">
                Imported <strong>{result.imported.length}</strong>{' '}
                {result.imported.length === 1 ? 'item' : 'items'}
                {result.manifestPath ? ` from ${result.manifestPath}` : ''}.
              </p>
              {result.skipped.length > 0 ? (
                <p className="text-ink/45 mt-1">
                  Skipped {result.skipped.length}: {result.skipped[0]?.reason}
                  {result.skipped.length > 1 ? ` (+${result.skipped.length - 1} more)` : ''}
                </p>
              ) : null}
              {result.failed.length > 0 ? (
                <ul className="text-error/80 mt-1.5 list-disc pl-4">
                  {result.failed.slice(0, 5).map((failure) => (
                    <li key={failure.file}>
                      {failure.file}: {failure.error}
                    </li>
                  ))}
                  {result.failed.length > 5 ? <li>+{result.failed.length - 5} more failures</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <span className="text-ink/35 text-[10.5px]">
              {source ?? 'Packs can also hold all five angles of each pose, or prepped garment images.'}
            </span>
            <Button onClick={submit} disabled={!canSubmit} loading={busy}>
              <Upload size={14} /> Import
            </Button>
          </div>
        </div>

        <input
          ref={zipRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => {
            pickZip(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <input
          ref={folderRef}
          type="file"
          multiple
          className="hidden"
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={(event) => {
            pickFolder(event.target.files)
            event.target.value = ''
          }}
        />
        <input
          ref={mappingRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              setMapping(file)
              setResult(null)
            }
            event.target.value = ''
          }}
        />

        <p className="text-ink/30 mt-3 text-[10px]">
          Kinds: {KINDS.join(', ')}. Garments default to slot <em>top</em>, source <em>flat-lay</em>.
        </p>
      </DialogSurface>
    </Dialog.Root>
  )
}
