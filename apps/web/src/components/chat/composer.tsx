import { useEffect, useRef, type KeyboardEvent } from 'react'
import {
  ASSISTANT_MODELS,
  ASSISTANT_MODES,
  assistantMode,
  type AssistantModeGroup,
  type AssistantModeId,
} from '@sunnygen/core'
import { Button } from '@sunnygen/ui'
import { Send, Square } from 'lucide-react'

const MODE_GROUPS: readonly AssistantModeGroup[] = ['Basic', 'Refusal reduction']

const selectClass =
  'h-8 max-w-[11rem] truncate rounded-lg border border-line bg-surface px-2 text-[11.5px] text-ink/65 outline-none transition-colors hover:text-ink focus-visible:border-accent/45 focus-visible:ring-2 focus-visible:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-50'

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  sendBlocked,
  mode,
  onModeChange,
  model,
  onModelChange,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  streaming: boolean
  sendBlocked: boolean
  mode: AssistantModeId
  onModeChange: (mode: AssistantModeId) => void
  model: string
  onModelChange: (model: string) => void
}) {
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`
  }, [value])

  useEffect(() => {
    textarea.current?.focus()
  }, [])

  const canSend = !streaming && !sendBlocked && value.trim().length > 0
  const definition = assistantMode(mode)

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (canSend) onSend()
  }

  return (
    <div className="border-line/70 bg-surface/55 shrink-0 border-t px-3 py-3 md:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="border-line bg-surface focus-within:border-ink/20 rounded-2xl border p-2 shadow-[0_10px_30px_-24px_rgba(42,30,23,0.4)]">
          <textarea
            ref={textarea}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={streaming}
            placeholder="Ask anything, or paste a prompt to improve…"
            className="text-ink placeholder:text-ink/35 max-h-[200px] min-h-11 w-full resize-none bg-transparent px-2 py-2 text-[13.5px] leading-relaxed outline-none disabled:opacity-60"
            aria-label="Message"
          />

          <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1">
            <label className="sr-only" htmlFor="chat-mode">
              Response mode
            </label>
            <select
              id="chat-mode"
              value={mode}
              onChange={(event) => onModeChange(event.target.value as AssistantModeId)}
              disabled={streaming}
              className={selectClass}
              title={definition.description}
            >
              {MODE_GROUPS.map((group) => {
                const modes = ASSISTANT_MODES.filter((entry) => entry.group === group)
                if (modes.length === 0) return null
                return (
                  <optgroup key={group} label={group}>
                    {modes.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>

            <label className="sr-only" htmlFor="chat-model">
              Model
            </label>
            <select
              id="chat-model"
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              disabled={streaming}
              className={selectClass}
            >
              {ASSISTANT_MODELS.map((entry) => (
                <option key={entry.id} value={entry.id} title={entry.note}>
                  {entry.label}
                </option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-2">
              {streaming ? (
                <Button variant="outline" size="sm" onClick={onStop} aria-label="Stop generating">
                  <Square size={11} fill="currentColor" /> Stop
                </Button>
              ) : (
                <Button size="sm" onClick={onSend} disabled={!canSend} aria-label="Send message">
                  <Send size={13} />
                </Button>
              )}
            </div>
          </div>
        </div>

        <p className="text-ink/35 mt-1.5 hidden px-1 text-[10.5px] leading-relaxed sm:block">
          Enter sends · Shift+Enter adds a line · {definition.description}
        </p>
      </div>
    </div>
  )
}
