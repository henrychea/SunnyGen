import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import {
  CROP_REGION_DEFAULTS,
  CROP_REGION_ROLES,
  clampCropRegion,
  defaultCropRegions,
  isDefaultCropRegion,
  panelSizeError,
  regionSourceFor,
  sourceSize,
  type CropRegion,
  type CropRegionRole,
} from '@sunnygen/core'
import { Button, FadeImage, Label, toast } from '@sunnygen/ui'
import type { AvatarRegionsDto } from '~/server/studio.functions'
import { saveAvatarRegionsFn } from '~/server/studio.functions'
import { AvatarCropAdjuster } from './avatar-crop-adjuster'

const REGION_LABELS: Record<CropRegionRole, string> = {
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

const SOURCE_LABELS = {
  sheet: 'Reference sheet',
  'body-panel': 'Body panel',
  'face-panel': 'Face panel',
} as const

function blockedReason(regions: AvatarRegionsDto | null): string | null {
  if (!regions) return 'Loading your images…'
  if (!regions.sheet.assetId) return 'Upload the reference sheet first.'
  if (!regions.bodyPanel.assetId) return 'Upload the body panel first.'
  if (!regions.facePanel.assetId) return 'Upload the face panel first.'
  if (Math.max(regions.sheet.width ?? 0, regions.sheet.height ?? 0) < 4096) {
    return 'The reference sheet must be at least 4096 px on its long side.'
  }
  if (panelSizeError(regions.bodyPanel.width, regions.bodyPanel.height)) {
    return 'The body panel must be at least 4096 x 4096 px.'
  }
  if (panelSizeError(regions.facePanel.width, regions.facePanel.height)) {
    return 'The face panel must be at least 4096 x 4096 px.'
  }
  return null
}

export function AvatarCropsPanel({
  avatarId,
  pending,
  regions,
  derivedCleared,
  onReplacePanel,
  onRegionsSaved,
}: {
  avatarId: string
  pending: boolean
  regions?: AvatarRegionsDto | null
  /** A new image was picked in the form, so whatever is loaded is stale. */
  derivedCleared?: boolean
  onReplacePanel?: () => void
  onRegionsSaved?: (dto: AvatarRegionsDto) => void
}) {
  const [adjust, setAdjust] = useState<CropRegionRole | null>(null)
  const current = regions?.regions ?? defaultCropRegions()
  const reason = blockedReason(regions ?? null)
  const tiles = derivedCleared ? [] : (regions?.tiles ?? [])
  const boards = derivedCleared ? [] : (regions?.boards ?? [])

  const save = useMutation({
    mutationFn: (next: Record<CropRegionRole, CropRegion>) =>
      saveAvatarRegionsFn({ data: { avatarId, regions: next } }),
    onSuccess: (dto) => {
      onRegionsSaved?.(dto)
      setAdjust(null)
      toast(dto.tiles.length > 0 ? 'Crops cut and boards rebuilt' : 'No crops came out of those images', {
        tone: dto.tiles.length > 0 ? 'info' : 'warning',
      })
    },
    onError: (error) =>
      toast(error instanceof Error ? error.message : 'Could not cut the crops', { tone: 'error' }),
  })

  const generate = () => save.mutate(defaultCropRegions())
  const adjustSource = adjust ? regionSourceFor(adjust) : null
  const adjustInfo = adjustSource ? regions?.[sourceKey(adjustSource)] : null

  return (
    <div className="border-line rounded-xl border p-3">
      <Label>Crops</Label>
      <p className="text-ink/65 mt-1 text-[10.5px]">
        Crops are cut automatically from your three images. Adjust any tile if something is cut off.
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={generate}
          loading={save.isPending}
          disabled={Boolean(reason) || pending || save.isPending}
          className="min-h-11 text-[11px] sm:h-7 sm:min-h-0 sm:text-[10.5px]"
        >
          {tiles.length > 0 ? 'Regenerate crops' : 'Generate crops'}
        </Button>
        {reason ? (
          <span className="text-ink/55 text-[10px]">
            {reason}
            {reason.startsWith('Upload the sheet') || reason.startsWith('Upload the') ? (
              onReplacePanel ? (
                <button
                  type="button"
                  onClick={onReplacePanel}
                  className="text-accent ml-1 underline underline-offset-2"
                >
                  Choose images
                </button>
              ) : null
            ) : null}
          </span>
        ) : derivedCleared ? (
          <span className="text-ink/55 text-[10px]">New image picked. Generate crops again.</span>
        ) : null}
      </div>

      {pending ? <p className="text-ink/65 mt-3 text-[11px]">Loading crops…</p> : null}

      {adjust && adjustInfo?.url && adjustSource ? (
        <div className="mt-3.5">
          <p className="text-ink/75 mb-2 text-[11px] font-medium">
            {REGION_LABELS[adjust]} · {SOURCE_LABELS[adjustSource]}
          </p>
          <AvatarCropAdjuster
            role={adjust}
            label={REGION_LABELS[adjust]}
            source={{
              url: adjustInfo.url,
              width: sourceSize(adjustSource).width,
              height: sourceSize(adjustSource).height,
            }}
            region={clampCropRegion(current[adjust], sourceSize(adjustSource))}
            saving={save.isPending}
            onSave={(region) => save.mutate({ ...current, [adjust]: region })}
            onCancel={() => setAdjust(null)}
          />
        </div>
      ) : null}

      {!adjust && tiles.length > 0 ? (
        <div className="mt-3.5 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {CROP_REGION_ROLES.map((role) => {
            const crop = tiles.find((candidate) => candidate.role === role)
            if (!crop) return null
            const adjusted = !isDefaultCropRegion(role, current[role])
            return (
              <div key={role} className="border-line bg-canvas/40 overflow-hidden rounded-xl border">
                <FadeImage
                  shimmer
                  src={`/api/media/${crop.assetId}`}
                  alt={`${REGION_LABELS[role]} crop`}
                  className="aspect-square w-full object-cover"
                />
                <div className="flex flex-col gap-0.5 px-2 py-1.5">
                  <p className="text-ink/80 text-[10.5px] font-medium">{REGION_LABELS[role]}</p>
                  <p className="text-ink/55 text-[10px] tabular-nums">
                    {crop.width} x {crop.height} px
                  </p>
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAdjust(role)}
                      className="text-accent text-[10px] underline underline-offset-2"
                    >
                      Adjust
                    </button>
                    {adjusted ? (
                      <button
                        type="button"
                        onClick={() => save.mutate({ ...current, [role]: CROP_REGION_DEFAULTS[role] })}
                        className="text-ink/55 text-[10px] underline underline-offset-2"
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {!adjust && boards.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
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
                    {board.width} x {board.height} px
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

function sourceKey(source: 'sheet' | 'body-panel' | 'face-panel'): 'sheet' | 'bodyPanel' | 'facePanel' {
  if (source === 'sheet') return 'sheet'
  if (source === 'body-panel') return 'bodyPanel'
  return 'facePanel'
}
