import type { SQLOutputValue } from 'node:sqlite'

/**
 * SQLite returns untyped column records. Rows are produced only by this
 * package's own schema, so mapping them to a row interface here is safe.
 */
export function asRows<Row>(rows: Array<Record<string, SQLOutputValue>>): Row[] {
  return rows as unknown as Row[]
}
