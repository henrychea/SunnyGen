# Video edits + home-style Video tab — design

Date: 2026-11-23
Status: builder-checked, awaiting partner approval

## Intent and why

SunnyGen edits images today: target images plus avatar references plus a prompt, from the
home composer. The same job is missing for videos. This adds a video edit flow — pick a
target video, attach avatar/reference images, describe the change, get an edited video
back — and rebuilds the Video tab on the home pattern: prompt composer at the bottom,
gallery wall above, Generate/Edit toggle. The Video tab is currently the odd page out
(a 3-step wizard with a thin "recent" strip); unifying it removes a whole navigation
pattern and makes the two create surfaces behave the same.

## Goals

- Video edit flow: target video(s) + reference images (avatars included) + prompt →
  edited video, submitted as a normal generation (`kind: 'video'`).
- Video tab rebuilt like home: bottom composer with Generate | Edit modes, video-only
  gallery wall above (job cards, groups, wall modal, search), polling while jobs run.
- Schema-driven discovery: any configured video model whose provider schema documents a
  video-input operation (source video + prompt, optional reference images) becomes
  editable at runtime. No per-endpoint hardcoding in web code.
- Video targets come from existing media (uploads, Cobalt imports, renders) or direct
  upload in the picker.
- Avatars keep working as edit references, identity clause included.

## Non-goals

- No timeline, trim, or masking UI. The app sends whole videos; providers decide scope.
- No change to Home: image edit stays as-is, video generate from the home composer stays
  as-is.
- No new providers.
- No LoRA path for video edit (video models take no LoRAs today).

## Anti-goals

- Do not hardcode provider-specific edit endpoints in web code.
- Do not regress the existing text / start-frame / start+end / references video modes or
  their tests. `'edit'` is additive and ordered last so existing defaults never change.

## Constraints

- TanStack Start file routes; server functions imported statically; provider calls stay
  server-side.
- Existing invariants to keep green: `packages/core/src/video-modes.test.ts` (shipped
  models document their modes), `packages/providers` flow fixtures, `pnpm typecheck`,
  `pnpm lint`, `pnpm format`, `pnpm test`.
- The provider upload pipeline is already video-safe: `normalizeAsset`
  (packages/providers/src/normalize.ts) passes non-image buffers through untouched, and
  both sunra and fal storage uploads send any mime type. Video target assets ride the
  existing `assetIds → loadProviderAssets → provider upload` path.
- Both dynamic catalogs (sunra `model-catalog.server.ts` line ~458, fal line ~667) run the
  same `classifyVideoModes`, so a classifier extension covers both providers at once.

## Approaches

1. **Schema-driven edit mode (picked).** Add `'edit'` to `VideoModeKey`; classify
   provider operations that require a video input field and take a prompt as edit mode;
   adapters build request bodies from the endpoint schema. Mirrors how image edit
   discovers `editSourceId` from operations and how video modes are classified today.
   Works with whatever edit endpoints the configured keys expose; zero UI changes when
   providers add models.
2. **Hand-wired endpoints.** Pick named endpoints (e.g. a Kling video editor) and
   hardcode request bodies. Rejected as the primary path: brittle, per-model upkeep,
   and it fights the dynamic-catalog pattern the app already runs on. Hand-written
   `videoModes.edit` entries for shipped static models remain allowed where a spec
   proves an endpoint — that is the existing `SUNRA_VIDEO_SPECS` pattern, not a new one.

## Design

### packages/core

`video-modes.ts`:

- `VIDEO_MODE_KEYS` gains `'edit'`, appended last so `bestVideoMode` and
  `defaultVideoMode` never change for existing models.
- `VIDEO_MODE_LABELS.edit = 'Video edit'`.
- `VideoModeCapability` gains `videoField: string | null` — the source-video request
  field for edit mode, `null` for every other mode.
- Classification: an operation classifies as `'edit'` only when it has all three — a
  prompt field, a required field from `VIDEO_INPUT_FIELDS` (string type), and a
  reference image field: array type from `VIDEO_REFERENCE_FIELDS`, or a single
  string-typed reference field (which yields `maxImages: 1`, covering face-swap-style
  endpoints). A fourth condition: every **required** field of the operation must be one
  SunnyGen can fill — the prompt field, the video field, the reference field, or a
  known optional parameter (the duration / resolution / ratio / audio field lists).
  This is the rule that keeps extend, upscale, and interpolation out: they carry
  prompts and video inputs but no reference images, so they keep today's behavior and
  stay invisible. It also keeps Kling's `motion-control` out: it requires `image_url`
  and `character_orientation` beside `video_url`, which the edit capability cannot
  fill; driving it would need adapter-side field synthesis, a future extension.
  Prompt-only video-input restyle endpoints stay skipped too — the feature is
  reference-driven, matching image edit. Audio-input operations and drafts remain
  skipped as today.
- Edit capability shape: `videoField` = the matched video input field; reference image
  fields detected with the existing `VIDEO_REFERENCE_FIELDS` logic (array) or a single
  string-typed reference field; `fields` / `fieldsMode` describe the references (same
  semantics as `'references'` mode); `maxImages` from the reference field's maxItems
  (1 for a single string field).
- `models.ts`: `videoModeDefinition` narrows limits for edit like other modes; shipped
  `VIDEO_MODELS` gain `videoModes.edit` only where a real endpoint is documented.
- `bestVideoMode` skips `'edit'`: a model's default mode is always a generate mode. An
  edit-only model (dynamic catalog models whose only operation is video + references)
  has no default generate mode — it must never be submitted from a generate-mode
  context, or the adapter would write an image URL into the video field.

### packages/providers

- sunra `video.ts`: `requestedMode` accepts `'edit'`; `VideoInputs` gains
  `sourceVideo?`; `modeInputs` maps edit to `sourceVideo: urls[0]`, references from
  `urls.slice(1)`; body building writes `body[capability.videoField] = sourceVideo`
  then references through the existing array/single-field logic. Capability path
  resolution and schema conformance unchanged.
- fal `video.ts`: `requestedVideoCapability` accepts `'edit'`; the body builder gains
  the same video-field branch; `applyRequiredDefaults` + `conformBody` keep guarding
  required fields.
- Fixtures for an edit operation schema (`video_url` + `reference_images` + `prompt`)
  in both providers' flow tests.

### apps/web/src/server

- `generation.server.ts`: no structural change. `loadProviderAssets` already passes
  videos through (sharp only fits images); soften "image" wording in its error copy.
- `model-catalog.server.ts`: `videoCatalogCapabilities` treats `'edit'` as an
  asset-taking mode (`supportsImages` true, `maxImages` from the edit capability).
  A video model with **no** generate mode (edit-only) is excluded from generate-mode
  model lists at the shared choices layer, so Home's Generate list and the Video
  composer's Generate list never show it; the Video composer's Edit list does. Bump
  `CATALOG_VERSION` so existing installs resync and dynamic models gain their edit
  modes.
- `library.functions.ts`: `loadGenerationWall` gains an optional `kind` filter
  (`'all' | 'video'`); home keeps `'all'`, the video tab requests `'video'`.
- `generation.functions.ts` / `domain.ts`: `params.videoMode` is a passthrough string —
  verify nothing narrows it against `VIDEO_MODE_KEYS` before `'edit'` reaches the
  adapter.

### apps/web/src (UI)

**Video tab (`routes/video.tsx`) — rebuilt on the home pattern:**

- Sticky top bar: search, render/active counts, failed cleanup — home's shape, scoped
  to videos.
- Wall: reuse `~/components/home/wall-cards` (JobCard, OutputCard, GroupCard, WallModal)
  fed by `loadGenerationWall({ kind: 'video' })`; poll at 3s while queued/running, same
  as home.
- `VideoComposer` (new `~/components/video/composer.tsx`, modeled on HomeComposer):
  - Mode toggle Generate | Edit, same visuals as home's Sparkles/Replace toggle.
  - Generate: References row (images through the existing picker) plus a compact
    flow-mode selector (Text / Start frame / Start + end / References, derived from the
    selected model's `videoModes`); duration, resolution, audio selectors as today;
    submits `videoMode` accordingly.
  - Edit: Targets row = videos, References row = images/avatars. Submitting fans out
    **one generation per target video** — the image-edit precedent — grouped in a
    batch folder when there is more than one; each job submits `kind: 'video'`,
    `videoMode: 'edit'`, assetIds ordered `[targetVideo, ...referenceImages]`
    (target first); avatar identity clause applied to the prompt. Never send several
    target videos in one provider request: adapters take exactly one source video.
  - Edit mode shows the same parameter row as Generate, derived from
    `videoModeDefinition(model, 'edit')` — duration / resolution / ratio / audio only
    where the mode documents them, hidden when empty; reuse `reconcileVideoParams`.
  - Model options filtered to video models; in Edit mode only models with a documented
    `videoModes.edit`.
- The wizard pieces (StepRail, ChoiceCard, InputsStep, GenerateStep, RecentStrip) and
  the standalone preview dialog are removed; the wall modal replaces the preview.

**ReferencePicker (`~/components/home/reference-picker.tsx`):**

- Gains `kind: 'image' | 'video'` (default `'image'`). Video mode: tiles render
  `<video muted preload="metadata">`, upload input accepts `video/*`, tab groups filter
  to video assets (uploads, assets, cobalt; avatars hidden), and `ReferenceItem` gains
  `kind?: 'image' | 'video'` so composers can validate targets. The picker's library
  fetch extends `loadReferenceLibrary` with a `kind` parameter (it lists only
  `kind: 'image'` today) so video targets list uploads, renders, and Cobalt imports.

## Tests

- core: edit classification — video + prompt + reference array → edit; video + prompt
  with only a single string reference field → edit with `maxImages: 1`; extend /
  interpolation / upscale / prompt-only video-input operations stay skipped;
  `bestVideoMode` never returns `'edit'`; shipped-models invariant updated so an edit
  mode with `fields: []`-equivalent reference shape stays valid.
- providers: sunra and fal edit body fixtures — video first, references after, prompt
  limit respected, required defaults applied.
- web: edit submission ordering (one job per target video, target first), edit-only
  models excluded from generate-mode lists, picker kind filtering, wall kind filter.

## Left to the builder

- Exact reference-field names per live endpoint — resolved from schemas at runtime.
- Which shipped models actually expose edit endpoints — confirmed through the dynamic
  catalog at runtime; hand-written `videoModes.edit` only where a shipped spec proves
  one. Kling `motion-control` is a real edit-shaped endpoint but requires
  `image_url` + `character_orientation` beside `video_url`; driving it needs dual-input
  capability modeling and is out of scope for this change.
- Video edit prompt shaping: start with plain instruction + identity clause; per-model
  edit profiles only if a model proves to need them.
- Video file size ceiling for targets, if any provider documents one — surface as a
  picker-side validation only when a real limit is observed.
