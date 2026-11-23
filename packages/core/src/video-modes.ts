export const VIDEO_MODE_KEYS = ['text', 'image', 'frames', 'references', 'edit'] as const

export type VideoModeKey = (typeof VIDEO_MODE_KEYS)[number]

export type VideoFieldType = 'string' | 'array' | 'object' | 'number' | 'integer' | 'boolean' | 'unknown'

export interface VideoFieldInfo {
  type: VideoFieldType
  maxItems: number | null
  values: string[]
}

export interface VideoOperationInfo {
  name: string
  path: string
  fields: Record<string, VideoFieldInfo>
  required: string[]
}

export interface VideoModeCapability {
  endpoint: string
  videoField: string | null
  fields: string[]
  fieldsMode: 'single' | 'array'
  maxImages: number
  durations: number[]
  resolutions: string[]
  ratios: string[]
  audio: boolean
}

export type VideoModes = Partial<Record<VideoModeKey, VideoModeCapability>>

export const VIDEO_MODE_LABELS: Record<VideoModeKey, string> = {
  text: 'Without references',
  image: 'Start frame',
  frames: 'Start + end frame',
  references: 'Reference images',
  edit: 'Video edit',
}

export const VIDEO_START_FIELDS = [
  'image',
  'image_url',
  'start_image',
  'start_image_url',
  'first_frame_url',
  'input_image',
  'input_image_url',
] as const

export const VIDEO_END_FIELDS = [
  'end_image',
  'end_image_url',
  'last_image',
  'last_image_url',
  'last_frame_url',
  'tail_image_url',
] as const

export const VIDEO_REFERENCE_FIELDS = [
  'reference_images',
  'reference_image_urls',
  'image_urls',
  'reference_image',
  'elements',
] as const

export const VIDEO_INPUT_FIELDS = ['video_url', 'video', 'video_urls', 'reference_video_urls'] as const

export const VIDEO_AUDIO_INPUT_FIELDS = ['audio_url', 'audio', 'voice', 'avatar', 'target_lang'] as const

export const VIDEO_FRAME_FIELDS = ['keyframes'] as const

const DURATION_FIELDS = ['duration', 'duration_seconds', 'seconds'] as const
const RESOLUTION_FIELDS = ['resolution'] as const
const RATIO_FIELDS = ['aspect_ratio', 'ratio'] as const
const AUDIO_FIELDS = ['generate_audio', 'audio'] as const
const PROMPT_FIELDS = ['prompt'] as const

const EDIT_PARAMETER_FIELDS = [...DURATION_FIELDS, ...RESOLUTION_FIELDS, ...RATIO_FIELDS, ...AUDIO_FIELDS]

export interface VideoModeOptions {
  maxImages?: number
  durations?: number[]
  resolutions?: string[]
  ratios?: string[]
  audio?: boolean
}

function namesOf(fields: Record<string, VideoFieldInfo>, names: readonly string[]): string[] {
  return names.filter((name) => name in fields)
}

function numberList(values: string[]): number[] {
  const numbers = values
    .map((value) => (/^\d+(?:\.\d+)?s?$/i.test(value.trim()) ? Number.parseFloat(value) : null))
    .filter((value): value is number => value !== null && Number.isFinite(value))
  return [...new Set(numbers)].sort((left, right) => left - right)
}

function stringList(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

function editReference(
  fields: Record<string, VideoFieldInfo>,
): { name: string; fieldsMode: 'single' | 'array' } | null {
  const array = namesOf(fields, VIDEO_REFERENCE_FIELDS).find((name) => fields[name]?.type === 'array')
  if (array) return { name: array, fieldsMode: 'array' }
  const single = namesOf(fields, VIDEO_REFERENCE_FIELDS).find((name) => fields[name]?.type === 'string')
  return single ? { name: single, fieldsMode: 'single' } : null
}

function operationMode(name: string): VideoModeKey | null {
  if (/reference-to-video/.test(name)) return 'references'
  if (/first-last-frame|keyframes-to-video/.test(name)) return 'frames'
  if (/text-to-video/.test(name)) return 'text'
  if (/image-to-video/.test(name)) return 'image'
  return null
}

function modeCapability(
  operation: VideoOperationInfo,
  mode: VideoModeKey,
  options: VideoModeOptions,
): VideoModeCapability {
  const fields = operation.fields
  const start = namesOf(fields, VIDEO_START_FIELDS).find((name) => fields[name]?.type === 'string')
  const end = namesOf(fields, VIDEO_END_FIELDS).find((name) => fields[name]?.type === 'string')
  const keyframe = namesOf(fields, VIDEO_FRAME_FIELDS).find((name) => fields[name]?.type === 'array')
  const reference = namesOf(fields, VIDEO_REFERENCE_FIELDS).find((name) => fields[name]?.type === 'array')
  const videoField =
    mode === 'edit'
      ? (namesOf(fields, VIDEO_INPUT_FIELDS).find(
          (name) => fields[name]?.type === 'string' && operation.required.includes(name),
        ) ?? null)
      : null

  const durations = numberList(namesOf(fields, DURATION_FIELDS).flatMap((name) => fields[name]?.values ?? []))
  const resolutions = [
    ...new Set(
      namesOf(fields, RESOLUTION_FIELDS)
        .flatMap((name) => fields[name]?.values ?? [])
        .map((value) => value.toLowerCase()),
    ),
  ]
  const ratios = stringList(namesOf(fields, RATIO_FIELDS).flatMap((name) => fields[name]?.values ?? []))
  const audio = namesOf(fields, AUDIO_FIELDS).some((name) => fields[name]?.type === 'boolean')

  let modeFields: string[] = []
  let fieldsMode: 'single' | 'array' = 'single'
  let maxImages = 0
  if (mode === 'image' && start) {
    modeFields = [start]
    maxImages = 1
  } else if (mode === 'frames' && start && end) {
    modeFields = [start, end]
    maxImages = 2
  } else if (mode === 'frames' && start && keyframe) {
    modeFields = [start, keyframe]
    fieldsMode = 'array'
    maxImages = fields[keyframe]?.maxItems ?? 2
  } else if (mode === 'references' && reference) {
    modeFields = [reference]
    fieldsMode = 'array'
    maxImages = fields[reference]?.maxItems ?? options.maxImages ?? (reference === 'elements' ? 3 : 0)
  } else if (mode === 'edit') {
    const editRef = editReference(fields)
    if (editRef) {
      modeFields = [editRef.name]
      fieldsMode = editRef.fieldsMode
      maxImages = editRef.fieldsMode === 'array' ? (fields[editRef.name]?.maxItems ?? 1) : 1
    }
  }

  return {
    endpoint: operation.path.replace(/^\/+/, ''),
    videoField,
    fields: modeFields,
    fieldsMode,
    maxImages: mode === 'text' ? 0 : maxImages || options.maxImages || 1,
    durations: durations.length > 0 ? durations : (options.durations ?? []),
    resolutions: resolutions.length > 0 ? resolutions : (options.resolutions ?? []),
    ratios: ratios.length > 0 ? ratios : (options.ratios ?? []),
    audio: audio || options.audio === true,
  }
}

export function classifyVideoOperation(operation: VideoOperationInfo): VideoModeKey | null {
  return operationVideoModes(operation)[0] ?? null
}

export function operationVideoModes(operation: VideoOperationInfo): VideoModeKey[] {
  const fields = operation.fields
  if (operation.name.includes('draft')) return []
  const requiredVideoInputs = namesOf(fields, VIDEO_INPUT_FIELDS).filter((name) =>
    operation.required.includes(name),
  )
  if (requiredVideoInputs.length > 0) {
    const videoField = requiredVideoInputs.find((name) => fields[name]?.type === 'string')
    const editRef = editReference(fields)
    if (!videoField || !editRef || namesOf(fields, PROMPT_FIELDS).length === 0) return []
    // A required field the adapter cannot send is a body the provider rejects, so it is not editable.
    const fillable = [...PROMPT_FIELDS, ...EDIT_PARAMETER_FIELDS, videoField, editRef.name]
    return operation.required.every((name) => fillable.includes(name)) ? ['edit'] : []
  }
  if (namesOf(fields, VIDEO_AUDIO_INPUT_FIELDS).some((name) => operation.required.includes(name))) {
    return []
  }
  if (operation.name.includes('upscale')) return []
  if (
    !namesOf(fields, PROMPT_FIELDS).length &&
    !/(text|image|reference|frame|keyframe)s?-to-video/.test(operation.name)
  ) {
    return []
  }

  const start = namesOf(fields, VIDEO_START_FIELDS).find((name) => fields[name]?.type === 'string')
  const end = namesOf(fields, VIDEO_END_FIELDS).find((name) => fields[name]?.type === 'string')
  const keyframe = namesOf(fields, VIDEO_FRAME_FIELDS).find((name) => fields[name]?.type === 'array')
  const reference = namesOf(fields, VIDEO_REFERENCE_FIELDS).find((name) => fields[name]?.type === 'array')
  const named = operationMode(operation.name)

  if (!start && !end && !keyframe && !reference) {
    return named === 'image' || named === 'frames' || named === 'references' ? [] : ['text']
  }

  const requiredStart = start !== undefined && operation.required.includes(start)
  const requiredEnd =
    (end !== undefined && operation.required.includes(end)) ||
    (keyframe !== undefined && operation.required.includes(keyframe))
  const modes: VideoModeKey[] = []
  if (reference && !requiredStart) modes.push('references')
  if (start && (end || keyframe)) modes.push('frames')
  if (start && !requiredEnd) modes.push('image')
  return modes
}

export function classifyVideoModes(
  operations: VideoOperationInfo[],
  options: VideoModeOptions = {},
): VideoModes {
  const modes: VideoModes = {}
  for (const operation of operations) {
    for (const mode of operationVideoModes(operation)) {
      if (modes[mode]) continue
      modes[mode] = modeCapability(operation, mode, options)
    }
  }
  return modes
}

export function videoModeKeys(modes: VideoModes | undefined | null): VideoModeKey[] {
  return VIDEO_MODE_KEYS.filter((mode) => modes?.[mode] !== undefined)
}

export function bestVideoMode(modes: VideoModes | undefined | null): VideoModeKey | null {
  return videoModeKeys(modes).find((mode) => mode !== 'edit') ?? null
}
