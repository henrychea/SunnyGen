import {
  AVATAR_PRESETS,
  DEFAULT_AVATAR_PROFILE,
  LIKENESS_CHANGE_LABELS,
  LIKENESS_CHANGE_TRAITS,
  LIKENESS_KEEP_LABELS,
  LIKENESS_KEEP_TRAITS,
  SHEET_SECTIONS,
  buildPanelSheetPrompt,
  buildReferenceSheetPrompt,
  parseAvatarProfile,
  type AvatarProfile,
  type AvatarSheetSettings,
} from '@sunnygen/core'
import {
  Button,
  Dialog,
  DialogSurface,
  FadeImage,
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
import { Check, Circle, ClipboardCopy, ImagePlus, ScanFace, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ReferencePicker } from '~/components/home/reference-picker'
import { ModelCombobox, type ModelOption } from '~/components/model-combobox'
import { sortModelChoices } from '~/lib/model-choices'
import { reconcileParams } from '~/lib/model-params'
import type { ReferenceItem } from '~/lib/reference-images'
import { useModelChoices } from '~/lib/use-model-choices'
import { getGenerationView, submitGeneration } from '~/server/generation.functions'
import { extractAvatarProfileFn, saveStudioItemFn, type StudioItemDto } from '~/server/studio.functions'

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function AvatarWizard({
  open,
  onOpenChange,
  item,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: StudioItemDto | null
  onSaved: () => void
}) {
  const stored = useMemo(() => parseAvatarProfile(item?.data.avatarProfile), [item])
  const [step, setStep] = useState<WizardStep>(1)
  const [name, setName] = useState(item?.name ?? '')
  const [profile, setProfile] = useState<AvatarProfile>(stored ?? DEFAULT_AVATAR_PROFILE)
  const [sheetId, setSheetId] = useState<string | null>(stringData(item, 'characterSheetAssetId'))
  const [panelId, setPanelId] = useState<string | null>(item?.assetId ?? null)
  const [sheetEdit, setSheetEdit] = useState<string | null>(null)
  const [panelEdit, setPanelEdit] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [modelId, setModelId] = useState('nano-banana-2')
  const [busy, setBusy] = useState<'sheet' | 'panel' | 'save' | 'extract' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { choices, catalogOnly } = useModelChoices()
  const modelOptions = useMemo(
    () =>
      sortModelChoices(choices, catalogOnly).filter(
        (entry) => entry.kind === 'image' && !entry.disabled && Boolean(entry.definition?.supportsImages),
      ),
    [choices, catalogOnly],
  )
  const model =
    modelOptions.find((entry) => entry.modelId === modelId)?.definition ?? modelOptions[0]?.definition ?? null

  const sheetPrompt = sheetEdit ?? buildReferenceSheetPrompt(profile)
  const panelPrompt = panelEdit ?? buildPanelSheetPrompt(profile)

  const patch = <K extends keyof AvatarProfile>(group: K, values: Partial<AvatarProfile[K]>) => {
    setProfile((current) => ({ ...current, [group]: { ...current[group], ...values } }))
  }

  const stepTop = useRef<HTMLDivElement>(null)

  useEffect(() => {
    stepTop.current?.scrollTo({ top: 0 })
  }, [step])

  const portraitId = profile.source.portraitAssetId ?? null

  const runGeneration = async (kind: 'sheet' | 'panel') => {
    if (!model) {
      setError('Pick an image model first.')
      return
    }
    const prompt = kind === 'sheet' ? sheetPrompt.trim() : panelPrompt.trim()
    if (prompt.length === 0) {
      setError('The prompt is empty.')
      return
    }
    if (kind === 'panel' && !sheetId) {
      setError('Generate or pick a reference sheet first.')
      return
    }
    const wanted = kind === 'sheet' ? profile.sheet.resolution : profile.panel.resolution
    const { params, changes } = reconcileParams(
      {
        aspectRatio: kind === 'sheet' ? profile.sheet.ratio : '1:1',
        quality: wanted.toLowerCase(),
        duration: 0,
        resolution: '',
        count: 1,
      },
      model,
    )
    for (const change of changes) toast(change.message, { tone: 'warning' })
    setBusy(kind)
    setError(null)
    try {
      const submitted = await submitGeneration({
        data: {
          kind: 'image',
          model: model.id,
          prompt,
          assetIds: kind === 'sheet' ? (portraitId ? [portraitId] : []) : [sheetId as string],
          params: { aspectRatio: params.aspectRatio, quality: params.quality },
        },
      })
      if (submitted.generation.status === 'failed') {
        throw new Error(submitted.generation.error ?? 'Generation failed')
      }
      let view = submitted
      for (let attempt = 0; attempt < 300 && view.generation.status !== 'succeeded'; attempt += 1) {
        await wait(2_000)
        const next = await getGenerationView({ data: { id: submitted.generation.id } })
        if (!next) throw new Error('The generation disappeared.')
        if (next.generation.status === 'failed') {
          throw new Error(next.generation.error ?? 'Generation failed')
        }
        if (next.generation.status === 'cancelled') throw new Error('Generation canceled.')
        view = next
      }
      const outputId = view.generation.outputAssetIds[0]
      if (!outputId) throw new Error('No image came back.')
      if (kind === 'sheet') setSheetId(outputId)
      else setPanelId(outputId)
      toast(kind === 'sheet' ? 'Reference sheet ready.' : '4×4 panel ready.', { tone: 'info' })
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Generation failed')
    } finally {
      setBusy(null)
    }
  }

  const extract = async () => {
    if (!item) return
    setBusy('extract')
    setError(null)
    try {
      const extracted = await extractAvatarProfileFn({ data: { avatarId: item.id } })
      setProfile((current) => ({
        ...extracted,
        source: { ...extracted.source, portraitAssetId: current.source.portraitAssetId },
      }))
      toast('Keywords extracted. Review them before saving.', { tone: 'info' })
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : 'Could not extract keywords')
    } finally {
      setBusy(null)
    }
  }

  const save = async (profileOnly: boolean) => {
    if (!name.trim()) {
      setError('Name the avatar first.')
      return
    }
    if (!profileOnly && (!sheetId || !panelId)) {
      setError('Both the reference sheet and the 4×4 panel are required.')
      return
    }
    setBusy('save')
    setError(null)
    try {
      await saveStudioItemFn({
        data: {
          id: item?.id,
          kind: 'avatar',
          name: name.trim(),
          assetId: profileOnly ? (item?.assetId ?? null) : panelId,
          cleanAssetId: item?.cleanAssetId ?? null,
          data: {
            ...item?.data,
            style: item?.data.style ?? 'photoreal',
            characterSheetAssetId: sheetId,
            avatarProfile: profile,
          },
        },
      })
      onSaved()
      onOpenChange(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save')
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

  const canSave = Boolean(sheetId && panelId && name.trim())
  const canSaveProfile = Boolean(name.trim())

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange} disablePointerDismissal={pickerOpen}>
        <DialogSurface className="h-[calc(100dvh-2rem)] w-[min(96vw,720px)]">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="font-display text-[16px] font-semibold">
                  {item ? `Edit profile · ${item.name}` : 'New avatar'}
                </Dialog.Title>
                <p className="text-ink/65 mt-0.5 text-[11px]">
                  Build the reference sheet and 4×4 panel, then save the identity keywords.
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
                      <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                        <button
                          type="button"
                          onClick={() => setPickerOpen(true)}
                          className="border-line bg-canvas/40 text-ink/65 hover:border-accent/40 hover:text-accent focus-visible:ring-accent/50 relative grid h-28 place-items-center overflow-hidden rounded-xl border border-dashed transition-[color,border-color,background-color] duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none"
                        >
                          {portraitId ? (
                            <FadeImage
                              shimmer
                              src={`/api/media/${portraitId}`}
                              alt="Likeness portrait"
                              className="size-full object-contain"
                            />
                          ) : (
                            <span className="flex flex-col items-center gap-1 text-[10.5px]">
                              <ImagePlus size={16} aria-hidden="true" />
                              Pick a portrait
                            </span>
                          )}
                        </button>
                        <div className="flex flex-col gap-3">
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
                              disabled={!portraitId}
                              className="accent-accent h-2 w-full disabled:opacity-40"
                            />
                            <span className="text-ink/65 text-[10.5px]">
                              The percentage is written into the likeness rule.
                            </span>
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="min-h-11 text-[11px] sm:h-7 sm:min-h-0 sm:text-[10.5px]"
                              onClick={() => patch('source', { portraitAssetId: undefined })}
                              disabled={!portraitId}
                            >
                              Clear portrait
                            </Button>
                            {item ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="min-h-11 text-[11px] sm:h-7 sm:min-h-0 sm:text-[10.5px]"
                                onClick={() => void extract()}
                                loading={busy === 'extract'}
                                disabled={busy !== null}
                              >
                                <ScanFace size={12} aria-hidden="true" /> Extract keywords from sheet
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {item ? (
                        <p className="text-ink/65 text-[10.5px]">
                          Extract reads the saved sheet once with the OpenRouter model from Settings. Nothing
                          is saved until you press Save.
                        </p>
                      ) : null}
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
                      {!portraitId ? (
                        <p className="text-ink/65 text-[10.5px]">
                          Without a portrait the likeness rule is left out and the sheet uses the fields
                          below.
                        </p>
                      ) : null}
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
                        <p className="text-ink/75 text-[11px] font-medium">4×4 panel</p>
                        <p className="text-ink/65 mt-1 text-[10.5px]">
                          Each count becomes a phrase in the panel prompt.
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <CountField
                            label="Views"
                            value={profile.panel.views}
                            min={1}
                            max={6}
                            onChange={(value) => patch('panel', { views: value })}
                          />
                          <CountField
                            label="Expressions"
                            value={profile.panel.expressions}
                            min={0}
                            max={8}
                            onChange={(value) => patch('panel', { expressions: value })}
                          />
                          <CountField
                            label="Poses"
                            value={profile.panel.poses}
                            min={0}
                            max={8}
                            onChange={(value) => patch('panel', { poses: value })}
                          />
                          <CountField
                            label="Detail crops"
                            value={profile.panel.detailCrops}
                            min={0}
                            max={8}
                            onChange={(value) => patch('panel', { detailCrops: value })}
                          />
                        </div>
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
                        Both prompts are saved with the profile. Edit or copy them before generating.
                      </p>
                      <PromptEditor
                        label="Reference sheet prompt"
                        value={sheetPrompt}
                        onChange={setSheetEdit}
                        onCopy={() => void copy(sheetPrompt)}
                      />
                      <PromptEditor
                        label="4×4 panel prompt"
                        value={panelPrompt}
                        onChange={setPanelEdit}
                        onCopy={() => void copy(panelPrompt)}
                      />
                    </div>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="border-line bg-surface mt-4 flex shrink-0 flex-col gap-3 border-t pt-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex items-center gap-2">
                  <AssetPill label="Sheet" assetId={sheetId} />
                  <AssetPill label="Panel" assetId={panelId} />
                </div>
                <div className="sm:ml-auto sm:w-64">
                  <ModelCombobox
                    options={modelOptions}
                    value={model?.id ?? ''}
                    onChange={(entry: ModelOption) => {
                      if (entry.modelId) setModelId(entry.modelId)
                    }}
                    ariaLabel="Image model"
                  />
                  <p className="text-ink/65 mt-1 text-[10.5px]">
                    The image model used by both generate buttons.
                  </p>
                </div>
              </div>

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
                <Button
                  variant="outline"
                  onClick={() => void runGeneration('sheet')}
                  loading={busy === 'sheet'}
                  disabled={busy !== null || !model}
                  className="min-h-11 text-[11px] sm:min-h-10"
                >
                  Generate reference sheet
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void runGeneration('panel')}
                  loading={busy === 'panel'}
                  disabled={busy !== null || !model || !sheetId}
                  className="min-h-11 text-[11px] sm:min-h-10"
                >
                  Generate 4×4 panel
                </Button>
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

          {pickerOpen ? (
            <ReferencePicker
              title="Portrait for likeness"
              allowAvatars={false}
              existingIds={[]}
              max={1}
              onClose={() => setPickerOpen(false)}
              onConfirm={(picked: ReferenceItem[]) => {
                const chosen = picked[0]
                if (chosen) {
                  patch('source', { portraitAssetId: chosen.id })
                  if (!name.trim()) setName(chosen.name)
                }
                setPickerOpen(false)
              }}
            />
          ) : null}
        </DialogSurface>
      </Dialog.Root>
    </>
  )
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

function CountField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-ink/70 text-[10.5px]">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        className="h-11 sm:h-9"
        onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || 0)))}
      />
    </label>
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

function AssetPill({ label, assetId }: { label: string; assetId: string | null }) {
  return (
    <span className="border-line bg-canvas/40 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px]">
      {assetId ? (
        <Check size={10} className="text-accent" aria-hidden="true" />
      ) : (
        <Circle size={10} className="text-ink/60" aria-hidden="true" />
      )}
      <span className="text-ink/70">{label}</span>
      <span className="sr-only">{assetId ? 'ready' : 'missing'}</span>
    </span>
  )
}
