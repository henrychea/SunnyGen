import { LORA_STEP_PRESETS, LORA_TRAINER_ID } from '@sunnygen/core'
import { zipSync, type Zippable } from 'fflate'
import { ProviderError, type ProviderFlow } from '../types'
import { submitFalQueue, uploadFalAsset } from './client'

const ENDPOINT = 'fal-ai/flux-lora-fast-training'

function imageName(name: string, index: number): string {
  const extension = name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ?? 'png'
  return `${String(index + 1).padStart(3, '0')}.${extension}`
}

export const falTrainingFlow: ProviderFlow = {
  id: 'fal.training',
  kind: 'lora',
  matches: (model) => model.id === LORA_TRAINER_ID,
  async submit(context, request) {
    if (request.assets.length === 0) {
      throw new ProviderError('fal', 'Add training images before training a LoRA.')
    }

    const files: Zippable = {}
    for (const [index, asset] of request.assets.entries()) {
      files[imageName(asset.fileName, index)] = new Uint8Array(asset.buffer)
    }
    const archive = zipSync(files, { level: 0 })
    const archiveUrl = await uploadFalAsset(context, {
      buffer: Buffer.from(archive),
      mime: 'application/zip',
      fileName: 'images.zip',
    })

    const requested = Number(request.params.steps)
    const steps = LORA_STEP_PRESETS.some((preset) => preset.steps === requested) ? requested : 1000
    const triggerWord = String(request.params.triggerWord ?? request.prompt ?? '').trim()

    return submitFalQueue(
      context,
      ENDPOINT,
      {
        images_data_url: archiveUrl,
        steps,
        is_style: false,
        create_masks: true,
        ...(triggerWord ? { trigger_word: triggerWord } : {}),
      },
      request.webhookUrl,
    )
  },
}
