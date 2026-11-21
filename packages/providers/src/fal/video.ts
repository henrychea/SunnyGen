import type { VideoModelDefinition } from '@sunnygen/core'
import { ProviderError, type ProviderFlow } from '../types'
import { submitFalQueue, uploadFalAsset } from './client'

export const falVideoFlow: ProviderFlow = {
  id: 'fal.video',
  kind: 'video',
  matches: (model) => model.kind === 'video',
  async submit(context, request) {
    const model = request.model as VideoModelDefinition
    if (!model.dynamic || !model.sourceId) {
      throw new ProviderError('fal', `${model.label} is not available on fal.ai`)
    }

    const urls = await Promise.all(request.assets.map((asset) => uploadFalAsset(context, asset)))
    const body: Record<string, unknown> = {
      prompt: request.prompt,
      duration: request.params.durationSeconds ?? model.defaultDuration,
      resolution: request.params.resolution ?? model.defaultResolution,
    }
    if (urls[0]) body.image_url = urls[0]
    if (urls.length > 1) body.reference_image_urls = urls.slice(1, 1 + model.maxImages)
    return submitFalQueue(context, model.sourceId, body, request.webhookUrl, request.assets)
  },
}
