import {
  ALL_MODELS,
  IMAGE_MODELS,
  PROVIDERS,
  VIDEO_MODELS,
  type ModelDefinition,
  type ProviderId,
} from '@sunnygen/core'
import { FAL_IMAGE_SPECS, SUNRA_IMAGE_SPECS, SUNRA_VIDEO_SPECS } from '@sunnygen/providers/models'
import {
  falImageCapabilities,
  falOpenApiUrl,
  parseFalOpenApi,
  parseOpenApi,
  operationSchemas,
  sunraImageCapabilities,
  type FalRequestSchema,
  type SunraImageCapabilities,
} from '@sunnygen/providers'
import { readSetting, writeSetting } from '@sunnygen/db'
import { falModelCapabilities, sunraEditOperation, sunraModelCapabilities } from './model-capabilities'
import { CATALOG_VERSION, catalogNeedsResync, storedEntryCapabilities } from './model-catalog.stale'
import type {
  CatalogProvider,
  ModelCatalogEntry,
  ModelCatalogSource,
  ModelCatalogView,
} from './model-catalog.types'

const SUNRA_MODELS_URL = 'https://api.sunra.ai/v1/models?limit=300'
const SUNRA_PRICING_URL = 'https://api.sunra.ai/v1/pricing?limit=1000'
const FAL_DOCS_URL = 'https://fal.ai/docs/documentation/model-apis/models.md'
const FAL_PRICING_URL = 'https://api.fal.ai/v1/models/pricing'
const CATALOG_SETTING = (provider: CatalogProvider) => `models.catalog.${provider}`
const CATALOG_SYNC_RETRY_MS = 5 * 60_000

interface StoredCatalog {
  version?: number
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

const catalogSyncs = new Set<CatalogProvider>()
const catalogSyncAttempts = new Map<CatalogProvider, number>()

function scheduleCatalogSync(provider: CatalogProvider): void {
  if (catalogSyncs.has(provider)) return
  const attempted = catalogSyncAttempts.get(provider) ?? 0
  if (Date.now() - attempted < CATALOG_SYNC_RETRY_MS) return
  catalogSyncs.add(provider)
  catalogSyncAttempts.set(provider, Date.now())
  void syncCatalog(provider)
    .catch(() => undefined)
    .finally(() => catalogSyncs.delete(provider))
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
      supportsImages: model.supportsImages,
      supportsText: true,
      maxImages: model.maxImages,
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
          if (target.kind === 'image' && storedEntry.maxImages > 0) {
            target.maxImages = Math.min(target.maxImages, storedEntry.maxImages)
          }
          continue
        }
        if (byKey.has(storedEntry.key)) continue
        const sourceId = storedEntry.sourceId || storedEntry.key
        const capabilities = storedEntryCapabilities(storedEntry)
        byKey.set(storedEntry.key, {
          ...storedEntry,
          sourceId,
          price: cleanPrice(storedEntry.price),
          editSourceId: storedEntry.editSourceId ?? null,
          schemaUrl: storedEntry.schemaUrl ?? null,
          available: storedEntry.available ?? true,
          limitation: storedEntry.limitation ?? null,
          supportsImages: capabilities.supportsImages,
          supportsText: capabilities.supportsText,
          maxImages: capabilities.maxImages,
          company:
            storedEntry.company ||
            (storedEntry.provider === 'fal' ? falCompany(sourceId) : companyName(undefined, sourceId)),
        })
      }
    }
    if (catalogNeedsResync(stored)) scheduleCatalogSync(provider)
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

const SUNRA_MODEL_SCHEMA_TIMEOUT = 15_000

async function fetchSunraImageSchemas(models: SunraModel[]): Promise<Map<string, SunraImageCapabilities>> {
  const result = new Map<string, SunraImageCapabilities>()
  const targets = models.filter((model) => {
    const endpoints = (model.endpoints ?? []).map((endpoint) => endpoint.name).filter(Boolean)
    return Boolean(model.openapi) && sunraEditOperation(endpoints as string[]) !== null
  })
  const queue = [...targets]
  const worker = async () => {
    for (let model = queue.shift(); model; model = queue.shift()) {
      const alias = model.alias ?? model.name ?? model.id
      try {
        const response = await fetch(model.openapi as string, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(SUNRA_MODEL_SCHEMA_TIMEOUT),
        })
        if (!response.ok) continue
        const parsed = parseOpenApi(await response.json())
        if (!parsed) continue
        const operations = operationSchemas(parsed)
        result.set(
          alias,
          sunraImageCapabilities({
            operations,
            components: parsed.components,
          }),
        )
      } catch {
        continue
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker))
  return result
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
  const imageSchemas = await fetchSunraImageSchemas(models)
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
    const resolvedKind =
      kind ?? (modelId ? (ALL_MODELS.find((entry) => entry.id === modelId)?.kind ?? 'image') : 'image')
    const capabilities = sunraModelCapabilities(endpoints, imageSchemas.get(alias) ?? null, alias)
    entries.push({
      key: `sunra:${alias}`,
      label: model.display_name ?? model.name ?? alias,
      company: companyName(model.owner?.name, alias),
      provider: 'sunra',
      providerLabel: providerLabel('sunra'),
      kind: resolvedKind,
      price,
      sourceId: alias,
      editSourceId: resolvedKind === 'image' ? capabilities.editSourceId : null,
      schemaUrl: model.openapi ?? null,
      supported: Boolean(modelId),
      available: Boolean(modelId) || capabilities.available,
      limitation: capabilities.limitation,
      modelId: modelId ?? null,
      supportsImages:
        resolvedKind === 'video'
          ? endpoints.includes('image-to-video') || endpoints.includes('reference-to-video')
          : capabilities.supportsImages,
      supportsText:
        resolvedKind === 'video' ? endpoints.includes('text-to-video') : capabilities.supportsText,
      maxImages: resolvedKind === 'video' ? 2 : capabilities.maxImages,
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

function flowTypes(cell: string): { inputs: string[]; outputs: string[] } {
  const [inputPart = '', outputPart = ''] = cell.split('→')
  const split = (value: string) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  return { inputs: split(inputPart), outputs: split(outputPart) }
}

const FAL_SCHEMA_TIMEOUT = 15_000

async function fetchFalEndpointSchema(endpoint: string): Promise<FalRequestSchema | null> {
  try {
    const response = await fetch(falOpenApiUrl(endpoint), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FAL_SCHEMA_TIMEOUT),
    })
    if (!response.ok) return null
    return parseFalOpenApi(await response.json())
  } catch {
    return null
  }
}

async function fetchFalSchemas(endpointIds: string[]): Promise<Map<string, FalRequestSchema | null>> {
  const result = new Map<string, FalRequestSchema | null>()
  const queue = [...endpointIds]
  const worker = async () => {
    for (let endpoint = queue.shift(); endpoint; endpoint = queue.shift()) {
      result.set(endpoint, await fetchFalEndpointSchema(endpoint))
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, queue.length) }, worker))
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
  const candidates = endpoints.filter(
    (endpoint) => models.get(endpoint)?.kind === 'image' && !endpoint.endsWith('/edit'),
  )
  const probes = [...endpoints, ...candidates.map((endpoint) => `${endpoint}/edit`)]
  const schemas = await fetchFalSchemas(probes)

  let prices = new Map<string, FalPrice>()
  let priced = false
  if (key) {
    prices = await fetchFalPrices(key, endpoints)
    priced = prices.size > 0
  }

  const entries: ModelCatalogEntry[] = [...models.values()].map((model) => {
    const modelId = support.get(model.endpoint_id)
    const base = schemas.get(model.endpoint_id) ?? null
    const edit = schemas.get(`${model.endpoint_id}/edit`) ?? null
    const capabilities = falModelCapabilities({
      endpoint: model.endpoint_id,
      base: base ? falImageCapabilities(base) : null,
      edit: edit ? falImageCapabilities(edit) : null,
      required: base?.required ?? [],
      docsInputs: model.inputs,
      docsOutputs: model.outputs,
    })
    return {
      key: `fal:${model.endpoint_id}`,
      label: model.label,
      company: falCompany(model.endpoint_id),
      provider: 'fal',
      providerLabel: providerLabel('fal'),
      kind: model.kind,
      price: falPrice(prices.get(model.endpoint_id)),
      sourceId: model.endpoint_id,
      editSourceId: capabilities.editSourceId,
      schemaUrl: null,
      supported: Boolean(modelId),
      available: Boolean(modelId) || capabilities.available,
      limitation: capabilities.limitation,
      modelId: modelId ?? null,
      supportsImages: model.kind === 'image' ? capabilities.supportsImages : model.inputs.includes('Image'),
      supportsText: capabilities.supportsText,
      maxImages: model.kind === 'image' ? capabilities.maxImages : Math.max(1, capabilities.maxImages || 2),
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
    version: CATALOG_VERSION,
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
