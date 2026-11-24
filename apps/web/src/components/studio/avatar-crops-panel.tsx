import { AVATAR_CROP_CELLS, PANEL_GRID, panelSizeError, type AvatarCrop } from '@sunnygen/core'
import { Button, FadeImage, Label, cn } from '@sunnygen/ui'
import { CROP_ROLE_LABELS } from '~/lib/avatar-references'

export interface CropsPanelInfo {
  assetId: string | null
  url: string | null
  name: string | null
  width: number | null
  height: number | null
}

const ROLE_CELLS = Object.entries(AVATAR_CROP_CELLS) as Array<
  [keyof typeof AVATAR_CROP_CELLS, { row: number; column: number; label: string }]
>

function cellIndex(row: number, column: number): number {
  return row * PANEL_GRID + column
}

export function AvatarCropsPanel({
  crops,
  panel,
  pending,
  regenerating,
  onRegenerate,
  onReplacePanel,
}: {
  crops: AvatarCrop[]
  panel: CropsPanelInfo | null
  pending: boolean
  regenerating: boolean
  onRegenerate: () => void
  onReplacePanel: () => void
}) {
  const sizeError = panel ? panelSizeError(panel.width, panel.height) : null

  return (
    <div className="border-line rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label>Crops</Label>
          <p className="text-ink/65 mt-1 text-[10.5px]">
            Three cells of the 4x4 panel, used as avatar references. Regenerating replaces them with new ones
            from the current panel.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          loading={regenerating}
          disabled={regenerating || pending || !panel?.assetId || sizeError !== null}
          className="min-h-11 text-[11px] sm:h-7 sm:min-h-0 sm:text-[10.5px]"
        >
          Regenerate crops
        </Button>
      </div>

      {pending ? (
        <p className="text-ink/65 mt-3 text-[11px]">Loading crops…</p>
      ) : !panel?.assetId ? (
        <div className="mt-3 flex flex-col items-start gap-2">
          <p className="text-ink/65 text-[11px]">
            No 4x4 panel yet. Upload a 4096 x 4096 px panel to make crops.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onReplacePanel}
            className="min-h-11 text-[11px] sm:min-h-7"
          >
            Choose panel
          </Button>
        </div>
      ) : sizeError ? (
        <div className="mt-3 flex flex-col items-start gap-2">
          <p className="text-ink/65 text-[11px]">
            Panel is {panel.width ?? '?'} x {panel.height ?? '?'}. Upload the 4096 px 4x4 panel to make crops.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onReplacePanel}
            className="min-h-11 text-[11px] sm:min-h-7"
          >
            Replace panel
          </Button>
        </div>
      ) : crops.length === 0 ? (
        <p className="text-ink/65 mt-3 text-[11px]">
          This panel has no crops yet. Regenerate crops to make them.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {crops.map((crop) => {
              const cell = AVATAR_CROP_CELLS[crop.role]
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

          <div className="flex flex-col gap-1.5">
            <p className="text-ink/65 text-[10.5px]">Source panel</p>
            <div className="border-line relative w-full max-w-[320px] overflow-hidden rounded-lg border">
              <FadeImage
                shimmer
                src={`/api/media/${panel.assetId}`}
                alt="4x4 panel"
                className="w-full object-contain"
              />
              <div
                aria-hidden="true"
                className={cn('pointer-events-none absolute inset-0 grid', 'grid-cols-4 grid-rows-4')}
              >
                {Array.from({ length: PANEL_GRID * PANEL_GRID }).map((_, index) => {
                  const cell = ROLE_CELLS.find(
                    ([, position]) => cellIndex(position.row, position.column) === index,
                  )
                  return (
                    <div
                      key={index}
                      className={cn(
                        'border border-white/40',
                        cell ? 'border-accent/80 bg-accent/10' : 'border-white/25',
                      )}
                    >
                      {cell ? (
                        <span className="text-canvas bg-accent/80 m-0.5 inline-block rounded px-1 text-[8px] font-semibold">
                          {cell[1].label}
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
            <p className="text-ink/45 text-[10px]">
              {panel.name ?? 'Panel'} · {panel.width ?? '?'} x {panel.height ?? '?'} px
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
