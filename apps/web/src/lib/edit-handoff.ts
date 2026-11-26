import type { ReferenceItem } from './reference-images'

let pending: ReferenceItem[] = []

export function setEditHandoff(items: ReferenceItem[]): void {
  pending = items
}

export function takeEditHandoff(): ReferenceItem[] {
  const items = pending
  pending = []
  return items
}
