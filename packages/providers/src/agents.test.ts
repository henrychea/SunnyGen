import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agentCommand, runAgentShotList, type AgentTextResult } from './agents'

const VALID_LIST = JSON.stringify({
  shots: [
    {
      start: 0,
      end: 3,
      subject: 'a room',
      action: 'pans',
      motion: 'slow',
      camera: 'push in',
      lighting: 'window light',
      prompt: 'a slow push in across the room',
    },
  ],
})

const FRAMES = ['/data/media/2026/11/a.jpg', '/data/media/2026/11/b.jpg']

test('each agent gets a non-interactive print command', () => {
  assert.deepEqual(agentCommand('claude', { prompt: 'hi' }), ['-p', 'hi'])
  assert.deepEqual(agentCommand('codex', { prompt: 'hi' }), ['exec', '--skip-git-repo-check', 'hi'])
  assert.deepEqual(agentCommand('omp', { prompt: 'hi' }), ['-p', 'hi'])
  assert.deepEqual(agentCommand('pi', { prompt: 'hi' }), ['-p', 'hi'])
})

test('each agent gets the frames in the shape its CLI accepts', () => {
  assert.deepEqual(agentCommand('claude', { prompt: 'hi', images: FRAMES }), [
    '-p',
    'hi',
    '--add-dir',
    '/data/media/2026/11',
  ])
  assert.deepEqual(agentCommand('codex', { prompt: 'hi', images: FRAMES }), [
    'exec',
    '--skip-git-repo-check',
    '-i',
    '/data/media/2026/11/a.jpg',
    '-i',
    '/data/media/2026/11/b.jpg',
    'hi',
  ])
  assert.deepEqual(agentCommand('omp', { prompt: 'hi', images: FRAMES }), [
    '-p',
    '--add-dir=/data/media/2026/11',
    '@/data/media/2026/11/a.jpg',
    '@/data/media/2026/11/b.jpg',
    'hi',
  ])
  assert.deepEqual(agentCommand('pi', { prompt: 'hi', images: FRAMES }), [
    '-p',
    '@/data/media/2026/11/a.jpg',
    '@/data/media/2026/11/b.jpg',
    'hi',
  ])
})

test('frames in two directories each get an add-dir entry', () => {
  const images = ['/data/media/2026/10/a.jpg', '/data/media/2026/11/b.jpg']
  assert.deepEqual(agentCommand('claude', { prompt: 'hi', images }).slice(-4), [
    '--add-dir',
    '/data/media/2026/10',
    '--add-dir',
    '/data/media/2026/11',
  ])
})

test('a bad first answer triggers exactly one retry with the parse error', async () => {
  const prompts: string[] = []
  const seen: Array<string[] | undefined> = []
  const result = await runAgentShotList({
    agent: 'claude',
    prompt: 'p',
    images: FRAMES,
    durationSeconds: 6,
    runner: async ({ prompt, images }): Promise<AgentTextResult> => {
      prompts.push(prompt)
      seen.push(images)
      return prompts.length === 1 ? { ok: true, text: 'sorry, I cannot' } : { ok: true, text: VALID_LIST }
    },
  })
  assert.equal(prompts.length, 2)
  assert.match(prompts[1] ?? '', /JSON/)
  assert.deepEqual(seen, [FRAMES, FRAMES])
  assert.ok('shots' in result)
})

test('two bad answers fail with the last parse error', async () => {
  const result = await runAgentShotList({
    agent: 'codex',
    prompt: 'p',
    durationSeconds: 6,
    runner: async () => ({ ok: true, text: 'no' }),
  })
  assert.ok('error' in result)
  assert.match(result.error, /JSON/)
})
