export const APP_NAME = 'SunnyGen'
export const APP_VERSION = '2.0.0'
export const APP_TAGLINE = 'Build AI image and video pipelines visually.'

export const PROVIDER_IDS = ['sunra', 'fal', 'azure', 'codex'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

export const ASSISTANT_PROVIDER_IDS = ['openrouter'] as const
export type AssistantProviderId = (typeof ASSISTANT_PROVIDER_IDS)[number]

export const GENERATION_KINDS = ['image', 'video'] as const
export type GenerationKind = (typeof GENERATION_KINDS)[number]

export const GENERATION_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const
export type GenerationStatus = (typeof GENERATION_STATUSES)[number]

export const ASSET_KINDS = ['image', 'video', 'audio'] as const
export type AssetKind = (typeof ASSET_KINDS)[number]

export const ASSET_SOURCES = ['generated', 'upload', 'social', 'studio'] as const
export type AssetSource = (typeof ASSET_SOURCES)[number]

export const STUDIO_KINDS = ['avatar', 'garment', 'pose', 'scene'] as const
export type StudioKind = (typeof STUDIO_KINDS)[number]

export const GARMENT_SLOTS = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'accessory'] as const
export type GarmentSlot = (typeof GARMENT_SLOTS)[number]

export const GARMENT_SOURCES = ['flat-lay', 'on-model', 'supplier'] as const
export type GarmentSource = (typeof GARMENT_SOURCES)[number]

export const STUDIO_ANGLES = ['front', 'three-quarter', 'side', 'back'] as const
export type StudioAngle = (typeof STUDIO_ANGLES)[number]

export type ProviderCapability = 'image' | 'video' | 'assistant'

export interface ProviderDescriptor {
  id: ProviderId
  label: string
  capabilities: readonly ProviderCapability[]
  keySetting: string | null
  docsUrl: string | null
}

export const PROVIDERS: readonly ProviderDescriptor[] = [
  {
    id: 'sunra',
    label: 'Sunra.ai',
    capabilities: ['image', 'video'],
    keySetting: 'provider.sunra.key',
    docsUrl: 'https://sunra.ai',
  },
  {
    id: 'fal',
    label: 'fal.ai',
    capabilities: ['image', 'video'],
    keySetting: 'provider.fal.key',
    docsUrl: 'https://fal.ai',
  },
  {
    id: 'azure',
    label: 'Azure AI Foundry',
    capabilities: ['image'],
    keySetting: 'provider.azure.key',
    docsUrl: 'https://ai.azure.com',
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    capabilities: ['image'],
    keySetting: null,
    docsUrl: 'https://github.com/openai/codex',
  },
]

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value)
}

export function getProvider(id: ProviderId): ProviderDescriptor {
  const provider = PROVIDERS.find((entry) => entry.id === id)
  if (!provider) throw new Error(`Unknown provider: ${id}`)
  return provider
}
