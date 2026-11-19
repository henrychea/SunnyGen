import type { ProviderId } from './domain'
import type { ImageModelDefinition } from './models'

export const LORA_MODEL_ID = 'flux-lora'
export const LORA_TRAINER_ID = 'flux-lora-fast-training'
export const LORA_MIN_IMAGES = 10
export const LORA_MAX_IMAGES = 40
export const LORA_PRICE_PER_1000_STEPS = 2
export const LORA_SCALE_MIN = 0.6
export const LORA_SCALE_MAX = 1.2
export const LORA_SCALE_DEFAULT = 1

export interface LoraStepPreset {
  id: 'fast' | 'balanced' | 'best'
  label: string
  steps: number
  hint: string
}

export const LORA_STEP_PRESETS = [
  { id: 'fast', label: 'Fast', steps: 500, hint: 'Rough likeness in a few minutes.' },
  { id: 'balanced', label: 'Balanced', steps: 1000, hint: 'The usual sweet spot.' },
  { id: 'best', label: 'Best', steps: 2000, hint: 'Closest likeness, slowest run.' },
] as const satisfies readonly LoraStepPreset[]

/** Training endpoint definition; the trainer is not offered in the model pickers. */
export const LORA_TRAINER_MODEL: ImageModelDefinition = {
  id: LORA_TRAINER_ID,
  label: 'FLUX LoRA trainer',
  providerLabel: 'FLUX',
  kind: 'image',
  providers: ['fal'] as ProviderId[],
  ratios: [],
  supportsImages: true,
  maxImages: LORA_MAX_IMAGES,
  supportsQuality: false,
  qualityOptions: [],
  defaultQuality: '',
  price: '$2 per 1,000 steps',
  sourceId: 'fal-ai/flux-lora-fast-training',
}

export interface AvatarLora {
  assetId: string
  remoteUrl: string
  triggerWord: string
  baseModel: string
  scale: number
  generationId: string
  trainedAt: number
  version: number
}

export function loraTrainingCost(steps: number): number {
  const safe = Number.isFinite(steps) && steps > 0 ? steps : 0
  return Math.round((safe * LORA_PRICE_PER_1000_STEPS * 100) / 1000) / 100
}

export function isLoraStepCount(steps: number): boolean {
  return LORA_STEP_PRESETS.some((preset) => preset.steps === steps)
}

export function loraTriggerWord(name: string): string {
  const shortName = name.split(' — ')[0] ?? name
  const slug = shortName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
  return slug || 'subject'
}

export function withLoraTriggerWord(prompt: string, triggerWord: string): string {
  const word = triggerWord.trim()
  if (!word) return prompt
  if (prompt.trim().toLowerCase().startsWith(word.toLowerCase())) return prompt
  return `${word} ${prompt}`.trim()
}

export function parseAvatarLora(value: unknown): AvatarLora | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.assetId !== 'string' || !record.assetId) return null
  if (typeof record.remoteUrl !== 'string' || !record.remoteUrl) return null
  const triggerWord = typeof record.triggerWord === 'string' ? record.triggerWord : ''
  if (!triggerWord) return null
  const scale = Number(record.scale)
  return {
    assetId: record.assetId,
    remoteUrl: record.remoteUrl,
    triggerWord,
    baseModel: typeof record.baseModel === 'string' && record.baseModel ? record.baseModel : LORA_MODEL_ID,
    scale: Number.isFinite(scale) && scale > 0 ? scale : LORA_SCALE_DEFAULT,
    generationId: typeof record.generationId === 'string' ? record.generationId : '',
    trainedAt: Number(record.trainedAt) || 0,
    version: Number(record.version) || 1,
  }
}
