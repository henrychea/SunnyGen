import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname } from 'node:path'
import { parseShotList, type VideoShot } from '@sunnygen/core'

export const AGENT_IDS = ['claude', 'codex', 'omp', 'pi'] as const

export type AgentId = (typeof AGENT_IDS)[number]

export const AGENT_LABELS: Record<AgentId, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  omp: 'OMP',
  pi: 'Pi',
}

const AGENT_TIMEOUT_MS = 180_000
const STDOUT_LIMIT = 2 * 1024 * 1024
const STDERR_LIMIT = 8 * 1024

let detected: Record<AgentId, boolean> | null = null

function probe(binary: string): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const proc = spawn(binary, ['--version'], { stdio: 'ignore' })
  proc.on('error', () => resolve(false))
  proc.on('close', (code) => resolve(code === 0))
  return promise
}

export async function detectAgents(): Promise<Record<AgentId, boolean>> {
  if (detected) return detected
  const entries = await Promise.all(AGENT_IDS.map(async (agent) => [agent, await probe(agent)] as const))
  detected = Object.fromEntries(entries) as Record<AgentId, boolean>
  return detected
}

export interface AgentCommandInput {
  prompt: string
  images?: string[]
}

function imageDirs(images: string[]): string[] {
  return [...new Set(images.map((image) => dirname(image)))]
}

// The agent runs in a temp directory, so every CLI needs its frames handed over explicitly:
// codex takes them as --image attachments and needs the repo check skipped, claude and omp
// need the media directory added to their workspace, and omp and pi accept @path arguments.
export function agentCommand(agent: AgentId, input: AgentCommandInput): string[] {
  const images = input.images ?? []
  const dirs = imageDirs(images)
  switch (agent) {
    case 'claude':
      return ['-p', input.prompt, ...dirs.flatMap((dir) => ['--add-dir', dir])]
    case 'codex':
      return ['exec', '--skip-git-repo-check', ...images.flatMap((image) => ['-i', image]), input.prompt]
    case 'omp':
      return [
        '-p',
        ...dirs.map((dir) => `--add-dir=${dir}`),
        ...images.map((image) => `@${image}`),
        input.prompt,
      ]
    case 'pi':
      return ['-p', ...images.map((image) => `@${image}`), input.prompt]
  }
}

export type AgentTextResult = { ok: true; text: string } | { ok: false; error: string }

export interface AgentTextInput {
  agent: AgentId
  prompt: string
  images?: string[]
  timeoutMs?: number
}

export async function runAgentText(input: AgentTextInput): Promise<AgentTextResult> {
  const label = AGENT_LABELS[input.agent]
  const timeoutMs = input.timeoutMs ?? AGENT_TIMEOUT_MS
  const { promise, resolve } = Promise.withResolvers<AgentTextResult>()
  const proc = spawn(input.agent, agentCommand(input.agent, input), {
    cwd: tmpdir(),
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let settled = false

  const settle = (result: AgentTextResult) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    resolve(result)
  }
  const timer = setTimeout(() => {
    proc.kill('SIGKILL')
    settle({ ok: false, error: `${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.` })
  }, timeoutMs)

  proc.stdout.on('data', (chunk: Buffer) => {
    if (stdout.length >= STDOUT_LIMIT) return
    stdout += chunk.toString()
  })
  proc.stderr.on('data', (chunk: Buffer) => {
    if (stderr.length >= STDERR_LIMIT) return
    stderr += chunk.toString()
  })
  proc.on('error', () => settle({ ok: false, error: `${label} is not installed on this machine.` }))
  proc.on('close', (code) => {
    if (code === 0) {
      settle({ ok: true, text: stdout.trim() })
      return
    }
    const tail = stderr.trim().split('\n').slice(-5).join(' ').slice(0, 400)
    settle({ ok: false, error: `${label} exited with code ${code}${tail ? `: ${tail}` : ''}` })
  })
  return promise
}

export type AgentRunner = (input: {
  agent: AgentId
  prompt: string
  images?: string[]
}) => Promise<AgentTextResult>

export interface AgentShotListInput {
  agent: AgentId
  prompt: string
  images?: string[]
  durationSeconds: number
  runner?: AgentRunner
}

export async function runAgentShotList(
  input: AgentShotListInput,
): Promise<{ shots: VideoShot[] } | { error: string }> {
  const runner = input.runner ?? runAgentText
  const first = await runner({ agent: input.agent, prompt: input.prompt, images: input.images })
  if (!first.ok) return { error: first.error }

  const parsed = parseShotList(first.text, input.durationSeconds)
  if ('shots' in parsed) return parsed

  const retry = await runner({
    agent: input.agent,
    prompt: `${input.prompt}\n\nYour previous answer could not be used: ${parsed.error}\nReply with only the JSON object, no prose and no explanation.`,
    images: input.images,
  })
  if (!retry.ok) return { error: retry.error }
  return parseShotList(retry.text, input.durationSeconds)
}
