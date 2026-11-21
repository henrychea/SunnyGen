import type { ProviderId } from './domain'

export interface EditProfile {
  target: 'first' | 'second'
  token: string
}

interface EditProfileRow {
  provider?: ProviderId
  match: RegExp
  profile: EditProfile
}

const IMAGE_TOKEN = 'image %d'
const AT_IMAGE_TOKEN = '@image%d'

const EDIT_PROFILES: EditProfileRow[] = [
  { provider: 'fal', match: /flux-?2/, profile: { target: 'first', token: AT_IMAGE_TOKEN } },
  { match: /flux-?2|flux-?3/, profile: { target: 'first', token: IMAGE_TOKEN } },
  { match: /kontext/, profile: { target: 'first', token: IMAGE_TOKEN } },
  { match: /nano-banana|gemini/, profile: { target: 'first', token: IMAGE_TOKEN } },
  { match: /seedream/, profile: { target: 'first', token: IMAGE_TOKEN } },
  { match: /gpt-image/, profile: { target: 'first', token: IMAGE_TOKEN } },
  { match: /qwen-image/, profile: { target: 'first', token: IMAGE_TOKEN } },
  { match: /grok-imagine/, profile: { target: 'first', token: IMAGE_TOKEN } },
]

export const DEFAULT_EDIT_PROFILE: EditProfile = { target: 'second', token: IMAGE_TOKEN }

function providerOf(modelId: string): ProviderId | null {
  const [prefix, ...rest] = modelId.split(':')
  if (rest.length === 0) return null
  return prefix === 'fal' || prefix === 'sunra' ? prefix : null
}

export function editProfile(modelId: string): EditProfile {
  const provider = providerOf(modelId)
  for (const row of EDIT_PROFILES) {
    if (row.provider && row.provider !== provider) continue
    if (row.match.test(modelId)) return row.profile
  }
  return DEFAULT_EDIT_PROFILE
}

export function editToken(profile: EditProfile, index: number): string {
  return profile.token.replace('%d', String(index))
}
