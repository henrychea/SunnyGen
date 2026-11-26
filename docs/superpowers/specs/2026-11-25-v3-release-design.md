# SunnyGen v3 release: dark theme, antislop audit, NSFW mode, video copy pipeline — design

Date: 2026-11-25
Status: draft, awaiting owner approval
Target version: 3.0.0 (current 2.1.0, see `packages/core/src/domain.ts`)

## Intent and why

SunnyGen ships one warm light theme, a UI that grew route by route without a full visual
audit, and a video tab that can generate and edit a clip but cannot copy one. v3 closes
those four gaps in one release train:

- A dark theme, because the app is used at night beside other creative tools that are all
  dark, and because `apps/web/src/styles.css` already funnels every colour through eight
  `@theme` tokens, so the work is mostly a second token set, not a rewrite.
- A full antislop audit of both themes, because the UI was built fast and nobody has
  checked contrast, tap targets, copy and comment hygiene against a written standard.
- An NSFW mode, because the owner's own generations are hidden from the app today while
  provider safety checkers are already off, which is the worst of both arrangements:
  filtering in neither layer, tagging in neither table.
- A video copy pipeline: extract frames from a source video, edit the frames, let a
  coding agent read them into a shot list, regenerate each shot with the existing
  start+end frame mode, concatenate the results. That turns a reference clip into a
  re-make in the user's own AI style rather than a prompt guess.

## Goals

- Dark theme with System / Light / Dark in Settings, no flash of the wrong theme, warm
  near-black palette, accent readable at WCAG AA.
- Every hardcoded colour in `apps/web/src` and every hardcoded shadow in `packages/ui`
  replaced by a token.
- One findings report at `docs/audits/2026-v3-antislop.md`, ranked, `file:line`, with
  each finding tied to a rule ID, then the fixes landed from it.
- NSFW mode as a stored setting that changes what the server returns and what providers
  are asked for, with its own theme variant and a short 😈 transition.
- A four-stage video copy pipeline on the Video tab that persists like any other job.
- `3.0.0` version bump across the eight places 2.1.0 touched, plus an update note.

## Non-goals

- No redesign of the light theme. Its values stay, except the ones the audit proves
  fail AA (`--color-warning` and the `text-ink/55` tier are already failing, see
  Constraints).
- No new providers, no new model catalog, no change to `CATALOG_VERSION`.
- No timeline, trim, mask, or keyframe curve editor. The 2026-11-23 spec listed those as
  non-goals and they stay non-goals; the copy pipeline is new scope beside them, not a
  reversal.
- No change to Assistant chat behaviour in NSFW mode (listed as an open question).
- No marketing site work. `site/` gets the dark treatment only if it is a token swap.
- No per-user accounts, sessions, or multi-tenant anything. One owner, one local database.
- No client-side NSFW blur, placeholder, or "click to reveal". Hidden means not sent.

## Anti-goals

- Do not hide NSFW assets with CSS, opacity, or a client-side filter. Safe mode must never
  receive the rows or the bytes.
- Do not fork components per theme. One component tree, tokens switch under it.
- Do not add a `dark:` Tailwind variant to individual elements. That is how a token
  system rots into per-element overrides.
- Do not put an agent CLI on the normal generation path. The copy pipeline calls it
  explicitly and nothing else does.
- Do not guess that ffmpeg or an agent CLI exists. Detect, then fail with the install
  command in the message.
- Do not fabricate the audit. Every finding cites a file and a line that exists.

## Constraints

Facts from the code as it stands on 2026-11-25:

- Theme tokens live in `apps/web/src/styles.css` under `@theme` (canvas `#FAF6EF`,
  surface `#FFFDF8`, ink `#2A1E17`, line `#E8DFD3`, accent `#A31621`, success `#2F7A4B`,
  warning `#A36A12`, error `#B3261E`). Nothing else defines colour.
- Tailwind v4 compiles utilities to `var(--color-*)`. Verified in a built bundle:
  `.bg-canvas{background-color:var(--color-canvas)}`, and the variables are emitted on
  `:root,:host`. A second block keyed on a `data-theme` attribute therefore re-themes
  the whole app without touching a component.
- There is not one `dark:` variant in `apps/web/src` or `packages/ui/src` today, so
  nothing competes with a token override.
- 8 hardcoded hex values exist in `apps/web/src/**/*.tsx` plus 1 in
  `apps/web/src/lib/workflow.ts`: `apps/web/src/routes/__root.tsx:25,28`,
  `apps/web/src/components/studio/library-grid.tsx:86`,
  `apps/web/src/components/generate-dialog.tsx:489`,
  `apps/web/src/components/canvas/nodes.tsx:403,568`,
  `apps/web/src/components/canvas/editor.tsx:61,500`,
  `apps/web/src/lib/workflow.ts:140`. `packages/ui/src` has 0 hex but 8 `rgba()` shadows, and
  `apps/web/src` has 16 more.
- `packages/ui/src/button.tsx:8` uses `text-white` on `bg-accent`, and
  `packages/ui/src/card.tsx`, `packages/ui/src/dialog.tsx`, `packages/ui/src/toast.tsx`,
  `packages/ui/src/dropdown-menu.tsx`, `packages/ui/src/selector.tsx` bake warm-ink
  `rgba()` shadows. 12 more `text-white` uses sit in `apps/web/src`.
- Contrast measured with the antislop contrast checker, not by eye. Light theme today:
  ink/canvas 15.04 (pass), accent/canvas 7.24 (pass), success/canvas 4.87 (pass),
  error/canvas 6.07 (pass), **warning/canvas 4.21 (fail at 4.5)**, **ink at 55% over
  canvas 3.64 (fail)**, **line/canvas 1.22 (fail for control borders, needs 3:1)**.
  `text-ink/55` is used in 27 places.
- `packages/db` hand-writes migrations: `packages/db/src/migrations.ts` holds
  `SCHEMA_VERSION = 4` and a `MIGRATIONS` string array, `database.ts` applies them by
  `PRAGMA user_version`. There is no `db:generate` script in this repo, so a schema
  change means a new array entry, a version bump, and an updated
  `packages/db/src/migrations.test.ts` (which asserts `MIGRATIONS.length`).
- Provider safety checkers are **already off unconditionally**:
  `packages/providers/src/fal/image.ts:155,193`,
  `packages/providers/src/sunra/image.ts:104`, and
  `packages/providers/src/models.ts:52,65`. Safe mode turning
  them back on is a behaviour fix, not a new feature.
- NSFW filtering points that must all agree: `listAssets` / `listGenerations`
  (`packages/db/src/repositories/`), `loadGenerationWall`, `loadGallery`, `loadAssets`,
  `loadMediaAssets`, `loadReferenceLibrary` (`apps/web/src/server/library.functions.ts`),
  and `openAssetFile` / `openAssetThumbFile` behind `apps/web/src/routes/api/media/$id.ts`.
- No ffmpeg or ffprobe call exists anywhere in the repo. `Dockerfile` builds a
  `node:24-slim` runtime that installs `ca-certificates` only, so a container has no
  ffmpeg until the image adds it. `compose.yaml` mounts one volume, `/data`.
- Agent CLIs are not wired. The only CLI integration is `codex-imagegen` behind
  `isCodexAvailable()` in `packages/providers/src/codex.ts:33`, which is the pattern to
  copy: spawn `--help`, resolve `false` on `error`, resolve on exit code.
- Start+end frame video generation already exists as video mode `'frames'`
  (`packages/core/src/video-modes.ts:1`), and both adapters map it to two image fields
  (`packages/providers/src/sunra/video.ts` `modeInputs`,
  `packages/providers/src/fal/video.ts` `imageBody`).
- `zod ^4.6.7` is already a dependency of `packages/core` and `apps/web`.
- Unit tests are `tsx --test` files beside the code (`*.test.ts`). CI runs
  `pnpm format:check`, `pnpm lint`, `pnpm test`, `pnpm build`; `pnpm typecheck` exists
  but is not in `.github/workflows/ci.yml`, so run it by hand.
- QA and screenshots use demo data only: `pnpm dev:demo` (port 8978, data under
  `~/.local/share/sunnygen-demo/data`, `.temp/demo-app`). Never the real
  `data/sunnygen.db`, never the Docker `sunnygen-prod` container.

## Approaches

### 1. Dark theme

1. **Attribute override of the token set (picked).** Keep `@theme` as the light default,
   add `html[data-theme='dark'] { … }` with the same eight names plus the new ones. The
   compiled utilities already read the variables, so every route, dialog, and card
   switches with zero component edits, and a third variant (NSFW) is one more block.
   The specificity matters: `html[data-theme='dark']` is (0,1,1) and beats the emitted
   `:root` (0,1,0), so the override wins without `!important`.
2. **Duplicate the stylesheet per theme** (a `dark.css` imported on toggle). Rejected:
   two sources of truth, half the app loads the wrong one during navigation, and any new
   token has to be added twice.
3. **Per-element `dark:` variants.** Rejected as an anti-goal: it produces 500 call-site
   edits and drifts immediately.

Theme mode is client state in `localStorage` (`sunnygen.theme`, `'system' | 'light' |
'dark'`). A server setting would force a loader on every route and SSR would still render
before the preference is known, so the flash stays. A 200-byte inline script in `<head>`
resolves the mode and sets `data-theme` before first paint; `prefers-color-scheme` is read
for `'system'` and a `matchMedia` listener keeps it live.

### 2. Antislop audit

1. **AFTER mode: report first, fixes second (picked).** The antislop core resolves to
   AFTER for this release: produce a numbered, ranked findings file, get approval per
   finding, then fix. It matches the release train (audit lands after the dark theme, so
   it sees both themes) and it keeps the fixes reviewable in batches instead of one
   unfalsifiable "cleanup" commit.
2. **DURING mode while building each feature.** Rejected for this release because the
   existing surface is already built, and DURING has no artefact to review.
3. **No audit, fix what looks wrong.** Rejected: no evidence, no ranking, no proof.

### 3. NSFW mode

1. **Stored mode + server-enforced flag + media-route gate (picked).** One settings key
   (`nsfw.enabled`) decides the mode server-side; a `nsfw` column on `assets` and
   `generations` decides visibility; the repositories filter by it unless the mode is on;
   `/api/media/$id` returns 404 for a hidden asset. Safe mode cannot leak a row or a byte,
   and the same server-side flag tells the adapters whether to ask providers to run their
   safety checker.
2. **Client-side blur or a CSS class.** Rejected as an anti-goal. The bytes still arrive.
3. **Separate tables or a separate media root for NSFW.** Rejected: doubles every query,
   breaks the single media gateway, and gains nothing a boolean column does not.
4. **Per-generation tag only, no asset tag.** Rejected: an edited frame or an uploaded
   reference is an asset with no generation, and it would show in Assets, pickers, and
   the media route.

### 4. Video copy pipeline

1. **Frames → edited keyframes → agent shot list → per-shot prompts → frames mode →
   ffmpeg concat (picked).** Every stage reuses something that already works: frames are
   ordinary media assets, edits are the existing image edit flow, the shot list is
   validated JSON, each shot is a normal `'frames'` mode generation, and concat is one
   ffmpeg call. It is resumable at every boundary.
2. **One whole-video img2img pass.** Rejected: no model exposes it, and it gives no
   per-shot control over motion or camera.
3. **Agent drives the provider directly** (agent writes and runs its own API calls).
   Rejected: loses the job table, the poller, retries, and cost accounting, and puts an
   unvalidated external process on the generation path.
4. **A timeline editor with per-shot trim.** Rejected: that is the 2026-11-23 non-goal
   coming back in through the side door. Shots are fixed-length clips joined in order.

## Design per feature

### 1. Dark theme

New tokens and values. Ratios below are computed against the surface or canvas named,
using `~/.claude/skills/antislop-human/contrast-check.py`.

| Token                       | Light (existing, except noted) | Dark (new) |
| --------------------------- | ------------------------------ | ---------- |
| `--color-canvas`            | `#FAF6EF`                      | `#17120F`  |
| `--color-surface`           | `#FFFDF8`                      | `#211A16`  |
| `--color-ink`               | `#2A1E17`                      | `#F4ECE1`  |
| `--color-line`              | `#E8DFD3`                      | `#4A3C34`  |
| `--color-line-strong` (new) | `#8F7E6B`                      | `#8A7364`  |
| `--color-accent`            | `#A31621`                      | `#E0695C`  |
| `--color-accent-ink` (new)  | `#FFFDF8`                      | `#17120F`  |
| `--color-success`           | `#2F7A4B`                      | `#5FBF84`  |
| `--color-warning`           | `#8C5A0C` (was `#A36A12`)      | `#E0A64A`  |
| `--color-error`             | `#B3261E`                      | `#F0786C`  |

Dark theme ratios: ink/canvas 15.87, ink/surface 14.65, accent/canvas 5.62,
accent/surface 5.18, accent-ink/accent 5.62, success 8.21, warning 8.61, error 6.73,
line-strong/canvas 4.17, line-strong/surface 3.85. Ink at 55% over canvas is 5.45, so the
27 `text-ink/55` call sites pass in dark without edits. Light theme after the two fixes:
warning/canvas 5.44, line-strong/canvas 3.63, line-strong/surface 3.85.

Two new tokens, each with a reason:

- `--color-line-strong`: `--color-line` is a hairline for dividers (1.22 light, 1.76
  dark). A control border is a non-text boundary and needs 3:1 (WCAG 1.4.11). Inputs,
  selectors, and checkbox outlines use `line-strong`; dividers keep `line`.
- `--color-accent-ink`: text on a filled accent button. `Button` uses `text-white` today,
  which is 2.83:1 on the dark accent and fails. Tying the label to the accent token fixes
  both themes and removes the last hardcoded white.

Mechanics:

- `apps/web/src/lib/theme.ts`: `THEME_STORAGE_KEY`, `type ThemeMode = 'system' | 'light'
  | 'dark'`, `resolveTheme(mode, systemPrefersDark): 'light' | 'dark'`,
  `readStoredTheme()`, `applyTheme()`, and the boot-script source as a template string.
  Pure functions only, so the resolution is unit-testable.
- `apps/web/src/routes/__root.tsx`: render the boot script inside `<head>` after
  `<HeadContent />` as `<script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />`.
  `RootComponent` already renders the whole `<html>` document, so the attribute is set
  before `<body>` paints.
- Settings gains a `ThemeCard` next to Studio and Local storage, with three segmented
  choices (System, Light, Dark) built from the existing `Selector` or plain buttons with
  `aria-pressed`. Changing it writes `localStorage` and calls `applyTheme`; no server
  round-trip, no reload.
- `__root.tsx` head meta: keep two `theme-color` entries, one per `prefers-color-scheme`,
  so the browser chrome matches a system-dark user before JS runs. `manifest.webmanifest`
  keeps one static `theme_color` (`#17120F` would fight light users; keep `#FAF6EF` and
  accept the mismatch on the installed-app splash, or regenerate icons later).
- Canvas: `apps/web/src/components/canvas/editor.tsx:61,500` and
  `apps/web/src/lib/workflow.ts:140` pass colours to
  React Flow as props, and CSS variables are not resolved there. Read them at runtime:
  `getComputedStyle(document.documentElement).getPropertyValue('--color-accent')` in a
  small `useThemeColors()` hook, and pass the resolved values.
  `apps/web/src/components/canvas/nodes.tsx:568`
  uses `bg-[#FFF8E7]`, which becomes a token (`bg-warning/10`) or a new `--color-note`.
- `packages/ui`: replace `text-white` with `text-accent-ink`, and the 8 `rgba()` shadows
  with `--shadow-menu`, `--shadow-dialog`, `--shadow-card`, `--shadow-toast`,
  `--shadow-primary` variables declared beside the tokens and overridden in dark. Warm
  ink shadows are invisible on `#17120F`, so the dark values use black at higher alpha.
- `accent-[#A31621]` on the native checkbox
  (`apps/web/src/components/generate-dialog.tsx:489`,
  `apps/web/src/components/canvas/nodes.tsx:403`) becomes `accent-accent`.

### 2. Full antislop audit

Mode: AFTER. One artefact, `docs/audits/2026-v3-antislop.md`, ranked HIGH (Hard Gate) to
LOW (Quality Locks), each row `file:line`, rule ID, one-line reason, and the smallest
fix. No fixes land until the owner picks row numbers.

Coverage:

- Every route in `apps/web/src/routes`: `index`, `images`, `video`, `canvas`, `gallery`,
  `studio`, `shoots`, `assets`, `chat`, `settings`, plus `__root` and the 404 component.
- Shared UI in `packages/ui/src` (17 modules) and `apps/web/src/components` (assistant,
  canvas, chat, home, studio, video, dialogs, pickers).
- Three widths per route: 375, 768, 1440, checked by narrowing the viewport, not by
  device list. Both themes. Demo data only.

Per-skill checks that feed the report:

- `antislop` core: the Delivery Gate, all four blocks, plus R-21/R-34 (both themes work),
  R-26/R-27 (no dead controls, empty/loading/error states), R-31 (a one-line reason per
  major decision).
- `antislop-ui`: glass/glow/shadow dose caps, radius consistency, background grid, icon
  relevance, motion purpose, decorative stripes and badges.
- `antislop-human`: every text pair through `contrast-check.py`, both themes, including
  the `/55`, `/65`, `/70` opacity tiers; non-text 3:1 for borders, focus rings, and status
  dots; keyboard pass with Tab/Enter/Escape and a visible focus ring; 200% zoom; the
  on-screen keyboard over the composer.
- `antislop-layoutmobile`: reflow states across the whole width range (not two
  breakpoints), no horizontal overflow, 44px tap targets, sticky bars not covering the
  composer, the mobile nav.
- `antislop-copywriting`: em dashes, buzzwords, empty claims, chatbot closers, fake
  specificity. The 404 and empty-state copy is the usual offender here.
- `antislop-code`: comment hygiene only, no code changes in the same pass.

The report also records the token-pair matrix (10 tokens x 2 themes x surface/canvas) and
the route-by-route state matrix (empty, loading, error, success) as tables, so a later
change can re-run the same thing.

### 3. NSFW mode

State:

- Setting `nsfw.enabled` in `settings` (`'true' | 'false'`, default absent = safe).
  Server functions `loadNsfwMode()` and `setNsfwMode({ data: { enabled } })` in
  `apps/web/src/server/settings.functions.ts`; `SettingsSnapshot` gains `nsfwEnabled`.
- Mode is global to the install, not per device. Per-device is an open question.

Server enforcement (the part that matters):

- Schema: `assets.nsfw INTEGER NOT NULL DEFAULT 0`, `generations.nsfw INTEGER NOT NULL
  DEFAULT 0`, plus `CREATE INDEX assets_nsfw ON assets(nsfw)`.
- `packages/db/src/repositories/assets.ts`: `ListAssetsFilter` gains `includeNsfw?: boolean`
  and `nsfwOnly?: boolean`; the WHERE clause adds `nsfw = 0` when `includeNsfw` is not
  true. Same shape in `packages/db/src/repositories/generations.ts`
  (`ListGenerationsFilter.includeNsfw`).
- `apps/web/src/server/library.functions.ts`: every read resolves the mode once
  (`readSetting('nsfw.enabled')`) and passes `includeNsfw: mode`. That covers
  `loadGenerationWall`, `loadGallery`, `loadAssets`, `loadMediaAssets`,
  `loadReferenceLibrary`. Safe mode returns no NSFW row, so no title, prompt, or URL
  reaches the client.
- `apps/web/src/routes/api/media/$id.ts`: `openAssetFile` and `openAssetThumbFile` take an
  `includeNsfw` flag; when the asset is NSFW and the mode is off, return the existing
  404 (`Not found`). Thumbs are refused the same way, or a 404 body leaks a preview.
- `packages/db/src/repositories/assets.ts` `CreateAssetInput` gains `nsfw?: boolean`;
  `storeBuffer` passes it through.
- Auto-tag: `submitGeneration` in `apps/web/src/server/generation.functions.ts` reads the
  mode and writes `nsfw: mode` on the generation row and on every stored output
  (`storeProviderOutputs`, `storeBuffer`). A generation made in safe mode is tagged 0 even
  if the provider returns something explicit.
- Manual: `setAssetNsfwFn({ id, nsfw })` server fn; the asset action bar in
  `apps/web/src/routes/assets.tsx` and the wall modal get a Tag NSFW / Remove tag item.
- Providers: `GenerationParams` gains `safetyCheckers?: 'on' | 'off'` (absent means `'on'`,
  so a legacy row keeps today's image behaviour). `generation.server.ts`
  sets it from the mode when it builds params. `packages/providers/src/fal/image.ts` (two
  spots), `packages/providers/src/sunra/image.ts`, and
  `packages/providers/src/models.ts` stop writing
  `enable_safety_checker = false` unconditionally and write
  `body.enable_safety_checker = request.params.safetyCheckers !== 'off'` only when the
  field exists in the schema. Video flows get the same branch where the schema documents
  the field. Providers whose schema has no such field are left alone; the mode cannot
  switch off what does not exist.

Presentation:

- Theme variant `html[data-theme='nsfw']` layered over the dark tokens: canvas `#1A0F0D`,
  surface `#241513`, ink `#F6E9E4`, line `#4A2C28`, line-strong `#8C6159`, accent
  `#FF6B5E` (6.72 on canvas, 6.31 on surface), accent-ink `#1A0F0D`, success `#5FBF84`,
  warning `#E0A64A`, error `#F0786C`. `data-theme` is `'nsfw'` only when the mode is on;
  the theme choice still decides the base, so `nsfw` implies the dark base.
- Transition: entering the mode plays a short 😈 sweep, roughly 700ms, a large devil glyph
  that crosses the viewport and settles into the mode pill. `useReducedMotion` from
  `motion/react` (the app already wraps everything in `MotionConfig reducedMotion="user"`)
  skips to a 120ms opacity change. Leaving the mode plays nothing.
- Badges: NSFW cards carry a badge using the existing `Badge` tone `error`, in both modes,
  because the owner needs to see what is tagged even when everything is visible.

### 4. Video copy pipeline

Stages, all server-side, all resumable:

**A. Extract.** `apps/web/src/server/video-copy.server.ts` plus a server-only ffmpeg
wrapper. Modes: scene change (`-vf select='gt(scene,0.3)'`), every N seconds
(`fps=1/10`), and an explicit timestamp list. Each frame is `storeBuffer({ kind: 'image',
source: 'generated', folderId })` so it is an ordinary asset with a thumbnail and a URL.
Hard cap of 24 frames per run, since stage D bills one video generation per shot. Guard
against a source that is not a video, a duration over 10 minutes, and a missing binary.
`ffmpeg -i` output is parsed for duration and frame size; a `-ss <t> -frames:v 1` call
extracts each requested frame.

**B. Edit.** No new code. The extracted frames open in the existing image edit composer,
avatars work as references, and each output is a normal asset. The copy panel offers a
"send these frames to Edit" action that prefills the composer with the frame assets in
order.

**C. Analyze.** `packages/providers/src/agents.ts`: `detectAgents()` probes `claude`,
`codex`, `omp`, `pi` with `--version` (spawn, `error` → false), caching the result for the
process. `runAgentShotList({ agent, prompt, durationSeconds })` spawns the chosen CLI with
a non-interactive argument set (`claude -p`, `codex exec`, `omp -p`, `pi -p`; exact flags
in the plan), reads stdout, strips code fences, and validates against the schema. One
retry with the parse error appended to the prompt, then a clear failure. Timeout 180s, no
shell, arguments as an array.

Output contract, `packages/core/src/video-shot-list.ts`, zod:

```ts
shots: [
  {
    start: number,
    end: number, // seconds, ascending, end > start
    subject: string,
    action: string,
    motion: string,
    camera: string,
    lighting: string,
    prompt: string, // prompt is the generation prompt
  },
]
```

Validated extra rules, so a bad answer fails instead of generating nonsense: at least 1,
at most 24 shots, `start` ascending, `end > start`, `end <= duration + 0.5`, no prompt
over 2000 characters, all strings non-empty after trim.

Stored: `video_copies` row (see Data/schema), status `extracted | analyzed | generating |
joining | done | failed`, `shots` as JSON, `agent`, `error`.

**D. Recreate.** For each shot: pick the start keyframe (the edited frame nearest `start`)
and the end keyframe (nearest `end`), pick a model that documents `'frames'` mode
(`videoModesFor(models, 'frames')`), and submit one `kind: 'video'` generation with
`params.videoMode: 'frames'` and `assetIds: [startId, endId]`. Prompt is
`shot.prompt` plus the copy's style clause. Generations are grouped under one folder
(`<source name> copy`). Then `ffmpeg -f concat -safe 0 -i list.txt -c copy` when the clips
share codec and size, and a re-encode fallback when they do not; the result is stored as a
new asset (`kind: 'video'`, `source: 'generated'`) and linked back to the copy row.
Progress is polled from the `jobs` table, one poller as today.

Jobs and persistence: shot generations are ordinary `generations` + `jobs` rows, so the
existing poller, webhook path, retries, wall, and cleanup all apply. The copy row tracks
the batch; it has no poller of its own.

UI: a `Copy` panel on the Video tab (`apps/web/src/routes/video.tsx`,
`apps/web/src/components/video/copy-panel.tsx`) opened from a button beside the
Generate | Edit toggle. Steps: pick a source video (video picker), choose extraction mode
and count, run, review frames, run analysis, review the shot table (editable prompt per
shot, remove a shot), then Recreate. The shot table is the only new editing surface, and
it edits prompts and shot membership, not timing.

Relationship to the 2026-11-23 spec: that design added reference-driven video edit and
declared trim, timeline, and masking out of scope. This pipeline adds no timeline and no
trim controls. It joins whole generated clips and treats the shot list as data it derived
from a reference, not as an editable timeline.

## Data/schema changes

- v3.1 dark theme: none. Theme mode is `localStorage` only.
- v3.2 audit: none. Docs only.
- v3.3 NSFW, migration 5 (`packages/db/src/migrations.ts`, `SCHEMA_VERSION = 5`):
  - `ALTER TABLE assets ADD COLUMN nsfw INTEGER NOT NULL DEFAULT 0;`
  - `ALTER TABLE generations ADD COLUMN nsfw INTEGER NOT NULL DEFAULT 0;`
  - `CREATE INDEX assets_nsfw ON assets(nsfw);`
  - Settings key `nsfw.enabled`, no table change.
- v3.4 video copy, migration 6 (`SCHEMA_VERSION = 6`):
  - `CREATE TABLE video_copies (id TEXT PRIMARY KEY, source_asset_id TEXT NOT NULL
    REFERENCES assets(id) ON DELETE CASCADE, status TEXT NOT NULL, agent TEXT, shots TEXT
    NOT NULL DEFAULT '[]', frame_asset_ids TEXT NOT NULL DEFAULT '[]', output_asset_id TEXT
    REFERENCES assets(id) ON DELETE SET NULL, error TEXT, folder_id TEXT REFERENCES
    folders(id) ON DELETE SET NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)
    STRICT;`
  - `CREATE INDEX video_copies_created ON video_copies(created_at DESC);`
  - `output_asset_id` makes the concat step idempotent: a second client that sees every
    shot finished cannot join the same clips twice.
  - Why a table and not `generations.params`: one copy owns N shot generations. A params
    blob would be duplicated across them, and deleting or reordering shots would mean
    rewriting generation rows.
- Core types touched: `AssetRecord.nsfw`, `GenerationRecord.nsfw`, `PublicAsset.nsfw`,
  `GenerationParams.safetyCheckers`, `VideoCopyRecord`, `VideoShotList`.
- Version bump (release, no schema): `package.json`, `apps/web/package.json`,
  `apps/cli/package.json`, `packages/core/package.json`, `packages/db/package.json`,
  `packages/providers/package.json`, `packages/ui/package.json`,
  `packages/core/src/domain.ts` (`APP_VERSION`), plus
  `updates/2026-11-25-v3.0.0.md` and its row in `updates/README.md`, following
  `git show f64a007 --stat`.

## Risks

- **Flash of the wrong theme.** Mitigated by the inline head script, but a slow bundle
  still paints with the light tokens if the script throws. Keep the script dependency-free
  and wrapped in `try/catch`.
- **Light theme regressions.** Overriding tokens under an attribute is safe; adding
  `line-strong` and changing `warning` is not free, because `border-line` appears in many
  controls. Fix inputs explicitly and verify both themes.
- **Tailwind opacity on dark.** `text-ink/55` compiles to `color-mix(in oklab, …)`. Values
  were computed for sRGB blending; verify a sample of tiers in the browser, not only in
  Python.
- **Canvas colours come from props, not CSS.** React Flow needs resolved values, so the
  hook must re-run on theme change or edges keep the old accent.
- **Provider checkers.** Turning checkers on in safe mode can start rejecting generations
  that used to pass. That is the intended behaviour, but it will look like a regression to
  the owner if the failure copy does not say "the provider's safety checker rejected this,
  turn on NSFW mode if you meant it".
- **NSFW leaks.** Every read path must pass `includeNsfw`, and the media route is the only
  place that streams bytes. One forgotten caller means a hidden asset in the Assets grid.
  A test must assert safe mode returns zero NSFW rows from each loader.
- **ffmpeg absent.** Dev machines may have it, the Docker image does not, and CI will not
  run it. Every entry point checks availability and names the fix.
- **Agent CLI absent in prod Docker.** Expected. The panel shows "not installed" and the
  manual path (paste a shot list JSON) stays available.
- **Agent cost and latency.** A 20-shot clip means 20 generations; the panel must show the
  count and estimated cost before submitting, and cap at 24.
- **Shot drift.** Shots cut at scene boundaries will not match the keyframes exactly. The
  frames mode interpolates; a jump is possible. No stabilisation in v3.
- **Concat failure.** Mixed codec, size, or fps breaks `-c copy`. Fall back to a re-encode
  and say which path ran.
- **Migration mistakes.** Two migrations land in one release; `migrations.test.ts` must
  build a v4 database, apply 5 and 6, and assert old rows survive with `nsfw = 0`.

## Open questions

1. [NSFW] PIN or lock on entering NSFW mode (a 4-digit code stored hashed), or no lock at
   all?
2. [NSFW] Mode state per device (localStorage) or global to the install (settings table)?
   The design above picks global because the filtering is server-side; per-device would
   need a device token on every request.
3. [NSFW] Does the Assistant chat get a mode? Options: no change, a separate NSFW system
   prompt, or a warning banner only.
4. [NSFW] Demo build (`pnpm dev:demo`): should NSFW mode exist there, be hidden, or be
   forced off so a shared demo cannot be put into adult mode?
5. [NSFW] Do NSFW generations need a separate folder for cleanup, or stay mixed in the
   wall?
6. [theme] Per-device or synced theme choice (same trade-off as question 2, lower stakes).
7. [theme] Is `site/` in scope for the dark palette, or left light as marketing?
8. [copy] Which agent CLI is the default when more than one is installed?
9. [copy] Frame count default and cap: 12 is a good default, 24 the ceiling, per the risk
   above.
10. [copy] Should shot generations be retried automatically when one shot fails, or leave
    the batch paused for a manual retry?
11. [copy] Manual fallback: paste a shot list JSON when no agent CLI exists. Ship it in
    v3 or defer?

## Release order

1. **v3.1 dark theme.** Tokens, boot script, settings control, hardcoded colour and
   shadow cleanup. Lands first because the audit must see both themes.
2. **v3.2 full antislop audit.** Report against light and dark, then the approved fixes.
   Waits for v3.1.
3. **v3.3 NSFW mode.** Schema migration 5, server filtering, provider checker switch,
   theme variant, 😈 transition, manual tags.
4. **v3.4 video copy pipeline.** ffmpeg, agent CLIs, shot list schema, `video_copies`
   table (migration 6), copy panel, concat.
5. **3.0.0 release.** Version bump in the eight files listed above, update note, changelog
   row. Nothing else may land in this step.
