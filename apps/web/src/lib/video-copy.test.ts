import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { VideoShot } from '@sunnygen/core'
import { copyShotJobs } from './video-copy'

function shot(start: number, end: number, prompt = `shot ${start} to ${end}`): VideoShot {
  return {
    start,
    end,
    subject: 'a room',
    action: 'pans',
    motion: 'slow',
    camera: 'push in',
    lighting: 'window light',
    prompt,
  }
}

const FRAMES = [
  { id: 'f0', atSeconds: 0 },
  { id: 'f1', atSeconds: 3 },
  { id: 'f2', atSeconds: 6 },
]

test('each shot maps to the frames on either side', () => {
  const { jobs } = copyShotJobs({
    shots: [shot(0, 3), shot(3, 6)],
    frames: FRAMES,
    stylePrompt: 'warm film',
  })
  assert.deepEqual(
    jobs.map((job) => job.assetIds),
    [
      ['f0', 'f1'],
      ['f1', 'f2'],
    ],
  )
  assert.match(jobs[0]?.prompt ?? '', /warm film/)
  assert.deepEqual(
    jobs.map((job) => job.shotIndex),
    [0, 1],
  )
})

test('a shot with no end frame is refused, not guessed', () => {
  const { error, jobs } = copyShotJobs({
    shots: [shot(0, 6)],
    frames: [{ id: 'only', atSeconds: 0 }],
    stylePrompt: '',
  })
  assert.equal(jobs.length, 0)
  assert.match(error ?? '', /shot 1/)
})

test('more shots than the cap is refused before submit', () => {
  const shots = Array.from({ length: 25 }, (_value, index) => shot(index, index + 1))
  const { error, jobs } = copyShotJobs({ shots, frames: FRAMES, stylePrompt: '' })
  assert.equal(jobs.length, 0)
  assert.match(error ?? '', /limit is 24/)
})

test('a tie between two frames goes to the earlier one', () => {
  const { jobs } = copyShotJobs({
    shots: [shot(1.5, 4.5)],
    frames: [
      { id: 'early', atSeconds: 1 },
      { id: 'late', atSeconds: 2 },
      { id: 'end-early', atSeconds: 4 },
      { id: 'end-late', atSeconds: 5 },
    ],
    stylePrompt: '',
  })
  assert.deepEqual(jobs[0]?.assetIds, ['early', 'end-early'])
})
