import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_AVATAR_PROFILE, getModel, type VideoModelDefinition } from '@sunnygen/core'
import type { ReferenceItem } from './reference-images'
import { videoEditJobs } from './video-edit'
import { videoEditOnly } from './video-flow'

const BASE = getModel('veo3') as VideoModelDefinition

const EDIT_CAPABILITY = {
  endpoint: 'vendor/video-to-video',
  videoField: 'video_url',
  fields: ['reference_images'],
  fieldsMode: 'array' as const,
  maxImages: 4,
  durations: [],
  resolutions: [],
  ratios: [],
  audio: false,
}

const EDIT_MODEL: VideoModelDefinition = { ...BASE, videoModes: { edit: EDIT_CAPABILITY } }

const TEXT_AND_EDIT_MODEL: VideoModelDefinition = {
  ...BASE,
  videoModes: { ...BASE.videoModes, edit: EDIT_CAPABILITY },
}

const VIDEO = (id: string): ReferenceItem => ({ id, name: id, url: `url-${id}`, kind: 'video' })

test('one job per target video, target asset first', () => {
  const { error, jobs } = videoEditJobs({
    targets: [VIDEO('v1'), VIDEO('v2')],
    references: [{ id: 'r1', name: 'r', url: 'u3' }],
    prompt: 'swap the outfit',
    model: EDIT_MODEL,
  })
  assert.equal(error, null)
  assert.deepEqual(
    jobs.map((job) => job.assetIds),
    [
      ['v1', 'r1'],
      ['v2', 'r1'],
    ],
  )
  assert.deepEqual(
    jobs.map((job) => job.prompt),
    ['swap the outfit', 'swap the outfit'],
  )
})

test('blank prompt without references is rejected before any submit', () => {
  const { error, jobs } = videoEditJobs({
    targets: [VIDEO('v1')],
    references: [],
    prompt: '   ',
    model: EDIT_MODEL,
  })
  assert.equal(error, 'Describe the change, or add a reference image.')
  assert.deepEqual(jobs, [])
})

test('no targets is rejected', () => {
  const { error, jobs } = videoEditJobs({
    targets: [],
    references: [{ id: 'r1', name: 'r', url: 'u3' }],
    prompt: 'swap the outfit',
    model: EDIT_MODEL,
  })
  assert.equal(error, 'Add a target video to edit.')
  assert.deepEqual(jobs, [])
})

test('avatar references expand to their crops and add the identity clause', () => {
  const avatar: ReferenceItem = {
    id: 'sheet',
    name: 'avatar',
    url: 'u',
    avatar: true,
    profile: DEFAULT_AVATAR_PROFILE,
  }
  const { error, jobs } = videoEditJobs({
    targets: [VIDEO('v1')],
    references: [avatar],
    prompt: '  keep the room  ',
    model: EDIT_MODEL,
  })
  assert.equal(error, null)
  assert.deepEqual(jobs[0]?.assetIds, ['v1', 'sheet'])
  assert.match(jobs[0]?.prompt ?? '', /^keep the room\n\nAvatar identity: /)
})

test('videoEditOnly is true only for edit-only models', () => {
  assert.equal(videoEditOnly(EDIT_MODEL), true)
  assert.equal(videoEditOnly(TEXT_AND_EDIT_MODEL), false)
  assert.equal(videoEditOnly(BASE), false)
})
