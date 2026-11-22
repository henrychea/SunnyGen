import {
  VIDEO_MODE_KEYS,
  VIDEO_MODE_LABELS,
  defaultVideoMode,
  videoModeDefinition,
  type VideoModeKey,
  type VideoModelDefinition,
} from '@sunnygen/core'
import type { ModelOption } from '~/components/model-combobox'
import { reconcileParams, type ComposerParams, type ParamChange } from './model-params'

export interface VideoParams extends ComposerParams {
  videoMode: VideoModeKey
  sound: boolean
}

export interface VideoReconcileResult {
  params: VideoParams
  mode: VideoModeKey
  changes: ParamChange[]
}

export function videoDefinitions(options: ModelOption[]): VideoModelDefinition[] {
  const seen = new Set<string>()
  const models: VideoModelDefinition[] = []
  for (const option of options) {
    const definition = option.definition
    if (!definition || definition.kind !== 'video' || option.disabled) continue
    if (seen.has(definition.id)) continue
    seen.add(definition.id)
    models.push(definition)
  }
  return models
}

export function videoModesFor(models: VideoModelDefinition[], mode: VideoModeKey): VideoModelDefinition[] {
  return models.filter((model) => model.videoModes[mode] !== undefined)
}

export function availableVideoModes(models: VideoModelDefinition[]): VideoModeKey[] {
  return VIDEO_MODE_KEYS.filter((mode) => videoModesFor(models, mode).length > 0)
}

export function videoModeSlots(models: VideoModelDefinition[], mode: VideoModeKey): number {
  return Math.max(0, ...models.map((model) => model.videoModes[mode]?.maxImages ?? 0))
}

export function defaultVideoParams(model: VideoModelDefinition, mode: VideoModeKey): VideoParams {
  const limits = videoModeDefinition(model, mode)
  return {
    videoMode: mode,
    aspectRatio: limits.defaultRatio,
    quality: '',
    duration: limits.defaultDuration,
    resolution: limits.defaultResolution,
    count: 1,
    sound: limits.sound,
  }
}

export function reconcileVideoParams(
  current: VideoParams,
  model: VideoModelDefinition,
  preferredMode: VideoModeKey,
): VideoReconcileResult {
  const changes: ParamChange[] = []
  const mode = model.videoModes[preferredMode] ? preferredMode : defaultVideoMode(model)
  if (mode !== preferredMode) {
    changes.push({
      field: 'videoMode',
      from: preferredMode,
      to: mode,
      message: `${VIDEO_MODE_LABELS[preferredMode]} is not available on ${model.label}. Switched to ${VIDEO_MODE_LABELS[mode]}.`,
    })
  }

  const limits = videoModeDefinition(model, mode)
  const { params, changes: limitChanges } = reconcileParams(
    {
      aspectRatio: current.aspectRatio,
      quality: '',
      duration: current.duration,
      resolution: current.resolution,
      count: 1,
    },
    limits,
  )
  changes.push(...limitChanges)

  const sound = limits.sound ? current.sound : false

  return {
    mode,
    changes,
    params: {
      ...params,
      videoMode: mode,
      sound,
    },
  }
}
