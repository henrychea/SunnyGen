import type { ImageModelDefinition } from '@sunnygen/core'
import { SUNRA_IMAGE_SPECS } from '../models'
import { gptImageSize } from '../sizes'
import { ProviderError, type ProviderFlow, type ProviderRequest } from '../types'
import { SUNRA_BASE, cleanSunraPrompt, submitSunraQueue, uploadSunraAsset } from './client'

function buildImageRequest(
  request: ProviderRequest,
  urls: string[],
): { endpoint: string; body: Record<string, unknown> } {
  const model = request.model as ImageModelDefinition
  const spec = SUNRA_IMAGE_SPECS[model.id]
  if (!spec && model.dynamic && model.sourceId) {
    const hasImages = urls.length > 0
    const operation = hasImages ? 'image-editing' : 'text-to-image'
    const quality = String(request.params.quality ?? model.defaultQuality)
    const resolution = quality === '1k' ? '1K' : quality === '2k' ? '2K' : quality === '4k' ? '4K' : undefined
    return {
      endpoint: `${SUNRA_BASE}/queue/${model.sourceId}/${operation}`,
      body: {
        prompt: cleanSunraPrompt(request.prompt, 20_000),
        ...(hasImages ? { images: urls.slice(0, model.maxImages) } : {}),
        aspect_ratio: request.params.aspectRatio ?? '1:1',
        ...(resolution ? { resolution } : {}),
      },
    }
  }
  if (!spec) throw new ProviderError('sunra', `${model.label} is not available on Sunra`)

  const hasImages = urls.length > 0
  const operation = hasImages ? spec.imageOperation : spec.textOperation
  const quality = request.params.quality ?? model.defaultQuality
  const aspectRatio = request.params.aspectRatio ?? '1:1'
  const body: Record<string, unknown> = {
    prompt: cleanSunraPrompt(request.prompt, spec.promptMaxLength),
  }

  if (hasImages) {
    body[spec.imageKey] = spec.imageMode === 'single' ? urls[0] : urls.slice(0, model.maxImages)
  }
  if (spec.aspectRatioKey && !(hasImages && spec.skipAspectRatioOnEdit)) {
    body[spec.aspectRatioKey] = aspectRatio
  }
  if (spec.qualityKey) {
    body[spec.qualityKey] = spec.qualityMap?.[quality] ?? quality
  }
  if (spec.sizeKeys) {
    const size = gptImageSize(aspectRatio, quality)
    if (size) {
      body[spec.sizeKeys.width] = size.width
      body[spec.sizeKeys.height] = size.height
    }
  }
  if (spec.outputFormat) body.output_format = spec.outputFormat
  if (spec.extra) Object.assign(body, spec.extra)

  return { endpoint: `${SUNRA_BASE}/queue/${spec.apiId}/${operation}`, body }
}

export const sunraImageFlow: ProviderFlow = {
  id: 'sunra.image',
  kind: 'image',
  matches: (model) => model.kind === 'image',
  async submit(context, request) {
    const urls = await Promise.all(request.assets.map((asset) => uploadSunraAsset(context, asset)))
    const { endpoint, body } = buildImageRequest(request, urls)
    return submitSunraQueue(context, endpoint, body, request.webhookUrl)
  },
}
