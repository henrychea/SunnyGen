import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MAX_COPY_FRAMES,
  MAX_COPY_SHOTS,
  capFrameTimes,
  frameTimes,
  framesWithinBudget,
  type AssetRecord,
  type FrameMode,
  type GenerationStatus,
  type VideoCopyRecord,
  type VideoCopyShot,
} from '@sunnygen/core'
import {
  createVideoCopy,
  getAsset,
  getAssetsByIds,
  getGeneration,
  getVideoCopy,
  listVideoCopies,
  mediaDir,
  updateVideoCopy,
} from '@sunnygen/db'
import {
  AGENT_LABELS,
  CONCAT_TIMEOUT_MS,
  concatArgs,
  detectAgents,
  isFfmpegAvailable,
  probeVideo,
  runAgentShotList,
  runFfmpeg,
  sceneFrameArgs,
  videoFrameArgs,
  type AgentId,
  type VideoProbe,
} from '@sunnygen/providers'
import { MAX_UPLOAD_BYTES, assetUrl, storeBuffer } from './media.server'
import { readNsfwMode } from './nsfw.server'

export const MAX_SOURCE_SECONDS = 600

// The copy row has no per-frame timestamp column, so each frame's time travels in the
// asset name, where the library also shows it.
const FRAME_TIME = /@ (\d+(?:\.\d+)?)s/

const JOIN_FPS_TOLERANCE = 0.5

export function assetPath(asset: AssetRecord): string {
  return join(mediaDir, asset.path)
}

/**
 * Every asset the pipeline writes belongs to its source's visibility class, so a copy of an NSFW
 * clip hides as a whole in safe mode instead of leaving its frames behind.
 */
export function inheritVisibility(source: Pick<AssetRecord, 'nsfw'>): { nsfw: boolean } {
  return { nsfw: source.nsfw }
}

function frameName(atSeconds: number): string {
  return `Frame @ ${atSeconds.toFixed(2)}s`
}

function frameTime(asset: AssetRecord | undefined): number | null {
  const match = asset?.name?.match(FRAME_TIME)
  return match?.[1] ? Number(match[1]) : null
}

export function shotPromptTemplate(input: {
  durationSeconds: number
  frames: Array<{ index: number; atSeconds: number; path: string }>
}): string {
  const duration = input.durationSeconds.toFixed(1)
  return [
    `The clip is ${duration} seconds long. The frames below are stills from it, in order:`,
    ...input.frames.map((frame) => `frame ${frame.index + 1}: ${frame.atSeconds.toFixed(2)}s ${frame.path}`),
    '',
    'Read the frames and describe how to recreate this clip as a series of shots.',
    'Reply with JSON only, no prose and no markdown fence, shaped exactly like this:',
    '{"shots":[{"start":0,"end":3.2,"subject":"what is in frame","action":"what happens",' +
      '"motion":"how things move","camera":"camera move","lighting":"light and colour",' +
      '"prompt":"the video generation prompt for this shot"}]}',
    `Rules: 1 to ${MAX_COPY_SHOTS} shots, "start" strictly increasing, "end" after "start", ` +
      `the last "end" at or before ${duration} seconds, every text field non-empty, ` +
      '"prompt" at most 2000 characters.',
  ].join('\n')
}

export function parseShowinfoTimes(stderr: string): number[] {
  const times: number[] = []
  for (const line of stderr.split('\n')) {
    const match = line.match(/Parsed_showinfo.*pts_time:\s*(\d+(?:\.\d+)?)/)
    if (match?.[1]) times.push(Number(match[1]))
  }
  return times
}

function planError(count: number): string {
  if (count === 0) {
    return 'That plan picks no frame inside the clip. Move a timestamp inside it, or use every N seconds.'
  }
  return `That plan picks ${count} frames; the cap is ${MAX_COPY_FRAMES}. Widen the interval or drop timestamps.`
}

async function listFrames(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir)
    return files.filter((file) => file.endsWith('.jpg')).sort()
  } catch {
    return []
  }
}

async function extractEvery(
  workDir: string,
  source: AssetRecord,
  times: number[],
): Promise<Array<{ file: string; atSeconds: number }>> {
  const outDir = join(workDir, 'frames')
  await mkdir(outDir, { recursive: true })
  for (const args of videoFrameArgs({ path: assetPath(source), times, outDir })) {
    await runFfmpeg(args)
  }
  const files = await listFrames(outDir)
  return files.map((file, index) => ({ file: join(outDir, file), atSeconds: times[index] ?? 0 }))
}

async function extractScenes(
  workDir: string,
  source: AssetRecord,
): Promise<Array<{ file: string; atSeconds: number }>> {
  const outDir = join(workDir, 'scenes')
  await mkdir(outDir, { recursive: true })
  let stderr = ''
  try {
    const run = await runFfmpeg(sceneFrameArgs({ path: assetPath(source), outDir }))
    stderr = run.stderr
  } catch (error) {
    if ((await listFrames(outDir)).length === 0) {
      throw new Error('No scene changes were found in that clip. Use every N seconds instead.')
    }
    throw error
  }
  const files = await listFrames(outDir)
  const times = parseShowinfoTimes(stderr)
  if (files.length === 0 || times.length === 0) {
    throw new Error('No scene changes were found in that clip. Use every N seconds instead.')
  }
  const pairs = files
    .slice(0, times.length)
    .map((file, index) => ({ file: join(outDir, file), atSeconds: times[index] as number }))
  const kept = new Set(
    capFrameTimes(
      pairs.map((_pair, index) => index),
      MAX_COPY_FRAMES,
    ),
  )
  return pairs.filter((_pair, index) => kept.has(index))
}

export interface ExtractFramesInput {
  sourceAssetId: string
  mode: FrameMode
  everySeconds?: number
  timestamps?: number[]
  folderId?: string | null
}

export async function probeCopySource(
  assetId: string,
): Promise<{ durationSeconds: number | null; error: string | null }> {
  const asset = getAsset(assetId)
  if (!asset) return { durationSeconds: null, error: 'That video is not in the library.' }
  if (asset.kind !== 'video') return { durationSeconds: null, error: 'The copy source must be a video.' }
  const probe = await probeVideo(assetPath(asset))
  if (!probe) return { durationSeconds: null, error: 'ffprobe could not read that file. Try another clip.' }
  return { durationSeconds: probe.durationSeconds, error: null }
}

export async function extractFrames(
  input: ExtractFramesInput,
): Promise<{ copyId: string; frameAssetIds: string[] }> {
  if (!(await isFfmpegAvailable())) {
    throw new Error(
      'ffmpeg is not installed on this machine. Install it with apt install ffmpeg on Debian or brew install ffmpeg on macOS, then extract again.',
    )
  }
  const source = getAsset(input.sourceAssetId)
  if (!source) throw new Error('That source video is not in the library.')
  if (source.kind !== 'video') throw new Error('The copy source must be a video.')

  const probe = await probeVideo(assetPath(source))
  if (!probe) throw new Error('ffprobe could not read that file. Try another clip.')
  if (probe.durationSeconds > MAX_SOURCE_SECONDS) {
    throw new Error(
      `That clip is ${Math.round(probe.durationSeconds)} seconds; the limit is ${MAX_SOURCE_SECONDS}. Cut it down first.`,
    )
  }

  const planned = frameTimes({
    mode: input.mode,
    durationSeconds: probe.durationSeconds,
    everySeconds: input.everySeconds,
    timestamps: input.timestamps,
  })
  if (input.mode !== 'scene' && !framesWithinBudget(planned.length))
    throw new Error(planError(planned.length))

  const workDir = await mkdtemp(join(tmpdir(), 'sunnygen-copy-'))
  try {
    const frames =
      input.mode === 'scene'
        ? await extractScenes(workDir, source)
        : await extractEvery(workDir, source, planned)
    if (frames.length === 0) throw new Error(planError(0))

    const frameAssetIds: string[] = []
    for (const frame of frames) {
      const buffer = await readFile(frame.file)
      const asset = await storeBuffer({
        buffer,
        mime: 'image/jpeg',
        kind: 'image',
        source: 'generated',
        folderId: input.folderId ?? null,
        name: frameName(frame.atSeconds),
        ...inheritVisibility(source),
      })
      frameAssetIds.push(asset.id)
    }

    const copy = createVideoCopy({
      sourceAssetId: source.id,
      frameAssetIds,
      folderId: input.folderId ?? null,
    })
    return { copyId: copy.id, frameAssetIds }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

export async function analyzeCopyShots(input: {
  copyId: string
  agent: AgentId
}): Promise<{ shots: VideoCopyShot[] } | { error: string }> {
  const includeNsfw = readNsfwMode()
  const copy = getVideoCopy(input.copyId, { includeNsfw })
  if (!copy) return { error: 'That copy is not in the library.' }
  if (copy.frameAssetIds.length === 0) return { error: 'Extract frames before running the analysis.' }

  const source = getAsset(copy.sourceAssetId, { includeNsfw })
  if (!source) return { error: 'The source video was deleted. Start a new copy.' }
  const probe = await probeVideo(assetPath(source))
  if (!probe) return { error: 'ffprobe could not read the source video. Start a new copy.' }

  const assets = new Map(
    getAssetsByIds(copy.frameAssetIds, { includeNsfw }).map((asset) => [asset.id, asset]),
  )
  const frames = copy.frameAssetIds.flatMap((id, index) => {
    const asset = assets.get(id)
    const atSeconds = frameTime(asset)
    if (!asset || atSeconds === null) return []
    return [{ index, atSeconds, path: assetPath(asset) }]
  })
  if (frames.length < 2) return { error: 'This copy needs two frames with timestamps. Extract frames again.' }

  const installed = await detectAgents()
  if (!installed[input.agent]) {
    return {
      error: `${AGENT_LABELS[input.agent]} is not installed on this machine. Install it, or paste a shot list.`,
    }
  }

  const result = await runAgentShotList({
    agent: input.agent,
    prompt: shotPromptTemplate({ durationSeconds: probe.durationSeconds, frames }),
    images: frames.map((frame) => frame.path),
    durationSeconds: probe.durationSeconds,
  })
  if ('error' in result) {
    updateVideoCopy(copy.id, { status: 'failed', error: result.error })
    return { error: result.error }
  }

  updateVideoCopy(copy.id, { status: 'analyzed', agent: input.agent, shots: result.shots, error: null })
  return { shots: result.shots }
}

export function saveCopyShots(input: {
  copyId: string
  shots: VideoCopyShot[]
  status?: 'analyzed' | 'generating'
  folderId?: string | null
}): { status: VideoCopyRecord['status'] } | { error: string } {
  const copy = getVideoCopy(input.copyId, { includeNsfw: readNsfwMode() })
  if (!copy) return { error: 'That copy is not in the library.' }
  if (input.shots.length > MAX_COPY_SHOTS) {
    return { error: `That is ${input.shots.length} shots; the limit is ${MAX_COPY_SHOTS}.` }
  }
  const fresh = copy.status === 'extracted' || copy.status === 'failed'
  const patch: Parameters<typeof updateVideoCopy>[1] = {
    shots: input.shots,
    status: input.shots.length === 0 ? copy.status : (input.status ?? (fresh ? 'analyzed' : copy.status)),
    error: null,
  }
  if (input.folderId !== undefined) patch.folderId = input.folderId
  const updated = updateVideoCopy(copy.id, patch)
  return { status: updated?.status ?? copy.status }
}

export interface CopyFrameView {
  id: string
  atSeconds: number | null
  url: string
  byteSize: number | null
}

export interface CopyShotView {
  index: number
  shot: VideoCopyShot
  status: GenerationStatus | 'pending'
  error: string | null
  outputUrl: string | null
}

export interface CopyView {
  copy: VideoCopyRecord
  source: { id: string; name: string | null; url: string } | null
  durationSeconds: number | null
  frames: CopyFrameView[]
  shots: CopyShotView[]
}

export async function loadCopyView(copyId: string): Promise<CopyView | null> {
  const includeNsfw = readNsfwMode()
  const copy = getVideoCopy(copyId, { includeNsfw })
  if (!copy) return null

  const assets = new Map(
    getAssetsByIds(copy.frameAssetIds, { includeNsfw }).map((asset) => [asset.id, asset]),
  )
  const frames = copy.frameAssetIds.map((id) => ({
    id,
    atSeconds: frameTime(assets.get(id)),
    url: assetUrl(id),
    byteSize: assets.get(id)?.byteSize ?? null,
  }))

  const shots = copy.shots.map((shot, index) => {
    const generation = shot.generationId ? getGeneration(shot.generationId, { includeNsfw }) : null
    const outputId = generation?.outputAssetIds[0] ?? null
    return {
      index,
      shot,
      status: generation?.status ?? ('pending' as const),
      error: generation?.error ?? null,
      outputUrl: outputId ? assetUrl(outputId) : null,
    }
  })

  const source = getAsset(copy.sourceAssetId, { includeNsfw })
  let durationSeconds = source?.duration ?? null
  if (source && durationSeconds === null && copy.shots.length === 0) {
    durationSeconds = (await probeVideo(assetPath(source)))?.durationSeconds ?? null
  }

  return {
    copy,
    source: source ? { id: source.id, name: source.name, url: assetUrl(source.id) } : null,
    durationSeconds,
    frames,
    shots,
  }
}

export async function loadLatestCopy(): Promise<CopyView | null> {
  const latest = listVideoCopies(1, { includeNsfw: readNsfwMode() })[0]
  return latest ? loadCopyView(latest.id) : null
}

function concatQuote(path: string): string {
  return path.replace(/'/g, "'\\''")
}

function sharedStreams(probes: VideoProbe[]): boolean {
  const first = probes[0]
  if (!first) return false
  return probes.every(
    (probe) =>
      probe.codec === first.codec &&
      probe.width === first.width &&
      probe.height === first.height &&
      Math.abs(probe.fps - first.fps) <= JOIN_FPS_TOLERANCE,
  )
}

export async function joinCopyClips(copyId: string): Promise<{ assetId: string } | { error: string }> {
  const includeNsfw = readNsfwMode()
  const copy = getVideoCopy(copyId, { includeNsfw })
  if (!copy) return { error: 'That copy is not in the library.' }
  if (copy.outputAssetId) return { assetId: copy.outputAssetId }
  if (copy.shots.length === 0) return { error: 'There are no shots to join.' }
  const source = getAsset(copy.sourceAssetId, { includeNsfw })
  if (!source) return { error: 'The source video was deleted. Start a new copy.' }

  const clips: string[] = []
  for (const [index, shot] of copy.shots.entries()) {
    const generation = shot.generationId ? getGeneration(shot.generationId, { includeNsfw }) : null
    if (!generation || generation.status !== 'succeeded' || generation.outputAssetIds.length !== 1) {
      return { error: `shot ${index + 1} has not finished. Wait for the batch, then join.` }
    }
    const asset = getAsset(generation.outputAssetIds[0] as string, { includeNsfw })
    if (!asset) return { error: `shot ${index + 1} has no clip on disk. Re-run that shot.` }
    clips.push(assetPath(asset))
  }

  const probes: VideoProbe[] = []
  for (const [index, clip] of clips.entries()) {
    const probe = await probeVideo(clip)
    if (!probe) return { error: `shot ${index + 1} cannot be read as a video. Re-run that shot.` }
    probes.push(probe)
  }

  const workDir = await mkdtemp(join(tmpdir(), 'sunnygen-join-'))
  updateVideoCopy(copy.id, { status: 'joining', error: null })
  try {
    const listPath = join(workDir, 'list.txt')
    await writeFile(listPath, clips.map((clip) => `file '${concatQuote(clip)}'`).join('\n'))
    const outPath = join(workDir, 'joined.mp4')
    await runFfmpeg(concatArgs({ listPath, outPath, copy: sharedStreams(probes) }), {
      timeoutMs: CONCAT_TIMEOUT_MS,
    })

    const buffer = await readFile(outPath)
    const megabyte = 1024 * 1024
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error(
        `The joined clip is ${(buffer.byteLength / megabyte).toFixed(0)} MB; the limit is ${MAX_UPLOAD_BYTES / megabyte} MB. Drop a shot and join again.`,
      )
    }

    const asset = await storeBuffer({
      buffer,
      mime: 'video/mp4',
      kind: 'video',
      source: 'generated',
      folderId: copy.folderId,
      ...inheritVisibility(source),
    })
    updateVideoCopy(copy.id, { status: 'done', outputAssetId: asset.id, error: null })
    return { assetId: asset.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The join failed.'
    updateVideoCopy(copy.id, { status: 'failed', error: message })
    return { error: message }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
