import assert from 'node:assert/strict'
import test from 'node:test'
import { falModelCapabilities, sunraModelCapabilities, sunraEditOperation } from './model-capabilities'

test('Sunra edit operations follow the documented endpoint order', () => {
  assert.equal(sunraEditOperation(['text-to-image', 'image-editing', 'image-to-image']), 'image-editing')
  assert.equal(sunraEditOperation(['text-to-image', 'image-to-image']), 'image-to-image')
  assert.equal(
    sunraEditOperation(['text-to-image', 'reference-images-to-image']),
    'reference-images-to-image',
  )
  assert.equal(sunraEditOperation(['text-to-image']), null)
  assert.equal(sunraEditOperation(['text-to-image', 'layerize']), null)
})

test('Sunra models with blending or face swap but no edit endpoint never offer edit', () => {
  const endpoints = ['text-to-image', 'image-blending', 'face-swap', 'action', 'describe']
  const withoutSchema = sunraModelCapabilities(endpoints, null, 'midjourney/v8.2')
  assert.equal(withoutSchema.supportsImages, false)
  assert.equal(withoutSchema.maxImages, 0)
  assert.equal(withoutSchema.editSourceId, null)
  assert.equal(withoutSchema.supportsText, true)

  const staleDoc = sunraModelCapabilities(
    endpoints,
    {
      textOperation: 'text-to-image',
      editOperation: 'image-editing',
      editPath: '/midjourney/v8.2/image-editing',
      imageField: 'image_urls',
      maxImages: 4,
      supportsImages: true,
      supportsText: true,
    },
    'midjourney/v8.2',
  )
  assert.equal(staleDoc.supportsImages, false)
  assert.equal(staleDoc.maxImages, 0)
  assert.equal(staleDoc.editSourceId, null)
})

test('Sunra models without an edit endpoint cannot be used in edit mode', () => {
  const capabilities = sunraModelCapabilities(
    ['text-to-image', 'layerize'],
    null,
    'black-forest-labs/flux-3-image',
  )
  assert.equal(capabilities.supportsImages, false)
  assert.equal(capabilities.maxImages, 0)
  assert.equal(capabilities.editSourceId, null)
  assert.equal(capabilities.supportsText, true)
  assert.equal(capabilities.available, true)
})

test('Sunra edit models take their image limit from the schema', () => {
  const capabilities = sunraModelCapabilities(
    ['text-to-image', 'image-editing'],
    {
      textOperation: 'text-to-image',
      editOperation: 'image-editing',
      editPath: '/xai/grok-imagine-image-2.0/image-editing',
      imageField: 'images',
      maxImages: 3,
      supportsImages: true,
      supportsText: true,
    },
    'xai/grok-imagine-image-2.0',
  )
  assert.equal(capabilities.supportsImages, true)
  assert.equal(capabilities.maxImages, 3)
  assert.equal(capabilities.editSourceId, 'xai/grok-imagine-image-2.0/image-editing')
})

test('Sunra image-to-image models are edit only', () => {
  const capabilities = sunraModelCapabilities(
    ['image-to-image'],
    {
      textOperation: null,
      editOperation: 'image-to-image',
      editPath: '/wan/wan-2.7/image-to-image',
      imageField: 'image_urls',
      maxImages: 2,
      supportsImages: true,
      supportsText: false,
    },
    'wan/wan-2.7',
  )
  assert.equal(capabilities.supportsImages, true)
  assert.equal(capabilities.supportsText, false)
  assert.equal(capabilities.limitation, 'Needs a reference image')
})

test('Sunra models with no supported flow are unavailable', () => {
  const capabilities = sunraModelCapabilities(['image-rle'], null, 'meta/sam-3')
  assert.equal(capabilities.available, false)
  assert.match(capabilities.limitation ?? '', /image rle/)
})

test('fal edit endpoints are only offered when the endpoint exists', () => {
  const base = {
    supportsImages: false,
    supportsText: true,
    imageField: null,
    maxImages: 0,
  }
  const withoutEdit = falModelCapabilities({
    endpoint: 'fal-ai/flux/schnell',
    base,
    edit: null,
    required: ['prompt'],
    docsInputs: ['Text'],
    docsOutputs: ['Image'],
  })
  assert.equal(withoutEdit.editSourceId, null)
  assert.equal(withoutEdit.supportsImages, false)

  const withEdit = falModelCapabilities({
    endpoint: 'openai/gpt-image-2',
    base,
    edit: { supportsImages: true, supportsText: true, imageField: 'image_urls', maxImages: 16 },
    required: ['prompt'],
    docsInputs: ['Text'],
    docsOutputs: ['Image'],
  })
  assert.equal(withEdit.editSourceId, 'openai/gpt-image-2/edit')
  assert.equal(withEdit.supportsImages, true)
  assert.equal(withEdit.maxImages, 16)
})

test('fal endpoints without a prompt property are not offered for text', () => {
  const capabilities = falModelCapabilities({
    endpoint: 'fal-ai/birefnet/v2',
    base: { supportsImages: true, supportsText: false, imageField: 'image_url', maxImages: 1 },
    edit: null,
    required: ['image_url'],
    docsInputs: ['Image'],
    docsOutputs: ['Image'],
  })
  assert.equal(capabilities.supportsText, false)
  assert.equal(capabilities.available, true)
  assert.equal(capabilities.maxImages, 1)
})
