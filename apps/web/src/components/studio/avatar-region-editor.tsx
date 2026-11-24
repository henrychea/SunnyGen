import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import {
  BOARD_TILES,
  CROP_REGION_ROLES,
  REGION_MIN_SIDE,
  regionsForSource,
  type AvatarBoard,
  type CropRegion,
  type CropRegionRole,
  type RegionSource,
} from '@sunnygen/core'
import { Button, FadeImage, cn, toast } from '@sunnygen/ui'
import { saveAvatarRegionsFn, type AvatarRegionsDto } from '~/server/studio.functions'

export const REGION_LABELS: Record<CropRegionRole, string> = {
  'face-front': 'Front face',
  'face-three-quarter': 'Three-quarter face',
  'face-side': 'Side face',
  hands: 'Hands',
  'body-front': 'Front body',
  'body-side': 'Side body',
  'body-back': 'Back body',
  'body-three-quarter': 'Three-quarter body',
  expressions: 'Expressions',
  'hair-details': 'Hair',
  'facial-features': 'Face features',
  'skin-texture': 'Skin',
  'body-details': 'Body details',
}

const SOURCE_LABELS: Record<RegionSource, string> = {
  sheet: 'Reference sheet',
  'body-panel': 'Body panel',
  'face-panel': 'Face panel',
}

const SOURCES: RegionSource[] = ['body-panel', 'face-panel', 'sheet']

export interface RegionSourceInfo {
  url: string
  width: number
  height: number
}

type Regions = Record<CropRegionRole, CropRegion>

function clampRegion(region: CropRegion, size: { width: number; height: number }): CropRegion {
  const w = Math.min(Math.max(region.w, REGION_MIN_SIDE), size.width)
  const h = Math.min(Math.max(region.h, REGION_MIN_SIDE), size.height)
  return {
    source: region.source,
    w,
    h,
    x: Math.min(Math.max(region.x, 0), size.width - w),
    y: Math.min(Math.max(region.y, 0), size.height - h),
  }
}

/**
 * Drag a region to move it, drag its corner to resize it. Everything is stored in source pixels
 * so a box means the same thing whatever size the image is drawn at.
 */
function RegionBox({
  role,
  region,
  size,
  active,
  onActivate,
  onChange,
}: {
  role: CropRegionRole
  region: CropRegion
  size: { width: number; height: number }
  active: boolean
  onActivate: () => void
  onChange: (next: CropRegion) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)

  const start = (event: React.PointerEvent, mode: 'move' | 'resize') => {
    event.preventDefault()
    event.stopPropagation()
    onActivate()
    const parent = boxRef.current?.parentElement
    if (!parent) return
    const bounds = parent.getBoundingClientRect()
    const scaleX = size.width / bounds.width
    const scaleY = size.height / bounds.height
    const originX = event.clientX
    const originY = event.clientY
    const from = region
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)

    const move = (moveEvent: PointerEvent) => {
      const dx = Math.round((moveEvent.clientX - originX) * scaleX)
      const dy = Math.round((moveEvent.clientY - originY) * scaleY)
      const next =
        mode === 'move'
          ? { ...from, x: from.x + dx, y: from.y + dy }
          : { ...from, w: from.w + dx, h: from.h + dy }
      onChange(clampRegion(next, size))
    }
    const end = () => {
      target.releasePointerCapture(event.pointerId)
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', end)
      target.removeEventListener('pointercancel', end)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', end)
    target.addEventListener('pointercancel', end)
  }

  return (
    <div
      ref={boxRef}
      role="group"
      aria-label={`${REGION_LABELS[role]} region`}
      onPointerDown={(event) => start(event, 'move')}
      className={cn(
        'absolute cursor-move touch-none border text-[9px]',
        active ? 'border-accent bg-accent/15 border-2' : 'border-accent/60 bg-accent/10',
      )}
      style={{
        left: `${(region.x / size.width) * 100}%`,
        top: `${(region.y / size.height) * 100}%`,
        width: `${(region.w / size.width) * 100}%`,
        height: `${(region.h / size.height) * 100}%`,
      }}
    >
      <span className="bg-accent/85 text-canvas m-0.5 inline-block rounded px-1 font-semibold">
        {REGION_LABELS[role]}
      </span>
      <button
        type="button"
        aria-label={`Resize ${REGION_LABELS[role]}`}
        onPointerDown={(event) => start(event, 'resize')}
        className="bg-accent border-canvas absolute -right-1.5 -bottom-1.5 size-3.5 cursor-nwse-resize rounded-sm border"
      />
    </div>
  )
}

export function AvatarRegionEditor({
  avatarId,
  sources,
  regions,
  boards,
  onSaved,
}: {
  avatarId: string
  sources: Partial<Record<RegionSource, RegionSourceInfo>>
  regions: Regions
  boards: AvatarBoard[]
  onSaved: (dto: AvatarRegionsDto) => void
}) {
  const [draft, setDraft] = useState<Regions>(regions)
  const [active, setActive] = useState<CropRegionRole>(CROP_REGION_ROLES[0])
  const [dirty, setDirty] = useState(false)

  const save = useMutation({
    mutationFn: () => saveAvatarRegionsFn({ data: { avatarId, regions: draft } }),
    onSuccess: (dto) => {
      setDraft(dto.regions)
      setDirty(false)
      onSaved(dto)
      toast('Regions saved, boards rebuilt', { tone: 'info' })
    },
    onError: (error) =>
      toast(error instanceof Error ? error.message : 'Could not save regions', { tone: 'error' }),
  })

  const update = (role: CropRegionRole, next: CropRegion) => {
    setDraft((current) => ({ ...current, [role]: next }))
    setDirty(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink/65 text-[10.5px]">
        Drag a box to move it, drag its corner to resize it. Every box is cut from the original image with no
        upscaling, then the three boards are rebuilt.
      </p>
      {SOURCES.map((source) => {
        const info = sources[source]
        const roles = regionsForSource(source)
        if (!info || roles.length === 0) return null
        return (
          <section key={source} className="border-line rounded-xl border p-2.5">
            <p className="text-ink/75 text-[11px] font-medium">{SOURCE_LABELS[source]}</p>
            <div className="border-line relative mt-2 w-full max-w-[420px] overflow-hidden rounded-lg border">
              <FadeImage
                shimmer
                src={info.url}
                alt={SOURCE_LABELS[source]}
                className="w-full object-contain"
              />
              {roles.map((role) => (
                <RegionBox
                  key={role}
                  role={role}
                  region={draft[role]}
                  size={info}
                  active={active === role}
                  onActivate={() => setActive(role)}
                  onChange={(next) => update(role, next)}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {roles.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setActive(role)}
                  aria-pressed={active === role}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                    active === role
                      ? 'border-accent bg-accent/10 text-accent font-medium'
                      : 'border-line text-ink/70 hover:border-ink/25',
                  )}
                >
                  {REGION_LABELS[role]}
                </button>
              ))}
            </div>
          </section>
        )
      })}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={save.isPending || !dirty}
          className="min-h-11 text-[11px] sm:h-7 sm:min-h-0 sm:text-[10.5px]"
        >
          Save regions
        </Button>
        <p className="text-ink/55 text-[10px]">
          {dirty ? 'Boxes changed. Save to rebuild the boards.' : 'Boxes match the saved selection.'}
        </p>
      </div>

      {boards.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {(['face', 'body', 'details'] as const).map((role) => {
            const board = boards.find((candidate) => candidate.role === role)
            if (!board) return null
            return (
              <div key={role} className="border-line bg-canvas/40 overflow-hidden rounded-xl border">
                <FadeImage
                  shimmer
                  src={`/api/media/${board.assetId}`}
                  alt={`${role} board`}
                  className="w-full object-contain"
                />
                <div className="px-2 py-1.5">
                  <p className="text-ink/80 text-[10.5px] font-medium capitalize">{role} board</p>
                  <p className="text-ink/55 text-[10px] tabular-nums">
                    {board.width} x {board.height} px ·{' '}
                    {BOARD_TILES[role].map((tile) => REGION_LABELS[tile]).join(', ')}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
