import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import {
  AVATAR_CROP_CELLS,
  AVATAR_CROP_ROLES,
  DEFAULT_PANEL_GRID,
  type AvatarCropCell,
  type AvatarCropRole,
  type AvatarPanelGrid,
} from '@sunnygen/core'
import { Button, FadeImage, cn, toast } from '@sunnygen/ui'
import { CROP_ROLE_LABELS } from '~/lib/avatar-references'
import { saveAvatarCropsFn, type AvatarCropsDto } from '~/server/studio.functions'

export type CropCells = Record<AvatarCropRole, AvatarCropCell>

function sameCell(left: AvatarCropCell, right: AvatarCropCell): boolean {
  return left.row === right.row && left.column === right.column
}

/**
 * The owner assigns one panel cell to every crop role. The grid comes from the panel, so a
 * panel with a different layout only changes the `grid` it is given, not this component.
 */
export function AvatarCropSelector({
  avatarId,
  panelUrl,
  grid = DEFAULT_PANEL_GRID,
  initialCells,
  onSaved,
}: {
  avatarId: string
  panelUrl: string
  grid?: AvatarPanelGrid
  initialCells: CropCells
  onSaved: (dto: AvatarCropsDto) => void
}) {
  const [cells, setCells] = useState<CropCells>(initialCells)
  const [active, setActive] = useState<AvatarCropRole>(AVATAR_CROP_ROLES[0])

  const save = useMutation({
    mutationFn: () => saveAvatarCropsFn({ data: { avatarId, cells } }),
    onSuccess: (dto) => {
      onSaved(dto)
      toast('Crops saved', { tone: 'info' })
    },
    onError: (error) =>
      toast(error instanceof Error ? error.message : 'Could not save crops', { tone: 'error' }),
  })

  const assign = (row: number, column: number) => {
    setCells((current) => ({ ...current, [active]: { row, column } }))
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {AVATAR_CROP_ROLES.map((role) => {
          const cell = cells[role]
          return (
            <button
              key={role}
              type="button"
              onClick={() => setActive(role)}
              aria-pressed={active === role}
              className={cn(
                'min-h-9 rounded-full border px-2.5 py-1 text-[10.5px] transition-colors',
                active === role
                  ? 'border-accent bg-accent/10 text-accent font-medium'
                  : 'border-line text-ink/70 hover:border-ink/25 hover:text-ink',
              )}
            >
              {CROP_ROLE_LABELS[role]}
              <span className="text-ink/45 ml-1 tabular-nums">
                row {cell.row + 1}, col {cell.column + 1}
              </span>
            </button>
          )
        })}
      </div>

      <div className="border-line relative w-full max-w-[420px] overflow-hidden rounded-lg border">
        <FadeImage shimmer src={panelUrl} alt="4x4 panel" className="w-full object-contain" />
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: grid.rows * grid.columns }).map((_, index) => {
            const row = Math.floor(index / grid.columns)
            const column = index % grid.columns
            const owners = AVATAR_CROP_ROLES.filter((role) => sameCell(cells[role], { row, column }))
            const isActiveCell = sameCell(cells[active], { row, column })
            return (
              <button
                key={index}
                type="button"
                onClick={() => assign(row, column)}
                aria-label={`Assign row ${row + 1}, column ${column + 1}`}
                className={cn(
                  'flex flex-col items-center justify-center border text-center transition-colors',
                  isActiveCell
                    ? 'border-accent bg-accent/15 border-2'
                    : 'border-white/30 hover:border-accent/60 hover:bg-accent/5',
                )}
              >
                {owners.map((role) => (
                  <span
                    key={role}
                    className="bg-accent/85 text-canvas m-0.5 inline-block rounded px-1 text-[8px] font-semibold"
                  >
                    {AVATAR_CROP_CELLS[role].label}
                  </span>
                ))}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={save.isPending}
          className="min-h-11 text-[11px] sm:h-7 sm:min-h-0 sm:text-[10.5px]"
        >
          Save crops
        </Button>
        <p className="text-ink/55 text-[10px]">
          Pick a role, then click its cell on the panel. Saving cuts the cells you chose.
        </p>
      </div>
    </div>
  )
}
