import type { ModelDefinition, ProviderId } from '@sunnygen/core'
import { azureAdapter } from './azure'
import { codexAdapter } from './codex'
import { falAdapter } from './fal'
import { sunraAdapter } from './sunra'
import type { ProviderAdapter } from './types'

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  sunra: sunraAdapter,
  fal: falAdapter,
  azure: azureAdapter,
  codex: codexAdapter,
}

export function getAdapter(provider: ProviderId): ProviderAdapter {
  return ADAPTERS[provider]
}

export function adapterSupports(provider: ProviderId, model: ModelDefinition): boolean {
  return model.providers.includes(provider)
}
