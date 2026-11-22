import sharp from 'sharp'
import {
  AVATAR_CROP_CELLS,
  PANEL_CROP_MIN_SIDE,
  PANEL_GRID,
  parseAvatarCrops,
  parseAvatarProfile,
  qualifyAvatarCrops,
  type AvatarCrop,
  type AvatarCropRole,
} from '@sunnygen/core'
import { saveStudioItem, type StudioItemRecord } from '@sunnygen/db'
import { readAssetBuffer, storeBuffer } from './media.server'

const ROLES = Object.keys(AVATAR_CROP_CELLS) as AvatarCropRole[]

export async function ensureAvatarCrops(item: StudioItemRecord): Promise<AvatarCrop[] | undefined> {
  if (item.kind !== 'avatar') return undefined
  const stored = parseAvatarCrops(item.data.crops)
  if (stored !== undefined) return stored
  if (!parseAvatarProfile(item.data.avatarProfile) || !item.assetId) return undefined

  const panel = await readAssetBuffer(item.assetId)
  if (!panel) return undefined
  const metadata = await sharp(panel.buffer).metadata()
  const cellWidth = Math.floor((metadata.width ?? 0) / PANEL_GRID)
  const cellHeight = Math.floor((metadata.height ?? 0) / PANEL_GRID)

  const cells: AvatarCrop[] = []
  if (cellWidth >= PANEL_CROP_MIN_SIDE && cellHeight >= PANEL_CROP_MIN_SIDE) {
    for (const role of ROLES) {
      const cell = AVATAR_CROP_CELLS[role]
      const buffer = await sharp(panel.buffer)
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
  }

  const crops = qualifyAvatarCrops(cells)
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
