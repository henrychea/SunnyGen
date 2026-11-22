import { readdirSync, readFileSync } from 'node:fs'
import type { AdapterContext } from './types'

export interface JsonSchema {
  [key: string]: unknown
}

export interface OpenApiFixture {
  openapi?: string
  info?: { title?: string; docs?: string }
  paths: Record<
    string,
    { post?: { requestBody?: { content?: { 'application/json'?: { schema?: JsonSchema } } } } }
  >
}

export interface DocumentedOperation {
  name: string
  path: string
  schema: JsonSchema
}

function fixtureUrl(relative: string): URL {
  return new URL(`./__fixtures__/${relative}`, import.meta.url)
}

export type FixtureDocument = Record<string, unknown>

export function loadFixture<T = FixtureDocument>(relative: string): T {
  return JSON.parse(readFileSync(fixtureUrl(relative), 'utf8')) as T
}

export function fixtureNames(provider: 'sunra' | 'fal' | 'fal-video' | 'azure' | 'codex'): string[] {
  return readdirSync(fixtureUrl(provider))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort()
}

const openapiCache = new Map<string, OpenApiFixture>()

export function openApiFixture(provider: 'sunra' | 'fal' | 'fal-video', name: string): OpenApiFixture {
  const key = `${provider}/${name}`
  const cached = openapiCache.get(key)
  if (cached) return cached
  const fixture = loadFixture<OpenApiFixture>(`${key}.json`)
  openapiCache.set(key, fixture)
  return fixture
}

export function documentedOperations(fixture: OpenApiFixture): DocumentedOperation[] {
  const operations: DocumentedOperation[] = []
  for (const [path, entry] of Object.entries(fixture.paths)) {
    const schema = entry.post?.requestBody?.content?.['application/json']?.schema
    if (!schema) continue
    operations.push({ name: path.split('/').filter(Boolean).pop() ?? path, path, schema })
  }
  return operations
}

export function documentedOperation(fixture: OpenApiFixture, name: string): DocumentedOperation | undefined {
  return documentedOperations(fixture).find((operation) => operation.name === name)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function variants(schema: JsonSchema): JsonSchema[] {
  const nested: JsonSchema[] = []
  for (const key of ['anyOf', 'oneOf']) {
    const list = schema[key]
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      const record = asRecord(entry)
      if (record) nested.push(record)
    }
  }
  return nested.length > 0 ? nested : [schema]
}

function schemaType(schema: JsonSchema): string | null {
  if (typeof schema.type === 'string') return schema.type
  if (asRecord(schema.properties)) return 'object'
  if (schema.items) return 'array'
  return null
}

function typeMatches(value: unknown, type: string): boolean {
  if (type === 'null') return value === null
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'string') return typeof value === 'string'
  return true
}

function validateValue(value: unknown, schema: JsonSchema, path: string, problems: string[]): void {
  const options = variants(schema)
  if (!options.some((option) => matchesValue(value, option))) {
    const types = options.map((option) => schemaType(option) ?? 'any')
    problems.push(`${path}: expected ${types.join(' or ')}, received ${JSON.stringify(value)}`)
    return
  }
  const matched = options.find((option) => matchesValue(value, option))
  if (!matched) return

  if (Array.isArray(matched.enum) && !matched.enum.some((entry) => entry === value)) {
    problems.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(matched.enum)}`)
  }
  if (typeof value === 'string') {
    if (typeof matched.maxLength === 'number' && value.length > matched.maxLength) {
      problems.push(`${path}: longer than ${matched.maxLength} characters`)
    }
    if (typeof matched.minLength === 'number' && value.length < matched.minLength) {
      problems.push(`${path}: shorter than ${matched.minLength} characters`)
    }
  }
  if (typeof value === 'number') {
    if (typeof matched.maximum === 'number' && value > matched.maximum) {
      problems.push(`${path}: above ${matched.maximum}`)
    }
    if (typeof matched.minimum === 'number' && value < matched.minimum) {
      problems.push(`${path}: below ${matched.minimum}`)
    }
  }
  if (Array.isArray(value)) {
    if (typeof matched.maxItems === 'number' && value.length > matched.maxItems) {
      problems.push(`${path}: ${value.length} items exceeds maxItems ${matched.maxItems}`)
    }
    if (typeof matched.minItems === 'number' && value.length < matched.minItems) {
      problems.push(`${path}: ${value.length} items is below minItems ${matched.minItems}`)
    }
    const items = asRecord(matched.items)
    if (items) {
      value.forEach((entry, index) => validateValue(entry, items, `${path}[${index}]`, problems))
    }
  }
  if (schemaType(matched) === 'object') {
    validateObject(value, matched, path, problems)
  }
}

function matchesValue(value: unknown, schema: JsonSchema): boolean {
  const type = schemaType(schema)
  if (type && !typeMatches(value, type)) return false
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => entry === value)) return false
  if (Array.isArray(value) && typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
    return false
  }
  if (schemaType(schema) === 'object') {
    const properties = asRecord(schema.properties) ?? {}
    const body = asRecord(value) ?? {}
    for (const key of Object.keys(body)) {
      if (!(key in properties) && schema.additionalProperties === false) return false
    }
    for (const key of requiredKeys(schema)) {
      if (!(key in body)) return false
    }
  }
  return true
}

function requiredKeys(schema: JsonSchema): string[] {
  return Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === 'string')
    : []
}

function validateObject(value: unknown, schema: JsonSchema, path: string, problems: string[]): void {
  const properties = asRecord(schema.properties) ?? {}
  const body = asRecord(value)
  if (!body) return
  for (const key of requiredKeys(schema)) {
    if (!(key in body)) problems.push(`${path}.${key}: required by the documented schema`)
  }
  for (const [key, entry] of Object.entries(body)) {
    const property = asRecord(properties[key])
    if (!property) {
      problems.push(`${path}.${key}: not in the documented request schema`)
      continue
    }
    validateValue(entry, property, `${path}.${key}`, problems)
  }
}

export function validateBody(body: unknown, schema: JsonSchema, label = 'body'): string[] {
  const problems: string[] = []
  const record = asRecord(schema)
  if (!record) {
    problems.push(`${label}: fixture has no request schema`)
    return problems
  }
  if (!asRecord(body)) {
    problems.push(`${label}: expected a JSON object`)
    return problems
  }
  validateValue(body, { ...record, additionalProperties: false }, label, problems)
  return problems
}

export type MockBody = Record<string, unknown> | string | null

export interface MockCall {
  url: string
  method: string
  body: MockBody
  contentType: string | null
}

export interface MockContext {
  context: AdapterContext
  calls: MockCall[]
  queueCalls(): MockCall[]
}

function parseBody(raw: unknown, contentType: string | null): MockBody {
  if (typeof raw !== 'string' || raw.length === 0) return null
  if (contentType?.includes('application/json')) {
    try {
      return JSON.parse(raw) as MockBody
    } catch {
      return raw
    }
  }
  return raw
}

function mockContext(route: (url: string, init?: RequestInit) => Response | null): MockContext {
  const calls: MockCall[] = []
  const context: AdapterContext = {
    apiKey: 'test-key',
    baseUrl: 'https://azure.test',
    deployment: 'gpt-image-2',
    fetch: async (input, init) => {
      const url = String(input)
      const contentType = new Headers(init?.headers).get('content-type')
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: parseBody(init?.body, contentType),
        contentType,
      })
      const response = route(url, init)
      if (response) return response
      return new Response(JSON.stringify({ error: `unmocked ${url}` }), { status: 500 })
    },
  }
  return {
    context,
    calls,
    queueCalls: () =>
      calls.filter(
        (call) =>
          call.method === 'POST' && (call.url.includes('/queue/') || call.url.includes('queue.fal.run')),
      ),
  }
}

// Uploads run concurrently, so numbering by initiation order races. The asset's own
// file name keeps each mock URL attached to the asset the test meant.
function uploadNumber(init?: RequestInit): number | null {
  if (typeof init?.body !== 'string') return null
  const sent = JSON.parse(init.body) as { file_name?: string }
  const digits = sent.file_name?.match(/-(\d+)\./)?.[1]
  const index = Number(digits ?? 0)
  return index > 0 ? index : null
}

function sunraAlias(fixture: OpenApiFixture): string {
  const path = Object.keys(fixture.paths)[0] ?? ''
  return path.split('/').filter(Boolean).slice(0, -1).join('/')
}

export function mockSunra(fixtures: OpenApiFixture[]): MockContext {
  const byDocs = new Map<string, OpenApiFixture>()
  const models: Array<{
    id: string
    alias: string
    name: string
    openapi: string
    endpoints: Array<{ name: string }>
  }> = []
  for (const fixture of fixtures) {
    const docs = fixture.info?.docs ?? ''
    const alias = sunraAlias(fixture)
    if (!docs || !alias) continue
    byDocs.set(docs, fixture)
    models.push({
      id: `model_${alias.replace(/\W/g, '_')}`,
      alias,
      name: alias,
      openapi: docs,
      endpoints: documentedOperations(fixture).map((operation) => ({ name: operation.name })),
    })
  }
  let uploadIndex = 0
  return mockContext((url, init) => {
    if (url.startsWith('https://api.sunra.ai/v1/models')) {
      return Response.json({ object: 'list', data: models, has_more: false })
    }
    const fixture = byDocs.get(url)
    if (fixture) return Response.json(fixture)
    if (url.includes('/storage/upload/initiate')) {
      uploadIndex += 1
      const index = uploadNumber(init) ?? uploadIndex
      return Response.json({
        upload_url: `https://upload.test/sunra/${index}`,
        file_url: `https://cdn.test/sunra-${index}.png`,
      })
    }
    if (url.startsWith('https://upload.test/')) return new Response('ok', { status: 200 })
    if (url.includes('/queue/')) return Response.json({ request_id: 'mock-sunra-1' })
    return null
  })
}

export function mockFal(fixtures: OpenApiFixture[]): MockContext {
  const byEndpoint = new Map<string, OpenApiFixture>()
  for (const fixture of fixtures) {
    const path = Object.keys(fixture.paths)[0]
    if (!path) continue
    byEndpoint.set(path.replace(/^\//, ''), fixture)
  }
  let uploadIndex = 0
  return mockContext((url, init) => {
    if (url.startsWith('https://fal.ai/api/openapi/queue/openapi.json')) {
      const endpoint = new URL(url).searchParams.get('endpoint_id')
      const fixture = endpoint ? byEndpoint.get(endpoint) : undefined
      return fixture ? Response.json(fixture) : new Response('not found', { status: 404 })
    }
    if (url.includes('/storage/upload/initiate')) {
      uploadIndex += 1
      const index = uploadNumber(init) ?? uploadIndex
      return Response.json({
        upload_url: `https://upload.test/fal/${index}`,
        file_url: `https://cdn.test/fal-${index}.png`,
      })
    }
    if (url.startsWith('https://upload.test/')) return new Response('ok', { status: 200 })
    if (url.includes('queue.fal.run')) {
      return Response.json({
        request_id: 'mock-fal-1',
        status_url: 'https://queue.fal.run/test/requests/mock-fal-1/status',
        response_url: 'https://queue.fal.run/test/requests/mock-fal-1',
      })
    }
    return null
  })
}

export function imageAsset(
  index = 1,
  mime = 'image/png',
): { buffer: Buffer; mime: string; fileName: string } {
  return {
    buffer: Buffer.from(`image-${index}`),
    mime,
    fileName: `reference-${index}.${mime === 'image/jpeg' ? 'jpg' : 'png'}`,
  }
}

export function uploadedUrls(queue: MockCall | undefined): string[] {
  const body = asRecord(queue?.body)
  if (!body) return []
  for (const value of Object.values(body)) {
    if (!Array.isArray(value)) continue
    const urls = value.filter((entry): entry is string => typeof entry === 'string')
    if (urls.length > 0) return urls
  }
  return []
}

export interface FormFieldSchema {
  type?: string
  required?: boolean
  enum?: string[]
  minimum?: number
  maximum?: number
  allowAuto?: boolean
  pixelFormat?: string
  multipleOf?: number
  maxEdge?: number
  minPixels?: number
  maxPixels?: number
  maxAspect?: number
}

export interface AzureEndpointFixture {
  method: string
  path: string
  contentType: string
  fields: Record<string, FormFieldSchema>
  files?: Record<string, { required?: boolean; minFiles?: number; maxFiles?: number; types?: string[] }>
}

export interface AzureFixture {
  provider: 'azure'
  model: string
  docs: string
  apiVersion: string
  endpoints: Record<'generate' | 'edit', AzureEndpointFixture>
}

export const AZURE_SIZE_PATTERN = /^(\d+)x(\d+)$/

export function validateSizeString(size: string, schema: FormFieldSchema): string[] {
  if (size === 'auto') return schema.allowAuto === false ? ['size: auto is not documented'] : []
  const match = AZURE_SIZE_PATTERN.exec(size)
  if (!match) return [`size: ${size} is not WIDTHxHEIGHT`]
  const width = Number(match[1])
  const height = Number(match[2])
  const problems: string[] = []
  const multiple = schema.multipleOf ?? 1
  if (width % multiple !== 0 || height % multiple !== 0) {
    problems.push(`size: ${size} is not a multiple of ${multiple}`)
  }
  const longest = Math.max(width, height)
  const shortest = Math.min(width, height)
  if (schema.maxEdge && longest > schema.maxEdge) problems.push(`size: ${size} exceeds ${schema.maxEdge}px`)
  const pixels = width * height
  if (schema.minPixels && pixels < schema.minPixels)
    problems.push(`size: ${size} is below ${schema.minPixels} pixels`)
  if (schema.maxPixels && pixels > schema.maxPixels)
    problems.push(`size: ${size} is above ${schema.maxPixels} pixels`)
  if (schema.maxAspect && longest / shortest > schema.maxAspect) {
    problems.push(`size: ${size} exceeds the ${schema.maxAspect}:1 aspect limit`)
  }
  return problems
}

export function validateAzureFields(
  fields: Record<string, string>,
  schema: Record<string, FormFieldSchema>,
): string[] {
  const problems: string[] = []
  for (const [name, definition] of Object.entries(schema)) {
    if (definition.required && !(name in fields))
      problems.push(`field ${name}: required by the documented schema`)
  }
  for (const [name, value] of Object.entries(fields)) {
    const definition = schema[name]
    if (!definition) {
      problems.push(`field ${name}: not in the documented request schema`)
      continue
    }
    if (definition.type === 'integer') {
      if (!/^\d+$/.test(value)) problems.push(`field ${name}: ${value} is not an integer`)
      const numeric = Number(value)
      if (definition.minimum !== undefined && numeric < definition.minimum) {
        problems.push(`field ${name}: below ${definition.minimum}`)
      }
      if (definition.maximum !== undefined && numeric > definition.maximum) {
        problems.push(`field ${name}: above ${definition.maximum}`)
      }
    }
    if (definition.enum && !definition.enum.includes(value)) {
      problems.push(`field ${name}: ${value} is not one of ${definition.enum.join(', ')}`)
    }
    if (definition.pixelFormat === 'WIDTHxHEIGHT') problems.push(...validateSizeString(value, definition))
  }
  return problems
}

export interface CodexFlagSchema {
  required?: boolean
  min?: number
  max?: number
  repeatable?: boolean
}

export interface CodexFixture {
  provider: 'codex'
  model: string
  docs: string
  commands: Record<
    'generate' | 'edit',
    { argv: string[]; flags: Record<string, CodexFlagSchema>; maxImages?: number }
  >
  size: FormFieldSchema
  quality: { enum: string[] }
}

export function validateCodexCommand(args: string[], fixture: CodexFixture): string[] {
  const problems: string[] = []
  const mode = args[0] === 'edit' ? 'edit' : args[0] === 'generate' ? 'generate' : null
  if (!mode) {
    problems.push(`command: ${args[0] ?? 'empty'} is not a documented subcommand`)
    return problems
  }
  const command = fixture.commands[mode]
  const seen: Record<string, number> = {}
  const values: Record<string, string> = {}
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index] as string
    const definition = command.flags[flag]
    if (!definition) {
      problems.push(`flag ${flag}: not in the documented command`)
      continue
    }
    seen[flag] = (seen[flag] ?? 0) + 1
    if (definition.repeatable) {
      const value = args[index + 1]
      if (value && !value.startsWith('--')) {
        values[flag] = value
        index += 1
      }
      continue
    }
    if (!definition.repeatable) {
      const value = args[index + 1]
      if (value && !value.startsWith('--')) {
        values[flag] = value
        index += 1
      }
    }
  }
  for (const [flag, definition] of Object.entries(command.flags)) {
    if (definition.required && !(flag in seen))
      problems.push(`flag ${flag}: required by the documented command`)
    const count = seen[flag] ?? 0
    if (definition.max !== undefined && count > definition.max) {
      problems.push(`flag ${flag}: ${count} uses exceeds the documented limit of ${definition.max}`)
    }
    if (definition.min !== undefined && count < definition.min) {
      problems.push(`flag ${flag}: ${count} uses is below the documented minimum of ${definition.min}`)
    }
    if (!definition.repeatable && count > 1) problems.push(`flag ${flag}: repeated`)
  }
  const size = values['--size']
  if (size) problems.push(...validateSizeString(size, fixture.size))
  return problems
}
