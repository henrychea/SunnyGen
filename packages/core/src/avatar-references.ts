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

export const AVATAR_IMAGE_ROLES = ['face-panel', 'body-panel', 'sheet'] as const
export type AvatarImageRole = (typeof AVATAR_IMAGE_ROLES)[number]

/** An avatar's three whole images, as stored on the studio item. */
export interface AvatarImageSource {
  facePanelAssetId?: string | null
  bodyPanelAssetId?: string | null
  sheetAssetId?: string | null
}

export interface AvatarImageSlot {
  role: AvatarImageRole
  assetId: string
}

function presentAssetId(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * qwen truncates long prompts and names two avatar images, so it takes the two panels and drops
 * the sheet; every other family takes all three.
 */
export function avatarImageLimit(family: AvatarModelFamily): number {
  return family === 'qwen' ? 2 : 3
}

/**
 * The three whole images an avatar is sent as, in send order: face panel, body panel, sheet.
 * They leave the disk at their own size and are resized only at send time. An avatar saved
 * before the split has no face panel, so this returns nothing and the caller sends the sheet
 * and the old panel whole, as it always did.
 */
export function avatarImagePlan(source: AvatarImageSource, family: AvatarModelFamily): AvatarImageSlot[] {
  const face = presentAssetId(source.facePanelAssetId)
  if (!face) return []
  const body = presentAssetId(source.bodyPanelAssetId)
  const sheet = presentAssetId(source.sheetAssetId)
  const slots: AvatarImageSlot[] = [
    { role: 'face-panel', assetId: face },
    ...(body ? [{ role: 'body-panel' as const, assetId: body }] : []),
    ...(sheet ? [{ role: 'sheet' as const, assetId: sheet }] : []),
  ]
  return slots.slice(0, avatarImageLimit(family))
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
