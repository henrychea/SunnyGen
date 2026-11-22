import type { VideoFieldInfo, VideoFieldType, VideoOperationInfo } from '@sunnygen/core'
import { type FalRequestSchema } from './fal/image'
import {
  enumValues,
  maxItemsOf,
  operationSchemas,
  propertyType,
  type ParsedOpenApi,
  type RequestSchema,
} from './schema'

const FIELD_TYPES: Record<string, VideoFieldType> = {
  string: 'string',
  array: 'array',
  object: 'object',
  number: 'number',
  integer: 'integer',
  boolean: 'boolean',
}

export function videoOperation(
  path: string,
  schema: RequestSchema,
  components: Record<string, unknown>,
): VideoOperationInfo {
  const fields: Record<string, VideoFieldInfo> = {}
  for (const [name, property] of Object.entries(schema.properties)) {
    const type = propertyType(property, components)
    fields[name] = {
      type: type ? (FIELD_TYPES[type] ?? 'unknown') : 'unknown',
      maxItems: maxItemsOf(property, components),
      values: enumValues(property, components),
    }
  }
  return {
    name: path.split('/').filter(Boolean).pop() ?? path,
    path,
    fields,
    required: schema.required,
  }
}

export function videoOperationsFromOpenApi(parsed: ParsedOpenApi): VideoOperationInfo[] {
  return Object.values(operationSchemas(parsed)).map((schema) =>
    videoOperation(schema.path, schema, parsed.components),
  )
}

export function falVideoOperations(schema: FalRequestSchema): VideoOperationInfo[] {
  return [videoOperation(schema.path, schema, schema.components)]
}
