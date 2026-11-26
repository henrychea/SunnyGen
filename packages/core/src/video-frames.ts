export const MAX_COPY_FRAMES = 48
export const MAX_COPY_SHOTS = 24

export type FrameMode = 'scene' | 'every' | 'timestamps'

export interface FrameTimeInput {
  mode: FrameMode
  durationSeconds: number
  everySeconds?: number
  timestamps?: number[]
  sceneTimes?: number[]
}

const DEFAULT_EVERY_SECONDS = 10

function cleanTimes(times: number[], durationSeconds: number): number[] {
  const kept = new Set<number>()
  for (const time of times) {
    if (!Number.isFinite(time)) continue
    if (time < 0 || time >= durationSeconds) continue
    kept.add(Math.round(time * 1000) / 1000)
  }
  return [...kept].sort((left, right) => left - right)
}

export function frameTimes(input: FrameTimeInput): number[] {
  const duration = input.durationSeconds
  if (!Number.isFinite(duration) || duration <= 0) return []

  if (input.mode === 'every') {
    const interval =
      Number.isFinite(input.everySeconds) && (input.everySeconds ?? 0) > 0
        ? (input.everySeconds as number)
        : DEFAULT_EVERY_SECONDS
    const times: number[] = []
    for (let index = 0; index * interval < duration; index += 1) times.push(index * interval)
    return times
  }

  if (input.mode === 'scene') return cleanTimes(input.sceneTimes ?? [], duration)
  return cleanTimes(input.timestamps ?? [], duration)
}

export function capFrameTimes(times: number[], max: number = MAX_COPY_FRAMES): number[] {
  const limit = Math.max(1, Math.floor(max))
  if (times.length <= limit) return [...times]
  if (limit === 1) return times.slice(0, 1)
  const last = times.length - 1
  const picked: number[] = []
  for (let index = 0; index < limit; index += 1) {
    picked.push(times[Math.round((index * last) / (limit - 1))] as number)
  }
  return picked
}

export function framesWithinBudget(frameCount: number, max: number = MAX_COPY_FRAMES): boolean {
  return frameCount > 0 && frameCount <= max
}
