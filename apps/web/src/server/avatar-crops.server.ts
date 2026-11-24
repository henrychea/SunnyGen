import sharp from 'sharp'
import {
  AVATAR_CROP_CELLS,
  panelCellSize,
  panelSizeError,
  parseAvatarCrops,
  parseAvatarProfile,
  qualifyAvatarCrops,
  type AvatarCrop,
  type AvatarCropRole,
} from '@sunnygen/core'
import { getAsset, saveStudioItem, type StudioItemRecord } from '@sunnygen/db'
import { assetUrl, readAssetBuffer, storeBuffer } from './media.server'

const ROLES = Object.keys(AVATAR_CROP_CELLS) as AvatarCropRole[]

export interface AvatarAssetInfo {
  assetId: string | null
  url: string | null
  name: string | null
  width: number | null
  height: number | null
}

export interface AvatarCropsDto {
  crops: AvatarCrop[]
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
    panel: assetInfo(item.assetId),
    sheet: assetInfo(sheetId),
  }
}

// A forced rebuild ignores the stored crops. An empty list means the panel was never cropped,
// so it has to be rebuilt too rather than treated as done.
export function existingCrops(item: StudioItemRecord, force: boolean): AvatarCrop[] | undefined {
  if (force) return undefined
  const crops = parseAvatarCrops(item.data.crops)
  return crops && crops.length > 0 ? crops : undefined
}

// Crops are cut from the panel, so a save that seals a different panel must not inherit the
// crops taken from the old one.
export function dataForPanelChange(
  data: Record<string, unknown>,
  panelChanged: boolean,
): Record<string, unknown> {
  if (!panelChanged) return data
  const next = { ...data }
  delete next.crops
  return next
}

export function assertCropPanelSize(width: number | null, height: number | null): void {
  const message = panelSizeError(width, height)
  if (message) throw new Error(message)
}

function storeCrops(item: StudioItemRecord, crops: AvatarCrop[]): AvatarCrop[] {
  saveStudioItem({
    id: item.id,
    kind: item.kind,
    name: item.name,
    assetId: item.assetId,
    cleanAssetId: item.cleanAssetId,
    data: { ...item.data, crops },
  })
  return crops
}

async function cropCells(panel: Buffer, cellWidth: number, cellHeight: number): Promise<AvatarCrop[]> {
  const cells: AvatarCrop[] = []
  for (const role of ROLES) {
    const cell = AVATAR_CROP_CELLS[role]
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
    cells.push({ role, assetId: asset.id, width: cellWidth, height: cellHeight })
  }
  return qualifyAvatarCrops(cells)
}

export async function ensureAvatarCrops(
  item: StudioItemRecord,
  options: { force?: boolean } = {},
): Promise<AvatarCrop[] | undefined> {
  if (item.kind !== 'avatar') return undefined
  const stored = existingCrops(item, options.force === true)
  if (stored !== undefined) return stored
  if (!parseAvatarProfile(item.data.avatarProfile) || !item.assetId) return undefined

  const panel = await readAssetBuffer(item.assetId)
  if (!panel) return undefined
  const metadata = await sharp(panel.buffer).metadata()
  const cell = panelCellSize(metadata.width ?? null, metadata.height ?? null)
  if (!cell.usable) return stored

  return storeCrops(item, await cropCells(panel.buffer, cell.cellWidth, cell.cellHeight))
}

export async function regenerateAvatarCrops(item: StudioItemRecord): Promise<AvatarCropsDto> {
  if (item.kind !== 'avatar') throw new Error('Avatar not found')
  if (!item.assetId) throw new Error('This avatar has no 4x4 panel to crop.')
  const panel = await readAssetBuffer(item.assetId)
  if (!panel) throw new Error('The 4x4 panel image is missing from disk.')
  const metadata = await sharp(panel.buffer).metadata()
  assertCropPanelSize(metadata.width ?? null, metadata.height ?? null)
  const cell = panelCellSize(metadata.width ?? null, metadata.height ?? null)
  const crops = await cropCells(panel.buffer, cell.cellWidth, cell.cellHeight)
  return avatarCropsDto({ ...item, data: { ...item.data, crops: storeCrops(item, crops) } })
}
