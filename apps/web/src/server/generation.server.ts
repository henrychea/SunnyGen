import {
  PROVIDERS,
  type AssetKind,
  type GenerationKind,
  type GenerationParams,
  type ModelDefinition,
  type ProviderId,
} from '@sunnygen/core'
import {
  deleteProviderUpload,
  getAssetsByIds,
  readProviderUpload,
  readSetting,
  saveProviderUpload,
} from '@sunnygen/db'
import {
  getAdapter,
  isCodexAvailable,
  providerSupportsWebhooks,
  type AdapterContext,
  type ProviderAsset,
  type ProviderOutput,
} from '@sunnygen/providers'
import sharp from 'sharp'
import { readAssetBuffer, storeBuffer } from './media.server'
import { providerWebhookUrl } from './webhook-config.server'

const PLACEHOLDER = /^your_.*_here$/i

function envKey(provider: ProviderId): string | null {
  if (provider === 'sunra') return process.env.SUNRA_API_KEY ?? null
  if (provider === 'fal') return process.env.FAL_KEY ?? null
  if (provider === 'azure') return process.env.AZURE_API_KEY ?? null
  return null
}

export function providerApiKey(provider: ProviderId): string | null {
  const descriptor = PROVIDERS.find((entry) => entry.id === provider)
  const stored = descriptor?.keySetting ? readSetting(descriptor.keySetting) : null
  const value = stored ?? envKey(provider)
  if (!value || PLACEHOLDER.test(value.trim())) return null
  return value.trim()
}

export function providerContext(provider: ProviderId): AdapterContext {
  return {
    apiKey: providerApiKey(provider),
    baseUrl: provider === 'azure' ? readSetting('provider.azure.baseUrl') : null,
    deployment: provider === 'azure' ? readSetting('provider.azure.deployment') : null,
    fetch,
    uploads: {
      get: (target, sha256) => readProviderUpload(target, sha256),
      save: (target, sha256, url, expiresAt) => saveProviderUpload(target, sha256, url, expiresAt),
      remove: (target, sha256) => deleteProviderUpload(target, sha256),
    },
  }
}

export async function providerConfigured(provider: ProviderId): Promise<boolean> {
  if (provider === 'codex') return isCodexAvailable()
  if (provider === 'azure') {
    return Boolean(
      providerApiKey('azure') &&
      readSetting('provider.azure.baseUrl') &&
      readSetting('provider.azure.deployment'),
    )
  }
  return providerApiKey(provider) !== null
}

export async function resolveProvider(model: ModelDefinition, preferred?: ProviderId): Promise<ProviderId> {
  const candidates =
    preferred && model.providers.includes(preferred)
      ? [preferred, ...model.providers.filter((id) => id !== preferred)]
      : [...model.providers]
  for (const provider of candidates) {
    if (await providerConfigured(provider)) return provider
  }
  const names = model.providers.map((id) => PROVIDERS.find((entry) => entry.id === id)?.label ?? id)
  throw new Error(`No configured provider for ${model.label}. Add a key for ${names.join(' or ')}.`)
}

const MAX_IMAGE_SIDE = 4096
const MAX_IMAGE_PIXELS = 16_800_000
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

async function fitImageForProvider(buffer: Buffer, mime: string): Promise<{ buffer: Buffer; mime: string }> {
  if (!mime.startsWith('image/')) return { buffer, mime }
  try {
    const metadata = await sharp(buffer).metadata()
    const width = metadata.width ?? 0
    const height = metadata.height ?? 0
    const fits =
      width <= MAX_IMAGE_SIDE &&
      height <= MAX_IMAGE_SIDE &&
      width * height <= MAX_IMAGE_PIXELS &&
      buffer.byteLength <= MAX_IMAGE_BYTES
    if (fits) return { buffer, mime }
    const resized = await sharp(buffer)
      .rotate()
      .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer()
    return { buffer: resized, mime: 'image/jpeg' }
  } catch {
    return { buffer, mime }
  }
}

export async function loadProviderAssets(assetIds: string[]): Promise<ProviderAsset[]> {
  if (assetIds.length === 0) return []
  const records = getAssetsByIds(assetIds)
  if (records.length !== assetIds.length) {
    const found = new Set(records.map((record) => record.id))
    const missing = assetIds.filter((id) => !found.has(id))
    throw new Error(
      `${missing.length} selected input ${missing.length === 1 ? 'image is' : 'images are'} not in the media library (${missing.join(', ')}). Re-select the references and try again.`,
    )
  }
  const assets: ProviderAsset[] = []
  for (const record of records) {
    const read = await readAssetBuffer(record.id)
    if (!read) throw new Error(`Input image ${record.id} is missing from disk. Re-select it and try again.`)
    const fitted = await fitImageForProvider(read.buffer, record.mime)
    const extension = fitted.mime.split('/')[1] ?? 'bin'
    assets.push({
      buffer: fitted.buffer,
      mime: fitted.mime,
      fileName: `${record.id}.${extension.replace('jpeg', 'jpg')}`,
    })
  }
  return assets
}

export async function storeProviderOutputs(
  outputs: ProviderOutput[],
  folderId: string | null,
  forceKind?: AssetKind,
): Promise<string[]> {
  const ids: string[] = []
  for (const output of outputs) {
    const kind: AssetKind =
      forceKind ??
      (output.mime.startsWith('video/') ? 'video' : output.mime.startsWith('audio/') ? 'audio' : 'image')
    const asset = await storeBuffer({
      buffer: output.buffer,
      mime: output.mime,
      kind,
      source: 'generated',
      folderId,
      ...(output.fileName ? { fileName: output.fileName } : {}),
    })
    ids.push(asset.id)
  }
  return ids
}

export interface PreparedGeneration {
  request: {
    kind: GenerationKind
    model: ModelDefinition
    prompt: string
    params: GenerationParams
    assets: ProviderAsset[]
    webhookUrl?: string | null
  }
  provider: ProviderId
}

export async function prepareGeneration(input: {
  kind: GenerationKind
  model: ModelDefinition
  prompt: string
  params: GenerationParams
  assetIds: string[]
  provider?: ProviderId
}): Promise<PreparedGeneration> {
  const provider = await resolveProvider(input.model, input.provider)
  const assets = input.model.supportsImages ? await loadProviderAssets(input.assetIds) : []
  return {
    provider,
    request: {
      kind: input.kind,
      model: input.model,
      prompt: input.prompt,
      params: input.params,
      assets,
      webhookUrl: providerSupportsWebhooks(provider) ? providerWebhookUrl(provider) : null,
    },
  }
}

export function adapterFor(provider: ProviderId) {
  return getAdapter(provider)
}
