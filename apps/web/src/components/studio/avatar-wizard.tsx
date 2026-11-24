import {
  AVATAR_PRESETS,
  DEFAULT_AVATAR_PROFILE,
  LIKENESS_CHANGE_LABELS,
  LIKENESS_CHANGE_TRAITS,
  LIKENESS_KEEP_LABELS,
  LIKENESS_KEEP_TRAITS,
  SHEET_SECTIONS,
  buildBodyPanelPrompt,
  buildFacePanelPrompt,
  buildReferenceSheetPrompt,
  parseAvatarProfile,
  type AvatarProfile,
  type AvatarSheetSettings,
} from '@sunnygen/core'
import {
  Button,
  Dialog,
  DialogSurface,
  Input,
  Label,
  Selector,
  Textarea,
  cn,
  motionFast,
  motionSpring,
  motionSwap,
  toast,
} from '@sunnygen/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ClipboardCopy, ClipboardPaste, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AvatarCropsPanel } from '~/components/studio/avatar-crops-panel'
import {
  AvatarSheetUploads,
  type AvatarSlotKind,
  type SlotAsset,
} from '~/components/studio/avatar-sheet-uploads'
import { PromptExtract } from '~/components/studio/avatar-prompt-extract'
import {
  loadAvatarCropsFn,
  loadAvatarRegionsFn,
  saveStudioItemFn,
  type StudioItemDto,
} from '~/server/studio.functions'

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 1, label: 'Source' },
  { id: 2, label: 'Identity' },
  { id: 3, label: 'Hair & body' },
  { id: 4, label: 'Outfit & style' },
  { id: 5, label: 'Sheet' },
  { id: 6, label: 'Review' },
]

const NEXT_LABELS: Record<WizardStep, string> = {
  1: 'Continue to identity',
  2: 'Continue to hair and body',
  3: 'Continue to outfit and style',
  4: 'Continue to sheet options',
  5: 'Build prompts',
  6: 'Save avatar',
}

const REALISM_FLAGS = [
  { key: 'photo', label: 'Realistic photo' },
  { key: 'naturalLight', label: 'Natural light' },
  { key: 'realSkin', label: 'Real skin' },
  { key: 'realHair', label: 'Real hair' },
  { key: 'realProportions', label: 'Real proportions' },
] as const

const STYLE_BANS = [
  { key: 'banAnime', label: 'No anime' },
  { key: 'banCg', label: 'No CG feel' },
  { key: 'banSmoothing', label: 'No over-smoothing' },
] as const

function titleCase(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1)
}

// Enum values that read as machine data once title-cased.
const FIELD_LABELS: Record<string, string> = { 'light-beige': 'Light beige' }

function stringData(item: StudioItemDto | null | undefined, key: string): string | null {
  const value = item?.data[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function AvatarWizard({
  open,
  onOpenChange,
  item,
  initial,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: StudioItemDto | null
  initial?: { profile: AvatarProfile; sheet: SlotAsset | null; panel: SlotAsset | null; name?: string } | null
  onSaved: () => void
}) {
  const stored = useMemo(() => parseAvatarProfile(item?.data.avatarProfile), [item])
  const [step, setStep] = useState<WizardStep>(1)
  const [name, setName] = useState(item?.name ?? initial?.name ?? '')
  const [profile, setProfile] = useState<AvatarProfile>(stored ?? initial?.profile ?? DEFAULT_AVATAR_PROFILE)
  const [sheetChoice, setSheetChoice] = useState<SlotAsset | null | undefined>(undefined)
  const [panelChoice, setPanelChoice] = useState<SlotAsset | null | undefined>(undefined)
  const [faceChoice, setFaceChoice] = useState<SlotAsset | null | undefined>(undefined)
  const [sheetEdit, setSheetEdit] = useState<string | null>(null)
  const [bodyPanelEdit, setBodyPanelEdit] = useState<string | null>(null)
  const [facePanelEdit, setFacePanelEdit] = useState<string | null>(null)
  const [picker, setPicker] = useState<AvatarSlotKind | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [busy, setBusy] = useState<'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const activeId = item?.id ?? savedId

  const cropsQuery = useQuery({
    queryKey: ['avatar-crops', activeId],
    queryFn: () => loadAvatarCropsFn({ data: { avatarId: activeId as string } }),
    enabled: Boolean(activeId),
  })
  const cropsDto = cropsQuery.data
  const regionsQuery = useQuery({
    queryKey: ['avatar-regions', activeId],
    queryFn: () => loadAvatarRegionsFn({ data: { avatarId: activeId as string } }),
    enabled: Boolean(activeId),
  })
  const regionsDto = regionsQuery.data

  const baseFace = stringData(item, 'facePanelAssetId')
  const face =
    faceChoice !== undefined
      ? faceChoice
      : baseFace
        ? { id: baseFace, name: null, width: null, height: null }
        : null
  const baseSheet = stringData(item, 'characterSheetAssetId')
  const sheet =
    sheetChoice !== undefined
      ? sheetChoice
      : (dtoSlot(cropsDto?.sheet) ??
        initial?.sheet ??
        (baseSheet ? { id: baseSheet, name: null, width: null, height: null } : null))
  const panel =
    panelChoice !== undefined
      ? panelChoice
      : (dtoSlot(cropsDto?.panel) ??
        initial?.panel ??
        (item?.assetId ? { id: item.assetId, name: null, width: null, height: null } : null))

  const sheetPrompt = sheetEdit ?? buildReferenceSheetPrompt(profile)
  const bodyPanelPrompt = bodyPanelEdit ?? buildBodyPanelPrompt(profile)
  const facePanelPrompt = facePanelEdit ?? buildFacePanelPrompt(profile)

  const patch = <K extends keyof AvatarProfile>(group: K, values: Partial<AvatarProfile[K]>) => {
    setProfile((current) => ({ ...current, [group]: { ...current[group], ...values } }))
  }

  const stepTop = useRef<HTMLDivElement>(null)

  useEffect(() => {
    stepTop.current?.scrollTo({ top: 0 })
  }, [step])

  const save = async (profileOnly: boolean) => {
    if (!name.trim()) {
      setError('Name the avatar first.')
      return
    }
    if (!profileOnly && (!sheet || !panel || !face)) {
      setError('The reference sheet, the body panel and the face panel are required.')
      return
    }
    setBusy('save')
    setError(null)
    try {
      const saved = await saveStudioItemFn({
        data: {
          id: item?.id,
          kind: 'avatar',
          name: name.trim(),
          assetId: profileOnly ? (item?.assetId ?? null) : (panel?.id ?? null),
          cleanAssetId: item?.cleanAssetId ?? null,
          data: {
            ...item?.data,
            style: item?.data.style ?? 'photoreal',
            characterSheetAssetId: sheet?.id ?? null,
            facePanelAssetId: profileOnly ? (item?.data.facePanelAssetId ?? null) : (face?.id ?? null),
            avatarProfile: profile,
          },
        },
      })
      const panelChanged = !item || item.assetId !== (profileOnly ? item.assetId : (panel?.id ?? null))
      onSaved()
      if (panelChanged) {
        setSavedId(saved.id)
        setStep(6)
        toast('Panel saved. Pick the crop regions below.', { tone: 'info' })
      } else {
        onOpenChange(false)
        toast(profileOnly ? 'Profile saved' : 'Avatar saved', { tone: 'info' })
      }
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Could not save'
      setError(message)
      toast(message, { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Prompt copied.', { tone: 'info' })
    } catch {
      toast('Copy failed.', { tone: 'error' })
    }
  }

  const canSave = Boolean(sheet && panel && name.trim())
  const canSaveProfile = Boolean(name.trim())

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={onOpenChange}
        disablePointerDismissal={picker !== null || pasteOpen}
      >
        <DialogSurface className="h-[calc(100dvh-2rem)] w-[min(96vw,720px)]">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="font-display text-[16px] font-semibold">
                  {item ? `Edit profile · ${item.name}` : 'New avatar'}
                </Dialog.Title>
                <p className="text-ink/65 mt-0.5 text-[11px]">
                  Fill in the profile, run the two prompts in your image AI, then upload the sheet and the 4×4
                  panel.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-ink/60 hover:bg-ink/5 grid size-11 shrink-0 place-items-center rounded-lg transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.94] motion-reduce:active:scale-100 sm:size-8"
                aria-label="Close"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="border-line -mx-1 mt-3 overflow-x-auto pb-1">
              <div className="inline-flex rounded-xl border p-0.5" role="tablist" aria-label="Avatar steps">
                {STEPS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={step === entry.id}
                    onClick={() => setStep(entry.id)}
                    disabled={busy !== null}
                    className={cn(
                      'relative min-h-11 shrink-0 rounded-[10px] px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150 ease-out focus-visible:ring-accent/50 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 sm:min-h-0 sm:px-2.5 sm:text-[11px]',
                      step === entry.id ? 'text-canvas' : 'text-ink/75 hover:text-ink',
                    )}
                  >
                    {step === entry.id ? (
                      <motion.span
                        layoutId="avatar-wizard-step"
                        transition={motionSpring}
                        className="bg-ink pointer-events-none absolute inset-0 rounded-[10px]"
                      />
                    ) : null}
                    <span className="relative">
                      {entry.id}. {entry.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div ref={stepTop} className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  variants={motionSwap}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={motionFast}
                >
                  <label className="mb-3 flex flex-col gap-1.5">
                    <Label>Name</Label>
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Name the avatar"
                      className="h-11 sm:h-9"
                      disabled={busy !== null}
                    />
                  </label>

                  {step === 1 ? (
                    <div className="flex flex-col gap-4">
                      <ChipGroup
                        label="Portrait"
                        options={[{ key: 'portrait', label: 'Attach a portrait in your AI' }]}
                        selected={profile.source.usePortrait ? ['portrait'] : []}
                        onToggle={() => patch('source', { usePortrait: !profile.source.usePortrait })}
                      />
                      <p className="text-ink/65 text-[10.5px]">
                        {profile.source.usePortrait
                          ? 'The likeness rule goes into the sheet prompt. Attach your portrait in your image AI when you run that prompt.'
                          : 'Without the portrait the likeness rule stays out of the sheet prompt and the fields below carry the look.'}
                      </p>
                      <label className="flex flex-col gap-1.5">
                        <Label>Likeness · {profile.source.likenessPercent}%</Label>
                        <input
                          type="range"
                          min={20}
                          max={95}
                          step={5}
                          value={profile.source.likenessPercent}
                          onChange={(event) =>
                            patch('source', { likenessPercent: Number(event.target.value) })
                          }
                          className="accent-accent h-2 w-full"
                        />
                        <span className="text-ink/65 text-[10.5px]">
                          The percentage is written into the likeness rule.
                        </span>
                      </label>
                      <p className="text-ink/65 text-[10.5px]">
                        Chip lists are written into the likeness rule as traits to keep or change.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ChipGroup
                          label="Keep from the portrait"
                          options={LIKENESS_KEEP_TRAITS.map((trait) => ({
                            key: trait,
                            label: LIKENESS_KEEP_LABELS[trait],
                          }))}
                          selected={profile.source.keep}
                          onToggle={(key) =>
                            patch('source', {
                              keep: toggleIn(
                                profile.source.keep,
                                key as (typeof LIKENESS_KEEP_TRAITS)[number],
                              ),
                            })
                          }
                        />
                        <ChipGroup
                          label="Change from the portrait"
                          options={LIKENESS_CHANGE_TRAITS.map((trait) => ({
                            key: trait,
                            label: LIKENESS_CHANGE_LABELS[trait],
                          }))}
                          selected={profile.source.change}
                          onToggle={(key) =>
                            patch('source', {
                              change: toggleIn(
                                profile.source.change,
                                key as (typeof LIKENESS_CHANGE_TRAITS)[number],
                              ),
                            })
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-11 self-start text-[11px] sm:h-7 sm:min-h-0 sm:text-[10.5px]"
                          onClick={() => setPasteOpen(true)}
                          disabled={busy !== null}
                        >
                          <ClipboardPaste size={12} aria-hidden="true" /> Paste prompt
                        </Button>
                        <p className="text-ink/65 text-[10.5px]">
                          Paste the image prompt to fill the fields it states. Anything it does not state is
                          listed as missing so you can fill it in.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {step === 2 ? (
                    <div className="flex flex-col gap-3">
                      <p className="text-ink/65 text-[10.5px]">
                        These fields become the Character Features line in the sheet prompt.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Gender"
                          value={profile.identity.gender}
                          options={[...AVATAR_PRESETS.gender]}
                          onChange={(value) =>
                            patch('identity', { gender: value === 'male' ? 'male' : 'female' })
                          }
                        />
                        <label className="flex flex-col gap-1.5">
                          <Label>Age (adults only)</Label>
                          <Input
                            type="number"
                            min={18}
                            max={99}
                            value={profile.identity.age}
                            onChange={(event) =>
                              patch('identity', { age: Math.round(Number(event.target.value) || 18) })
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <Label>Height (cm)</Label>
                          <Input
                            type="number"
                            min={140}
                            max={210}
                            value={profile.identity.heightCm}
                            onChange={(event) =>
                              patch('identity', { heightCm: Math.round(Number(event.target.value) || 168) })
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <Label>Weight (kg)</Label>
                          <Input
                            type="number"
                            min={30}
                            max={200}
                            placeholder="Optional"
                            value={profile.identity.weightKg ?? ''}
                            onChange={(event) => {
                              const raw = event.target.value.trim()
                              const parsed = Number(raw)
                              patch('identity', {
                                weightKg: raw && Number.isFinite(parsed) ? Math.round(parsed) : undefined,
                              })
                            }}
                          />
                        </label>
                        <Field
                          label="Ethnicity"
                          value={profile.identity.ethnicity}
                          options={[...AVATAR_PRESETS.ethnicity]}
                          onChange={(value) => patch('identity', { ethnicity: value })}
                        />
                        <Field
                          label="Face shape"
                          value={profile.face.faceShape}
                          options={[...AVATAR_PRESETS.faceShape]}
                          onChange={(value) => patch('face', { faceShape: value })}
                        />
                        <Field
                          label="Jawline"
                          value={profile.face.jawline}
                          options={[...AVATAR_PRESETS.jawline]}
                          onChange={(value) => patch('face', { jawline: value })}
                        />
                        <Field
                          label="Chin"
                          value={profile.face.chin}
                          options={[...AVATAR_PRESETS.chin]}
                          onChange={(value) => patch('face', { chin: value })}
                        />
                        <Field
                          label="Eyes · size"
                          value={profile.face.eyeSize}
                          options={[...AVATAR_PRESETS.eyeSize]}
                          onChange={(value) => patch('face', { eyeSize: value })}
                        />
                        <Field
                          label="Eyes · shape"
                          value={profile.face.eyeShape}
                          options={[...AVATAR_PRESETS.eyeShape]}
                          onChange={(value) => patch('face', { eyeShape: value })}
                        />
                        <Field
                          label="Eyebrows"
                          value={profile.face.eyebrows}
                          options={[...AVATAR_PRESETS.eyebrows]}
                          onChange={(value) => patch('face', { eyebrows: value })}
                        />
                        <Field
                          label="Nose bridge"
                          value={profile.face.noseBridge}
                          options={[...AVATAR_PRESETS.noseBridge]}
                          onChange={(value) => patch('face', { noseBridge: value })}
                        />
                        <Field
                          label="Nose tip"
                          value={profile.face.noseTip}
                          options={[...AVATAR_PRESETS.noseTip]}
                          onChange={(value) => patch('face', { noseTip: value })}
                        />
                        <Field
                          label="Lips"
                          value={profile.face.lips}
                          options={[...AVATAR_PRESETS.lips]}
                          onChange={(value) => patch('face', { lips: value })}
                        />
                        <Field
                          label="Skin tone"
                          value={profile.face.skinTone}
                          options={[...AVATAR_PRESETS.skinTone]}
                          onChange={(value) => patch('face', { skinTone: value })}
                        />
                      </div>
                    </div>
                  ) : null}

                  {step === 3 ? (
                    <div className="flex flex-col gap-3">
                      <p className="text-ink/65 text-[10.5px]">
                        Hair and body fields join the same Character Features line.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Hair colour"
                          value={profile.hair.color}
                          options={[...AVATAR_PRESETS.hairColor]}
                          onChange={(value) => patch('hair', { color: value })}
                        />
                        <Field
                          label="Hair length"
                          value={profile.hair.length}
                          options={[...AVATAR_PRESETS.hairLength]}
                          onChange={(value) => patch('hair', { length: value })}
                        />
                        <Field
                          label="Hair texture"
                          value={profile.hair.texture}
                          options={[...AVATAR_PRESETS.hairTexture]}
                          onChange={(value) => patch('hair', { texture: value })}
                        />
                        <Field
                          label="Parting"
                          value={profile.hair.parting}
                          options={[...AVATAR_PRESETS.hairParting]}
                          onChange={(value) => patch('hair', { parting: value })}
                        />
                        <Field
                          label="Figure"
                          value={profile.body.build}
                          options={[...AVATAR_PRESETS.bodyBuild]}
                          onChange={(value) => patch('body', { build: value })}
                        />
                        <Field
                          label="Legs"
                          value={profile.body.legs}
                          options={[...AVATAR_PRESETS.bodyLegs]}
                          onChange={(value) => patch('body', { legs: value })}
                        />
                        <Field
                          label="Bust"
                          value={profile.body.bust}
                          options={[...AVATAR_PRESETS.bust]}
                          onChange={(value) => patch('body', { bust: value })}
                        />
                      </div>
                    </div>
                  ) : null}

                  {step === 4 ? (
                    <div className="flex flex-col gap-4">
                      <p className="text-ink/65 text-[10.5px]">
                        Outfit becomes Basic Attire. Flags list in Overall Style, bans list as do-not lines.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Top"
                          value={profile.outfit.top}
                          options={[...AVATAR_PRESETS.outfitTop]}
                          onChange={(value) => patch('outfit', { top: value })}
                        />
                        <Field
                          label="Legwear"
                          value={profile.outfit.legwear}
                          options={[...AVATAR_PRESETS.legwear]}
                          onChange={(value) => patch('outfit', { legwear: value })}
                        />
                        <Field
                          label="Shoes"
                          value={profile.outfit.shoes}
                          options={[...AVATAR_PRESETS.shoes]}
                          onChange={(value) => patch('outfit', { shoes: value })}
                        />
                      </div>
                      <ChipGroup
                        label="Realism flags"
                        options={REALISM_FLAGS.map((flag) => ({ key: flag.key, label: flag.label }))}
                        selected={REALISM_FLAGS.filter((flag) => profile.style[flag.key]).map(
                          (flag) => flag.key,
                        )}
                        onToggle={(key) => patch('style', { [key]: !profile.style[key] })}
                      />
                      <ChipGroup
                        label="Bans"
                        options={STYLE_BANS.map((ban) => ({ key: ban.key, label: ban.label }))}
                        selected={STYLE_BANS.filter((ban) => profile.style[ban.key]).map((ban) => ban.key)}
                        onToggle={(key) => patch('style', { [key]: !profile.style[key] })}
                      />
                    </div>
                  ) : null}

                  {step === 5 ? (
                    <div className="flex flex-col gap-4">
                      <p className="text-ink/65 text-[10.5px]">
                        Background, ratio and resolution are written into the layout and closing lines.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field
                          label="Background"
                          value={profile.sheet.background}
                          options={['white', 'light-beige']}
                          onChange={(value) =>
                            patch('sheet', { background: value === 'white' ? 'white' : 'light-beige' })
                          }
                        />
                        <Field
                          label="Ratio"
                          value={profile.sheet.ratio}
                          options={[...AVATAR_PRESETS.sheetRatio]}
                          onChange={(value) => patch('sheet', { ratio: value })}
                        />
                        <Field
                          label="Resolution"
                          value={profile.sheet.resolution}
                          options={[...AVATAR_PRESETS.sheetResolution]}
                          onChange={(value) => patch('sheet', { resolution: value })}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>Sheet sections</Label>
                        <p className="text-ink/65 text-[10.5px]">
                          Every enabled section becomes one numbered line in the sheet prompt.
                        </p>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {SHEET_SECTIONS.map((section) => {
                            const enabled = profile.sheet.sections[section.id]
                            return (
                              <button
                                key={section.id}
                                type="button"
                                aria-pressed={enabled}
                                onClick={() =>
                                  patch('sheet', {
                                    sections: {
                                      ...profile.sheet.sections,
                                      [section.id]: !enabled,
                                    } as AvatarSheetSettings['sections'],
                                  })
                                }
                                className={cn(
                                  'border-line flex min-h-11 items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-[border-color,background-color] duration-150 ease-out focus-visible:ring-accent/50 focus-visible:ring-2 focus-visible:outline-none sm:min-h-0',
                                  enabled
                                    ? 'border-accent/40 bg-accent/[0.04]'
                                    : 'bg-canvas/30 hover:border-ink/25',
                                )}
                              >
                                <span
                                  className={cn(
                                    'mt-0.5 grid size-4 shrink-0 place-items-center rounded border',
                                    enabled ? 'border-accent bg-accent text-canvas' : 'border-line',
                                  )}
                                >
                                  {enabled ? <Check size={10} aria-hidden="true" /> : null}
                                </span>
                                <span className="min-w-0">
                                  <span className="text-ink/75 block text-[11px] font-medium">
                                    {section.label}
                                  </span>
                                  {section.items.length > 0 ? (
                                    <span className="text-ink/65 block text-[10px] leading-snug">
                                      {section.items.join(' · ')}
                                    </span>
                                  ) : null}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ChipGroup
                          label="Sheet text"
                          options={[
                            { key: 'labels', label: 'Section names only' },
                            { key: 'footerText', label: 'Footer text' },
                          ]}
                          selected={[
                            ...(profile.sheet.labels === 'section-names' ? ['labels'] : []),
                            ...(profile.sheet.footerText ? ['footerText'] : []),
                          ]}
                          onToggle={(key) =>
                            key === 'labels'
                              ? patch('sheet', {
                                  labels: profile.sheet.labels === 'section-names' ? 'none' : 'section-names',
                                })
                              : patch('sheet', { footerText: !profile.sheet.footerText })
                          }
                        />
                        <ChipGroup
                          label="Sheet borders"
                          options={[{ key: 'borders', label: 'Box outlines' }]}
                          selected={profile.sheet.borders ? ['borders'] : []}
                          onToggle={() => patch('sheet', { borders: !profile.sheet.borders })}
                        />
                      </div>
                      <div className="border-line rounded-xl border p-3">
                        <p className="text-ink/75 text-[11px] font-medium">Body and face panels</p>
                        <p className="text-ink/65 mt-1 text-[10.5px]">
                          Two fixed 2 by 2 panels: the body panel carries the four body angles, the face panel
                          the faces and the hands. Each view gets a 2048 px cell.
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Field
                            label="Panel resolution"
                            value={profile.panel.resolution}
                            options={[...AVATAR_PRESETS.panelResolution]}
                            onChange={(value) => patch('panel', { resolution: value })}
                          />
                          <ChipGroup
                            label="Panel extras"
                            options={[
                              { key: 'text', label: 'Text' },
                              { key: 'borders', label: 'Borders' },
                            ]}
                            selected={[
                              ...(profile.panel.text ? ['text'] : []),
                              ...(profile.panel.borders ? ['borders'] : []),
                            ]}
                            onToggle={(key) =>
                              key === 'text'
                                ? patch('panel', { text: !profile.panel.text })
                                : patch('panel', { borders: !profile.panel.borders })
                            }
                          />
                          <span className="text-ink/65 text-[10.5px]">Background: white</span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {step === 6 ? (
                    <div className="flex flex-col gap-4">
                      <p className="text-ink/65 text-[10.5px]">
                        Copy each prompt into your image AI, then upload the three images here. The prompts
                        are saved with the profile.
                      </p>
                      <PromptEditor
                        label="Reference sheet prompt"
                        value={sheetPrompt}
                        onChange={setSheetEdit}
                        onCopy={() => void copy(sheetPrompt)}
                      />
                      <PromptEditor
                        label="Body panel prompt"
                        value={bodyPanelPrompt}
                        onChange={setBodyPanelEdit}
                        onCopy={() => void copy(bodyPanelPrompt)}
                      />
                      <PromptEditor
                        label="Face panel prompt"
                        value={facePanelPrompt}
                        onChange={setFacePanelEdit}
                        onCopy={() => void copy(facePanelPrompt)}
                      />
                      <AvatarSheetUploads
                        sheet={sheet}
                        panel={panel}
                        face={face}
                        onSheet={setSheetChoice}
                        onPanel={setPanelChoice}
                        onFace={setFaceChoice}
                        picker={picker}
                        onPicker={setPicker}
                        onCopy={(kind) =>
                          void copy(
                            kind === 'sheet'
                              ? sheetPrompt
                              : kind === 'body-panel'
                                ? bodyPanelPrompt
                                : facePanelPrompt,
                          )
                        }
                      />
                      {activeId ? (
                        <AvatarCropsPanel
                          avatarId={activeId}
                          crops={cropsDto?.crops ?? []}
                          cropCells={cropsDto?.cropCells ?? null}
                          panel={cropsDto?.panel ?? null}
                          pending={cropsQuery.isPending}
                          regions={regionsDto ?? null}
                          onRegionsSaved={(dto) =>
                            queryClient.setQueryData(['avatar-regions', activeId], dto)
                          }
                          onReplacePanel={() => setPicker('body-panel')}
                          onSaved={(dto) => {
                            queryClient.setQueryData(['avatar-crops', activeId], dto)
                            onSaved()
                          }}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="border-line bg-surface mt-4 flex shrink-0 flex-col gap-3 border-t pt-3">
              <AnimatePresence initial={false}>
                {error ? (
                  <motion.p
                    key="wizard-error"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={motionFast}
                    role="alert"
                    className="border-error/20 bg-error/5 text-error overflow-hidden rounded-lg border px-3 py-2 text-[11.5px]"
                  >
                    {error}
                  </motion.p>
                ) : null}
              </AnimatePresence>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  {item ? (
                    <Button
                      variant="ghost"
                      onClick={() => void save(true)}
                      loading={busy === 'save'}
                      disabled={busy !== null || !canSaveProfile}
                      className="min-h-11 text-[11px] sm:min-h-10"
                    >
                      Save profile only
                    </Button>
                  ) : null}
                  {step < 6 ? (
                    <Button
                      onClick={() => setStep((step + 1) as WizardStep)}
                      disabled={busy !== null}
                      className="min-h-11 text-[11px] sm:min-h-10"
                    >
                      {NEXT_LABELS[step]}
                    </Button>
                  ) : null}
                  <Button
                    variant={step === 6 ? 'primary' : 'outline'}
                    onClick={() => void save(false)}
                    loading={busy === 'save'}
                    disabled={busy !== null || !canSave}
                    className="min-h-11 text-[11px] sm:min-h-10"
                  >
                    Save avatar
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {pasteOpen ? (
            <Dialog.Root open onOpenChange={setPasteOpen}>
              <DialogSurface className="w-[min(92vw,560px)]">
                <Dialog.Title className="font-display text-[15px] font-semibold">Paste prompt</Dialog.Title>
                <p className="text-ink/65 mt-0.5 text-[11px]">
                  Only what the prompt states is filled in. Everything else is listed so you can fill it in
                  the steps.
                </p>
                <div className="mt-3">
                  <PromptExtract
                    onExtracted={(extracted) =>
                      setProfile((current) => ({
                        ...extracted,
                        source: {
                          ...extracted.source,
                          portraitAssetId: current.source.portraitAssetId,
                          usePortrait: current.source.usePortrait,
                        },
                      }))
                    }
                  />
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setPasteOpen(false)}
                    className="min-h-11 text-[11px] sm:min-h-9"
                  >
                    Done
                  </Button>
                </div>
              </DialogSurface>
            </Dialog.Root>
          ) : null}
        </DialogSurface>
      </Dialog.Root>
    </>
  )
}

function dtoSlot(
  info:
    | { assetId: string | null; name: string | null; width: number | null; height: number | null }
    | undefined,
): SlotAsset | null {
  if (!info?.assetId) return null
  return { id: info.assetId, name: info.name, width: info.width, height: info.height }
}

function toggleIn<T extends string>(items: T[], key: T): T[] {
  return items.includes(key) ? items.filter((item) => item !== key) : [...items, key]
}

function Field({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  const custom = !options.includes(value)
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Selector
        value={custom ? '__custom__' : value}
        size="sm"
        ariaLabel={label}
        options={[
          ...options.map((option) => ({ key: option, label: FIELD_LABELS[option] ?? titleCase(option) })),
          { key: '__custom__', label: 'Custom…' },
        ]}
        onChange={(option) => onChange(option.key === '__custom__' ? '' : option.key)}
      />
      {custom || value.length === 0 ? (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} custom value`}
          placeholder="Type a custom value"
          className="h-11 sm:h-9"
        />
      ) : null}
    </div>
  )
}

function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: Array<{ key: T; label: string }>
  selected: T[]
  onToggle: (key: T) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option.key)
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(option.key)}
              className={cn(
                'inline-flex min-h-11 items-center gap-1 rounded-full border px-3 py-1 text-[11px] transition-[border-color,background-color,color] duration-150 ease-out focus-visible:ring-accent/50 focus-visible:ring-2 focus-visible:outline-none sm:min-h-0 sm:px-2.5 sm:text-[10.5px]',
                active
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-line text-ink/70 hover:border-ink/25 hover:text-ink',
              )}
            >
              {active ? <Check size={10} aria-hidden="true" /> : null}
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PromptEditor({
  label,
  value,
  onChange,
  onCopy,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onCopy: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="flex items-center gap-2">
          <span className="text-ink/65 text-[10px] tabular-nums">{value.length} chars</span>
          <button
            type="button"
            onClick={onCopy}
            className="text-ink/70 hover:bg-ink/5 hover:text-ink focus-visible:ring-accent/50 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] transition-colors focus-visible:ring-2 focus-visible:outline-none sm:min-h-0"
          >
            <ClipboardCopy size={12} aria-hidden="true" /> Copy
          </button>
        </span>
      </div>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-40" />
    </div>
  )
}
