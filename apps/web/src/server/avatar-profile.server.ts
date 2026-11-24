import {
  DEFAULT_ASSISTANT_MODEL,
  missingProfileFields,
  parseAvatarProfile,
  type AvatarProfile,
} from '@sunnygen/core'

const OPENROUTER_URL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1/chat/completions'

export const PROFILE_EXTRACTION_PROMPT = [
  'You fill an avatar profile from one character reference sheet.',
  'Describe only the adult person shown and return one JSON object: no prose, no code fence.',
  'Shape: {"identity":{"gender":"female|male","age":<adult 18-99>,"ethnicity":"...","heightCm":<140-210>,"weightKg":<30-200>},"face":{"faceShape":"...","jawline":"...","chin":"...","eyeSize":"...","eyeShape":"...","eyebrows":"...","noseBridge":"...","noseTip":"...","lips":"...","skinTone":"..."},"hair":{"color":"...","length":"...","texture":"...","parting":"..."},"body":{"build":"...","legs":"...","bust":"..."},"outfit":{"top":"...","legwear":"...","shoes":"..."}}',
  'Write short lower-case phrases in this style: soft oval, slender, petite, large, natural almond-shaped, slim, dainty, soft and full, fair and natural, dark brown near-black, long, slightly wavy, natural center-parted fringe, very slim and hourglass, black stockings, black high heels.',
  'If a detail is not visible, choose the closest plausible value for the same adult. Never return an age under 18.',
].join(' ')

export const PROMPT_EXTRACTION_PROMPT = [
  'You fill an avatar profile from one pasted image-generation prompt.',
  'Return one JSON object: no prose, no code fence, no fields beyond the shape below.',
  'Shape: {"identity":{"gender":"female|male","age":<adult 18-99>,"ethnicity":"...","heightCm":<140-210>,"weightKg":<30-200>},"face":{"faceShape":"...","jawline":"...","chin":"...","eyeSize":"...","eyeShape":"...","eyebrows":"...","noseBridge":"...","noseTip":"...","lips":"...","skinTone":"..."},"hair":{"color":"...","length":"...","texture":"...","parting":"..."},"body":{"build":"...","legs":"...","bust":"..."},"outfit":{"top":"...","legwear":"...","shoes":"..."}}',
  'Use only what the prompt states. Set every field the prompt does not state to null. Never guess, never infer from the image type, never fill a field to be helpful.',
  'Copy the prompt wording into short lower-case phrases, for example: soft oval, slender, petite, large almond-shaped, slim, dainty, fair and natural, dark brown near-black, waist-length, slightly wavy, very slim and hourglass, black stockings, black high heels.',
  'The person must be an adult aged 18 or older.',
].join(' ')

export interface ImageProfileInput {
  imageDataUrl: string
  key: string
  model?: string
  origin?: string
}

export interface PromptProfileInput {
  promptText: string
  key: string
  model?: string
  origin?: string
}

export type ProfileExtractionInput = ImageProfileInput | PromptProfileInput

export interface ProfileExtractionRequest {
  url: string
  init: RequestInit
  model: string
}

export function buildProfileExtractionRequest(input: ProfileExtractionInput): ProfileExtractionRequest {
  const model = input.model ?? DEFAULT_ASSISTANT_MODEL
  const content =
    'promptText' in input
      ? [{ type: 'text', text: `${PROMPT_EXTRACTION_PROMPT}\n\nPrompt:\n${input.promptText}` }]
      : [
          { type: 'text', text: PROFILE_EXTRACTION_PROMPT },
          { type: 'image_url', image_url: { url: input.imageDataUrl } },
        ]
  const body = {
    model,
    messages: [{ role: 'user', content }],
    response_format: { type: 'json_object' },
    max_tokens: 1200,
    stream: false,
  }
  return {
    url: OPENROUTER_URL,
    model,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.key}`,
        'Content-Type': 'application/json',
        ...(input.origin ? { 'HTTP-Referer': input.origin } : {}),
        'X-Title': 'SunnyGen',
      },
      body: JSON.stringify(body),
    },
  }
}

export function parseExtractedProfile(content: string): AvatarProfile | null {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return parseAvatarProfile(JSON.parse(content.slice(start, end + 1)) as unknown)
  } catch {
    return null
  }
}

interface OpenRouterReply {
  choices?: Array<{ message?: { content?: unknown } }>
  error?: { message?: string } | string
}

export async function awaitProfileExtraction(
  request: ProfileExtractionRequest,
  fetcher: typeof fetch = fetch,
): Promise<AvatarProfile> {
  const reply = await awaitProfileReply(request, fetcher)
  const profile = parseExtractedProfile(reply)
  if (!profile) throw new Error('The assistant did not return a usable profile.')
  return profile
}

async function awaitProfileReply(
  request: ProfileExtractionRequest,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher(request.url, request.init)
  const text = await response.text()
  if (!response.ok) {
    let detail = ''
    try {
      const parsed = JSON.parse(text) as OpenRouterReply
      detail = typeof parsed.error === 'string' ? parsed.error : (parsed.error?.message ?? '')
    } catch {
      detail = text.trim()
    }
    throw new Error(detail || `OpenRouter returned ${response.status}.`)
  }
  let payload: OpenRouterReply
  try {
    payload = JSON.parse(text) as OpenRouterReply
  } catch {
    throw new Error('OpenRouter returned an unreadable reply.')
  }
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('The assistant did not return a usable profile.')
  }
  return content
}

export interface PromptProfileResult {
  profile: AvatarProfile
  missing: string[]
}

export async function extractAvatarFromPrompt(
  input: PromptProfileInput,
  fetcher: typeof fetch = fetch,
): Promise<PromptProfileResult> {
  if (!input.key.trim()) {
    throw new Error('Add an OpenRouter API key in Settings to extract a profile.')
  }
  const reply = await awaitProfileReply(buildProfileExtractionRequest(input), fetcher)
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('The assistant did not return a usable profile.')
  let raw: unknown
  try {
    raw = JSON.parse(reply.slice(start, end + 1))
  } catch {
    throw new Error('The assistant did not return a usable profile.')
  }
  const rawAge = (raw as { identity?: { age?: unknown } }).identity?.age
  const age = rawAge === null || rawAge === undefined || rawAge === '' ? Number.NaN : Number(rawAge)
  if (Number.isFinite(age) && !isAdult(age)) {
    throw new Error('That prompt describes a person under 18. Avatars must be adults.')
  }
  const profile = parseAvatarProfile(
    // A null field means "the prompt does not say": drop it so the parser keeps its default and
    // the field stays in the missing list instead of failing the whole extraction.
    JSON.parse(JSON.stringify(raw, (_key, value) => (value === null ? undefined : value))) as unknown,
  )
  if (!profile) throw new Error('The assistant did not return a usable profile.')
  return { profile, missing: missingProfileFields(raw) }
}

function isAdult(age: number): boolean {
  return Number.isInteger(age) && age >= 18 && age <= 99
}

export async function extractAvatarProfile(
  input: ImageProfileInput,
  fetcher: typeof fetch = fetch,
): Promise<AvatarProfile> {
  if (!input.key.trim()) {
    throw new Error('Add an OpenRouter API key in Settings to extract keywords.')
  }
  return awaitProfileExtraction(buildProfileExtractionRequest(input), fetcher)
}
