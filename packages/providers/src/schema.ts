export interface RequestSchema {
  path: string
  required: string[]
  properties: Record<string, unknown>
  closed: boolean
}

export interface ParsedOpenApi {
  paths: Record<string, RequestSchema>
  components: Record<string, unknown>
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function variants(
  value: unknown,
  components: Record<string, unknown>,
  depth = 0,
): Array<Record<string, unknown>> {
  const record = asRecord(value)
  if (!record || depth > 6) return []
  if (typeof record.$ref === 'string') {
    const name = record.$ref.split('/').pop()
    return name && components[name] ? variants(components[name], components, depth + 1) : []
  }
  const nested: Array<Record<string, unknown>> = []
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    const list = record[key]
    if (!Array.isArray(list)) continue
    for (const entry of list) nested.push(...variants(entry, components, depth + 1))
  }
  return nested.length > 0 ? nested : [record]
}

export function enumValues(property: unknown, components: Record<string, unknown>): string[] {
  const values = new Set<string>()
  for (const variant of variants(property, components)) {
    if (!Array.isArray(variant.enum)) continue
    for (const value of variant.enum) {
      if (typeof value === 'string' || typeof value === 'number') values.add(String(value))
    }
  }
  return [...values]
}

export function propertyType(property: unknown, components: Record<string, unknown>): string | null {
  for (const variant of variants(property, components)) {
    const type = typeof variant.type === 'string' ? variant.type : null
    if (type) return type
    if (asRecord(variant.properties)) return 'object'
    if (variant.items) return 'array'
  }
  return null
}

export function isArrayProperty(property: unknown, components: Record<string, unknown>): boolean {
  return propertyType(property, components) === 'array'
}

const BASE_IMAGE_FIELDS = ['image_url', 'input_image_url', 'input_image', 'image'] as const

export function baseImageField(
  properties: Record<string, unknown>,
  components: Record<string, unknown>,
  excluded: string,
): string | null {
  const field = BASE_IMAGE_FIELDS.find(
    (name) => name !== excluded && name in properties && !isArrayProperty(properties[name], components),
  )
  return field ?? null
}

export function acceptsObject(property: unknown, components: Record<string, unknown>): boolean {
  return propertyType(property, components) === 'object'
}

export function maxItemsOf(property: unknown, components: Record<string, unknown>): number | null {
  for (const variant of variants(property, components)) {
    if (typeof variant.maxItems === 'number') return variant.maxItems
  }
  return null
}

export function maxLengthOf(property: unknown, components: Record<string, unknown>): number | null {
  for (const variant of variants(property, components)) {
    if (typeof variant.maxLength === 'number') return variant.maxLength
  }
  return null
}

export function numericBounds(
  property: unknown,
  components: Record<string, unknown>,
): { min: number | null; max: number | null } {
  let min: number | null = null
  let max: number | null = null
  for (const variant of variants(property, components)) {
    if (typeof variant.minimum === 'number')
      min = min === null ? variant.minimum : Math.max(min, variant.minimum)
    if (typeof variant.maximum === 'number')
      max = max === null ? variant.maximum : Math.min(max, variant.maximum)
  }
  return { min, max }
}

const QUALITY_RANK: Record<string, number> = {
  '0.5k': 0,
  '768sq': 0,
  '1k': 1,
  '1.5k': 1,
  '2k': 2,
  '3k': 3,
  '4k': 4,
}

const QUALITY_TIER: Record<string, number> = {
  '0.5k': 0,
  '768sq': 0,
  '1k': 0,
  '1.5k': 1,
  '2k': 1,
  '3k': 2,
  '4k': 2,
}

const QUALITY_LADDERS: string[][] = [
  ['low', 'medium', 'high', 'xhigh', 'max'],
  ['standard', 'high'],
  ['standard', 'high', 'ultra'],
]

function numericOrder(value: string): number | null {
  const tier = QUALITY_RANK[value.toLowerCase()]
  if (tier !== undefined) return tier
  if (!/^[\d.]+(?:k|mp|sq)?$/i.test(value)) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isNumericEnum(allowed: string[]): boolean {
  return allowed.every((value) => /^[\d.]+(?:k|mp|sq)?$/i.test(value))
}

function ladderOrder(allowed: string[]): string[] | null {
  const lower = allowed.map((value) => value.toLowerCase())
  for (const ladder of QUALITY_LADDERS) {
    if (!lower.every((value) => ladder.includes(value))) continue
    return [...allowed].sort((left, right) => {
      return ladder.indexOf(left.toLowerCase()) - ladder.indexOf(right.toLowerCase())
    })
  }
  return null
}

export function matchEnumValue(allowed: string[], wanted: string | undefined | null): string | null {
  if (!wanted) return null
  const trimmed = wanted.trim()
  if (!trimmed) return null
  const exact = allowed.find((value) => value === trimmed)
  if (exact) return exact
  const insensitive = allowed.find((value) => value.toLowerCase() === trimmed.toLowerCase())
  if (insensitive) return insensitive

  const ladder = ladderOrder(allowed)
  if (ladder) {
    const tier = QUALITY_TIER[trimmed.toLowerCase()]
    if (tier === undefined) return null
    const index = Math.round((tier / 2) * (ladder.length - 1))
    return ladder[index] ?? null
  }

  const wantedOrder = numericOrder(trimmed)
  if (wantedOrder === null || !isNumericEnum(allowed)) return null
  let best: { value: string; distance: number; order: number } | null = null
  for (const value of allowed) {
    const order = numericOrder(value)
    if (order === null) continue
    const distance = Math.abs(order - wantedOrder)
    if (!best || distance < best.distance || (distance === best.distance && order > best.order)) {
      best = { value, distance, order }
    }
  }
  return best?.value ?? null
}

export function clampNumber(value: number, min: number | null, max: number | null): number {
  let next = value
  if (min !== null && next < min) next = min
  if (max !== null && next > max) next = max
  return next
}

export function parseOpenApi(value: unknown): ParsedOpenApi | null {
  const document = asRecord(value)
  const schemaPaths = asRecord(document?.paths)
  if (!schemaPaths) return null
  const components = asRecord(document?.components)
  const schemas = asRecord(components?.schemas) ?? {}
  const paths: Record<string, RequestSchema> = {}

  for (const [path, entry] of Object.entries(schemaPaths)) {
    const post = asRecord(asRecord(entry)?.post)
    const body = asRecord(asRecord(asRecord(post?.requestBody)?.content)?.['application/json'])
    const raw = asRecord(body?.schema)
    if (!raw) continue
    const target = typeof raw.$ref === 'string' ? asRecord(schemas[raw.$ref.split('/').pop() ?? '']) : raw
    const properties = asRecord(target?.properties)
    if (!properties) continue
    paths[path] = {
      path,
      required: Array.isArray(target?.required)
        ? target.required.filter((name): name is string => typeof name === 'string')
        : [],
      properties,
      closed: target?.additionalProperties === false,
    }
  }
  return { paths, components: schemas }
}

export function operationSchemas(parsed: ParsedOpenApi): Record<string, RequestSchema> {
  const result: Record<string, RequestSchema> = {}
  for (const [path, schema] of Object.entries(parsed.paths)) {
    const operation = path.split('/').filter(Boolean).pop()
    if (operation) result[operation] = schema
  }
  return result
}

export function schemaValue(
  key: string,
  schema: RequestSchema,
  components: Record<string, unknown>,
  wanted: unknown,
): unknown {
  const property = schema.properties[key]
  if (!property) return undefined
  const allowed = enumValues(property, components)
  if (allowed.length > 0) {
    const matched = matchEnumValue(allowed, wanted === null ? null : String(wanted))
    if (matched === null) return undefined
    const type = propertyType(property, components)
    return type === 'integer' || type === 'number' ? Number(matched) : matched
  }
  if (wanted === undefined || wanted === null) return undefined
  const type = propertyType(property, components)
  if (type === 'integer' || type === 'number') {
    const numeric = Number(wanted)
    if (!Number.isFinite(numeric)) return undefined
    const bounds = numericBounds(property, components)
    return type === 'integer'
      ? Math.round(clampNumber(numeric, bounds.min, bounds.max))
      : clampNumber(numeric, bounds.min, bounds.max)
  }
  if (type === 'boolean') return Boolean(wanted)
  if (type === 'string') return String(wanted)
  return undefined
}

export function conformBody(
  body: Record<string, unknown>,
  schema: RequestSchema,
  components: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue
    const property = schema.properties[key]
    if (!property) continue
    const allowed = enumValues(property, components)
    if (allowed.length > 0) {
      const matched = matchEnumValue(allowed, String(value))
      if (matched !== null) {
        const type = propertyType(property, components)
        result[key] = type === 'integer' || type === 'number' ? Number(matched) : matched
      }
      continue
    }
    if (Array.isArray(value)) {
      const max = maxItemsOf(property, components)
      const list = max === null ? value : value.slice(0, max)
      const numericItems =
        propertyType(property, components) === 'array' ? itemsNumeric(property, components) : false
      result[key] = numericItems ? list.map((entry) => Number(entry)) : list
      continue
    }
    const type = propertyType(property, components)
    if (type === 'integer' || type === 'number') {
      const numeric = Number(value)
      if (Number.isFinite(numeric)) {
        const bounds = numericBounds(property, components)
        const clamped = clampNumber(numeric, bounds.min, bounds.max)
        result[key] = type === 'integer' ? Math.round(clamped) : clamped
      }
      continue
    }
    if (type === 'string' && typeof value !== 'string') {
      result[key] = String(value)
      continue
    }
    result[key] = value
  }
  return result
}

function itemsNumeric(property: unknown, components: Record<string, unknown>): boolean {
  for (const variant of variants(property, components)) {
    const items = asRecord(variant.items)
    if (!items) continue
    if (items.type === 'integer' || items.type === 'number') return true
  }
  return false
}

export function missingRequired(body: Record<string, unknown>, schema: RequestSchema): string[] {
  return schema.required.filter((key) => (!(key in schema.properties) ? false : body[key] === undefined))
}
