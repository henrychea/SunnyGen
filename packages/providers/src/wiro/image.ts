import type { ImageModelDefinition } from '@sunnygen/core'
import { normalizeAsset } from '../normalize'
import { WIRO_IMAGE_SPECS } from '../models'
import { ProviderError, type ProviderAsset, type ProviderFlow, type ProviderRequest } from '../types'
import { submitWiroRun } from './client'

export function wiroImageBody(
  request: ProviderRequest,
  model: ImageModelDefinition,
): Record<string, unknown> {
  const spec = WIRO_IMAGE_SPECS[model.id]
  const body: Record<string, unknown> = { prompt: request.prompt }
  const ratio = String(request.params.aspectRatio ?? '')
  if (spec?.ratioKey && model.ratios.includes(ratio)) body[spec.ratioKey] = ratio
  const quality = String(request.params.quality ?? model.defaultQuality)
  if (spec?.resolutionKey && model.qualityOptions.includes(quality)) {
    body[spec.resolutionKey] = spec.qualityMap?.[quality] ?? quality
  }
  for (const [key, value] of Object.entries(spec?.extra ?? {})) body[key] = value
  return body
}

async function editForm(
  request: ProviderRequest,
  model: ImageModelDefinition,
  assets: ProviderAsset[],
): Promise<FormData | null> {
  const spec = WIRO_IMAGE_SPECS[model.id]
  const field = spec?.imageField
  if (!field || assets.length === 0) return null
  const form = new FormData()
  for (const [key, value] of Object.entries(wiroImageBody(request, model))) form.set(key, String(value))
  form.set(`${field}Url`, '')
  for (const asset of assets.slice(0, spec?.maxImages ?? model.maxImages)) {
    const normalized = await normalizeAsset(asset)
    form.append(
      field,
      new Blob([new Uint8Array(normalized.buffer)], { type: normalized.mime }),
      normalized.fileName,
    )
  }
  return form
}

export const wiroImageFlow: ProviderFlow = {
  id: 'wiro.image',
  kind: 'image',
  matches: (model) => model.kind === 'image',
  async submit(context, request) {
    const model = request.model as ImageModelDefinition
    const spec = WIRO_IMAGE_SPECS[model.id]
    if (!spec) throw new ProviderError('wiro', `${model.label} is not available on Wiro`)

    const requiresImages = Boolean(spec.imageField)
    if (requiresImages && request.assets.length === 0) {
      throw new ProviderError('wiro', `${model.label} needs at least one input image.`)
    }
    if (!requiresImages && request.assets.length > 0) {
      throw new ProviderError('wiro', `${model.label} does not accept input images. Pick an editing model.`)
    }

    const form = await editForm(request, model, request.assets)
    const taskId = await submitWiroRun(context, spec.endpoint, form ?? wiroImageBody(request, model))
    return { providerJobId: taskId, status: 'running' }
  },
}
