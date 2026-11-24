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
import type { AvatarCropsDto } from '~/server/studio.functions'
import { AvatarCropSelector } from './avatar-crop-selector'

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
  onReplacePanel,
  onSaved,
}: {
  avatarId: string
  crops: AvatarCrop[]
  cropCells: Record<AvatarCropRole, AvatarCropCell> | null
  panel: CropsPanelInfo | null
  pending: boolean
  onReplacePanel?: () => void
  onSaved: (dto: AvatarCropsDto) => void
}) {
  const sizeError = panel ? panelSizeError(panel.width, panel.height) : null
  const chosen = cropCells ?? defaultAvatarCropCells()

  return (
    <div className="border-line rounded-xl border p-3">
      <div>
        <Label>Crops</Label>
        <p className="text-ink/65 mt-1 text-[10.5px]">
          Pick which cells of the panel feed each crop. Nothing is cut until you save them, and a panel with
          no crops uses the whole sheet and the whole panel instead.
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
      ) : (
        <div className="mt-3 flex flex-col gap-4">
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
