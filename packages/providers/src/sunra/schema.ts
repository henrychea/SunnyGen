import { isArrayProperty, maxItemsOf, operationSchemas, parseOpenApi, type RequestSchema } from '../schema'
import type { AdapterContext } from '../types'
import { SUNRA_BASE } from './client'

export interface SunraModelSchema {
  alias: string
  docs: string
  operations: Record<string, RequestSchema>
  components: Record<string, unknown>
}

const MODEL_INDEX_TTL = 10 * 60_000

let indexCache: { at: number; entries: Map<string, string> } | null = null
const schemaCache = new Map<string, Promise<SunraModelSchema | null>>()

export function resetSunraSchemaCache(): void {
  indexCache = null
  schemaCache.clear()
}

interface SunraModelEntry {
  id?: string
  name?: string
  alias?: string
  openapi?: string
}

async function loadModelIndex(context: AdapterContext): Promise<Map<string, string>> {
  if (indexCache && Date.now() - indexCache.at < MODEL_INDEX_TTL) return indexCache.entries
  const entries = new Map<string, string>()
  let url = `${SUNRA_BASE}/models?limit=300`
  for (let page = 0; page < 6; page += 1) {
    const response = await context.fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) break
    const payload = (await response.json().catch(() => null)) as {
      data?: SunraModelEntry[]
      has_more?: boolean
    } | null
    const models = payload?.data ?? []
    for (const model of models) {
      if (!model.openapi) continue
      for (const key of [model.alias, model.name, model.id]) {
        if (key && !entries.has(key)) entries.set(key, model.openapi)
      }
    }
    const last = models.at(-1)
    if (!payload?.has_more || !last?.id) break
    url = `${SUNRA_BASE}/models?limit=300&starting_after=${encodeURIComponent(last.id)}`
  }
  if (entries.size > 0) indexCache = { at: Date.now(), entries }
  return entries
}

async function fetchSchemaDocument(
  context: AdapterContext,
  alias: string,
  docs: string,
): Promise<SunraModelSchema | null> {
  const response = await context.fetch(docs, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) return null
  const parsed = parseOpenApi(await response.json().catch(() => null))
  if (!parsed) return null
  const operations = operationSchemas(parsed)
  if (Object.keys(operations).length === 0) return null
  return { alias, docs, operations, components: parsed.components }
}

export async function fetchSunraSchema(
  context: AdapterContext,
  alias: string,
  schemaUrl?: string | null,
): Promise<SunraModelSchema | null> {
  const cached = schemaCache.get(alias)
  if (cached) return cached

  const pending = (async () => {
    try {
      let docs = schemaUrl ?? (await loadModelIndex(context)).get(alias)
      if (!docs) return null
      let schema = await fetchSchemaDocument(context, alias, docs)
      if (!schema && schemaUrl) {
        const fallback = (await loadModelIndex(context)).get(alias)
        if (fallback && fallback !== docs) {
          docs = fallback
          schema = await fetchSchemaDocument(context, alias, docs)
        }
      }
      return schema
    } catch {
      return null
    }
  })()

  schemaCache.set(alias, pending)
  const schema = await pending
  if (!schema) schemaCache.delete(alias)
  return schema
}

export interface SunraOperation {
  name: string
  schema: RequestSchema
}

export function pickOperation(schema: SunraModelSchema | null, order: string[]): SunraOperation | null {
  if (!schema) return null
  for (const name of order) {
    const operation = schema.operations[name]
    if (operation) return { name, schema: operation }
  }
  return null
}

const EDIT_OPERATIONS = ['image-editing', 'image-to-image', 'reference-images-to-image']

export function sunraImageOperations(schema: SunraModelSchema | null): {
  text: SunraOperation | null
  edit: SunraOperation | null
} {
  return {
    text: pickOperation(schema, ['text-to-image']),
    edit: pickOperation(schema, EDIT_OPERATIONS),
  }
}

const IMAGE_FIELDS = [
  'image_urls',
  'images',
  'image_url',
  'image',
  'reference_images',
  'reference_image_urls',
  'input_images',
  'input_image',
] as const

export function sunraImageField(schema: RequestSchema | null): string | null {
  if (!schema) return null
  return IMAGE_FIELDS.find((name) => name in schema.properties) ?? null
}

export const DEFAULT_IMAGE_LIMIT = 10

export interface SunraImageCapabilities {
  textOperation: string | null
  editOperation: string | null
  editPath: string | null
  imageField: string | null
  maxImages: number
  supportsImages: boolean
  supportsText: boolean
}

export function sunraImageCapabilities(schema: SunraModelSchema | null): SunraImageCapabilities {
  const { text, edit } = sunraImageOperations(schema)
  const field = edit ? sunraImageField(edit.schema) : null
  const property = edit && field ? edit.schema.properties[field] : undefined
  const array = property ? isArrayProperty(property, schema?.components ?? {}) : false
  const declared = property ? maxItemsOf(property, schema?.components ?? {}) : null
  const maxImages = property ? (declared ?? (array ? DEFAULT_IMAGE_LIMIT : 1)) : 0
  return {
    textOperation: text?.name ?? null,
    editOperation: edit?.name ?? null,
    editPath: edit?.schema.path ?? null,
    imageField: field,
    maxImages,
    supportsImages: Boolean(edit && field),
    supportsText: Boolean(text),
  }
}
