export interface AssistantShortcutEvent {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  defaultPrevented?: boolean
}

export function isAssistantShortcut(event: AssistantShortcutEvent): boolean {
  if (event.defaultPrevented || event.altKey || event.shiftKey) return false
  if (!event.metaKey && !event.ctrlKey) return false
  return event.key.toLowerCase() === 'j'
}

export function assistantShortcutLabel(platform = ''): string {
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘J' : 'Ctrl J'
}
