import { AVATAR_PROFILE_FIELD_LABELS, type AvatarProfile } from '@sunnygen/core'
import { Button, Label, Textarea, toast } from '@sunnygen/ui'
import { useState } from 'react'
import { extractAvatarFromPromptFn } from '~/server/studio.functions'

export function MissingFields({ missing }: { missing: string[] }) {
  if (missing.length === 0) {
    return <p className="text-ink/70 text-[11px]">Nothing missing. Every field came from the prompt.</p>
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Missing from the prompt</Label>
      <div className="flex flex-wrap gap-1.5">
        {missing.map((path) => (
          <span
            key={path}
            className="border-line-strong bg-canvas/40 text-ink/70 rounded-full border px-2 py-0.5 text-[11px]"
          >
            {AVATAR_PROFILE_FIELD_LABELS[path] ?? path} is missing
          </span>
        ))}
      </div>
    </div>
  )
}

export function PromptExtract({ onExtracted }: { onExtracted: (profile: AvatarProfile) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[] | null>(null)

  const extract = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await extractAvatarFromPromptFn({ data: { prompt: text.trim() } })
      setMissing(result.missing)
      onExtracted(result.profile)
      toast('Profile extracted. Fill in what is missing.', { tone: 'info' })
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : 'Could not extract the profile')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setError(null)
        }}
        aria-label="Pasted prompt"
        placeholder="Paste your image prompt"
        className="min-h-32"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => void extract()}
          loading={busy}
          disabled={busy || text.trim().length < 20}
          className="min-h-11 text-[11px] sm:min-h-9"
        >
          Extract
        </Button>
        <span className="text-ink/65 text-[11px]">
          {text.trim().length < 20
            ? 'Paste at least 20 characters.'
            : 'Nothing is saved until you press Save.'}
        </span>
      </div>
      {error ? (
        <p
          role="alert"
          className="border-error/20 bg-error/5 text-error rounded-lg border px-3 py-2 text-[11px]"
        >
          {error}
        </p>
      ) : null}
      {missing ? <MissingFields missing={missing} /> : null}
    </div>
  )
}
