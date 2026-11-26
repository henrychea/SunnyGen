import { spawn } from 'node:child_process'
import { join } from 'node:path'

export interface VideoProbe {
  durationSeconds: number
  width: number
  height: number
  fps: number
  codec: string
}

export interface FfmpegRun {
  code: number
  stderr: string
}

const STDERR_LIMIT = 64 * 1024
const STDOUT_LIMIT = 2 * 1024 * 1024
const FRAME_TIMEOUT_MS = 120_000
const PROBE_TIMEOUT_MS = 30_000

interface Capture {
  code: number
  stdout: string
  stderr: string
}

function lastLines(text: string, count: number): string {
  return text.trim().split('\n').slice(-count).join('\n')
}

function capture(binary: string, args: string[], timeoutMs: number): Promise<Capture> {
  const { promise, resolve, reject } = Promise.withResolvers<Capture>()
  const proc = spawn(binary, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  let stdoutBytes = 0
  let settled = false

  const finish = (run: () => void) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    run()
  }
  const timer = setTimeout(() => {
    proc.kill('SIGKILL')
    finish(() => reject(new Error(`${binary} timed out after ${Math.round(timeoutMs / 1000)}s`)))
  }, timeoutMs)

  proc.stdout.on('data', (chunk: Buffer) => {
    if (stdoutBytes >= STDOUT_LIMIT) return
    stdoutBytes += chunk.byteLength
    stdout += chunk.toString()
  })
  proc.stderr.on('data', (chunk: Buffer) => {
    if (stderr.length < STDERR_LIMIT) stderr += chunk.toString()
  })
  proc.on('error', (error) => finish(() => reject(new Error(`${binary} is not installed: ${error.message}`))))
  proc.on('close', (code) => finish(() => resolve({ code: code ?? 1, stdout, stderr })))
  return promise
}

export async function isFfmpegAvailable(): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' })
  proc.on('error', () => resolve(false))
  proc.on('close', (code) => resolve(code === 0))
  return promise
}

export async function ffmpegVersion(): Promise<string | null> {
  try {
    const result = await capture('ffmpeg', ['-version'], PROBE_TIMEOUT_MS)
    if (result.code !== 0) return null
    return result.stdout.split('\n')[0]?.trim() || null
  } catch {
    return null
  }
}

function parseRate(value: string | undefined): number {
  if (!value) return 0
  const [numerator, denominator] = value.split('/')
  const top = Number(numerator)
  const bottom = Number(denominator ?? 1)
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom === 0) return 0
  return top / bottom
}

interface ProbeJson {
  format?: { duration?: string }
  streams?: Array<{
    codec_type?: string
    codec_name?: string
    width?: number
    height?: number
    duration?: string
    r_frame_rate?: string
    avg_frame_rate?: string
  }>
}

export async function probeVideo(path: string): Promise<VideoProbe | null> {
  let result: Capture
  try {
    result = await capture(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
      PROBE_TIMEOUT_MS,
    )
  } catch {
    return null
  }
  if (result.code !== 0) return null

  let parsed: ProbeJson
  try {
    parsed = JSON.parse(result.stdout) as ProbeJson
  } catch {
    return null
  }
  const stream = parsed.streams?.find((entry) => entry.codec_type === 'video')
  if (!stream?.width || !stream.height) return null
  const durationSeconds = Number(parsed.format?.duration ?? stream.duration)
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null

  return {
    durationSeconds,
    width: stream.width,
    height: stream.height,
    fps: parseRate(stream.r_frame_rate) || parseRate(stream.avg_frame_rate),
    codec: stream.codec_name ?? 'unknown',
  }
}

export function videoFrameArgs(input: {
  path: string
  times: number[]
  outDir: string
  width?: number
}): string[][] {
  return input.times.map((time, index) => {
    const out = join(input.outDir, `frame-${String(index).padStart(3, '0')}.jpg`)
    const scale = input.width ? ['-vf', `scale=${input.width}:-2`] : []
    return ['-ss', String(time), '-i', input.path, '-frames:v', '1', ...scale, '-q:v', '2', out]
  })
}

export function sceneFrameArgs(input: { path: string; outDir: string; threshold?: number }): string[] {
  const threshold = input.threshold ?? 0.3
  return [
    '-i',
    input.path,
    '-vf',
    `select='gt(scene,${threshold})',showinfo`,
    '-fps_mode',
    'vfr',
    join(input.outDir, 'scene-%04d.jpg'),
  ]
}

export function concatArgs(input: { listPath: string; outPath: string; copy: boolean }): string[] {
  const codec = input.copy
    ? ['-c', 'copy']
    : ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
  return ['-f', 'concat', '-safe', '0', '-i', input.listPath, ...codec, input.outPath]
}

export async function runFfmpeg(args: string[], options: { timeoutMs?: number } = {}): Promise<FfmpegRun> {
  const result = await capture('ffmpeg', args, options.timeoutMs ?? FRAME_TIMEOUT_MS)
  if (result.code !== 0) {
    throw new Error(`ffmpeg failed (${result.code}): ${lastLines(result.stderr, 20)}`)
  }
  return { code: result.code, stderr: result.stderr }
}

export const CONCAT_TIMEOUT_MS = 600_000
