import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import sharp from 'sharp'

const dataDir = mkdtempSync(join(tmpdir(), 'sunnygen-poller-'))
process.env.SUNNYGEN_DATA_DIR = dataDir
process.env.SUNNYGEN_MEDIA_DIR = join(dataDir, 'media')
process.env.SUNRA_API_KEY = 'test-key'

const {
  closeDb,
  createGeneration,
  getGeneration,
  readProviderUpload,
  saveJob,
  saveProviderUpload,
  updateGeneration,
} = await import('@sunnygen/db')
const { storeBuffer } = await import('./media.server')
const { processGenerationJobs } = await import('./generation-poller.server')

after(() => {
  closeDb()
  rmSync(dataDir, { recursive: true, force: true })
})

const INPUT_URL = 'https://assets.sunra.ai/uploads/550f1ea0.png'

async function input(): Promise<{ id: string; sha256: string }> {
  const buffer = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#c05030' },
  })
    .png()
    .toBuffer()
  const asset = await storeBuffer({ buffer, mime: 'image/png', kind: 'image', source: 'studio' })
  return { id: asset.id, sha256: createHash('sha256').update(buffer).digest('hex') }
}

function sunraPoll(status: unknown): typeof fetch {
  return (async () => Response.json(status)) as typeof fetch
}

async function failingGeneration(assetId: string, status: unknown) {
  const generation = createGeneration({
    kind: 'image',
    provider: 'sunra',
    model: 'seedream-5-pro',
    prompt: 'swap the face',
    params: { aspectRatio: '1:1', quality: '1k' },
    inputAssetIds: [assetId],
  })
  updateGeneration(generation.id, { status: 'running', providerJobId: 'req-1' })
  saveJob({
    taskId: generation.id,
    generationId: generation.id,
    provider: 'sunra',
    providerJobId: 'req-1',
    status: 'running',
    pollAfter: 0,
  })
  process.env.SUNRA_API_KEY = 'test-key'
  globalThis.fetch = sunraPoll(status)
  await processGenerationJobs()
  return getGeneration(generation.id)
}

test('a poll that fails fetching an input drops the cached upload URL for the retry', async () => {
  const source = await input()
  saveProviderUpload('sunra', source.sha256, INPUT_URL, null)

  const generation = await failingGeneration(source.id, {
    status: 'FAILED',
    error: {
      code: 'invalid_input',
      reason: 'input_fetch_failed',
      message: `Failed to fetch an input file (${INPUT_URL}): the file exceeds the download size limit.`,
    },
  })

  assert.equal(generation?.status, 'failed')
  assert.equal(
    generation?.error,
    'An input image was too large for Sunra. It has been resized for next time; press Retry.',
  )
  assert.equal(generation?.errorRetryable, true)
  assert.equal(readProviderUpload('sunra', source.sha256), null)
})

test('a poll that fails for another reason keeps the cached upload URL', async () => {
  const source = await input()
  saveProviderUpload('sunra', source.sha256, INPUT_URL, null)

  await failingGeneration(source.id, {
    status: 'FAILED',
    error: { code: 'invalid_request', message: 'the prompt was rejected' },
  })

  assert.equal(readProviderUpload('sunra', source.sha256)?.url, INPUT_URL)
})
