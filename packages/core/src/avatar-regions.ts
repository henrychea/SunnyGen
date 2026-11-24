/**
 * An avatar carries three images: a reference sheet, a body panel and a face panel. Crops are
 * regions of those images, and the references sent to a model are boards composed from them.
 */

export const REGION_SOURCES = ['sheet', 'body-panel', 'face-panel'] as const
export type RegionSource = (typeof REGION_SOURCES)[number]

export const BODY_REGION_ROLES = ['body-front', 'body-side', 'body-back', 'body-three-quarter'] as const

export const FACE_REGION_ROLES = ['face-front', 'face-three-quarter', 'face-side', 'hands'] as const

export const SHEET_REGION_ROLES = [
  'expressions',
  'hair-details',
  'facial-features',
  'skin-texture',
  'body-details',
] as const

export const CROP_REGION_ROLES = [...FACE_REGION_ROLES, ...BODY_REGION_ROLES, ...SHEET_REGION_ROLES] as const

export type CropRegionRole = (typeof CROP_REGION_ROLES)[number]

export interface CropRegion {
  source: RegionSource
  x: number
  y: number
  w: number
  h: number
}

export const BOARD_ROLES = ['face', 'body', 'details'] as const
export type BoardRole = (typeof BOARD_ROLES)[number]

/** Tile order inside each board, front to back, faces before details. */
export const BOARD_TILES: Record<BoardRole, readonly CropRegionRole[]> = {
  face: ['face-front', 'face-three-quarter', 'face-side', 'expressions'],
  body: ['body-front', 'body-side', 'body-back', 'body-three-quarter'],
  details: ['hands', 'skin-texture', 'hair-details', 'facial-features', 'body-details'],
}

export interface AvatarBoard {
  role: BoardRole
  assetId: string
  width: number
  height: number
}

export const SHEET_CANVAS = { width: 4096, height: 3072 } as const
export const PANEL_CANVAS = { width: 4096, height: 4096 } as const
export const PANEL_QUADRANT = 2048
export const REGION_MIN_SIDE = 256

/** The named boxes the reference sheet prompt draws on its 4096 x 3072 canvas. */
export const SHEET_REGION_BOXES = {
  'body-angles': { x: 0, y: 0, w: 2048, h: 1024 },
  'face-angles': { x: 2048, y: 0, w: 1024, h: 1024 },
  expressions: { x: 3072, y: 0, w: 1024, h: 1024 },
  hair: { x: 0, y: 1024, w: 1024, h: 1024 },
  features: { x: 1024, y: 1024, w: 1024, h: 1024 },
  skin: { x: 2048, y: 1024, w: 1024, h: 1024 },
  hands: { x: 3072, y: 1024, w: 1024, h: 1024 },
  'body-details': { x: 0, y: 2048, w: 2048, h: 1024 },
  outfits: { x: 2048, y: 2048, w: 1024, h: 1024 },
  basic: { x: 3072, y: 2048, w: 1024, h: 1024 },
} as const

/**
 * Default boxes read from the layouts the three prompts draw: a 2x2 panel is four equal
 * quadrants, so front is top-left, side top-right, back bottom-left and three-quarter
 * bottom-right. HANDS sits in the face panel's bottom-right quadrant.
 */
export const CROP_REGION_DEFAULTS: Record<CropRegionRole, CropRegion> = {
  'face-front': { source: 'face-panel', x: 0, y: 0, w: PANEL_QUADRANT, h: PANEL_QUADRANT },
  'face-three-quarter': {
    source: 'face-panel',
    x: PANEL_QUADRANT,
    y: 0,
    w: PANEL_QUADRANT,
    h: PANEL_QUADRANT,
  },
  'face-side': { source: 'face-panel', x: 0, y: PANEL_QUADRANT, w: PANEL_QUADRANT, h: PANEL_QUADRANT },
  hands: {
    source: 'face-panel',
    x: PANEL_QUADRANT,
    y: PANEL_QUADRANT,
    w: PANEL_QUADRANT,
    h: PANEL_QUADRANT,
  },
  'body-front': { source: 'body-panel', x: 0, y: 0, w: PANEL_QUADRANT, h: PANEL_QUADRANT },
  'body-side': {
    source: 'body-panel',
    x: PANEL_QUADRANT,
    y: 0,
    w: PANEL_QUADRANT,
    h: PANEL_QUADRANT,
  },
  'body-back': { source: 'body-panel', x: 0, y: PANEL_QUADRANT, w: PANEL_QUADRANT, h: PANEL_QUADRANT },
  'body-three-quarter': {
    source: 'body-panel',
    x: PANEL_QUADRANT,
    y: PANEL_QUADRANT,
    w: PANEL_QUADRANT,
    h: PANEL_QUADRANT,
  },
  expressions: { source: 'sheet', ...SHEET_REGION_BOXES.expressions },
  'hair-details': { source: 'sheet', ...SHEET_REGION_BOXES.hair },
  'facial-features': { source: 'sheet', ...SHEET_REGION_BOXES.features },
  'skin-texture': { source: 'sheet', ...SHEET_REGION_BOXES.skin },
  'body-details': { source: 'sheet', ...SHEET_REGION_BOXES['body-details'] },
}

export function regionSourceFor(role: CropRegionRole): RegionSource {
  return CROP_REGION_DEFAULTS[role].source
}

export function regionsForSource(source: RegionSource): CropRegionRole[] {
  return CROP_REGION_ROLES.filter((role) => regionSourceFor(role) === source)
}

export function defaultCropRegions(): Record<CropRegionRole, CropRegion> {
  const regions = {} as Record<CropRegionRole, CropRegion>
  for (const role of CROP_REGION_ROLES) {
    regions[role] = { ...CROP_REGION_DEFAULTS[role] }
  }
  return regions
}

export function sourceSize(source: RegionSource): { width: number; height: number } {
  return source === 'sheet'
    ? { width: SHEET_CANVAS.width, height: SHEET_CANVAS.height }
    : { width: PANEL_CANVAS.width, height: PANEL_CANVAS.height }
}

function insideImage(region: CropRegion, size: { width: number; height: number }): boolean {
  return (
    Number.isInteger(region.x) &&
    Number.isInteger(region.y) &&
    Number.isInteger(region.w) &&
    Number.isInteger(region.h) &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.w >= REGION_MIN_SIDE &&
    region.h >= REGION_MIN_SIDE &&
    region.x + region.w <= size.width &&
    region.y + region.h <= size.height
  )
}

function parseRegionSource(value: unknown): RegionSource | null {
  return REGION_SOURCES.find((source) => source === value) ?? null
}

/**
 * A saved selection names a box for every role, each inside its own source image, at least
 * REGION_MIN_SIDE on both sides. Anything else is rejected instead of silently repaired.
 */
export function parseCropRegions(value: unknown): Record<CropRegionRole, CropRegion> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const regions = {} as Record<CropRegionRole, CropRegion>
  for (const role of CROP_REGION_ROLES) {
    const entry = record[role]
    if (!entry || typeof entry !== 'object') return null
    const candidate = entry as Record<string, unknown>
    const source = parseRegionSource(candidate.source)
    if (!source || source !== regionSourceFor(role)) return null
    const region: CropRegion = {
      source,
      x: Number(candidate.x),
      y: Number(candidate.y),
      w: Number(candidate.w),
      h: Number(candidate.h),
    }
    if (!insideImage(region, sourceSize(region.source))) return null
    regions[role] = region
  }
  return regions
}

/** Boards are cut from the images, so a replaced image resets that image's regions. */
export function resetRegionsForSource(
  regions: Record<CropRegionRole, CropRegion> | null,
  source: RegionSource,
): Record<CropRegionRole, CropRegion> {
  const next = regions ? { ...regions } : defaultCropRegions()
  for (const role of regionsForSource(source)) {
    next[role] = { ...CROP_REGION_DEFAULTS[role] }
  }
  return next
}

export function parseAvatarBoards(value: unknown): AvatarBoard[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return undefined
  const boards: AvatarBoard[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const role = BOARD_ROLES.find((candidate) => candidate === record.role)
    const assetId = typeof record.assetId === 'string' ? record.assetId : ''
    if (!role || !assetId) continue
    boards.push({
      role,
      assetId,
      width: Number(record.width) || 0,
      height: Number(record.height) || 0,
    })
  }
  return boards
}

export function boardAssetIds(boards: AvatarBoard[]): string[] {
  const byRole = new Map(boards.map((board) => [board.role, board]))
  return BOARD_ROLES.flatMap((role) => {
    const board = byRole.get(role)
    return board ? [board.assetId] : []
  })
}

/**
 * Which boards a model family receives, identity first. A family that names fewer avatar
 * references gets the face board before the body board, and never the details alone.
 */
export function plannedBoardAssets(boards: AvatarBoard[], limit: number): string[] {
  return boardAssetIds(boards).slice(0, Math.max(0, limit))
}
