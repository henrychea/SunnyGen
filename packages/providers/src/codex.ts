import { spawn } from 'node:child_process'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ImageModelDefinition } from '@sunnygen/core'
import { codexSize } from './sizes'
import {
  ProviderError,
  createAdapterFromFlows,
  type AdapterContext,
  type ProviderFlow,
  type ProviderModule,
  type ProviderRequest,
  type ProviderSubmit,
} from './types'

function cleanError(raw: string): string {
  const match = raw.match(/Error:\s*([\s\S]*)$/)
  const tail = (match?.[1] ?? raw).trim()
  const brace = tail.indexOf('{')
  if (brace !== -1) {
    try {
      const parsed = JSON.parse(tail.slice(brace)) as { error?: { message?: string } }
      if (parsed.error?.message) return parsed.error.message
    } catch {
      // Fall through.
    }
  }
  const semicolon = tail.indexOf(';')
  return (semicolon !== -1 ? tail.slice(0, semicolon).trim() : tail) || raw
}

export async function isCodexAvailable(): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const proc = spawn('codex-imagegen', ['--help'], { stdio: 'ignore' })
  proc.on('error', () => resolve(false))
  proc.on('close', (code) => resolve(code === 0))
  return promise
}

export const CODEX_MAX_EDIT_IMAGES = 5

export interface CodexCommand {
  mode: 'generate' | 'edit'
  args: string[]
  prompt: string
  size: string
  out: string
  images: number
}

export function codexCommand(options: {
  prompt: string
  size: string
  inputPaths: string[]
  outputPath: string
}): CodexCommand {
  const images = options.inputPaths.slice(0, CODEX_MAX_EDIT_IMAGES)
  if (images.length > 0) {
    return {
      mode: 'edit',
      args: [
        'edit',
        ...images.flatMap((path) => ['--image', path]),
        '--prompt',
        options.prompt,
        '--size',
        options.size,
        '--out',
        options.outputPath,
        '--force',
      ],
      prompt: options.prompt,
      size: options.size,
      out: options.outputPath,
      images: images.length,
    }
  }
  return {
    mode: 'generate',
    args: [
      'generate',
      '--prompt',
      options.prompt,
      '--size',
      options.size,
      '--out',
      options.outputPath,
      '--force',
    ],
    prompt: options.prompt,
    size: options.size,
    out: options.outputPath,
    images: 0,
  }
}

async function runCodex(
  prompt: string,
  size: string,
  assets: Array<{ buffer: Buffer; mime: string }>,
): Promise<Buffer> {
  const inputPaths: string[] = []
  const outputPath = join(tmpdir(), `sunnygen-codex-${Date.now()}-${Math.random().toString(36).slice(2)}.png`)
  try {
    for (const [index, asset] of assets.entries()) {
      const ext = asset.mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'
      const path = join(tmpdir(), `sunnygen-codex-in-${Date.now()}-${index}.${ext}`)
      await writeFile(path, asset.buffer)
      inputPaths.push(path)
    }

    const { args } = codexCommand({ prompt, size, inputPaths, outputPath })

    const { promise, resolve, reject } = Promise.withResolvers<number>()
    let stderr = ''
    const proc = spawn('codex-imagegen', args)
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    proc.on('error', (error) =>
      reject(new ProviderError('codex', `codex-imagegen is not installed: ${error.message}`)),
    )
    proc.on('close', (code) => {
      if (code === 0) resolve(0)
      else reject(new ProviderError('codex', cleanError(stderr || `codex-imagegen exited with code ${code}`)))
    })
    const exitCode = await promise
    if (exitCode !== 0) throw new ProviderError('codex', 'codex-imagegen failed')
    return await readFile(outputPath)
  } finally {
    await Promise.all([...inputPaths, outputPath].map((path) => unlink(path).catch(() => undefined)))
  }
}

async function submit(_context: AdapterContext, request: ProviderRequest): Promise<ProviderSubmit> {
  const model = request.model as ImageModelDefinition
  const aspectRatio = String(request.params.aspectRatio ?? '1:1')
  const prompt =
    `${request.prompt.slice(0, 8000)}${aspectRatio !== 'auto' ? ` Aspect ratio: ${aspectRatio}.` : ''}`.trim()
  const size = codexSize(aspectRatio, String(request.params.quality ?? model.defaultQuality))
  const buffer = await runCodex(prompt, size, request.assets.slice(0, CODEX_MAX_EDIT_IMAGES))
  return {
    providerJobId: null,
    status: 'succeeded',
    outputs: [{ buffer, mime: 'image/png' }],
  }
}

export const codexImageFlow: ProviderFlow = {
  id: 'codex.image',
  kind: 'image',
  matches: (model) => model.kind === 'image',
  submit,
}

const flows = [codexImageFlow]

export const codexAdapter = createAdapterFromFlows('codex', flows)

export const codexModule: ProviderModule = {
  id: 'codex',
  label: 'Codex CLI',
  adapter: codexAdapter,
  flows,
}
