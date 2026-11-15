import {
  ALL_MODELS,
  IMAGE_MODELS,
  PROVIDERS,
  VIDEO_MODELS,
  type ModelDefinition,
  type ProviderId,
} from '@sunnygen/core'
import { FAL_IMAGE_SPECS, SUNRA_IMAGE_SPECS, SUNRA_VIDEO_SPECS } from '@sunnygen/providers/models'
import { readSetting, writeSetting } from '@sunnygen/db'
import type {
  CatalogProvider,
  ModelCatalogEntry,
  ModelCatalogSource,
  ModelCatalogView,
} from './model-catalog.types'

const SUNRA_MODELS_URL = 'https://api.sunra.ai/v1/models?limit=300'
const SUNRA_PRICING_URL = 'https://api.sunra.ai/v1/pricing?limit=1000'
const FAL_DOCS_URL = 'https://fal.ai/docs/documentation/model-apis/models.md'
const FAL_MODELS_API = 'https://api.fal.ai/v1/models'
const FAL_PRICING_URL = 'https://api.fal.ai/v1/models/pricing'
const CATALOG_SETTING = (provider: CatalogProvider) => `models.catalog.${provider}`

interface StoredCatalog {
  updatedAt: number
  priced: boolean
  entries: ModelCatalogEntry[]
}

const SOURCE_INFO: Record<CatalogProvider, { label: string; docsUrl: string }> = {
  sunra: {
    label: 'Sunra.ai',
    docsUrl: 'https://docs.sunra.ai/platform/pricing',
  },
  fal: {
    label: 'fal.ai',
    docsUrl: 'https://fal.ai/docs/documentation/model-apis/models',
  },
}

function providerLabel(provider: ProviderId): string {
  return PROVIDERS.find((entry) => entry.id === provider)?.label ?? provider
}

function cleanPrice(display: string | null | undefined): string | null {
  const value = display?.trim()
  if (!value) return null
  if (/token/i.test(value)) return 'Token based'
  if (!/[$€£¥]|USD|EUR|GBP|free/i.test(value)) return null
  return value.length > 64 ? null : value
}

const COMPANY_NAMES: Record<string, string> = {
  google: 'Google',
  openai: 'OpenAI',
  bytedance: 'ByteDance',
  'x-ai': 'xAI',
  xai: 'xAI',
  kling: 'Kling',
  minimax: 'MiniMax',
  alibaba: 'Alibaba',
  meta: 'Meta',
  pika: 'Pika',
  'black-forest-labs': 'Black Forest Labs',
  recraft: 'Recraft',
  ideogram: 'Ideogram',
  midjourney: 'Midjourney',
  suno: 'Suno',
  elevenlabs: 'ElevenLabs',
  lightricks: 'Lightricks',
  topazlabs: 'Topaz Labs',
  veed: 'Veed',
  heygen: 'HeyGen',
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function companyName(value: string | undefined, sourceId: string): string {
  const raw = (value ?? sourceId.split('/')[0] ?? '').toLowerCase()
  return COMPANY_NAMES[raw] ?? titleCase(raw) ?? 'Other'
}

function falCompany(endpoint: string): string {
  const value = endpoint.toLowerCase()
  if (value.startsWith('openai/')) return 'OpenAI'
  if (value.startsWith('google/')) return 'Google'
  if (value.startsWith('minimax/')) return 'MiniMax'
  if (value.startsWith('bytedance/')) return 'ByteDance'
  if (value.startsWith('alibaba/')) return 'Alibaba'
  if (value.includes('kling')) return 'Kling'
  if (value.includes('minimax')) return 'MiniMax'
  if (value.includes('bytedance')) return 'ByteDance'
  if (value.includes('nano-banana')) return 'Google'
  if (value.includes('flux')) return 'Black Forest Labs'
  if (value.includes('ltx')) return 'Lightricks'
  if (value.includes('elevenlabs')) return 'ElevenLabs'
  if (value.includes('birefnet')) return 'BRIA'
  if (value.includes('sync-lipsync')) return 'Sync'
  return value.startsWith('fal-ai/') ? 'fal.ai' : titleCase(value.split('/')[0] ?? 'Other')
}

function readStored(provider: CatalogProvider): StoredCatalog | null {
  const raw = readSetting(CATALOG_SETTING(provider))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredCatalog
    if (!Array.isArray(parsed.entries)) return null
    return parsed
  } catch {
    return null
  }
}

function sourceIdFor(model: ModelDefinition, provider: ProviderId): string {
  if (provider === 'sunra') {
    return model.kind === 'image'
      ? (SUNRA_IMAGE_SPECS[model.id]?.apiId ?? model.id)
      : (SUNRA_VIDEO_SPECS[model.id]?.apiId ?? model.id)
  }
  if (provider === 'fal') return FAL_IMAGE_SPECS[model.id]?.endpoint ?? model.id
  return model.id
}

function supportedEntries(): ModelCatalogEntry[] {
  return ALL_MODELS.flatMap((model) =>
    model.providers.map((provider) => ({
      key: `${provider}:${model.id}`,
      label: model.label,
      company: model.providerLabel,
      provider,
      providerLabel: providerLabel(provider),
      kind: model.kind,
      price: model.price ?? null,
      sourceId: sourceIdFor(model, provider),
      editSourceId: provider === 'fal' ? (FAL_IMAGE_SPECS[model.id]?.editEndpoint ?? null) : null,
      schemaUrl: null,
      supported: true,
      available: true,
      limitation: null,
      modelId: model.id,
    })),
  )
}

export function buildModelCatalog(): ModelCatalogView {
  const entries = supportedEntries()
  const byModel = new Map(entries.map((entry) => [`${entry.provider}:${entry.modelId}`, entry] as const))
  const byKey = new Map(entries.map((entry) => [entry.key, entry] as const))
  const sources: ModelCatalogSource[] = []

  for (const provider of ['sunra', 'fal'] as const) {
    const stored = readStored(provider)
    const info = SOURCE_INFO[provider]
    if (stored) {
      for (const storedEntry of stored.entries) {
        if (storedEntry.supported && storedEntry.modelId) {
          const target = byModel.get(`${storedEntry.provider}:${storedEntry.modelId}`)
          if (!target) continue
          target.price = cleanPrice(storedEntry.price) ?? target.price
          target.label = storedEntry.label || target.label
          target.sourceId = storedEntry.sourceId || target.sourceId
          continue
        }
        if (byKey.has(storedEntry.key)) continue
        const sourceId = storedEntry.sourceId || storedEntry.key
        byKey.set(storedEntry.key, {
          ...storedEntry,
          sourceId,
          price: cleanPrice(storedEntry.price),
          editSourceId: storedEntry.editSourceId ?? null,
          schemaUrl: storedEntry.schemaUrl ?? null,
          available: storedEntry.available ?? true,
          limitation: storedEntry.limitation ?? null,
          company:
            storedEntry.company ||
            (storedEntry.provider === 'fal' ? falCompany(sourceId) : companyName(undefined, sourceId)),
        })
      }
    }
    sources.push({
      id: provider,
      label: info.label,
      docsUrl: info.docsUrl,
      updatedAt: stored?.updatedAt ?? null,
      priced: stored?.priced ?? false,
      count: stored?.entries.length ?? 0,
    })
  }

  const catalogEntries = [...byKey.values()].sort(
    (left, right) =>
      Number(right.supported) - Number(left.supported) ||
      left.provider.localeCompare(right.provider) ||
      left.label.localeCompare(right.label),
  )
  const updatedAt = sources.reduce<number | null>(
    (current, source) => (source.updatedAt === null ? current : Math.max(current ?? 0, source.updatedAt)),
    null,
  )
  return { entries: catalogEntries, sources, updatedAt }
}

interface SunraModel {
  id: string
  name?: string
  display_name?: string
  alias?: string
  tags?: string[]
  owner?: { name?: string }
  openapi?: string
  endpoints?: Array<{ name?: string }>
}

const COMPATIBLE_SUNRA_ENDPOINTS: Record<string, true> = {
  'text-to-image': true,
  'image-editing': true,
  'text-to-video': true,
  'image-to-video': true,
  'reference-to-video': true,
}

function sunraAvailability(
  endpoints: string[] | undefined,
  supported: boolean,
): { available: boolean; limitation: string | null } {
  if (supported) return { available: true, limitation: null }
  if (!endpoints || endpoints.length === 0) return { available: true, limitation: null }
  if (endpoints.some((endpoint) => COMPATIBLE_SUNRA_ENDPOINTS[endpoint])) {
    return { available: true, limitation: null }
  }
  return {
    available: false,
    limitation: `Requires ${endpoints[0]?.replaceAll('-', ' ') ?? 'a different input flow'}`,
  }
}

interface SunraPrice {
  id: string
  model_name?: string
  model_endpoint?: string
  display?: string
}

function sunraSupportMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const model of IMAGE_MODELS) {
    if (!model.providers.includes('sunra')) continue
    const spec = SUNRA_IMAGE_SPECS[model.id]
    if (spec) map.set(spec.apiId, model.id)
  }
  for (const model of VIDEO_MODELS) {
    if (!model.providers.includes('sunra')) continue
    const spec = SUNRA_VIDEO_SPECS[model.id]
    if (!spec) continue
    map.set(spec.apiId, model.id)
    for (const alias of Object.values(spec.apiIdByMode ?? {})) map.set(alias, model.id)
  }
  return map
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} returned ${response.status}`)
  }
  return (await response.json()) as T
}

async function fetchSunraModels(): Promise<SunraModel[]> {
  const models: SunraModel[] = []
  let url = SUNRA_MODELS_URL
  for (let page = 0; page < 6; page += 1) {
    const payload = await fetchJson<{ data?: SunraModel[]; has_more?: boolean }>(url)
    models.push(...(payload.data ?? []))
    const last = payload.data?.at(-1)
    if (!payload.has_more || !last) break
    url = `${SUNRA_MODELS_URL}&starting_after=${encodeURIComponent(last.id)}`
  }
  return models
}

async function fetchSunraPrices(key: string | null): Promise<SunraPrice[]> {
  if (!key) return []
  const prices: SunraPrice[] = []
  let url = SUNRA_PRICING_URL
  for (let page = 0; page < 6; page += 1) {
    const payload = await fetchJson<{ data?: SunraPrice[]; has_more?: boolean }>(url, {
      Authorization: `Key ${key}`,
    })
    prices.push(...(payload.data ?? []))
    const last = payload.data?.at(-1)
    if (!payload.has_more || !last) break
    url = `${SUNRA_PRICING_URL}&starting_after=${encodeURIComponent(last.id)}`
  }
  return prices
}

function sunraPrice(rows: SunraPrice[] | undefined, kind: 'image' | 'video'): string | null {
  if (!rows || rows.length === 0) return null
  const preferred =
    kind === 'image'
      ? ['text-to-image', 'image-editing']
      : ['text-to-video', 'image-to-video', 'reference-to-video']
  for (const endpoint of preferred) {
    const match = rows.find((row) => row.model_endpoint === endpoint)
    const cleaned = cleanPrice(match?.display)
    if (cleaned) return cleaned
  }
  for (const row of rows) {
    const cleaned = cleanPrice(row.display)
    if (cleaned) return cleaned
  }
  return null
}

async function syncSunra(): Promise<{ entries: ModelCatalogEntry[]; priced: boolean }> {
  const models = await fetchSunraModels()
  const key = readSetting('provider.sunra.key')?.trim() || process.env.SUNRA_API_KEY?.trim() || null
  let prices: SunraPrice[] = []
  let priced = false
  if (key) {
    try {
      prices = await fetchSunraPrices(key)
      priced = prices.length > 0
    } catch {
      priced = false
    }
  }

  const priceRows = new Map<string, SunraPrice[]>()
  for (const row of prices) {
    if (!row.model_name) continue
    const list = priceRows.get(row.model_name) ?? []
    list.push(row)
    priceRows.set(row.model_name, list)
  }

  const support = sunraSupportMap()
  const entries: ModelCatalogEntry[] = []
  for (const model of models) {
    const tags = new Set(model.tags ?? [])
    const alias = model.alias ?? model.name ?? model.id
    const modelId = support.get(alias)
    const kind = tags.has('video') && !tags.has('image') ? 'video' : tags.has('image') ? 'image' : null
    if (!kind && !modelId) continue
    const shortName = alias.split('/').pop() ?? alias
    const price = sunraPrice(priceRows.get(alias) ?? priceRows.get(shortName), kind ?? 'image')
    const endpoints = (model.endpoints ?? [])
      .map((endpoint) => endpoint.name)
      .filter((name): name is string => Boolean(name))
    const availability = sunraAvailability(endpoints, Boolean(modelId))
    entries.push({
      key: `sunra:${alias}`,
      label: model.display_name ?? model.name ?? alias,
      company: companyName(model.owner?.name, alias),
      provider: 'sunra',
      providerLabel: providerLabel('sunra'),
      kind: kind ?? (modelId ? (ALL_MODELS.find((entry) => entry.id === modelId)?.kind ?? 'image') : 'image'),
      price,
      sourceId: alias,
      editSourceId: null,
      schemaUrl: model.openapi ?? null,
      supported: Boolean(modelId),
      available: availability.available,
      limitation: availability.limitation,
      modelId: modelId ?? null,
    })
  }
  return { entries, priced }
}

interface FalDocModel {
  endpoint_id: string
  label: string
  kind: 'image' | 'video'
  inputs: string[]
  outputs: string[]
}

const FAL_COMPATIBLE_OUTPUTS: Record<string, true> = { Image: true, Video: true }

function flowTypes(cell: string): { inputs: string[]; outputs: string[] } {
  const [inputPart = '', outputPart = ''] = cell.split('→')
  const split = (value: string) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  return { inputs: split(inputPart), outputs: split(outputPart) }
}

function falAvailability(
  inputs: string[],
  outputs: string[],
  required: string[] = [],
): { available: boolean; limitation: string | null } {
  if (outputs.length > 0 && !outputs.some((output) => FAL_COMPATIBLE_OUTPUTS[output])) {
    return { available: false, limitation: 'No image or video output' }
  }
  if (required.length > 0) {
    const unsupported = required.find((field) => /(video|audio|pdf|mask|mesh|3d|depth)/i.test(field))
    if (unsupported) {
      return { available: false, limitation: `Requires ${unsupported.replaceAll('_', ' ')} input` }
    }
    const unknown = required.find(
      (field) =>
        field !== 'prompt' &&
        field !== 'num_images' &&
        field !== 'output_format' &&
        field !== 'aspect_ratio' &&
        !/image|photo|frame|reference/i.test(field),
    )
    if (unknown) {
      return { available: false, limitation: `Requires ${unknown.replaceAll('_', ' ')} input` }
    }
    return { available: true, limitation: null }
  }
  const unsupportedInput = inputs.find((input) => input === 'Audio' || input === 'Video' || input === '3D')
  if (unsupportedInput) {
    return { available: false, limitation: `Requires ${unsupportedInput.toLowerCase()} input` }
  }
  return { available: true, limitation: null }
}

interface FalExpandedModel {
  endpoint_id: string
  openapi?: {
    paths?: Record<
      string,
      {
        post?: {
          requestBody?: {
            content?: {
              'application/json'?: {
                schema?: { $ref?: string; required?: string[] }
              }
            }
          }
        }
      }
    >
    components?: { schemas?: Record<string, { required?: string[] }> }
  }
}

async function fetchFalSchemas(endpointIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  for (let index = 0; index < endpointIds.length; index += 10) {
    const batch = endpointIds.slice(index, index + 10)
    const params = new URLSearchParams({ expand: 'openapi-3.0' })
    for (const endpoint of batch) params.append('endpoint_id', endpoint)
    try {
      const payload = await fetchJson<{ models?: FalExpandedModel[] }>(`${FAL_MODELS_API}?${params}`)
      for (const model of payload.models ?? []) {
        const paths = model.openapi?.paths ?? {}
        const pathKey = Object.keys(paths).find((key) => !key.includes('{') && paths[key]?.post)
        const schema = pathKey
          ? paths[pathKey]?.post?.requestBody?.content?.['application/json']?.schema
          : undefined
        const resolved = schema?.$ref
          ? model.openapi?.components?.schemas?.[schema.$ref.split('/').pop() ?? '']
          : schema
        result.set(model.endpoint_id, resolved?.required ?? [])
      }
    } catch {
      // Fall back to docs input hints for this batch.
    }
  }
  return result
}

interface FalPrice {
  endpoint_id: string
  unit_price: number
  unit: string
  currency: string
}

const FAL_DOC_SECTIONS: Record<string, 'image' | 'video'> = {
  'Generate Video': 'video',
  'Edit and Transform Video': 'video',
  'Generate Images': 'image',
  'Edit and Transform Images': 'image',
}

function falDocLabel(cell: string): string {
  return cell
    .replace(/\[API\]\([^)]*\)/gi, '')
    .replace(/\[Model page\]\([^)]*\)/gi, '')
    .replace(/·/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\\([\\[\]])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchFalDocs(): Promise<FalDocModel[]> {
  const response = await fetch(FAL_DOCS_URL, {
    headers: { Accept: 'text/markdown' },
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) throw new Error(`fal docs returned ${response.status}`)
  const text = await response.text()
  const models = new Map<string, FalDocModel>()
  let current: 'image' | 'video' | null = null

  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      current = FAL_DOC_SECTIONS[line.slice(3).trim()] ?? null
      continue
    }
    if (!current) continue
    const match = /^\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*`([^`]+)`\s*\|\s*(.*?)\s*\|/.exec(line)
    if (!match) continue
    const endpoint = match[3]?.trim()
    if (!endpoint || models.has(endpoint)) continue
    const flows = flowTypes(match[4] ?? '')
    models.set(endpoint, {
      endpoint_id: endpoint,
      label: falDocLabel(match[1] ?? endpoint),
      kind: current,
      inputs: flows.inputs,
      outputs: flows.outputs,
    })
  }
  return [...models.values()]
}

function falPrice(price: FalPrice | undefined): string | null {
  if (!price) return null
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: price.currency || 'USD',
    maximumFractionDigits: 4,
  }).format(price.unit_price)
  return cleanPrice(`${amount} / ${price.unit.replace(/s$/, '')}`)
}

async function fetchFalPrices(key: string | null, endpointIds: string[]): Promise<Map<string, FalPrice>> {
  const result = new Map<string, FalPrice>()
  if (!key) return result
  for (let index = 0; index < endpointIds.length; index += 50) {
    const batch = endpointIds.slice(index, index + 50)
    const params = new URLSearchParams({ endpoint_id: batch.join(',') })
    try {
      const payload = await fetchJson<{ prices?: FalPrice[] }>(`${FAL_PRICING_URL}?${params}`, {
        Authorization: `Key ${key}`,
      })
      for (const price of payload.prices ?? []) result.set(price.endpoint_id, price)
    } catch {
      // Keep the catalog even when one pricing batch fails.
    }
  }
  return result
}

async function syncFal(): Promise<{ entries: ModelCatalogEntry[]; priced: boolean }> {
  const docs = await fetchFalDocs()
  const key = readSetting('provider.fal.key')?.trim() || process.env.FAL_KEY?.trim() || null
  const models = new Map(docs.map((model) => [model.endpoint_id, model]))

  const support = new Map<string, string>()
  for (const model of IMAGE_MODELS) {
    if (!model.providers.includes('fal')) continue
    const spec = FAL_IMAGE_SPECS[model.id]
    if (!spec) continue
    support.set(spec.endpoint, model.id)
    if (!models.has(spec.endpoint)) {
      models.set(spec.endpoint, {
        endpoint_id: spec.endpoint,
        label: model.label,
        kind: model.kind,
        inputs: ['Text', 'Image'],
        outputs: ['Image'],
      })
    }
  }

  const endpoints = [...models.keys()]
  const schemas = await fetchFalSchemas(endpoints)
  const endpointSet = new Set(endpoints)

  let prices = new Map<string, FalPrice>()
  let priced = false
  if (key) {
    prices = await fetchFalPrices(key, endpoints)
    priced = prices.size > 0
  }

  const entries: ModelCatalogEntry[] = [...models.values()].map((model) => {
    const modelId = support.get(model.endpoint_id)
    const availability = falAvailability(model.inputs, model.outputs, schemas.get(model.endpoint_id) ?? [])
    const editSourceId =
      model.endpoint_id.endsWith('/edit') || !endpointSet.has(`${model.endpoint_id}/edit`)
        ? null
        : `${model.endpoint_id}/edit`
    return {
      key: `fal:${model.endpoint_id}`,
      label: model.label,
      company: falCompany(model.endpoint_id),
      provider: 'fal',
      providerLabel: providerLabel('fal'),
      kind: model.kind,
      price: falPrice(prices.get(model.endpoint_id)),
      sourceId: model.endpoint_id,
      editSourceId,
      schemaUrl: null,
      supported: Boolean(modelId),
      available: availability.available,
      limitation: availability.limitation,
      modelId: modelId ?? null,
    }
  })
  return { entries, priced }
}

export async function syncCatalog(provider: CatalogProvider): Promise<{
  provider: CatalogProvider
  count: number
  supported: number
  priced: boolean
  updatedAt: number
}> {
  const synced = provider === 'sunra' ? await syncSunra() : await syncFal()
  const snapshot: StoredCatalog = {
    updatedAt: Date.now(),
    priced: synced.priced,
    entries: synced.entries,
  }
  writeSetting(CATALOG_SETTING(provider), JSON.stringify(snapshot))
  return {
    provider,
    count: synced.entries.length,
    supported: synced.entries.filter((entry) => entry.supported).length,
    priced: synced.priced,
    updatedAt: snapshot.updatedAt,
  }
}
