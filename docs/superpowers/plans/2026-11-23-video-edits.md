# Video Edits + Home-style Video Tab Implementation Plan

> **For agentic workers:** Executed by Orca Pi workers, one task per worker, in
> dependency order: Task 1 → (Task 2 ∥ Task 3) → Task 4 → Task 5. Steps use checkbox
> (`- [ ]`) syntax for tracking. Workers other than Task 1 must wait for the tasks
> they consume.

**Goal:** Add reference-driven video editing (target video + avatar/reference images + prompt → edited video) and rebuild the Video tab on the home pattern (bottom composer, gallery wall).

**Architecture:** A new schema-driven `'edit'` video mode flows from the core classifier through both providers' dynamic catalogs and adapters; the web app gains a video-capable reference picker, a `VideoComposer` with Generate | Edit modes, and a video-only generation wall. Edit submission fans out one generation per target video (image-edit precedent).

**Tech Stack:** TypeScript, TanStack Start, React, motion, node:sqlite, `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-23-video-edits-design.md`

## Global Constraints

- **Do not commit.** Leave all changes in the working tree and report; the coordinator
  asks the partner before any commit.
- **Do not start or stop dev servers.** Verify with `pnpm test`, `pnpm typecheck`,
  `pnpm lint`, `pnpm format` only.
- **No AI attribution** anywhere; no code comments unless logic demands one.
- Server functions are imported statically; server-only code stays in `.server.ts` /
  `.functions.ts`.
- Theme classes only (`bg-canvas`, `text-ink`, `border-line`, `accent`), warm-light
  look, Base UI dialogs.
- Unit tests are `tsx --test` files next to the code, `*.test.ts`.
- `'edit'` is ordered **last** in `VIDEO_MODE_KEYS` so existing defaults never change.
- Every shipped model invariant stays green: a shipped model's `videoModes` must keep
  documenting endpoints for its modes.

## Review Focus

1. An edit-only dynamic model (video + references, no generate mode) picked in a
   generate context would send an image URL through a video field — generate lists must
   exclude it. Pinned in Task 4 (`videoEditOnly` test) and Task 5 (home generate-list
   filter).
2. Several target videos in one provider request would corrupt the body — adapters take
   one source video. Pinned in Task 4 (`videoEditJobs` one-job-per-target test).
3. Extend/interpolation/upscale operations carry prompts and video inputs but no
   reference field — misclassifying them as edit sends whole videos to extenders.
   Pinned in Task 1 (classifier tests).
4. A model with both generate and edit modes must never default to edit on its own.
   Pinned in Task 1 (`bestVideoMode` skips `'edit'` test).
5. An edit submit with a target but neither prompt nor references must fail before any
   provider traffic. Pinned in Task 4 (`videoEditJobs` validation test).

---

### Task 1: Core `'edit'` video mode

**Files:**

- Modify: `packages/core/src/video-modes.ts`
- Modify: `packages/core/src/models.ts` (the `videoMode()` helper only)
- Test: `packages/core/src/video-modes.test.ts`

**Interfaces:**

- Consumes: none.
- Produces (exact, used by every later task):
  - `VIDEO_MODE_KEYS = ['text', 'image', 'frames', 'references', 'edit'] as const`
  - `VIDEO_MODE_LABELS.edit = 'Video edit'`
  - `VideoModeCapability` gains `videoField: string | null` — null for every mode
    except `'edit'`, where it is the required string-typed field from
    `VIDEO_INPUT_FIELDS`.
  - `bestVideoMode(modes: VideoModes | undefined | null): VideoModeKey | null` —
    returns the first present mode **excluding `'edit'`**, else null.
  - `operationVideoModes` classifies as `['edit']` only when an operation has: a
    prompt field, a **required string-typed** field from `VIDEO_INPUT_FIELDS`, and a
    reference field — array-typed from `VIDEO_REFERENCE_FIELDS` (maxImages from
    `maxItems ?? 1`) or a single string-typed reference field (maxImages 1). Operations
    meeting only part of that keep today's behavior (skipped).
  - Edit capability `fields` = the reference field, `fieldsMode` = `'array'` for an
    array reference / `'single'` for a string reference.

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/video-modes.test.ts`:

```ts
test('video + prompt + reference operations classify as edit', () => {
  const modes = classifyVideoModes([
    operation(
      'video-to-video',
      {
        ...PROMPT,
        video_url: field('string'),
        reference_images: field('array', { maxItems: 4 }),
      },
      ['prompt', 'video_url'],
    ),
  ])
  assert.deepEqual(videoModeKeys(modes), ['edit'])
  const edit = modes.edit
  assert.ok(edit)
  assert.equal(edit.endpoint, 'vendor/model/video-to-video')
  assert.equal(edit.videoField, 'video_url')
  assert.deepEqual(edit.fields, ['reference_images'])
  assert.equal(edit.fieldsMode, 'array')
  assert.equal(edit.maxImages, 4)
})

test('a single string reference field still classifies as edit with one slot', () => {
  const modes = classifyVideoModes([
    operation(
      'video-face-swap',
      { ...PROMPT, video_url: field('string'), reference_image: field('string') },
      ['prompt', 'video_url'],
    ),
  ])
  assert.equal(modes.edit?.maxImages, 1)
  assert.equal(modes.edit?.fieldsMode, 'single')
  assert.deepEqual(modes.edit?.fields, ['reference_image'])
})

test('prompt-only video-input operations stay skipped', () => {
  const modes = classifyVideoModes([
    operation('extend-video', { ...PROMPT, video_url: field('string') }, ['prompt', 'video_url']),
  ])
  assert.deepEqual(videoModeKeys(modes), [])
})
```

Extend the existing "operations that need a video or audio input are skipped" table
test: `extend-video` and `upscale` rows stay `[]`; drop nothing that already passes.
Add:

```ts
test('bestVideoMode never returns edit', () => {
  assert.equal(bestVideoMode({ edit: modes.edit }), null) // reuse the edit capability above
  const mixed = classifyVideoModes([operation('text-to-video', { ...PROMPT }, ['prompt'])])
  // a model with text + edit keeps 'text' as its default
  assert.equal(bestVideoMode({ ...mixed, edit: mixed.text }), 'text')
})
```

Also assert in the "every shipped video model documents its modes" test that no shipped
model gains an `edit` key (nothing was added by hand): for each mode of each shipped
model, `assert.notEqual(mode, 'edit')`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test packages/core/src/video-modes.test.ts`
Expected: FAIL — no `'edit'` key, `videoField` missing.

- [ ] **Step 3: Implement in `packages/core/src/video-modes.ts`**

- Append `'edit'` to `VIDEO_MODE_KEYS`; add `VIDEO_MODE_LABELS.edit = 'Video edit'`.
- Add `videoField: string | null` to `VideoModeCapability`.
- `modeCapability(operation, 'edit', options)`: resolve `videoField` (required
  string-typed `VIDEO_INPUT_FIELDS` match), the reference field (array preferred,
  else single string), `fields`/`fieldsMode`/`maxImages` per the Interfaces block.
- `operationVideoModes`: replace the blanket
  `if (operation.required.some((name) => VIDEO_INPUT_FIELDS.includes(name))) return []`
  with: if a **required string-typed** `VIDEO_INPUT_FIELDS` field exists → return
  `['edit']` when a prompt field and a reference field exist, else `[]`. Everything
  after that branch is unchanged.
- `bestVideoMode`: `videoModeKeys(modes).find((mode) => mode !== 'edit') ?? null`.
- In `packages/core/src/models.ts`, the `videoMode()` helper gains `videoField: null`
  so every hand-written capability satisfies the widened type. No other change to
  shipped models.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsx --test packages/core/src/video-modes.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the package**

Run: `pnpm --filter @sunnygen/core typecheck && pnpm --filter @sunnygen/core test`
Expected: clean. If a per-package typecheck script does not exist, `pnpm typecheck`.

- [ ] **Step 6: Report**

No commit. Report: files touched, test output, the exact `VideoModeCapability` shape
produced for `'edit'` (Task 2 and 3 build against it).

### Task 2: Provider adapters build edit bodies

**Files:**

- Modify: `packages/providers/src/sunra/video.ts`
- Modify: `packages/providers/src/fal/video.ts`
- Test: `packages/providers/src/flows.test.ts` (edit cases for both providers)

**Interfaces:**

- Consumes (from Task 1): `VideoModeKey` includes `'edit'`;
  `VideoModeCapability.videoField: string | null`; edit capability shape
  (`fields` = reference field, `fieldsMode`, `maxImages`).
- Produces: provider flows accepting `params.videoMode === 'edit'` with
  `request.assets` ordered `[targetVideo, ...referenceImages]`. Body:
  `body[capability.videoField] = <uploaded target URL>` and references through the
  existing reference-field logic. No changes to the legacy (capability-less) paths.

- [ ] **Step 1: Write the failing flow tests**

In `packages/providers/src/flows.test.ts`, following the existing video flow test
pattern (fixtures from `fixtures.ts`, mock queue): for **both** `sunra` and `fal`,
submit a `kind: 'video'` request with `params.videoMode: 'edit'`, a model whose
`videoModes.edit` is
`{ endpoint: '<alias>/video-to-video', fields: ['reference_images'], fieldsMode: 'array', maxImages: 4, durations: [], resolutions: [], ratios: [], audio: false, videoField: 'video_url' }`,
and three assets (first is `video/mp4`). Assert:

```ts
const body = submittedBody(call)
assert.equal(body.video_url, uploadedUrlsOfFirstAsset)
assert.deepEqual(body.reference_images, [url2, url3])
```

(with `uploadedUrls` from `fixtures.ts` and the queued-body accessors the file already
uses). Also assert one queue submit per request, and that a `videoField: null`
capability never reaches the video branch.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test packages/providers/src/flows.test.ts`
Expected: FAIL — adapters reject `'edit'` (`requestedMode`/`requestedVideoCapability`
return null today).

- [ ] **Step 3: Implement sunra `buildVideoRequest` edit support**

- `requestedMode`: accept `'edit'`.
- `VideoInputs` gains `sourceVideo?: string`.
- `modeInputs` edit branch:
  `{ ...inputs, sourceVideo: urls[0], references: urls.slice(1, 1 + capability.maxImages) }`.
- In `capabilityBody`: before `applyImages`, write
  `if (capability.videoField && inputs.sourceVideo) body[capability.videoField] = inputs.sourceVideo`.
  `applyImages` then handles references exactly as in `'references'` mode.

- [ ] **Step 4: Implement fal edit support**

- `requestedVideoCapability`: accept `'edit'`.
- After `imageBody(capability, urls)` (or inline, matching file style): when
  `capability.videoField` is set, `body[capability.videoField] = urls[0]` and pass
  `urls.slice(1)` to the reference-field logic. Keep
  `applyRequiredDefaults`/`conformBody`/`missingRequired` untouched.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec tsx --test packages/providers/src/flows.test.ts && pnpm --filter @sunnygen/providers test`
Expected: PASS.

- [ ] **Step 6: Verify the package**

Run: `pnpm --filter @sunnygen/providers typecheck` (or `pnpm typecheck`)
Expected: clean.

- [ ] **Step 7: Report**

No commit. Report: body shapes asserted per provider, test output.

### Task 3: Server catalog + wall and library kind filters

**Files:**

- Modify: `apps/web/src/server/model-catalog.stale.ts:3` (`CATALOG_VERSION`)
- Modify: `apps/web/src/server/library.functions.ts` (`loadGenerationWall`,
  `loadReferenceLibrary`)
- Modify: `apps/web/src/server/generation.server.ts` (error copy only)
- Test: `apps/web/src/server/model-catalog.stale.test.ts` (no change expected; verify)

**Interfaces:**

- Consumes (from Task 1): `VideoModes` may now contain `'edit'`.
- Produces:
  - `CATALOG_VERSION = 4` — existing installs resync and dynamic models gain edit modes.
  - `loadGenerationWall` accepts `createServerFn` input `{ kind: 'all' | 'video' }`
    (default `'all'`); home's existing no-arg calls keep working and return everything.
  - `loadReferenceLibrary` accepts input `{ kind: 'image' | 'video' }` (default
    `'image'`); kind `'video'` returns an empty avatar list and video assets only.

- [ ] **Step 1: Bump the catalog version**

`CATALOG_VERSION = 4` in `apps/web/src/server/model-catalog.stale.ts`.

- [ ] **Step 2: Verify the stale test still passes**

Run: `pnpm exec tsx --test apps/web/src/server/model-catalog.stale.test.ts`
Expected: PASS (test uses `CATALOG_VERSION` symbolically).

- [ ] **Step 3: Add the kind filter to `loadGenerationWall`**

Add `.validator(z.object({ kind: z.enum(['all', 'video']).default('all') }))` and pass
`kind: data.kind === 'all' ? undefined : data.kind` into each of the four
`listGenerations` status calls (`packages/db` already filters by kind — see
`loadGallery`). Leave `videoCatalogCapabilities` alone: its
`keys.some((key) => key !== 'text')` and maxImages spread already cover `'edit'`.

- [ ] **Step 4: Add the kind filter to `loadReferenceLibrary`**

Add a validator `{ kind: z.enum(['image', 'video']).default('image') }`; when
`kind === 'video'`, skip the avatar block (return `avatars: []`) and call `listAssets`
with `kind: 'video'`.

- [ ] **Step 5: Soften the input copy in `loadProviderAssets`**

`apps/web/src/server/generation.server.ts` — the missing-asset and missing-disk
errors say "Input image(s)"; change to "input(s)" so video targets read correctly.
No behavior change.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm exec tsx --test apps/web/src/server/model-capabilities.test.ts apps/web/src/server/model-catalog.stale.test.ts`
Expected: clean + PASS.

- [ ] **Step 7: Report**

No commit. Report: the new server-fn signatures (call sites in Task 4 depend on them).

### Task 4: Edit job helpers, edit-only guard, video-capable picker

**Files:**

- Modify: `apps/web/src/lib/reference-images.ts` (`ReferenceItem.kind`)
- Modify: `apps/web/src/lib/video-flow.ts` (`videoEditOnly`)
- Modify: `apps/web/src/components/model-combobox.tsx` (`ModelOption.editOnly?: boolean`)
- Modify: `apps/web/src/lib/use-model-choices.ts` (`editOnly` on `ModelOption`)
- Modify: `apps/web/src/components/home/reference-picker.tsx` (video kind)
- Create: `apps/web/src/lib/video-edit.ts` + `apps/web/src/lib/video-edit.test.ts`

**Interfaces:**

- Consumes (from Task 1): `VideoModelDefinition`, `videoModeKeys`.
- Consumes (from Task 3): `loadReferenceLibrary({ data: { kind } })`.
- Produces (exact, Task 5 builds on them):
  - `ReferenceItem.kind?: 'image' | 'video'`.
  - `videoEditOnly(model: VideoModelDefinition): boolean` — true when the model's
    video modes are exactly `['edit']`.
  - `videoEditJobs(input: { targets: ReferenceItem[]; references: ReferenceItem[];
    prompt: string; model: VideoModelDefinition }): { error: string | null; jobs:
    Array<{ prompt: string; assetIds: string[] }> }` — one job per target; per job
    `assetIds = [target.id, ...flattenReferenceAssets(references, model.id)]`;
    `prompt = withIdentityClause(prompt.trim(), referenceIdentity(references),
    model.id)`. Errors: `'Add a target video to edit.'` when targets are empty;
    `'Describe the change, or add a reference image.'` when the prompt is blank and
    references are empty.
  - `ReferencePicker` prop `kind: 'image' | 'video'` (default `'image'`) — video mode
    lists only video assets, renders video tiles, uploads `video/*`, hides avatars.
  - `ModelOption.editOnly?: boolean`, populated by `useModelChoices` via
    `videoEditOnly`.

- [ ] **Step 1: Write the failing tests for `videoEditJobs` and `videoEditOnly`**

`apps/web/src/lib/video-edit.test.ts`, following the style of
`apps/web/src/lib/edit-prompt.test.ts`:

```ts
test('one job per target video, target asset first', () => {
  const { error, jobs } = videoEditJobs({
    targets: [
      { id: 'v1', name: 'a', url: 'u1', kind: 'video' },
      { id: 'v2', name: 'b', url: 'u2', kind: 'video' },
    ],
    references: [{ id: 'r1', name: 'r', url: 'u3' }],
    prompt: 'swap the outfit',
    model: EDIT_MODEL,
  })
  assert.equal(error, null)
  assert.deepEqual(
    jobs.map((job) => job.assetIds),
    [
      ['v1', 'r1'],
      ['v2', 'r1'],
    ],
  )
})

test('blank prompt without references is rejected before any submit', () => {
  const { error, jobs } = videoEditJobs({
    targets: [{ id: 'v1', name: 'a', url: 'u1', kind: 'video' }],
    references: [],
    prompt: '   ',
    model: EDIT_MODEL,
  })
  assert.equal(error, 'Describe the change, or add a reference image.')
  assert.deepEqual(jobs, [])
})

test('no targets is rejected', () => {
  /* error === 'Add a target video to edit.' */
})

test('videoEditOnly is true only for edit-only models', () => {
  assert.equal(videoEditOnly(EDIT_ONLY_MODEL), true)
  assert.equal(videoEditOnly(TEXT_AND_EDIT_MODEL), false)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test apps/web/src/lib/video-edit.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the lib helpers**

`apps/web/src/lib/video-edit.ts` with the exact signatures above, importing
`flattenReferenceAssets`, `referenceIdentity`, `withIdentityClause` from
`~/lib/avatar-references`. `videoEditOnly` lives in `apps/web/src/lib/video-flow.ts`
using `videoModeKeys` from `@sunnygen/core`. Add `kind?: 'image' | 'video'` to
`ReferenceItem`; thread it from `assetItem()` in the picker. Add `editOnly?: boolean`
to `ModelOption` and compute it in `useModelChoices` via `videoEditOnly` for video
definitions.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsx --test apps/web/src/lib/video-edit.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend the ReferencePicker for videos**

Add prop `kind: 'image' | 'video' = 'image'`. Video mode: tab groups filter
`asset.kind === 'video'` (uploads, assets, cobalt; avatars group empty and hidden),
tiles render `<video muted preload="metadata">`, the upload input accepts `video/*`,
and only assets of the picker's kind are added. Library fetch becomes
`loadReferenceLibrary({ data: { kind } })`. Image mode behaves exactly as today.

- [ ] **Step 6: Verify and report**

Run: `pnpm exec tsx --test apps/web/src/lib/video-edit.test.ts && pnpm typecheck`
Expected: PASS, clean. No commit. Report the exact signatures shipped (Task 5 builds
on them).

### Task 5: VideoComposer and the rebuilt Video tab

**Files:**

- Create: `apps/web/src/components/video/composer.tsx`
- Modify: `apps/web/src/routes/video.tsx` (rebuild)
- Modify: `apps/web/src/components/home/composer.tsx` (generate-list filter, one line)

**Interfaces:**

- Consumes (from Task 1): `VIDEO_MODE_LABELS['Video edit']`, edit capabilities,
  `videoModeDefinition`, `reconcileVideoParams`, `videoModesFor`,
  `availableVideoModes`, `videoModeSlots`.
- Consumes (from Task 3): `loadGenerationWall({ data: { kind: 'video' } })`.
- Consumes (from Task 4): `ReferencePicker` `kind` prop, `ReferenceItem.kind`,
  `ModelOption.editOnly`, `videoEditJobs`, `videoEditOnly`.
- Produces:
  - `VideoComposer`: props `{ onPickerOpenChange?: (open: boolean) => void }`,
    rendered fixed at the bottom, Generate | Edit toggle like home's.
  - Route `/video`: sticky search bar, video wall, `VideoComposer`, `WallModal`.

- [ ] **Step 1: Build the VideoComposer**

New `apps/web/src/components/video/composer.tsx`, modeled on
`apps/web/src/components/home/composer.tsx` (same visual system: mode toggle pill,
SelectionBox rows, expand/minimize, ResizeImagesDialog for image references):

- Model base: `videoDefinitions(sortModelChoices(choices, catalogOnly))`.
- **Generate mode**: model list = video models with at least one generate mode
  (`videoModesFor` over `text`/`image`/`frames`/`references`; edit-only models
  excluded via `editOnly`). Flow-mode pills from
  `availableVideoModes(models).filter((mode) => mode !== 'edit')` labeled with
  `VIDEO_MODE_LABELS`. References row (images) with slot count
  `videoModeSlots(models, mode)` and slot labels as in the old InputsStep
  (Start frame / End frame / Reference N). Duration/resolution/audio selectors from
  `videoModeDefinition(model, mode)`. Submit: one job,
  `submitGeneration({ data: { kind: 'video', model: model.id, prompt, assetIds,
  params: { videoMode: mode, durationSeconds, resolution, aspectRatio, sound } } })`.
- **Edit mode**: model list = `videoModesFor(models, 'edit')`. Targets row →
  `ReferencePicker` with `kind="video"` (multiple targets allowed, cap 6). References
  row → existing image picker with avatars allowed, max =
  `videoModeCapability(model, 'edit')?.maxImages ?? 0`. Same selector row derived from
  `videoModeDefinition(model, 'edit')` (hidden when a list is empty). Submit: run
  `videoEditJobs`; on error show it; on success create a batch folder via
  `createFolderFn` when `jobs.length > 1` (same name format as home), then one
  `submitGeneration` per job with `kind: 'video'`, `params.videoMode: 'edit'`, and
  `folderId`. Invalidate `['video-wall']`, `['home-generations']`, `['gallery']`.
- Mode switching picks the first available model of that mode (same reconcile pattern
  as the old video tab's `chooseMode`).

- [ ] **Step 2: Rebuild the `/video` route**

`apps/web/src/routes/video.tsx`, mirroring `apps/web/src/routes/index.tsx` structure:

- Loader + `useQuery` on `loadGenerationWall({ data: { kind: 'video' } })`, polling
  3s while any item is queued/running (identical refetchInterval logic to home).
- Sticky top bar: search (prompt/model/provider), render + active counts,
  `CleanupFailedButton` for failed videos.
- Wall: reuse `JobCard`, `OutputCard`, `GroupCard`, `WallModal` from
  `~/components/home/wall-cards` with the same entry-grouping logic home uses
  (folder groups, single-output entries, multi-output groups), scoped to video items.
- Bottom: `<VideoComposer onPickerOpenChange={setPickerOpen} />` and the picker-open
  polling pause, as home does.
- Delete `StepRail`, `ChoiceCard`, `InputsStep`, `GenerateStep`, `RecentStrip`, and
  the standalone preview dialog. Keep `ResizeImagesDialog` usage inside the composer.

- [ ] **Step 3: Guard the home generate list**

In `apps/web/src/components/home/composer.tsx`, the generate-mode model list becomes
`allChoices.filter((entry) => !entry.editOnly)` (one line; the edit list is image-only
and unchanged).

- [ ] **Step 4: Verify everything**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format`
Expected: all green, no lint findings, format clean.

- [ ] **Step 5: Report**

No commit. Report: files touched, test/verify output, and any deviation from this
plan with its reason.
