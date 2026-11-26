import { z } from 'zod'
import { MAX_COPY_SHOTS } from './video-frames'

const PROMPT_LIMIT = 2000
const DURATION_SLACK = 0.5

export const videoShotSchema = z.object({
  start: z.number().finite().min(0, 'must not be negative'),
  end: z.number().finite().min(0, 'must not be negative'),
  subject: z.string().trim().min(1, 'is empty'),
  action: z.string().trim().min(1, 'is empty'),
  motion: z.string().trim().min(1, 'is empty'),
  camera: z.string().trim().min(1, 'is empty'),
  lighting: z.string().trim().min(1, 'is empty'),
  prompt: z.string().trim().min(1, 'is empty').max(PROMPT_LIMIT, `is longer than ${PROMPT_LIMIT} characters`),
})

export const videoShotListSchema = z.object({
  shots: z.array(videoShotSchema).min(1).max(MAX_COPY_SHOTS),
})

export type VideoShot = z.infer<typeof videoShotSchema>
export type VideoShotList = z.infer<typeof videoShotListSchema>

export type ShotListResult = { shots: VideoShot[] } | { error: string }

export const SHOT_LIST_JSON_ERROR =
  'The answer is not JSON. Reply with one JSON object shaped like {"shots":[{"start":0,"end":3,...}]} and nothing else.'

const FENCE = /```(?:json)?\s*([\s\S]*?)```/

function describeIssue(issue: z.core.$ZodIssue): string {
  const [root, index, field] = issue.path
  if (root !== 'shots' || typeof index !== 'number') {
    return `The shot list needs a "shots" array of 1 to ${MAX_COPY_SHOTS} shots.`
  }
  if (typeof field !== 'string') return `shot ${index + 1}: ${issue.message}`
  return `shot ${index + 1}: ${field} ${issue.message}`
}

export function parseShotList(text: string, durationSeconds: number): ShotListResult {
  const body = (text.match(FENCE)?.[1] ?? text).trim()
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return { error: SHOT_LIST_JSON_ERROR }
  }

  const parsed = videoShotListSchema.safeParse(raw)
  if (!parsed.success) return { error: describeIssue(parsed.error.issues[0] as z.core.$ZodIssue) }

  const shots = parsed.data.shots
  let previous: VideoShot | null = null
  for (const [index, shot] of shots.entries()) {
    if (previous && shot.start <= previous.start) {
      return {
        error: `shot ${index + 1}: start ${shot.start} must be greater than shot ${index} start ${previous.start}.`,
      }
    }
    if (shot.end <= shot.start) {
      return { error: `shot ${index + 1}: end ${shot.end} must be after start ${shot.start}.` }
    }
    if (shot.end > durationSeconds + DURATION_SLACK) {
      return { error: `shot ${index + 1}: end ${shot.end} is past the ${durationSeconds}s clip.` }
    }
    previous = shot
  }

  return { shots }
}
