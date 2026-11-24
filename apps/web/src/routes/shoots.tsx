import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { parseAvatarProfile, parseGarmentViews, type GarmentSlot, type GarmentSource } from '@sunnygen/core'
import { Badge, Button, Card, FadeImage, Textarea, cn, motionMountRise, toast } from '@sunnygen/ui'
import { Camera, Check, Images, Loader2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { PageBody, PageHeader, PageScroll } from '~/components/app-shell'
import { MAX_BATCH } from '~/components/home/composer'
import { JobCard, OutputCard, WallModal, type WallCard } from '~/components/home/wall-cards'
import { ModelCombobox, type ModelOption } from '~/components/model-combobox'
import { AspectRatioSelector, QualitySelector } from '~/components/generation-selectors'
import { avatarReferenceAssets } from '~/lib/avatar-references'
import { sortModelChoices } from '~/lib/model-choices'
import { reconcileParams } from '~/lib/model-params'
import { referenceAvatar } from '~/lib/reference-avatar'
import { thumbSrcSet, thumbUrl } from '~/lib/media-thumbs'
import { shootCombinations, type ShootCombination } from '~/lib/shoot-plan'
import { studioShot } from '~/lib/studio-shot'
import { useModelChoices } from '~/lib/use-model-choices'
import { submitGeneration } from '~/server/generation.functions'
import { createFolderFn, loadGenerationWall, type GenerationWallItem } from '~/server/library.functions'
import { loadStudioLibrary, type StudioItemDto } from '~/server/studio.functions'

export const Route = createFileRoute('/shoots')({
  loader: async () => {
    const [library, wall] = await Promise.all([loadStudioLibrary(), loadGenerationWall()])
    return { library, wall }
  },
  component: ShootsPage,
})

function mediaUrl(assetId: string): string {
  return `/api/media/${assetId}`
}

function shootFolderName(avatarName: string): string {
  return `Shoot ${avatarName} ${new Date().toLocaleDateString()}`
}

function isShoot(item: GenerationWallItem): boolean {
  return item.params.origin === 'shoot'
}

function ShootsPage() {
  const initial = Route.useLoaderData()
  const queryClient = useQueryClient()
  const library = initial.library
  const [avatarId, setAvatarId] = useState<string | null>(library.avatars[0]?.id ?? null)
  const [garmentIds, setGarmentIds] = useState<string[]>([])
  const [sceneIds, setSceneIds] = useState<string[]>([])
  const [poseIds, setPoseIds] = useState<string[]>([])
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set())
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [modelId, setModelId] = useState('nano-banana-2')
  const [ratio, setRatio] = useState('3:4')
  const [quality, setQuality] = useState('1k')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ title: string; cards: WallCard[] } | null>(null)

  const { choices, catalogOnly } = useModelChoices()
  const modelOptions = sortModelChoices(choices, catalogOnly).filter(
    (entry) => entry.kind === 'image' && Boolean(entry.definition?.supportsImages),
  )
  const model = modelOptions.find((entry) => entry.modelId === modelId)?.definition ?? null

  const wall = useQuery({
    queryKey: ['shoot-wall'],
    queryFn: () => loadGenerationWall(),
    initialData: initial.wall,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const items = query.state.data ?? []
      return items.some((item) => isShoot(item) && (item.status === 'queued' || item.status === 'running'))
        ? 3000
        : false
    },
  })
  const shootWall = (wall.data ?? []).filter(isShoot)

  const avatar = library.avatars.find((item) => item.id === avatarId) ?? null
  const avatarReference = avatar ? referenceAvatar(avatar) : null
  const avatarImages = avatarReference ? avatarReferenceAssets(avatarReference, model?.id ?? 'generic') : []

  const plan = shootCombinations({
    avatarId,
    garmentIds,
    sceneIds,
    poseIds,
    max: MAX_BATCH,
  })

  const pickedGarments = garmentIds
    .map((id) => library.garments.find((item) => item.id === id))
    .filter((item): item is StudioItemDto => Boolean(item))
  const pickedScenes = sceneIds
    .map((id) => library.scenes.find((item) => item.id === id))
    .filter((item): item is StudioItemDto => Boolean(item))
  const pickedPoses = poseIds
    .map((id) => library.poses.find((item) => item.id === id))
    .filter((item): item is StudioItemDto => Boolean(item))

  const shotFor = (cell: ShootCombination) => {
    const garment = pickedGarments.find((item) => item.id === cell.garmentId)
    const scene = pickedScenes.find((item) => item.id === cell.sceneId)
    const pose = pickedPoses.find((item) => item.id === cell.poseId)
    return studioShot({
      avatarAssetIds: avatarImages,
      avatarProfile: avatarReference?.profile ?? parseAvatarProfile(avatar?.data.avatarProfile),
      modelId: model?.id,
      garments: garment
        ? [
            {
              id: garment.id,
              name: garment.name,
              slot: (garment.data.slot as GarmentSlot) ?? 'top',
              sourceKind: (garment.data.sourceKind as GarmentSource) ?? 'flat-lay',
              notes: String(garment.data.notes ?? ''),
              views: parseGarmentViews(garment),
            },
          ]
        : [],
      poseAssetId: pose?.assetId ?? null,
      sceneAssetId: scene ? (scene.cleanAssetId ?? scene.assetId) : null,
      angle: 'front',
    })
  }

  const cells = plan.cells
    .filter((cell) => !dropped.has(cell.key))
    .map((cell) => {
      const shot = shotFor(cell)
      return {
        ...cell,
        prompt: prompts[cell.key] ?? shot.prompt,
        assetIds: shot.assetIds,
        label: [
          pickedGarments.find((item) => item.id === cell.garmentId)?.name,
          pickedScenes.find((item) => item.id === cell.sceneId)?.name,
          pickedPoses.find((item) => item.id === cell.poseId)?.name,
        ]
          .filter(Boolean)
          .join(' · '),
      }
    })

  const referenceLimit = model?.maxImages ?? 0
  const overReferenceLimit = referenceLimit > 0 && cells.some((cell) => cell.assetIds.length > referenceLimit)

  const chooseModel = (entry: ModelOption) => {
    const next = entry.definition
    if (!next || next.kind !== 'image') return
    setModelId(next.id)
    const { params, changes } = reconcileParams(
      { aspectRatio: ratio, quality, duration: 0, resolution: '', count: 1 },
      next,
    )
    setRatio(params.aspectRatio)
    setQuality(params.quality)
    for (const change of changes) toast(change.message, { tone: 'warning' })
  }

  const toggle = (
    id: string,
    selected: string[],
    setSelected: (update: (current: string[]) => string[]) => void,
    limit?: number,
  ) => {
    if (!selected.includes(id) && limit !== undefined && selected.length >= limit) {
      toast(`Pick at most ${limit}.`, { tone: 'warning' })
      return
    }
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )
  }

  const toggleCell = (key: string) => {
    setDropped((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const queue = async () => {
    if (!avatar || !model || cells.length === 0 || busy) return
    setBusy(true)
    setError(null)
    setProgress({ done: 0, total: cells.length })
    let queued = 0
    const failures: string[] = []
    try {
      const folder = await createFolderFn({ data: { name: shootFolderName(avatar.name) } })
      for (const [index, cell] of cells.entries()) {
        const view = await submitGeneration({
          data: {
            kind: 'image',
            model: model.id,
            prompt: cell.prompt,
            assetIds: cell.assetIds.slice(0, model.maxImages),
            params: { aspectRatio: ratio, quality, origin: 'shoot' },
            folderId: folder.id,
          },
        })
        if (view.generation.status === 'failed') {
          failures.push(view.generation.error ?? 'Generation failed')
        } else {
          queued += 1
        }
        setProgress({ done: index + 1, total: cells.length })
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['shoot-wall'] }),
        queryClient.invalidateQueries({ queryKey: ['today'] }),
        queryClient.invalidateQueries({ queryKey: ['gallery'] }),
        queryClient.invalidateQueries({ queryKey: ['home-generations'] }),
        queryClient.invalidateQueries({ queryKey: ['folders'] }),
      ])
      if (queued > 0) {
        toast(`Queued ${queued} ${queued === 1 ? 'look' : 'looks'} in ${shootFolderName(avatar.name)}.`)
      }
      if (failures.length > 0) setError(failures[0] ?? 'Some looks failed to queue.')
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : 'Could not queue the shoot')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const shootRunning = shootWall.filter(
    (item) => item.status === 'queued' || item.status === 'running',
  ).length
  const shootFailed = shootWall.filter((item) => item.status === 'failed').length
  const shootDone = shootWall.filter((item) => item.status === 'succeeded').length

  return (
    <PageScroll>
      <PageHeader
        eyebrow="Shoot planner"
        title="New shoot"
        description="Pick an avatar, wardrobe, scenes and poses. Every combination becomes one look, queued into a folder you can review from Today."
        actions={
          <Button onClick={() => void queue()} disabled={busy || cells.length === 0 || !model} size="sm">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            {busy && progress
              ? `Queuing ${progress.done}/${progress.total}`
              : `Queue ${cells.length} ${cells.length === 1 ? 'look' : 'looks'}`}
          </Button>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-5">
          <Card className="p-4">
            <Step title="1. Avatar" hint={`${library.avatars.length} saved`}>
              {library.avatars.length === 0 ? (
                <EmptyStep
                  title="No avatars yet."
                  body="Create one in Studio, then come back to plan the shoot."
                  to="/studio"
                />
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {library.avatars.map((item) => {
                    const active = avatarId === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setAvatarId(item.id)}
                        className={cn(
                          'relative w-20 shrink-0 overflow-hidden rounded-xl border text-left transition-[border-color] duration-200 ease-out',
                          active ? 'border-accent/60' : 'border-line hover:border-ink/25',
                        )}
                      >
                        {active ? (
                          <span className="border-accent pointer-events-none absolute inset-0 z-10 rounded-xl border-2" />
                        ) : null}
                        {item.assetUrl ? (
                          <FadeImage
                            src={thumbUrl(item.assetUrl, 160)}
                            srcSet={thumbSrcSet(item.assetUrl, [160, 320])}
                            sizes="80px"
                            alt=""
                            decoding="async"
                            className="aspect-square w-full object-cover"
                          />
                        ) : (
                          <div className="bg-ink/[0.04] aspect-square" />
                        )}
                        <p className="text-ink/60 truncate px-1.5 py-1 text-[10px]">{item.name}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </Step>
          </Card>

          <Card className="p-4">
            <Step title="2. Wardrobe" hint={`${garmentIds.length} picked`}>
              {library.garments.length === 0 ? (
                <EmptyStep
                  title="No wardrobe yet."
                  body="Add garments in Studio, then come back to plan the shoot."
                  to="/studio"
                />
              ) : (
                <MultiGrid
                  items={library.garments}
                  selected={garmentIds}
                  onToggle={(id) => toggle(id, garmentIds, setGarmentIds)}
                  emptyHint="Each picked piece becomes one outfit."
                />
              )}
            </Step>
          </Card>

          <Card className="p-4">
            <Step title="3. Scenes" hint={`${sceneIds.length} picked`}>
              <MultiGrid
                items={library.scenes}
                selected={sceneIds}
                onToggle={(id) => toggle(id, sceneIds, setSceneIds)}
                emptyHint="No scenes picked means a white studio background."
                showClean
              />
            </Step>
          </Card>

          <Card className="p-4">
            <Step title="4. Poses" hint={poseIds.length > 0 ? `${poseIds.length} picked` : 'optional'}>
              {library.poses.length === 0 ? (
                <p className="border-line text-ink/40 rounded-lg border border-dashed px-3 py-5 text-center text-[11.5px]">
                  No poses saved. Each look keeps a relaxed, natural stance.
                </p>
              ) : (
                <MultiGrid
                  items={library.poses}
                  selected={poseIds}
                  onToggle={(id) => toggle(id, poseIds, setPoseIds)}
                  emptyHint="No poses picked means a natural stance."
                />
              )}
            </Step>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div>
                <p className="text-ink/45 text-[11px] font-semibold tracking-[0.08em] uppercase">
                  5. Combinations
                </p>
                <p className="text-ink/40 mt-0.5 text-[10.5px]">
                  {plan.total} {plan.total === 1 ? 'combination' : 'combinations'} · {cells.length} queued
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <ModelCombobox
                  value={model?.id ?? null}
                  options={modelOptions}
                  size="sm"
                  onChange={chooseModel}
                  ariaLabel="Model"
                />
                {model ? (
                  <>
                    <AspectRatioSelector value={ratio} ratios={model.ratios} onChange={setRatio} />
                    <QualitySelector value={quality} options={model.qualityOptions} onChange={setQuality} />
                  </>
                ) : null}
              </div>
            </div>

            {plan.dropped > 0 ? (
              <p className="bg-warning/[0.08] text-ink/60 mb-3 rounded-lg px-2.5 py-1.5 text-[10.5px]">
                A shoot queues at most {MAX_BATCH} looks. The first {MAX_BATCH} of {plan.total} are shown;
                uncheck or trim the picks to swap them.
              </p>
            ) : null}
            {overReferenceLimit ? (
              <p className="bg-warning/[0.08] text-ink/60 mb-3 rounded-lg px-2.5 py-1.5 text-[10.5px]">
                {model?.label} takes {referenceLimit} reference images per look. Extra references are dropped
                when queuing.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-error/80 mb-3 text-[11px]">
                {error}
              </p>
            ) : null}

            {cells.length === 0 ? (
              <EmptyStep
                title="No looks yet."
                body="Pick an avatar and at least one garment. Scenes and poses are optional."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cells.map((cell) => (
                  <div
                    key={cell.key}
                    className={cn(
                      'border-line bg-canvas/40 flex flex-col gap-2 rounded-xl border p-2.5',
                      motionMountRise,
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <label className="flex min-w-0 flex-1 items-start gap-1.5">
                        <input
                          type="checkbox"
                          checked
                          onChange={() => toggleCell(cell.key)}
                          aria-label={`Queue ${cell.label}`}
                          className="accent-accent mt-0.5 size-3.5"
                        />
                        <span className="text-ink/65 min-w-0 text-[11px] leading-snug font-medium">
                          {cell.label}
                        </span>
                      </label>
                      <span className="text-ink/30 shrink-0 text-[9.5px]">{cell.assetIds.length} refs</span>
                    </div>
                    <div className="flex gap-1 overflow-x-auto">
                      {cell.assetIds.map((id, index) => (
                        <span
                          key={`${id}-${index}`}
                          className="border-line size-10 shrink-0 overflow-hidden rounded-md border"
                        >
                          <FadeImage
                            src={thumbUrl(mediaUrl(id), 160)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="size-full object-cover"
                          />
                        </span>
                      ))}
                    </div>
                    <Textarea
                      value={cell.prompt}
                      onChange={(event) =>
                        setPrompts((current) => ({ ...current, [cell.key]: event.target.value }))
                      }
                      aria-label={`Prompt for ${cell.label}`}
                      className="min-h-20 text-[10.5px] leading-snug"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="text-ink/45 text-[11px] font-semibold tracking-[0.08em] uppercase">Shoot queue</p>
              <div className="flex items-center gap-1.5">
                {shootRunning > 0 ? <Badge tone="accent">{shootRunning} running</Badge> : null}
                {shootFailed > 0 ? <Badge tone="error">{shootFailed} failed</Badge> : null}
                {shootDone > 0 ? <Badge tone="success">{shootDone} done</Badge> : null}
              </div>
            </div>
            {shootWall.length === 0 ? (
              <EmptyStep
                title="No shoot looks yet."
                body="Queued looks land here and in Today, newest first."
              />
            ) : (
              <div className="flex flex-wrap gap-3">
                {shootWall.map((item) =>
                  item.status === 'succeeded' && item.outputs.length > 0 ? (
                    item.outputs.map((output) => (
                      <OutputCard
                        key={`${item.id}-${output.id}`}
                        generation={item}
                        output={output}
                        showCount={false}
                        onOpen={() =>
                          setPreview({
                            title: item.prompt || item.model,
                            cards: [{ type: 'output', generation: item, output }],
                          })
                        }
                      />
                    ))
                  ) : (
                    <JobCard key={item.id} generation={item} />
                  ),
                )}
              </div>
            )}
          </Card>

          <p className="text-ink/35 text-[10.5px]">
            Shoot setups are not saved yet. The queued looks and their folder stay in Gallery.
          </p>
        </div>
      </PageBody>

      {preview ? (
        <WallModal title={preview.title} cards={preview.cards} onClose={() => setPreview(null)} />
      ) : null}
    </PageScroll>
  )
}

function Step({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-ink/45 text-[11px] font-semibold tracking-[0.08em] uppercase">{title}</p>
        {hint ? <span className="text-ink/35 text-[10.5px]">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

function MultiGrid({
  items,
  selected,
  onToggle,
  emptyHint,
  showClean = false,
}: {
  items: StudioItemDto[]
  selected: string[]
  onToggle: (id: string) => void
  emptyHint?: string
  showClean?: boolean
}) {
  return (
    <div>
      {items.length === 0 ? (
        <p className="border-line text-ink/40 rounded-lg border border-dashed px-3 py-5 text-center text-[11.5px]">
          Nothing saved here yet.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {items.map((item) => {
            const active = selected.includes(item.id)
            const image = showClean ? (item.cleanAssetUrl ?? item.assetUrl) : item.assetUrl
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item.id)}
                aria-pressed={active}
                className={cn(
                  'relative overflow-hidden rounded-lg border text-left transition-[border-color] duration-200 ease-out',
                  active ? 'border-accent/60' : 'border-line hover:border-ink/25',
                )}
              >
                {active ? (
                  <span className="border-accent pointer-events-none absolute inset-0 z-10 rounded-lg border-2" />
                ) : null}
                {active ? (
                  <span className="bg-accent text-canvas absolute top-1 right-1 z-20 grid size-4 place-items-center rounded-full">
                    <Check size={10} />
                  </span>
                ) : null}
                {image ? (
                  <FadeImage
                    src={thumbUrl(image, 320)}
                    srcSet={thumbSrcSet(image, [160, 320])}
                    sizes="(min-width: 1024px) 140px, 30vw"
                    alt=""
                    decoding="async"
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="bg-ink/[0.04] aspect-square" />
                )}
                <p className="text-ink/60 truncate px-1.5 py-1 text-[10px]">{item.name}</p>
              </button>
            )
          })}
        </div>
      )}
      {emptyHint ? <p className="text-ink/35 mt-1.5 text-[10.5px]">{emptyHint}</p> : null}
    </div>
  )
}

function EmptyStep({ title, body, to }: { title: string; body: string; to?: string }) {
  return (
    <div className="border-line bg-surface/35 rounded-xl border border-dashed px-4 py-5">
      <p className="text-ink/65 text-[12px] font-medium">{title}</p>
      <p className="text-ink/40 mt-1 max-w-md text-[11.5px] leading-relaxed">{body}</p>
      {to ? (
        <Link
          to={to}
          className="text-accent/85 hover:text-accent mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium"
        >
          <Images size={11} /> Open Studio
        </Link>
      ) : null}
    </div>
  )
}
