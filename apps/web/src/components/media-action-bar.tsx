import { AnimatePresence, motion } from 'motion/react'
import { Copy, Download, ExternalLink, Image as ImageIcon, Images, Trash2 } from 'lucide-react'
import { motionFadeRise, motionFast, motionMountFade } from '@sunnygen/ui'
import { useEffect, useState } from 'react'

export const ACTION_CLASS =
  'border-line bg-surface text-ink/65 hover:border-ink/25 hover:text-ink inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-[color,border-color,background-color,transform] active:scale-[0.97] disabled:opacity-50 motion-reduce:active:scale-100'

async function clipboardPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare the image.')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Could not prepare the image.'))),
      'image/png',
    )
  })
}

async function copyImage(url: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Image unavailable')
  const png = await clipboardPng(await response.blob())
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}

export function MediaActionBar({
  prompt,
  url,
  image,
  downloadUrl,
  referenceCount = 0,
  onShowReferences,
  onDelete,
  className,
}: {
  prompt: string
  url: string
  image: boolean
  downloadUrl?: string
  referenceCount?: number
  onShowReferences?: () => void
  onDelete: () => Promise<void>
  className?: string
}) {
  const [busy, setBusy] = useState<'copy-image' | 'delete' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2_000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const copyPrompt = async () => {
    setError(null)
    try {
      await navigator.clipboard.writeText(prompt)
      setNotice('Prompt copied')
    } catch {
      setError('Could not copy the prompt.')
    }
  }

  const copy = async () => {
    setBusy('copy-image')
    setError(null)
    try {
      await copyImage(url)
      setNotice('Image copied')
    } catch {
      setError('Could not copy the image. Use View full instead.')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('delete')
    setError(null)
    try {
      await onDelete()
    } catch {
      setError('Could not delete this render.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={copyPrompt} className={ACTION_CLASS}>
          <Copy size={13} /> Copy prompt
        </button>
        <a href={downloadUrl ?? `${url}?download=1`} download className={ACTION_CLASS}>
          <Download size={13} /> Download
        </a>
        {image ? (
          <>
            <a href={url} target="_blank" rel="noreferrer" className={ACTION_CLASS}>
              <ExternalLink size={13} /> View full
            </a>
            <button type="button" onClick={copy} disabled={busy === 'copy-image'} className={ACTION_CLASS}>
              <ImageIcon size={13} />
              <span key={busy === 'copy-image' ? 'busy' : 'idle'} className={motionMountFade}>
                {busy === 'copy-image' ? 'Copying…' : 'Copy image'}
              </span>
            </button>
          </>
        ) : null}
        {referenceCount > 0 && onShowReferences ? (
          <button type="button" onClick={onShowReferences} className={ACTION_CLASS}>
            <Images size={13} /> References ({referenceCount})
          </button>
        ) : null}
        <button
          type="button"
          onClick={remove}
          disabled={busy === 'delete'}
          className={`${ACTION_CLASS} text-error/70 hover:border-error/30 hover:text-error`}
        >
          <Trash2 size={13} />
          <span key={busy === 'delete' ? 'busy' : 'idle'} className={motionMountFade}>
            {busy === 'delete' ? 'Deleting…' : 'Delete'}
          </span>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {notice ? (
          <motion.p
            key="notice"
            variants={motionFadeRise}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={motionFast}
            className="text-success/80 mt-2 text-[10.5px]"
          >
            {notice}
          </motion.p>
        ) : null}
        {error ? (
          <motion.p
            key="error"
            variants={motionFadeRise}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={motionFast}
            className="text-error/80 mt-2 text-[10.5px]"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
