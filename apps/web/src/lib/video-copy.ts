import { MAX_COPY_SHOTS, type VideoShot } from '@sunnygen/core'

export interface CopyShotJob {
  shotIndex: number
  prompt: string
  assetIds: [string, string]
}

export interface CopyShotJobsInput {
  shots: VideoShot[]
  frames: Array<{ id: string; atSeconds: number }>
  stylePrompt: string
}

export function copyShotJobs(input: CopyShotJobsInput): { error: string | null; jobs: CopyShotJob[] } {
  if (input.shots.length === 0) return { error: 'There are no shots to recreate.', jobs: [] }
  if (input.shots.length > MAX_COPY_SHOTS) {
    return { error: `That is ${input.shots.length} shots; the limit is ${MAX_COPY_SHOTS}.`, jobs: [] }
  }
  if (input.frames.length === 0) return { error: 'This copy has no frames to recreate from.', jobs: [] }

  const style = input.stylePrompt.trim()
  const jobs: CopyShotJob[] = []
  for (const [index, shot] of input.shots.entries()) {
    const start = nearestFrame(input.frames, shot.start)
    const end = nearestFrame(input.frames, shot.end)
    if (!start || !end) {
      return { error: `shot ${index + 1} has no frame near ${shot.start}s or ${shot.end}s.`, jobs: [] }
    }
    if (start.id === end.id) {
      return {
        error: `shot ${index + 1}: the nearest frames to ${shot.start}s and ${shot.end}s are the same. Extract more frames or move the shot.`,
        jobs: [],
      }
    }
    const prompt = shot.prompt.trim()
    jobs.push({
      shotIndex: index,
      prompt: style ? `${prompt} ${style}` : prompt,
      assetIds: [start.id, end.id],
    })
  }
  return { error: null, jobs }
}

// A tie goes to the earlier frame, so the mapping is the same on every run.
function nearestFrame(
  frames: Array<{ id: string; atSeconds: number }>,
  atSeconds: number,
): { id: string; atSeconds: number } | null {
  let best: { id: string; atSeconds: number } | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const frame of frames) {
    const distance = Math.abs(frame.atSeconds - atSeconds)
    if (distance < bestDistance) {
      best = frame
      bestDistance = distance
    }
  }
  return best
}
