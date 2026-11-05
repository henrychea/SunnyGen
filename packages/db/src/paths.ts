import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

function findWorkspaceRoot(start: string): string {
  let current = resolve(start)
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml')) || existsSync(join(current, '.git'))) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) return resolve(start)
    current = parent
  }
}

export const workspaceRoot = findWorkspaceRoot(process.cwd())

export const dataDir = process.env.SUNNYGEN_DATA_DIR
  ? resolve(process.env.SUNNYGEN_DATA_DIR)
  : join(workspaceRoot, 'data')

export const mediaDir = process.env.SUNNYGEN_MEDIA_DIR
  ? resolve(process.env.SUNNYGEN_MEDIA_DIR)
  : join(dataDir, 'media')

export const databasePath = join(dataDir, 'sunnygen.db')
