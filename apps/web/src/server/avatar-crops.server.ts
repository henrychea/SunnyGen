import sharp from 'sharp'
import {
  AVATAR_CROP_ROLES,
  BOARD_GRID,
  BOARD_ROLES,
  BOARD_TILES,
  CROP_REGION_ROLES,
  boardLayout,
  defaultAvatarCropCells,
  defaultCropRegions,
  panelCellSize,
  panelSizeError,
  parseAvatarBoards,
  parseAvatarCropCells,
  parseAvatarCrops,
  parseCropRegions,
  qualifyAvatarCrops,
  type AvatarBoard,
  type AvatarCrop,
  type AvatarCropCell,
  type AvatarCropRole,
  type BoardRole,
  type CropRegion,
  type CropRegionRole,
  type RegionSource,
} from '@sunnygen/core'
import { getAsset, saveStudioItem, type StudioItemRecord } from '@sunnygen/db'
import { assetUrl, readAssetBuffer, storeBuffer } from './media.server'

export interface AvatarAssetInfo {
  assetId: string | null
  url: string | null
  name: string | null
  width: number | null
  height: number | null
}

export interface AvatarCropsDto {
  crops: AvatarCrop[]
  cropCells: Record<AvatarCropRole, AvatarCropCell> | null
  panel: AvatarAssetInfo
  sheet: AvatarAssetInfo
}

function assetInfo(assetId: string | null): AvatarAssetInfo {
  const asset = assetId ? getAsset(assetId) : null
  return {
    assetId: asset?.id ?? null,
    url: asset ? assetUrl(asset.id) : null,
    name: asset?.name ?? null,
    width: asset?.width ?? null,
    height: asset?.height ?? null,
  }
}

export function avatarCropsDto(item: StudioItemRecord): AvatarCropsDto {
  const sheetId = typeof item.data.characterSheetAssetId === 'string' ? item.data.characterSheetAssetId : null
  return {
    crops: parseAvatarCrops(item.data.crops) ?? [],
    cropCells: parseAvatarCropCells(item.data.cropCells),
    panel: assetInfo(item.assetId),
    sheet: assetInfo(sheetId),
  }
}

export function assertCropPanelSize(width: number | null, height: number | null): void {
  const message = panelSizeError(width, height)
  if (message) throw new Error(message)
}

// Crops are cut from the panel, so a save that seals a different panel must not inherit the
// crops, or the cell selection, taken from the old one. Manual selection then rebuilds them.
export function dataForPanelChange(
  data: Record<string, unknown>,
  panelChanged: boolean,
): Record<string, unknown> {
  if (!panelChanged) return data
  const next = { ...data }
  delete next.crops
  delete next.cropCells
  return next
}

async function cutCells(
  panel: Buffer,
  cells: Record<AvatarCropRole, AvatarCropCell>,
  cellWidth: number,
  cellHeight: number,
): Promise<AvatarCrop[]> {
  const crops: AvatarCrop[] = []
  for (const role of AVATAR_CROP_ROLES) {
    const cell = cells[role]
    const buffer = await sharp(panel)
      .extract({
        left: cell.column * cellWidth,
        top: cell.row * cellHeight,
        width: cellWidth,
        height: cellHeight,
      })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer()
    const asset = await storeBuffer({ buffer, mime: 'image/jpeg', kind: 'image', source: 'studio' })
    crops.push({ role, assetId: asset.id, width: cellWidth, height: cellHeight })
  }
  return qualifyAvatarCrops(crops)
}

/**
 * Cuts the cells the owner picked and remembers the selection, so reopening the editor shows
 * the same cells. Nothing cuts crops on its own any more: an avatar without a selection keeps
 * the whole sheet and the whole panel as its references.
 */
export async function saveAvatarCrops(
  item: StudioItemRecord,
  cells: Record<AvatarCropRole, AvatarCropCell>,
): Promise<AvatarCropsDto> {
  if (item.kind !== 'avatar') throw new Error('Avatar not found')
  if (!item.assetId) throw new Error('This avatar has no 4x4 panel to crop.')
  const panel = await readAssetBuffer(item.assetId)
  if (!panel) throw new Error('The 4x4 panel image is missing from disk.')
  const metadata = await sharp(panel.buffer).metadata()
  assertCropPanelSize(metadata.width ?? null, metadata.height ?? null)
  const cell = panelCellSize(metadata.width ?? null, metadata.height ?? null)

  const crops = await cutCells(panel.buffer, cells, cell.cellWidth, cell.cellHeight)
  saveStudioItem({
    id: item.id,
    kind: item.kind,
    name: item.name,
    assetId: item.assetId,
    cleanAssetId: item.cleanAssetId,
    data: { ...item.data, crops, cropCells: cells },
  })
  return avatarCropsDto({ ...item, data: { ...item.data, crops, cropCells: cells } })
}

/** The cells the editor opens with: the stored selection, or the panel prompt's own layout. */
export function initialCropCells(item: StudioItemRecord): Record<AvatarCropRole, AvatarCropCell> {
  return parseAvatarCropCells(item.data.cropCells) ?? defaultAvatarCropCells()
}

export interface AvatarRegionsDto {
  regions: Record<CropRegionRole, CropRegion>
  boards: AvatarBoard[]
  sheet: AvatarAssetInfo
  bodyPanel: AvatarAssetInfo
  facePanel: AvatarAssetInfo
  crops: AvatarCrop[]
  /** True for avatars saved before the two-panel split: one 4x4 panel, no face panel. */
  legacy: boolean
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function avatarRegionsDto(item: StudioItemRecord): AvatarRegionsDto {
  return {
    regions: parseCropRegions(item.data.cropRegions) ?? defaultCropRegions(),
    boards: parseAvatarBoards(item.data.boards) ?? [],
    sheet: assetInfo(text(item.data.characterSheetAssetId)),
    bodyPanel: assetInfo(item.assetId),
    facePanel: assetInfo(text(item.data.facePanelAssetId)),
    crops: parseAvatarCrops(item.data.crops) ?? [],
    legacy: text(item.data.facePanelAssetId) === null,
  }
}

/** The sheet only has to be 4096 on its long side; the panels are square 4K. */
export function assertSheetSize(width: number | null, height: number | null): void {
  const longest = Math.max(width ?? 0, height ?? 0)
  if (longest < panelSizeErrorWidth()) {
    throw new Error(
      `The reference sheet must be at least ${panelSizeErrorWidth()} px on its long side (this one is ${width ?? '?'} x ${height ?? '?'}).`,
    )
  }
}

function panelSizeErrorWidth(): number {
  return 4096
}

interface Cut {
  buffer: Buffer
  width: number
  height: number
}

async function cutRegion(panel: Buffer, region: CropRegion): Promise<Cut> {
  const buffer = await sharp(panel)
    .extract({ left: region.x, top: region.y, width: region.w, height: region.h })
    .png()
    .toBuffer()
  return { buffer, width: region.w, height: region.h }
}

async function composeBoard(
  role: BoardRole,
  tiles: Array<Cut & { role: CropRegionRole }>,
): Promise<AvatarBoard> {
  const sized: Partial<Record<CropRegionRole, { width: number; height: number }>> = {}
  for (const tile of tiles) sized[tile.role] = { width: tile.width, height: tile.height }
  const layout = boardLayout(BOARD_TILES[role], sized, BOARD_GRID[role])
  if (layout.tiles.length === 0) throw new Error(`The ${role} board has no tiles to compose.`)
  const composites = await Promise.all(
    layout.tiles.map(async (slot) => {
      const tile = tiles.find((candidate) => candidate.role === slot.role) as Cut
      const buffer = await sharp(tile.buffer)
        .resize({ width: slot.w, height: slot.h, fit: 'fill' })
        .png()
        .toBuffer()
      return { input: buffer, left: slot.x, top: slot.y }
    }),
  )
  const buffer = await sharp({
    create: {
      width: layout.width,
      height: layout.height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer()
  const asset = await storeBuffer({ buffer, mime: 'image/png', kind: 'image', source: 'studio' })
  return { role, assetId: asset.id, width: layout.width, height: layout.height }
}

/**
 * Cuts every region from the original file (never upscaled), composes the three boards and
 * remembers both the boxes and the boards. The boards are what a model receives.
 */
export async function saveAvatarRegions(
  item: StudioItemRecord,
  regions: Record<CropRegionRole, CropRegion>,
): Promise<AvatarRegionsDto> {
  if (item.kind !== 'avatar') throw new Error('Avatar not found')
  const sheetId = text(item.data.characterSheetAssetId)
  const faceId = text(item.data.facePanelAssetId)
  if (!item.assetId) throw new Error('Upload the body panel first.')
  if (!faceId) throw new Error('Upload the face panel first.')
  if (!sheetId) throw new Error('Upload the reference sheet first.')

  const sheet = getAsset(sheetId)
  assertSheetSize(sheet?.width ?? null, sheet?.height ?? null)
  for (const [label, id] of [
    ['body panel', item.assetId],
    ['face panel', faceId],
  ] as const) {
    const asset = getAsset(id)
    const message = panelSizeError(asset?.width ?? null, asset?.height ?? null)
    if (message) {
      throw new Error(
        `The ${label} must be at least 4096 x 4096 px (this one is ${asset?.width ?? '?'} x ${asset?.height ?? '?'}).`,
      )
    }
  }

  const buffers: Record<RegionSource, Buffer> = {
    sheet: (await readAssetBuffer(sheetId))?.buffer as Buffer,
    'body-panel': (await readAssetBuffer(item.assetId))?.buffer as Buffer,
    'face-panel': (await readAssetBuffer(faceId))?.buffer as Buffer,
  }
  for (const [source, buffer] of Object.entries(buffers)) {
    if (!buffer) throw new Error(`The ${source} image is missing from disk.`)
  }

  const cuts = new Map<CropRegionRole, Cut>()
  for (const role of CROP_REGION_ROLES) {
    const region = regions[role]
    cuts.set(role, await cutRegion(buffers[region.source], region))
  }

  const boards: AvatarBoard[] = []
  for (const role of BOARD_ROLES) {
    const tiles = BOARD_TILES[role].map((tile) => ({ role: tile, ...(cuts.get(tile) as Cut) }))
    boards.push(await composeBoard(role, tiles))
  }

  const data = { ...item.data, cropRegions: regions, boards }
  saveStudioItem({
    id: item.id,
    kind: item.kind,
    name: item.name,
    assetId: item.assetId,
    cleanAssetId: item.cleanAssetId,
    data,
  })
  return avatarRegionsDto({ ...item, data })
}
