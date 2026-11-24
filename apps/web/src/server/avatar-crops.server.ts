import sharp from 'sharp'
import {
  BOARD_GRID,
  BOARD_ROLES,
  BOARD_TILES,
  CROP_REGION_ROLES,
  boardLayout,
  clampCropRegion,
  defaultCropRegions,
  panelSizeError,
  parseAvatarBoards,
  parseAvatarCrops,
  parseCropRegions,
  parseRegionTiles,
  regionSourceFor,
  sourceSize,
  type AvatarBoard,
  type AvatarRegionTile,
  type AvatarCrop,
  type BoardRole,
  type CropRegion,
  type CropRegionRole,
  type RegionSource,
} from '@sunnygen/core'
import {
  deleteAsset,
  getAsset,
  listGenerations,
  listStudioItems,
  saveStudioItem,
  type StudioItemRecord,
} from '@sunnygen/db'
import { assetUrl, readAssetBuffer, removeAssetFile, storeBuffer } from './media.server'

export interface AvatarAssetInfo {
  assetId: string | null
  url: string | null
  name: string | null
  width: number | null
  height: number | null
}

export interface AvatarRegionsDto {
  regions: Record<CropRegionRole, CropRegion>
  boards: AvatarBoard[]
  sheet: AvatarAssetInfo
  bodyPanel: AvatarAssetInfo
  facePanel: AvatarAssetInfo
  tiles: AvatarRegionTile[]
  crops: AvatarCrop[]
  /** True for avatars saved before the two-panel split: one 4x4 panel, no face panel. */
  legacy: boolean
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
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

export function assertCropPanelSize(width: number | null, height: number | null): void {
  const message = panelSizeError(width, height)
  if (message) throw new Error(message)
}

// Crops and regions are cut from the panels, so a save that seals a different panel must not
// inherit anything taken from the old one: the cell crops, the boxes and the composed boards all
// describe images that are no longer there.
export function dataForPanelChange(
  data: Record<string, unknown>,
  panelsChanged: boolean,
): Record<string, unknown> {
  if (!panelsChanged) return data
  const next = { ...data }
  delete next.crops
  delete next.cropCells
  delete next.cropTiles
  delete next.cropRegions
  delete next.boards
  return next
}

/**
 * An avatar is on the two-panel layout as soon as it has a face panel. Nothing else decides
 * this: a stored crop list or a missing cropRegions must never send it back to the 4x4 cells.
 */
export function avatarUsesTwoPanels(data: Record<string, unknown>): boolean {
  return typeof data.facePanelAssetId === 'string' && data.facePanelAssetId.length > 0
}

export function avatarRegionsDto(item: StudioItemRecord): AvatarRegionsDto {
  return {
    regions: parseCropRegions(item.data.cropRegions) ?? defaultCropRegions(),
    boards: parseAvatarBoards(item.data.boards) ?? [],
    sheet: assetInfo(text(item.data.characterSheetAssetId)),
    bodyPanel: assetInfo(item.assetId),
    facePanel: assetInfo(text(item.data.facePanelAssetId)),
    tiles: parseRegionTiles(item.data.cropTiles) ?? [],
    crops: parseAvatarCrops(item.data.crops) ?? [],
    legacy: !avatarUsesTwoPanels(item.data),
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
  const tiles: AvatarRegionTile[] = []
  for (const role of CROP_REGION_ROLES) {
    const region = regions[role]
    const cut = await cutRegion(buffers[region.source], region)
    cuts.set(role, cut)
    const asset = await storeBuffer({
      buffer: cut.buffer,
      mime: 'image/png',
      kind: 'image',
      source: 'studio',
    })
    tiles.push({ role, assetId: asset.id, width: cut.width, height: cut.height })
  }

  const boards: AvatarBoard[] = []
  for (const role of BOARD_ROLES) {
    const tiles = BOARD_TILES[role].map((tile) => ({ role: tile, ...(cuts.get(tile) as Cut) }))
    boards.push(await composeBoard(role, tiles))
  }

  const data = { ...item.data, cropRegions: regions, boards, cropTiles: tiles }
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

/**
 * Freeform boxes are clamped, not rejected: a box may cross a quadrant line or hang over the
 * edge, and the image edge wins. Anything that is not a number per role is still an error.
 */
export function clampRegions(value: unknown): Record<CropRegionRole, CropRegion> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const regions = {} as Record<CropRegionRole, CropRegion>
  for (const role of CROP_REGION_ROLES) {
    const entry = record[role]
    if (!entry || typeof entry !== 'object') return null
    const candidate = entry as Record<string, unknown>
    const source = regionSourceFor(role)
    if (candidate.source !== source) return null
    const numbers = [candidate.x, candidate.y, candidate.w, candidate.h].map(Number)
    if (!numbers.every((value) => Number.isFinite(value))) return null
    const [x, y, w, h] = numbers as [number, number, number, number]
    regions[role] = clampCropRegion({ source, x, y, w, h }, sourceSize(source))
  }
  return regions
}

/** The assets this avatar cut for itself: its crop tiles and its composed boards. */
export function derivedAssetIds(data: Record<string, unknown>): string[] {
  const ids = new Set<string>()
  for (const crop of parseAvatarCrops(data.crops) ?? []) ids.add(crop.assetId)
  for (const tile of parseRegionTiles(data.cropTiles) ?? []) ids.add(tile.assetId)
  for (const board of parseAvatarBoards(data.boards) ?? []) ids.add(board.assetId)
  return [...ids]
}

/**
 * Deletes the crop and board files an avatar made for itself once nothing references them.
 * Only source 'studio' derived assets are candidates: a user's uploaded original ('upload') is
 * never touched. A tile other items or a generation still point at stays.
 */
export async function deleteDerivedAssets(
  itemId: string,
  oldData: Record<string, unknown>,
): Promise<string[]> {
  const candidates = derivedAssetIds(oldData)
  if (candidates.length === 0) return []
  const otherItems = listStudioItems().filter((item) => item.id !== itemId)
  const generations = listGenerations()
  const referenced = (id: string) => {
    if (otherItems.some((item) => JSON.stringify(item.data).includes(id))) return true
    return generations.some(
      (generation) => generation.inputAssetIds.includes(id) || generation.outputAssetIds.includes(id),
    )
  }

  const deleted: string[] = []
  for (const id of candidates) {
    const asset = getAsset(id)
    if (!asset || asset.source !== 'studio') continue
    if (referenced(id)) continue
    await removeAssetFile(id)
    if (deleteAsset(id)) deleted.push(id)
  }
  return deleted
}
