import { useEffect, useRef, useSyncExternalStore } from 'react'

export type PromptSource = 'home' | 'studio' | 'video'

export interface PromptContext {
  source: PromptSource
  label: string
  value: string
  expanded: boolean
  apply: (value: string) => void
}

let promptContext: PromptContext | null = null
let lastSessionId: string | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function registerPromptContext(context: PromptContext): () => void {
  promptContext = context
  emit()
  return () => {
    if (promptContext?.source !== context.source) return
    promptContext = null
    emit()
  }
}

export function updatePromptContext(source: PromptSource, value: string, expanded: boolean): void {
  if (!promptContext || promptContext.source !== source) return
  if (promptContext.value === value && promptContext.expanded === expanded) return
  promptContext = { ...promptContext, value, expanded }
  emit()
}

export function getPromptContext(): PromptContext | null {
  return promptContext
}

export function insertIntoPrompt(text: string): boolean {
  if (!promptContext || !text.trim()) return false
  promptContext.apply(text)
  return true
}

export function mergePrompt(draft: string, prompt: string): string {
  const addition = prompt.trim()
  if (!addition) return draft
  const base = draft.trimEnd()
  return base ? `${base}\n\n${addition}` : addition
}

export function rememberAssistantSession(id: string | null): void {
  if (lastSessionId === id) return
  lastSessionId = id
  emit()
}

export function getAssistantSession(): string | null {
  return lastSessionId
}

export function usePromptContext(): PromptContext | null {
  return useSyncExternalStore(subscribe, getPromptContext, () => null)
}

export function useAssistantSession(): string | null {
  return useSyncExternalStore(subscribe, getAssistantSession, () => null)
}

export function usePromptBridge(
  source: PromptSource,
  label: string,
  value: string,
  apply: (value: string) => void,
  expanded = false,
): void {
  const applyRef = useRef(apply)
  const latest = useRef({ value, expanded })

  useEffect(() => {
    applyRef.current = apply
  }, [apply])

  useEffect(() => {
    latest.current = { value, expanded }
  }, [expanded, value])

  useEffect(() => {
    return registerPromptContext({
      source,
      label,
      value: latest.current.value,
      expanded: latest.current.expanded,
      apply: (next) => applyRef.current(next),
    })
  }, [source, label])

  useEffect(() => {
    updatePromptContext(source, value, expanded)
  }, [source, value, expanded])
}

export function resetAssistantStore(): void {
  promptContext = null
  lastSessionId = null
  emit()
}
