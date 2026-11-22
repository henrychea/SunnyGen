import type { ModelDefinition } from '@sunnygen/core'

export const MAX_IMAGE_RESULTS = 4

export interface ComposerParams {
  aspectRatio: string
  quality: string
  duration: number
  resolution: string
  count: number
}

export type ParamField =
  | 'aspectRatio'
  | 'quality'
  | 'duration'
  | 'resolution'
  | 'count'
  | 'videoMode'
  | 'sound'

export interface ParamChange {
  field: ParamField
  from: string
  to: string
  message: string
}

export interface ReconcileResult {
  params: ComposerParams
  changes: ParamChange[]
}

export function defaultAspectRatio(model: ModelDefinition): string {
  if (model.ratios.length === 0) return '1:1'
  if (model.kind === 'video') return model.defaultRatio || model.ratios[0] || '1:1'
  return model.ratios.includes('1:1') ? '1:1' : (model.ratios[0] ?? '1:1')
}

export function defaultQuality(model: ModelDefinition): string {
  if (model.kind !== 'image' || !model.supportsQuality || model.qualityOptions.length === 0) return ''
  if (model.qualityOptions.includes('1k')) return '1k'
  if (model.defaultQuality && model.qualityOptions.includes(model.defaultQuality)) {
    return model.defaultQuality
  }
  return model.qualityOptions[0] ?? ''
}

function ratioValue(ratio: string): number | null {
  if (!ratio || ratio === 'auto') return null
  const [width, height] = ratio.split(':').map(Number)
  if (!width || !height) return null
  return width / height
}

function orientationOf(value: number): 'landscape' | 'portrait' | 'square' {
  if (Math.abs(value - 1) < 1e-6) return 'square'
  return value > 1 ? 'landscape' : 'portrait'
}

const QUALITY_TIERS: Record<string, number> = {
  '0.5k': 0.5,
  '768sq': 0.75,
  '1k': 1,
  '1.5k': 1.5,
  '2k': 2,
  '3k': 3,
  '4k': 4,
}

const RESOLUTION_TIERS: Record<string, number> = {
  '480p': 480,
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '1k': 1024,
  '2k': 1440,
  '4k': 2160,
}

function tierValue(value: string, tiers: Record<string, number>): number | null {
  const known = tiers[value.toLowerCase()]
  if (known !== undefined) return known
  const match = /(\d+(?:\.\d+)?)/.exec(value)
  if (!match) return null
  const numeric = Number(match[1])
  return Number.isFinite(numeric) ? numeric : null
}

function nearestRatio(current: string, options: string[]): string | null {
  const target = ratioValue(current)
  if (target === null) return null
  const orientation = orientationOf(target)
  const candidates: Array<{ ratio: string; distance: number; value: number }> = []
  for (const ratio of options) {
    const value = ratioValue(ratio)
    if (value === null || orientationOf(value) !== orientation) continue
    candidates.push({ ratio, distance: Math.abs(value - target), value })
  }
  if (candidates.length === 0) return null
  candidates.sort((left, right) => left.distance - right.distance || left.value - right.value)
  return candidates[0]?.ratio ?? null
}

function nearestTier(current: string, options: string[], tiers: Record<string, number>): string | null {
  const target = tierValue(current, tiers)
  if (target === null) return null
  const candidates: Array<{ option: string; distance: number; value: number }> = []
  for (const option of options) {
    const value = tierValue(option, tiers)
    if (value === null) continue
    candidates.push({ option, distance: Math.abs(value - target), value })
  }
  if (candidates.length === 0) return null
  candidates.sort((left, right) => left.distance - right.distance || left.value - right.value)
  return candidates[0]?.option ?? null
}

function nearestDuration(current: number, options: number[]): number | null {
  if (!Number.isFinite(current) || options.length === 0) return null
  const candidates = options
    .map((option) => ({ option, distance: Math.abs(option - current) }))
    .sort((left, right) => left.distance - right.distance || left.option - right.option)
  return candidates[0]?.option ?? null
}

function ratioLabel(ratio: string): string {
  return ratio === 'auto' ? 'Auto' : ratio
}

function tierLabel(value: string): string {
  return value.toUpperCase()
}

export function reconcileParams(current: ComposerParams, next: ModelDefinition): ReconcileResult {
  const changes: ParamChange[] = []
  const params: ComposerParams = { ...current }

  const ratios = next.ratios.length > 0 ? next.ratios : ['1:1']
  if (!ratios.includes(params.aspectRatio)) {
    const fallback = nearestRatio(params.aspectRatio, ratios) ?? defaultAspectRatio(next)
    if (fallback !== params.aspectRatio) {
      changes.push({
        field: 'aspectRatio',
        from: params.aspectRatio,
        to: fallback,
        message: `${ratioLabel(params.aspectRatio)} is not available on ${next.label}. Switched to ${ratioLabel(fallback)}.`,
      })
      params.aspectRatio = fallback
    }
  }

  if (next.kind === 'image' && next.supportsQuality && next.qualityOptions.length > 0) {
    const fallback = defaultQuality(next)
    if (params.quality && !next.qualityOptions.includes(params.quality)) {
      const nearest = nearestTier(params.quality, next.qualityOptions, QUALITY_TIERS) ?? fallback
      if (nearest && nearest !== params.quality) {
        changes.push({
          field: 'quality',
          from: params.quality,
          to: nearest,
          message: `Quality ${tierLabel(params.quality)} is not available on ${next.label}. Switched to ${tierLabel(nearest)}.`,
        })
        params.quality = nearest
      }
    } else if (!params.quality && fallback) {
      params.quality = fallback
    }
  }

  if (next.kind === 'video') {
    if (next.durations.length > 0 && !next.durations.includes(params.duration)) {
      const nearest = nearestDuration(params.duration, next.durations) ?? next.defaultDuration
      if (nearest !== params.duration) {
        changes.push({
          field: 'duration',
          from: String(params.duration),
          to: String(nearest),
          message: `${params.duration}s is not available on ${next.label}. Switched to ${nearest}s.`,
        })
        params.duration = nearest
      }
    }

    if (next.resolutions.length > 0 && !next.resolutions.includes(params.resolution)) {
      const fallback = next.defaultResolution || next.resolutions[0] || ''
      if (params.resolution) {
        const nearest = nearestTier(params.resolution, next.resolutions, RESOLUTION_TIERS) ?? fallback
        if (nearest && nearest !== params.resolution) {
          changes.push({
            field: 'resolution',
            from: params.resolution,
            to: nearest,
            message: `${tierLabel(params.resolution)} is not available on ${next.label}. Switched to ${tierLabel(nearest)}.`,
          })
          params.resolution = nearest
        }
      } else if (fallback) {
        params.resolution = fallback
      }
    }
  }

  if (next.kind === 'image' && params.count > MAX_IMAGE_RESULTS) {
    changes.push({
      field: 'count',
      from: String(params.count),
      to: String(MAX_IMAGE_RESULTS),
      message: `${next.label} shows at most ${MAX_IMAGE_RESULTS} results per prompt.`,
    })
    params.count = MAX_IMAGE_RESULTS
  }

  return { params, changes }
}

const REFERENCE_PLURAL = (count: number): string => (count === 1 ? 'reference' : 'references')

export function describeReferenceTrim(label: string, limit: number, removed: number): string {
  if (removed <= 0) return ''
  if (limit <= 0) return `${label} does not take reference images; removed ${removed}.`
  return `${label} accepts ${limit} ${REFERENCE_PLURAL(limit)}; removed ${removed}.`
}

export function describeEditReferenceTrim(label: string, limit: number, removed: number): string {
  if (removed <= 0) return ''
  if (limit <= 0) return `${label} does not take edit references; removed ${removed}.`
  return `${label} accepts ${limit} edit ${REFERENCE_PLURAL(limit)}; removed ${removed}.`
}
