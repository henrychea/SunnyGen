import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_COPY_SHOTS } from '@sunnygen/core'
import { inheritVisibility, parseShowinfoTimes, shotPromptTemplate } from './video-copy.server'

test('the agent prompt names the duration, the frames, and the JSON shape', () => {
  const prompt = shotPromptTemplate({
    durationSeconds: 12.5,
    frames: [
      { index: 0, atSeconds: 0, path: '/data/media/2026/11/a.jpg' },
      { index: 1, atSeconds: 6.25, path: '/data/media/2026/11/b.jpg' },
    ],
  })

  assert.match(prompt, /12\.5 seconds/)
  assert.match(prompt, /frame 1: 0\.00s \/data\/media\/2026\/11\/a\.jpg/)
  assert.match(prompt, /frame 2: 6\.25s \/data\/media\/2026\/11\/b\.jpg/)
  assert.match(prompt, /JSON/)
  for (const field of ['subject', 'action', 'motion', 'camera', 'lighting', 'prompt', 'start', 'end']) {
    assert.ok(prompt.includes(`"${field}"`), `prompt is missing ${field}`)
  }
  assert.ok(prompt.includes(`1 to ${MAX_COPY_SHOTS} shots`))
  assert.match(prompt, /2000 characters/)
})

// Extraction and joining both store through this, so one test covers the rule that a copy's own
// media never outlives its source's visibility class.
test('frames and joined clips take their source visibility', () => {
  assert.deepEqual(inheritVisibility({ nsfw: true }), { nsfw: true })
  assert.deepEqual(inheritVisibility({ nsfw: false }), { nsfw: false })
})

test('showinfo timestamps come out in order', () => {
  const stderr = [
    '[Parsed_showinfo_1 @ 0x1] n:   0 pts:  36864 pts_time:3 duration: 1024 duration_time:0.0833333',
    '[Parsed_showinfo_1 @ 0x1] n:   1 pts:  73728 pts_time:6.5 duration: 1024 duration_time:0.0833333',
    'frame=    2 fps=0.0 q=2.0 Lsize=N/A time=00:00:00.16 bitrate=N/A',
  ].join('\n')
  assert.deepEqual(parseShowinfoTimes(stderr), [3, 6.5])
  assert.deepEqual(parseShowinfoTimes('no frames here'), [])
})
