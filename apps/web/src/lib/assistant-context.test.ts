import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getAssistantSession,
  getPromptContext,
  insertIntoPrompt,
  mergePrompt,
  registerPromptContext,
  rememberAssistantSession,
  resetAssistantStore,
  updatePromptContext,
} from './assistant-context'

test('inserts the page prompt into the assistant input', () => {
  resetAssistantStore()
  assert.equal(insertIntoPrompt('anything'), false)

  const received: string[] = []
  registerPromptContext({
    source: 'home',
    label: 'Home prompt',
    value: 'a quiet portrait',
    expanded: false,
    apply: (value) => received.push(value),
  })

  assert.equal(insertIntoPrompt('rewrite this'), true)
  assert.deepEqual(received, ['rewrite this'])
  assert.equal(insertIntoPrompt('   '), false)
})

test('writes an assistant reply back to the active page prompt', () => {
  resetAssistantStore()
  let pagePrompt = 'a quiet portrait'
  registerPromptContext({
    source: 'home',
    label: 'Home prompt',
    value: pagePrompt,
    expanded: false,
    apply: (value) => {
      pagePrompt = value
    },
  })

  assert.equal(insertIntoPrompt('a quiet portrait, warm rim light'), true)
  assert.equal(pagePrompt, 'a quiet portrait, warm rim light')
})

test('tracks the focused prompt and ignores updates from another page', () => {
  resetAssistantStore()
  registerPromptContext({
    source: 'studio',
    label: 'Studio direction',
    value: 'tailored linen',
    expanded: false,
    apply: () => undefined,
  })

  updatePromptContext('home', 'ignored', false)
  assert.equal(getPromptContext()?.value, 'tailored linen')

  updatePromptContext('studio', 'tailored linen, golden hour', true)
  assert.equal(getPromptContext()?.value, 'tailored linen, golden hour')
  assert.equal(getPromptContext()?.expanded, true)
})

test('keeps the newer page prompt when the previous page unmounts', () => {
  resetAssistantStore()
  const releaseHome = registerPromptContext({
    source: 'home',
    label: 'Home prompt',
    value: 'home draft',
    expanded: false,
    apply: () => undefined,
  })
  releaseHome()

  registerPromptContext({
    source: 'studio',
    label: 'Studio direction',
    value: 'studio draft',
    expanded: false,
    apply: () => undefined,
  })
  const releaseStudio = registerPromptContext({
    source: 'studio',
    label: 'Studio direction',
    value: 'studio draft',
    expanded: false,
    apply: () => undefined,
  })

  releaseHome()
  assert.equal(getPromptContext()?.source, 'studio')
  releaseStudio()
  assert.equal(getPromptContext(), null)
})

test('appends a prompt without duplicating blank space', () => {
  assert.equal(mergePrompt('', 'a shot'), 'a shot')
  assert.equal(mergePrompt('existing', 'a shot'), 'existing\n\na shot')
  assert.equal(mergePrompt('existing\n\n', 'a shot'), 'existing\n\na shot')
  assert.equal(mergePrompt('existing', '   '), 'existing')
})

test('round trips the video page prompt through the assistant', () => {
  resetAssistantStore()
  let videoPrompt = ''
  registerPromptContext({
    source: 'video',
    label: 'Video prompt',
    value: videoPrompt,
    expanded: false,
    apply: (value) => {
      videoPrompt = value
    },
  })

  updatePromptContext('video', 'a slow dolly through a workshop', false)
  assert.equal(getPromptContext()?.source, 'video')
  assert.equal(getPromptContext()?.value, 'a slow dolly through a workshop')

  assert.equal(insertIntoPrompt('a slow dolly through a workshop, golden hour'), true)
  assert.equal(videoPrompt, 'a slow dolly through a workshop, golden hour')
})

test('remembers the current session for the panel', () => {
  resetAssistantStore()
  assert.equal(getAssistantSession(), null)
  rememberAssistantSession('chat-1')
  assert.equal(getAssistantSession(), 'chat-1')
  rememberAssistantSession(null)
  assert.equal(getAssistantSession(), null)
})
