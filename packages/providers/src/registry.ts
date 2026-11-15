import type { ModelDefinition, ProviderId } from '@sunnygen/core'
import { azureModule } from './azure'
import { codexModule } from './codex'
import { falModule } from './fal'
import { sunraModule } from './sunra'
import type { ProviderAdapter, ProviderModule, ProviderWebhook } from './types'

export const PROVIDER_MODULES: Record<ProviderId, ProviderModule> = {
  sunra: sunraModule,
  fal: falModule,
  azure: azureModule,
  codex: codexModule,
}

export function getProviderModule(provider: ProviderId): ProviderModule {
  return PROVIDER_MODULES[provider]
}

export function getAdapter(provider: ProviderId): ProviderAdapter {
  return PROVIDER_MODULES[provider].adapter
}

export function providerFlows(provider: ProviderId): ProviderModule['flows'] {
  return PROVIDER_MODULES[provider].flows
}

export function getWebhook(provider: ProviderId): ProviderWebhook | undefined {
  return PROVIDER_MODULES[provider].webhook
}

export function providerSupportsWebhooks(provider: ProviderId): boolean {
  return Boolean(PROVIDER_MODULES[provider].webhook)
}

export function listProviderModules(): ProviderModule[] {
  return Object.values(PROVIDER_MODULES)
}

export function adapterSupports(provider: ProviderId, model: ModelDefinition): boolean {
  return model.providers.includes(provider)
}
