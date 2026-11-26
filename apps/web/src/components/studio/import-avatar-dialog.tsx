import { identityKeywords, type AvatarProfile } from '@sunnygen/core'
import { Button, Dialog, DialogSurface, Input, Label, motionFast, toast } from '@sunnygen/ui'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { saveStudioItemFn } from '~/server/studio.functions'
import { PromptExtract } from './avatar-prompt-extract'
import { AvatarSheetUploads, type AvatarSlotKind, type SlotAsset } from './avatar-sheet-uploads'

export interface ImportedAvatar {
  profile: AvatarProfile
  sheet: SlotAsset | null
  panel: SlotAsset | null
  face?: SlotAsset | null
  name?: string
}

export function ImportAvatarDialog({
  open,
  onOpenChange,
  onSaved,
  onOpenInWizard,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  onOpenInWizard: (initial: ImportedAvatar) => void
}) {
  const [name, setName] = useState('')
  const [profile, setProfile] = useState<AvatarProfile | null>(null)
  const [sheet, setSheet] = useState<SlotAsset | null>(null)
  const [panel, setPanel] = useState<SlotAsset | null>(null)
  const [face, setFace] = useState<SlotAsset | null>(null)
  const [picker, setPicker] = useState<AvatarSlotKind | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSave = Boolean(name.trim() && profile && sheet && panel && face)
  const traits = profile ? identityKeywords(profile) : null

  const save = async () => {
    if (!profile || !sheet || !panel || !face) return
    setBusy(true)
    setError(null)
    try {
      await saveStudioItemFn({
        data: {
          kind: 'avatar',
          name: name.trim(),
          assetId: panel.id,
          cleanAssetId: null,
          data: {
            style: 'photoreal',
            characterSheetAssetId: sheet.id,
            facePanelAssetId: face.id,
            avatarProfile: profile,
          },
        },
      })
      onSaved()
      onOpenChange(false)
      toast('Avatar imported.', { tone: 'info' })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} disablePointerDismissal={picker !== null}>
      <DialogSurface className="w-[min(96vw,640px)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Dialog.Title className="font-display text-[16px] font-semibold">Import avatar</Dialog.Title>
            <p className="text-ink/65 mt-0.5 text-[11px]">
              Paste the prompt you used, then upload the two images it produced.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-ink/65 hover:bg-ink/5 grid size-11 shrink-0 place-items-center rounded-lg transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.94] motion-reduce:active:scale-100 sm:size-8"
            aria-label="Close"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name the avatar"
              className="h-11 sm:h-9"
              disabled={busy}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <Label>Paste the prompt you used for the reference sheet and 4×4 panel</Label>
            <PromptExtract onExtracted={setProfile} />
          </div>

          {traits ? (
            <div className="border-line-strong bg-canvas/40 text-ink/70 flex flex-col gap-0.5 rounded-xl border px-3 py-2 text-[11px]">
              <p className="text-ink/75 text-[11px] font-medium">Extracted traits</p>
              {[traits.face, traits.hair, traits.body, traits.outfit].map((group, index) => (
                <p key={index}>{group.join(' · ')}</p>
              ))}
            </div>
          ) : null}

          <AvatarSheetUploads
            sheet={sheet}
            panel={panel}
            face={face}
            onSheet={setSheet}
            onPanel={setPanel}
            onFace={setFace}
            picker={picker}
            onPicker={setPicker}
            onSwapPanels={() => {
              setPanel(face)
              setFace(panel)
            }}
          />
        </div>

        <AnimatePresence initial={false}>
          {error ? (
            <motion.p
              key="import-error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={motionFast}
              role="alert"
              className="border-error/20 bg-error/5 text-error mt-3 overflow-hidden rounded-lg border px-3 py-2 text-[11.5px]"
            >
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              onOpenInWizard({ profile: profile as AvatarProfile, sheet, panel, face, name: name.trim() })
            }
            disabled={!profile || busy}
            className="min-h-11 text-[11px] sm:min-h-10"
          >
            Open in wizard
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            loading={busy}
            disabled={!canSave || busy}
            className="min-h-11 text-[11px] sm:min-h-10"
          >
            Save avatar
          </Button>
        </div>
      </DialogSurface>
    </Dialog.Root>
  )
}
