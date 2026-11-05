import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { PROVIDERS } from '@sunnygen/core'
import { deleteSetting, getDatabaseInfo, readSetting, writeSetting } from '@sunnygen/db'

export interface ProviderKeyState {
  id: string
  label: string
  configured: boolean
  keySetting: string | null
}

export interface SettingsSnapshot {
  providers: ProviderKeyState[]
  azureBaseUrl: string
  azureDeployment: string
  openrouterConfigured: boolean
  prepModel: string
  dataDir: string
  mediaDir: string
  databaseVersion: number
}

export const loadSettings = createServerFn({ method: 'GET' }).handler((): SettingsSnapshot => {
  const database = getDatabaseInfo()
  return {
    providers: PROVIDERS.map((provider) => ({
      id: provider.id,
      label: provider.label,
      configured: provider.keySetting ? readSetting(provider.keySetting) !== null : false,
      keySetting: provider.keySetting,
    })),
    azureBaseUrl: readSetting('provider.azure.baseUrl') ?? '',
    azureDeployment: readSetting('provider.azure.deployment') ?? '',
    openrouterConfigured: readSetting('assistant.openrouter.key') !== null,
    prepModel: readSetting('studio.prepModel') ?? 'nano-banana-2',
    dataDir: database.dataDir,
    mediaDir: database.mediaDir,
    databaseVersion: database.version,
  }
})

const providerKeyInput = z.object({
  provider: z.enum(['sunra', 'fal', 'azure']),
  key: z.string().trim().min(1),
})

export const saveProviderKey = createServerFn({ method: 'POST' })
  .validator(providerKeyInput)
  .handler(({ data }) => {
    const provider = PROVIDERS.find((entry) => entry.id === data.provider)
    if (!provider?.keySetting) throw new Error('This provider does not use an API key')
    writeSetting(provider.keySetting, data.key)
    return { ok: true }
  })

export const clearProviderKey = createServerFn({ method: 'POST' })
  .validator(z.object({ provider: z.enum(['sunra', 'fal', 'azure']) }))
  .handler(({ data }) => {
    const provider = PROVIDERS.find((entry) => entry.id === data.provider)
    if (provider?.keySetting) deleteSetting(provider.keySetting)
    return { ok: true }
  })

const azureInput = z.object({
  baseUrl: z.string().trim(),
  deployment: z.string().trim(),
})

export const saveAzureConfig = createServerFn({ method: 'POST' })
  .validator(azureInput)
  .handler(({ data }) => {
    if (data.baseUrl) {
      const parsed = new URL(data.baseUrl)
      if (!parsed.protocol.startsWith('https')) throw new Error('Azure base URL must use https')
      writeSetting('provider.azure.baseUrl', parsed.toString().replace(/\/$/, ''))
    } else {
      deleteSetting('provider.azure.baseUrl')
    }
    if (data.deployment) writeSetting('provider.azure.deployment', data.deployment)
    else deleteSetting('provider.azure.deployment')
    return { ok: true }
  })

export const saveOpenRouterKey = createServerFn({ method: 'POST' })
  .validator(z.object({ key: z.string().trim().min(1) }))
  .handler(({ data }) => {
    writeSetting('assistant.openrouter.key', data.key)
    return { ok: true }
  })

export const clearOpenRouterKey = createServerFn({ method: 'POST' }).handler(() => {
  deleteSetting('assistant.openrouter.key')
  return { ok: true }
})

export const savePrepModel = createServerFn({ method: 'POST' })
  .validator(z.object({ model: z.string().trim().min(1) }))
  .handler(({ data }) => {
    writeSetting('studio.prepModel', data.model)
    return { ok: true }
  })

export interface CodexStatus {
  installed: boolean
  authFound: boolean
  ready: boolean
}

function codexBinaryInstalled(): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const proc = spawn('codex-imagegen', ['--help'], { stdio: 'ignore' })
  proc.on('error', () => resolve(false))
  proc.on('close', (code) => resolve(code === 0))
  return promise
}

export const loadCodexStatus = createServerFn({ method: 'GET' }).handler(async (): Promise<CodexStatus> => {
  const authPath = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'auth.json')
  const installed = await codexBinaryInstalled()
  const authFound = existsSync(authPath)
  return { installed, authFound, ready: installed && authFound }
})
