import {
  LORA_SCALE_DEFAULT,
  LORA_SCALE_MAX,
  LORA_SCALE_MIN,
  isPrivateHostname,
  parseAvatarLora,
  withLoraTriggerWord,
  type AvatarLora,
  type GenerationParams,
  type GenerationRecord,
  type ModelDefinition,
} from '@sunnygen/core'
import { getStudioItem, listStudioItems, saveStudioItem, type StudioItemRecord } from '@sunnygen/db'
import { isHttpUrl, uploadFalAsset, type ProviderOutput } from '@sunnygen/providers'
import { readAssetBuffer } from './media.server'
import { providerContext } from './generation.server'

export function completeLoraGeneration(
  generation: GenerationRecord,
  outputIds: string[],
  outputs: ProviderOutput[],
): void {
  const avatarId = typeof generation.params.avatarId === 'string' ? generation.params.avatarId : null
  const assetId = outputIds[0]
  const output = outputs[0]
  if (!avatarId || !assetId || !output) return
  saveAvatarLora({
    avatarId,
    assetId,
    remoteUrl: output.sourceUrl ?? '',
    generationId: generation.id,
    triggerWord: String(generation.params.triggerWord ?? ''),
    baseModel: String(generation.params.baseModel ?? generation.model),
    version: Number(generation.params.version) || 1,
  })
}

export interface SelectedAvatarLora {
  avatar: StudioItemRecord
  lora: AvatarLora
}

function avatarMatches(avatar: StudioItemRecord, assetIds: string[]): boolean {
  const sheet =
    typeof avatar.data.characterSheetAssetId === 'string' ? avatar.data.characterSheetAssetId : null
  return [avatar.assetId, sheet].some((id) => Boolean(id) && assetIds.includes(id as string))
}

export function avatarLoraFor(assetIds: string[]): SelectedAvatarLora | null {
  if (assetIds.length === 0) return null
  for (const avatar of listStudioItems('avatar')) {
    if (!avatarMatches(avatar, assetIds)) continue
    const lora = parseAvatarLora(avatar.data.lora)
    if (lora) return { avatar, lora }
  }
  return null
}

export async function loraInferencePath(lora: AvatarLora): Promise<string> {
  const loraEndpoint = isHttpUrl(lora.remoteUrl) ? new URL(lora.remoteUrl) : null
  if (loraEndpoint && !isPrivateHostname(loraEndpoint.hostname)) {
    try {
      const response = await fetch(loraEndpoint, { method: 'HEAD', signal: AbortSignal.timeout(8_000) })
      if (response.ok) return lora.remoteUrl
    } catch {
      return uploadStoredLora(lora)
    }
  }
  return uploadStoredLora(lora)
}

async function uploadStoredLora(lora: AvatarLora): Promise<string> {
  const read = await readAssetBuffer(lora.assetId)
  if (!read) throw new Error('The trained LoRA file is missing from disk. Retrain the avatar.')
  return uploadFalAsset(providerContext('fal'), {
    buffer: read.buffer,
    mime: 'application/octet-stream',
    fileName: 'lora.safetensors',
  })
}

export async function applyAvatarLora(
  model: ModelDefinition,
  assetIds: string[],
  prompt: string,
  params: GenerationParams,
): Promise<string> {
  if (!model.supportsLora) return prompt
  const selected = avatarLoraFor(assetIds)
  if (!selected) return prompt
  const strength = Number(params.loraStrength)
  const scale =
    Number.isFinite(strength) && strength > 0
      ? Math.min(LORA_SCALE_MAX, Math.max(LORA_SCALE_MIN, strength))
      : selected.lora.scale || LORA_SCALE_DEFAULT
  params.lora = { path: await loraInferencePath(selected.lora), scale }
  return withLoraTriggerWord(prompt, selected.lora.triggerWord)
}

export function saveAvatarLora(input: {
  avatarId: string
  assetId: string
  remoteUrl: string
  generationId: string
  triggerWord: string
  baseModel: string
  version: number
}): void {
  const avatar = getStudioItem(input.avatarId)
  if (!avatar || avatar.kind !== 'avatar') return
  const lora: AvatarLora = {
    assetId: input.assetId,
    remoteUrl: input.remoteUrl,
    triggerWord: input.triggerWord,
    baseModel: input.baseModel,
    scale: parseAvatarLora(avatar.data.lora)?.scale ?? LORA_SCALE_DEFAULT,
    generationId: input.generationId,
    trainedAt: Date.now(),
    version: input.version,
  }
  saveStudioItem({
    id: avatar.id,
    kind: avatar.kind,
    name: avatar.name,
    assetId: avatar.assetId,
    cleanAssetId: avatar.cleanAssetId,
    data: { ...avatar.data, lora },
  })
}
