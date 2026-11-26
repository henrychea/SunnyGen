import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyTheme, parseThemeMode, readStoredTheme, resolveTheme, writeThemeMode } from './theme'

test('parseThemeMode falls back to system for anything unknown', () => {
  assert.equal(parseThemeMode('dark'), 'dark')
  assert.equal(parseThemeMode('light'), 'light')
  assert.equal(parseThemeMode('system'), 'system')
  assert.equal(parseThemeMode('DARK'), 'system')
  assert.equal(parseThemeMode(null), 'system')
})

test('resolveTheme follows the system preference only in system mode', () => {
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
  assert.equal(resolveTheme('light', true), 'light')
})

test('readStoredTheme survives missing and throwing storage', () => {
  assert.equal(readStoredTheme(null), 'system')
  assert.equal(readStoredTheme({ getItem: () => 'dark' }), 'dark')
  assert.equal(
    readStoredTheme({
      getItem: () => {
        throw new Error('blocked')
      },
    }),
    'system',
  )
})

test('writeThemeMode stores the mode and ignores a throwing storage', () => {
  const writes: Array<[string, string]> = []
  writeThemeMode('dark', { setItem: (key, value) => writes.push([key, value]) })
  assert.deepEqual(writes, [['sunnygen.theme', 'dark']])
  assert.doesNotThrow(() =>
    writeThemeMode('light', {
      setItem: () => {
        throw new Error('blocked')
      },
    }),
  )
})

test('applyTheme writes the resolved theme onto the supplied root', () => {
  const root = { dataset: {} } as HTMLElement
  assert.equal(applyTheme('system', root, true), 'dark')
  assert.equal(root.dataset.theme, 'dark')
  assert.equal(applyTheme('light', root, true), 'light')
  assert.equal(root.dataset.theme, 'light')
})
