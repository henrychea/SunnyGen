import {
  AVATAR_CROP_CELLS,
  DEFAULT_PANEL_GRID,
  defaultAvatarCropCells,
  panelSizeError,
  type AvatarCrop,
  type AvatarCropCell,
  type AvatarCropRole,
} from '@sunnygen/core'
import { Button, FadeImage, Label } from '@sunnygen/ui'
import { CROP_ROLE_LABELS } from '~/lib/avatar-references'
import type { AvatarCropsDto, AvatarRegionsDto } from '~/server/studio.functions'
import { AvatarCropSelector } from './avatar-crop-selector'
import { AvatarRegionEditor } from './avatar-region-editor'

export interface CropsPanelInfo {
  assetId: string | null
  url: string | null
  name: string | null
  width: number | null
  height: number | null
}

export function AvatarCropsPanel({
  avatarId,
  crops,
  cropCells,
  panel,
  pending,
  regions,
  hasFacePanel,
  onReplacePanel,
  onSaved,
  onRegionsSaved,
}: {
  avatarId: string
  crops: AvatarCrop[]
  cropCells: Record<AvatarCropRole, AvatarCropCell> | null
  panel: CropsPanelInfo | null
  pending: boolean
  regions?: AvatarRegionsDto | null
  hasFacePanel?: boolean
  onReplacePanel?: () => void
  onSaved: (dto: AvatarCropsDto) => void
  onRegionsSaved?: (dto: AvatarRegionsDto) => void
}) {
  const sizeError = panel ? panelSizeError(panel.width, panel.height) : null
  const chosen = cropCells ?? defaultAvatarCropCells()
  // A face panel means the two-panel layout, whether it was just picked in the form or already
  // saved. The legacy cell selector only ever appears for an avatar that has no face panel.
  const twoPanel = Boolean(hasFacePanel) || Boolean(regions && !regions.legacy)

  return (
    <div className="border-line rounded-xl border p-3">
      <div>
        <Label>Crops</Label>
        <p className="text-ink/65 mt-1 text-[10.5px]">
          Drag these boxes to choose what each region cuts from your images. Saving rebuilds the face, body
          and details boards that generation sends.
        </p>
      </div>

      {pending ? (
        <p className="text-ink/65 mt-3 text-[11px]">Loading crops…</p>
      ) : !panel?.assetId ? (
        <div className="mt-3 flex flex-col items-start gap-2">
          <p className="text-ink/65 text-[11px]">
            No 4x4 panel yet. Upload a 4096 x 4096 px panel to make crops.
          </p>
          {onReplacePanel ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onReplacePanel}
              className="min-h-11 text-[11px] sm:min-h-7"
            >
              Choose panel
            </Button>
          ) : null}
        </div>
      ) : sizeError ? (
        <div className="mt-3 flex flex-col items-start gap-2">
          <p className="text-ink/65 text-[11px]">
            Panel is {panel.width ?? '?'} x {panel.height ?? '?'}. Upload the 4096 px 4x4 panel to make crops.
          </p>
          {onReplacePanel ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onReplacePanel}
              className="min-h-11 text-[11px] sm:min-h-7"
            >
              Replace panel
            </Button>
          ) : null}
        </div>
      ) : twoPanel ? (
        regions && !regions.legacy ? (
          <div className="mt-3 flex flex-col gap-4">
            <AvatarRegionEditor
              avatarId={avatarId}
              regions={regions.regions}
              boards={regions.boards}
              sources={{
                sheet: regions.sheet.url ? { url: regions.sheet.url, width: 4096, height: 3072 } : undefined,
                'body-panel': regions.bodyPanel.url
                  ? { url: regions.bodyPanel.url, width: 4096, height: 4096 }
                  : undefined,
                'face-panel': regions.facePanel.url
                  ? { url: regions.facePanel.url, width: 4096, height: 4096 }
                  : undefined,
              }}
              onSaved={(dto) => {
                onRegionsSaved?.(dto)
                onSaved({
                  crops: dto.crops,
                  cropCells: null,
                  panel: dto.bodyPanel,
                  sheet: dto.sheet,
                })
              }}
            />
          </div>
        ) : (
          <p className="text-ink/65 mt-3 text-[11px]">Loading crop regions…</p>
        )
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {regions?.legacy ? (
            <p className="text-ink/55 text-[10.5px]">
              This avatar uses the old single 4x4 panel. Upload a face panel to switch it to the two-panel
              layout; until then the cell crops below still work.
            </p>
          ) : null}
          <AvatarCropSelector
            avatarId={avatarId}
            panelUrl={panel.url ?? `/api/media/${panel.assetId}`}
            grid={DEFAULT_PANEL_GRID}
            initialCells={chosen}
            onSaved={onSaved}
          />

          {crops.length === 0 ? (
            <p className="text-ink/55 text-[11px]">
              No crops saved for this panel yet. Saving the cells above cuts them from the panel.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {crops.map((crop) => {
                const cell = chosen[crop.role] ?? AVATAR_CROP_CELLS[crop.role]
                return (
                  <div key={crop.role} className="border-line bg-canvas/40 overflow-hidden rounded-xl border">
                    <FadeImage
                      shimmer
                      src={`/api/media/${crop.assetId}`}
                      alt={`${CROP_ROLE_LABELS[crop.role]} crop`}
                      className="aspect-square w-full object-cover"
                    />
                    <div className="flex flex-col gap-0.5 px-2 py-1.5">
                      <p className="text-ink/80 text-[10.5px] font-medium capitalize">
                        {CROP_ROLE_LABELS[crop.role]}
                      </p>
                      <p className="text-ink/55 text-[10px] tabular-nums">
                        {crop.width} x {crop.height} px
                      </p>
                      <p className="text-ink/45 text-[10px]">
                        Panel cell row {cell.row + 1}, column {cell.column + 1}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
