import assert from 'node:assert/strict'
import test from 'node:test'
import { assistantShortcutLabel, isAssistantShortcut } from './assistant-shortcut'

test('toggles on Cmd+J and Ctrl+J', () => {
  assert.equal(isAssistantShortcut({ key: 'j', metaKey: true }), true)
  assert.equal(isAssistantShortcut({ key: 'J', metaKey: true }), true)
  assert.equal(isAssistantShortcut({ key: 'j', ctrlKey: true }), true)
  assert.equal(isAssistantShortcut({ key: 'J', ctrlKey: true }), true)
})

test('ignores bare or modified keys that are not the shortcut', () => {
  assert.equal(isAssistantShortcut({ key: 'j' }), false)
  assert.equal(isAssistantShortcut({ key: 'k', metaKey: true }), false)
  assert.equal(isAssistantShortcut({ key: 'j', metaKey: true, altKey: true }), false)
  assert.equal(isAssistantShortcut({ key: 'j', metaKey: true, shiftKey: true }), false)
})

test('ignores an already handled event', () => {
  assert.equal(isAssistantShortcut({ key: 'j', metaKey: true, defaultPrevented: true }), false)
})

test('labels the shortcut per platform', () => {
  assert.equal(assistantShortcutLabel('MacIntel'), '⌘J')
  assert.equal(assistantShortcutLabel('Linux x86_64'), 'Ctrl J')
})
