import sharp from 'sharp'
import {
  AVATAR_CROP_ROLES,
  defaultAvatarCropCells,
  panelCellSize,
  panelSizeError,
  parseAvatarCropCells,
  parseAvatarCrops,
  qualifyAvatarCrops,
  type AvatarCrop,
  type AvatarCropCell,
  type AvatarCropRole,
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
