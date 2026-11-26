import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import type { VideoCopyShot } from '@sunnygen/core'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-video-copies-'))
process.env.SUNNYGEN_DATA_DIR = dataDir
process.env.SUNNYGEN_MEDIA_DIR = join(dataDir, 'media')

const { closeDb } = await import('./database')
const { createAsset } = await import('./repositories/assets')
const { createVideoCopy, deleteVideoCopy, getVideoCopy, listVideoCopies, updateVideoCopy } =
  await import('./repositories/video-copies')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

function shot(start: number, end: number): VideoCopyShot {
  return {
    start,
    end,
    subject: 'a room',
    action: 'pans',
    motion: 'slow',
    camera: 'push in',
    lighting: 'window light',
    prompt: `shot ${start} to ${end}`,
  }
}

function sourceAsset(nsfw = false) {
  return createAsset({
    kind: 'video',
    mime: 'video/mp4',
    byteSize: 1024,
    duration: 6,
    sha256: `sha-${Math.random()}`,
    source: 'upload',
    path: '2026/11/source.mp4',
    nsfw,
  })
}

test('a copy stores its shots in order and moves its timestamp on every write', async () => {
  const asset = sourceAsset()
  const created = createVideoCopy({
    sourceAssetId: asset.id,
    frameAssetIds: ['frame-b', 'frame-a'],
    shots: [shot(0, 3), shot(3, 6)],
  })
  assert.equal(created.status, 'extracted')
  assert.deepEqual(
    created.shots.map((entry) => entry.start),
    [0, 3],
  )
  assert.deepEqual(created.frameAssetIds, ['frame-b', 'frame-a'])
  assert.equal(created.agent, null)

  await new Promise((resolve) => setTimeout(resolve, 2))
  const analyzed = updateVideoCopy(created.id, { status: 'analyzed', agent: 'claude' })
  assert.equal(analyzed?.status, 'analyzed')
  assert.equal(analyzed?.agent, 'claude')
  assert.ok((analyzed?.updatedAt ?? 0) > created.updatedAt)

  const output = createAsset({
    kind: 'video',
    mime: 'video/mp4',
    byteSize: 2048,
    duration: 6,
    sha256: 'sha-output',
    source: 'generated',
    path: '2026/11/output.mp4',
  })
  const done = updateVideoCopy(created.id, { status: 'done', outputAssetId: output.id })
  assert.equal(done?.outputAssetId, output.id)
  assert.equal(getVideoCopy(created.id)?.status, 'done')
  assert.equal(listVideoCopies().length, 1)

  assert.equal(deleteVideoCopy(created.id), true)
  assert.equal(getVideoCopy(created.id), null)
  assert.equal(deleteVideoCopy(created.id), false)
})

// Safe mode must not see a copy of an NSFW source, and the write path must still read the row it
// just created, which is why createVideoCopy returns its copy with includeNsfw.
test('a copy inherits its source visibility', () => {
  const hidden = createVideoCopy({ sourceAssetId: sourceAsset(true).id })
  assert.equal(hidden.status, 'extracted')
  assert.equal(getVideoCopy(hidden.id), null)
  assert.equal(getVideoCopy(hidden.id, { includeNsfw: true })?.id, hidden.id)
  assert.ok(!listVideoCopies(50).some((copy) => copy.id === hidden.id))
  assert.ok(listVideoCopies(50, { includeNsfw: true }).some((copy) => copy.id === hidden.id))

  const visible = createVideoCopy({ sourceAssetId: sourceAsset().id })
  assert.equal(getVideoCopy(visible.id)?.id, visible.id)
  assert.ok(listVideoCopies(50).some((copy) => copy.id === visible.id))
})
