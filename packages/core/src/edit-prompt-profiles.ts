import { avatarModelFamily } from './avatar-profile'

/**
 * One prompt shape per model family, because the vendors document opposite advice:
 * Qwen truncates long prompts, Gemini wants them long and specific.
 */
export type EditPromptFamily = 'nano-banana' | 'qwen' | 'flux' | 'seedream' | 'gpt-image' | 'grok' | 'generic'

export interface EditPromptProfile {
  family: EditPromptFamily
  /** Hard provider cap; undefined when the vendor documents none. */
  maxChars?: number
  /** Identity clause budget for this family. */
  clauseBudget: number
  detail: 'detailed' | 'compact'
  /** 'early' = the body paragraph sits right after the identity line. */
  bodyPlacement: 'early' | 'late'
  /** 'avoid' = phrase preservation positively, no "do not" lines. */
  negatives: 'allow' | 'avoid'
  /** Repeat one line at the end. */
  restateBody: boolean
  /** How many avatar refs the family accepts. */
  maxRefs: number
}

export const EDIT_PROMPT_PROFILES: Record<EditPromptFamily, EditPromptProfile> = {
  // Google asks for hyper-specific prompts with roles and a keep-list, so the clause gets room
  // and the body sentence repeats at the end.
  'nano-banana': {
    family: 'nano-banana',
    clauseBudget: 600,
    detail: 'detailed',
    bodyPlacement: 'early',
    negatives: 'avoid',
    restateBody: true,
    maxRefs: 3,
  },
  // Alibaba caps input.prompt at 800 characters and truncates the overflow instead of failing,
  // so everything above the subject and body facts has to give way first.
  qwen: {
    family: 'qwen',
    maxChars: 800,
    clauseBudget: 250,
    detail: 'compact',
    bodyPlacement: 'early',
    negatives: 'allow',
    restateBody: false,
    maxRefs: 2,
  },
  // BFL's multi-reference guide wants a narrative prompt with the reference mapping up front,
  // so the body lands after the keep-list and the clause keeps its detail.
  flux: {
    family: 'flux',
    clauseBudget: 600,
    detail: 'detailed',
    bodyPlacement: 'late',
    negatives: 'allow',
    restateBody: false,
    maxRefs: 3,
  },
  // BytePlus labels each role and asks for explicit keep/avoid constraints; no length cap.
  seedream: {
    family: 'seedream',
    clauseBudget: 600,
    detail: 'detailed',
    bodyPlacement: 'late',
    negatives: 'allow',
    restateBody: false,
    maxRefs: 3,
  },
  // OpenAI wants a concise, explicit edit instruction, so the clause is short and the body closes.
  'gpt-image': {
    family: 'gpt-image',
    clauseBudget: 450,
    detail: 'compact',
    bodyPlacement: 'late',
    negatives: 'allow',
    restateBody: false,
    maxRefs: 3,
  },
  // xAI documents short, direct prompts; two references is all a short prompt can name.
  grok: {
    family: 'grok',
    clauseBudget: 350,
    detail: 'compact',
    bodyPlacement: 'early',
    negatives: 'allow',
    restateBody: false,
    maxRefs: 2,
  },
  // Undocumented endpoints get the middle of every range.
  generic: {
    family: 'generic',
    clauseBudget: 600,
    detail: 'detailed',
    bodyPlacement: 'late',
    negatives: 'allow',
    restateBody: false,
    maxRefs: 3,
  },
}

export function editPromptProfile(modelId: string): EditPromptProfile {
  return EDIT_PROMPT_PROFILES[avatarModelFamily(modelId)]
}
