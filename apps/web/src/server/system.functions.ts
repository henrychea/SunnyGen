import { createServerFn } from '@tanstack/react-start'
import { getDatabaseInfo } from '@sunnygen/db'

export interface SystemInfo {
  node: string
  databaseVersion: number
  dataDir: string
  mediaDir: string
}

export const loadSystemInfo = createServerFn({ method: 'GET' }).handler((): SystemInfo => {
  const database = getDatabaseInfo()
  return {
    node: process.version,
    databaseVersion: database.version,
    dataDir: database.dataDir,
    mediaDir: database.mediaDir,
  }
})
