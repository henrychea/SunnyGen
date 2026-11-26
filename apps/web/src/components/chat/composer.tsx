import { useEffect, useRef, type KeyboardEvent } from 'react'
import { ASSISTANT_MODELS, ASSISTANT_MODES, assistantMode, type AssistantModeId } from '@sunnygen/core'
import { Button, Selector, cn, motionFade, motionPop, type SelectorOption } from '@sunnygen/ui'
import { Send, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { ModelCombobox, type ModelOption } from '../model-combobox'

const MODEL_OPTIONS: ModelOption[] = ASSISTANT_MODELS.map((entry) => ({
  key: `assistant:${entry.id}`,
  label: entry.label,
  company: entry.id.startsWith('google/')
    ? 'Google'
    : entry.id.startsWith('anthropic/')
      ? 'Anthropic'
      : 'OpenRouter',
  provider: 'openrouter',
  providerLabel: 'OpenRouter',
  providers: [{ id: 'openrouter', label: 'OpenRouter' }],
  kind: 'text',
  price: null,
  sourceId: entry.id,
  supported: true,
  modelId: entry.id,
}))

const MODE_OPTIONS: SelectorOption[] = ASSISTANT_MODES.map((entry) => ({
  key: entry.id,
  label: entry.label,
  description: entry.description,
  group: entry.group,
}))

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
  compact = false,
  autoFocus = false,
  menuClassName,
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
  compact?: boolean
  autoFocus?: boolean
  menuClassName?: string
}) {
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`
  }, [value])

  useEffect(() => {
    if (autoFocus) textarea.current?.focus()
  }, [autoFocus])

  const canSend = !streaming && !sendBlocked && value.trim().length > 0
  const definition = assistantMode(mode)

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (canSend) onSend()
  }

  return (
    <div
      className={cn(
        'border-line/70 bg-surface/55 shrink-0 border-t',
        compact ? 'px-3 py-2.5' : 'px-3 py-3 md:px-6',
      )}
    >
      <div className={cn('mx-auto w-full', compact ? 'max-w-none' : 'max-w-3xl')}>
        <div className="border-line-strong bg-surface focus-within:border-ink/20 rounded-2xl border p-2 transition-colors duration-150 ease-out">
          <textarea
            ref={textarea}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={streaming}
            placeholder="Ask anything, or paste a prompt to improve…"
            className={cn(
              'text-ink placeholder:text-ink/65 max-h-[200px] w-full resize-none bg-transparent px-2 py-2 text-[13.5px] leading-relaxed transition-[height,opacity] duration-150 ease-out outline-none disabled:opacity-60 motion-reduce:transition-none',
              compact ? 'min-h-10' : 'min-h-11',
            )}
            aria-label="Message"
          />

          <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1">
            <Selector
              value={mode}
              options={MODE_OPTIONS}
              onChange={(option) => onModeChange(option.key as AssistantModeId)}
              disabled={streaming}
              size="sm"
              className={compact ? 'w-[116px]' : 'w-[130px]'}
              ariaLabel="Response mode"
              menuMinWidth={250}
              showTriggerDescription={false}
              menuClassName={menuClassName}
            />

            <ModelCombobox
              value={model}
              options={MODEL_OPTIONS}
              size="sm"
              disabled={streaming}
              className={compact ? 'w-[150px]' : 'w-[168px]'}
              ariaLabel="Model"
              menuClassName={menuClassName}
              onChange={(entry) => {
                if (entry.modelId) onModelChange(entry.modelId)
              }}
            />

            <div className="ml-auto flex items-center gap-2">
              <AnimatePresence initial={false} mode="popLayout">
                {streaming ? (
                  <motion.div
                    key="stop"
                    variants={motionPop}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                  >
                    <Button variant="outline" size="sm" onClick={onStop} aria-label="Stop generating">
                      <Square size={11} fill="currentColor" /> Stop
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="send"
                    variants={motionPop}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                  >
                    <Button size="sm" onClick={onSend} disabled={!canSend} aria-label="Send message">
                      <Send size={13} />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <p
          className={cn(
            'text-ink/65 mt-1.5 px-1 text-[11px] leading-relaxed',
            compact ? 'hidden' : 'hidden sm:block',
          )}
        >
          Enter sends · Shift+Enter adds a line ·{' '}
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={mode}
              variants={motionFade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="inline-block"
            >
              {definition.description}
            </motion.span>
          </AnimatePresence>
        </p>
      </div>
    </div>
  )
}
