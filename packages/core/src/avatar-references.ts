import type { AvatarModelFamily } from './avatar-profile'

export const AVATAR_CROP_ROLES = ['face-front', 'face-three-quarter', 'body-front', 'body-side'] as const
export type AvatarCropRole = (typeof AVATAR_CROP_ROLES)[number]

export interface AvatarCropCell {
  row: number
  column: number
}

export interface AvatarCrop {
  role: AvatarCropRole
  assetId: string
  width: number
  height: number
}

export const PANEL_GRID = 4

export interface AvatarPanelGrid {
  rows: number
  columns: number
}

// shortcut: every panel is still one 4x4 sheet, so the grid defaults to it in this one place.
// The coming two-2x2-panel spec turns this into a per-panel answer; the selector, the parser
// and the cutting code already take the grid as a parameter and never assume 4.
export const DEFAULT_PANEL_GRID: AvatarPanelGrid = { rows: PANEL_GRID, columns: PANEL_GRID }

export const PANEL_CROP_MIN_SIDE = 1024
export const PANEL_MIN_SIDE = PANEL_GRID * PANEL_CROP_MIN_SIDE

export function panelSizeError(width: number | null, height: number | null): string | null {
  if (!width || !height) {
    return `The 4x4 panel must be at least ${PANEL_MIN_SIDE} x ${PANEL_MIN_SIDE} px and its pixel size must be known.`
  }
  if (width < PANEL_MIN_SIDE || height < PANEL_MIN_SIDE) {
    return `The 4x4 panel must be at least ${PANEL_MIN_SIDE} x ${PANEL_MIN_SIDE} px (this one is ${width} x ${height}).`
  }
  return null
}

export interface PanelCellSize {
  cellWidth: number
  cellHeight: number
  usable: boolean
}

export function panelCellSize(
  width: number | null,
  height: number | null,
  grid: AvatarPanelGrid = DEFAULT_PANEL_GRID,
): PanelCellSize {
  const cellWidth = Math.floor((width ?? 0) / grid.columns)
  const cellHeight = Math.floor((height ?? 0) / grid.rows)
  return {
    cellWidth,
    cellHeight,
    usable: cellWidth >= PANEL_CROP_MIN_SIDE && cellHeight >= PANEL_CROP_MIN_SIDE,
  }
}

export const AVATAR_CROP_CELLS: Record<AvatarCropRole, AvatarCropCell & { label: string }> = {
  // The panel prompt fixes row 0 to the full-body angles (front, right side, back, left side)
  // and row 1 to the faces (front, three-quarter, side, smiling), so these defaults read from
  // the cells the prompt actually draws. The owner can override them for older panels.
  'face-front': { row: 1, column: 0, label: 'Front face' },
  'face-three-quarter': { row: 1, column: 1, label: 'Three-quarter face' },
  'body-front': { row: 0, column: 0, label: 'Full body' },
  'body-side': { row: 0, column: 1, label: 'Side profile' },
}

export function defaultAvatarCropCells(): Record<AvatarCropRole, AvatarCropCell> {
  const cells = {} as Record<AvatarCropRole, AvatarCropCell>
  for (const role of AVATAR_CROP_ROLES) {
    const { row, column } = AVATAR_CROP_CELLS[role]
    cells[role] = { row, column }
  }
  return cells
}

/** A saved selection names one cell per role, and every cell is inside the panel's grid. */
export function parseAvatarCropCells(
  value: unknown,
  grid: AvatarPanelGrid = DEFAULT_PANEL_GRID,
): Record<AvatarCropRole, AvatarCropCell> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const cells = {} as Record<AvatarCropRole, AvatarCropCell>
  for (const role of AVATAR_CROP_ROLES) {
    const entry = record[role]
    if (!entry || typeof entry !== 'object') return null
    const { row, column } = entry as Record<string, unknown>
    if (!Number.isInteger(row) || !Number.isInteger(column)) return null
    const candidate = { row: row as number, column: column as number }
    if (
      candidate.row < 0 ||
      candidate.row >= grid.rows ||
      candidate.column < 0 ||
      candidate.column >= grid.columns
    ) {
      return null
    }
    cells[role] = candidate
  }
  return cells
}

// Models weight earlier images, and a second face adds little next to a frontal crop, so the
// body lands second and the side profile third: 3-ref families name those and demote the
// three-quarter face to a supporting image, which is the trade the body shape wants.
const REFERENCE_ORDER: readonly AvatarCropRole[] = [
  'face-front',
  'body-front',
  'body-side',
  'face-three-quarter',
]

const FAMILY_CROPS: Record<AvatarModelFamily, readonly AvatarCropRole[]> = {
  qwen: ['face-front', 'body-front'],
  'nano-banana': REFERENCE_ORDER,
  seedream: REFERENCE_ORDER,
  flux: REFERENCE_ORDER,
  'gpt-image': REFERENCE_ORDER,
  grok: REFERENCE_ORDER,
  generic: REFERENCE_ORDER,
}

export function avatarReferenceLimit(family: AvatarModelFamily): number {
  return family === 'qwen' ? 2 : 4
}

export function avatarCropPlan(family: AvatarModelFamily): AvatarCropRole[] {
  return [...FAMILY_CROPS[family]]
}

export function parseAvatarCrops(value: unknown): AvatarCrop[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return undefined
  const crops: AvatarCrop[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const role = AVATAR_CROP_ROLES.find((candidate) => candidate === record.role)
    const assetId = typeof record.assetId === 'string' ? record.assetId : ''
    if (!role || !assetId) continue
    const width = Number(record.width)
    const height = Number(record.height)
    crops.push({
      role,
      assetId,
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0,
    })
  }
  return crops
}

export function plannedAvatarAssets(crops: AvatarCrop[], family: AvatarModelFamily): string[] {
  const plan = avatarCropPlan(family)
  const byRole = new Map(crops.map((crop) => [crop.role, crop]))
  return plan.flatMap((role) => {
    const crop = byRole.get(role)
    return crop ? [crop.assetId] : []
  })
}

export function qualifyAvatarCrops(
  cells: Array<{ role: AvatarCropRole; assetId: string; width: number; height: number }>,
): AvatarCrop[] {
  return cells.filter((cell) => Math.min(cell.width, cell.height) >= PANEL_CROP_MIN_SIDE)
}
