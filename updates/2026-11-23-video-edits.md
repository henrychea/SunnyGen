# Video edits, and a video tab that works like Home

- Date: 2026-11-23
- Status: open, PR pending

## Summary

The Video tab now has a video-only wall on top and a fixed Generate | Edit composer
below it, the same shape as Home. Edit mode takes one or more target videos, an optional
set of image or avatar references and a prompt, then submits one generation per target
and files the batch in a folder. Edit is a new video mode, discovered from provider
schemas: an endpoint that requires a video field and also accepts a prompt plus a
reference field is offered as editable. Sunra and fal both send the target video in that
required field and put the reference images after it.

## Why

The old Video tab was a three step wizard (references, inputs, generate) above a recent
strip, with no way to change a shot that already existed. Providers already publish
video-to-video endpoints, but `operationVideoModes` threw away any operation with a
required video input, so the app could not represent them at all. Meanwhile the wall,
search, failed-cleanup and folder grouping already existed on Home; the Video page kept
its own list, its own preview dialog and its own polling.

## What changed

- `packages/core/src/video-modes.ts`: `VIDEO_MODE_KEYS` gains `'edit'`, with the label
  "Video edit". `VideoModeCapability` gains `videoField`, the required string field the
  adapter writes the target video into. `operationVideoModes` now classifies a video
  input operation as edit when it has a required string video field, a reference field
  and a prompt, and skips it when any required field is one the adapter cannot fill.
  `bestVideoMode` never returns `edit`, so a model that can only edit is not preselected
  for Generate.
- `packages/core/src/models.ts`: the `videoMode` helper writes `videoField: null`. No
  shipped model hardcodes an edit mode; they come from the synced catalog.
- `packages/providers/src/sunra/video.ts`: `modeInputs` handles `edit` by taking the
  first asset as the source video and the rest as references, and `capabilityBody` writes
  the source video into `capability.videoField`.
- `packages/providers/src/fal/video.ts`: same split. The first URL goes into `videoField`
  and the remaining URLs go through `imageBody`.
- `apps/web/src/server/model-catalog.stale.ts`: `CATALOG_VERSION` is 4, so stored
  catalogs resync and pick up `videoField` instead of being read as having no edit mode.
- `apps/web/src/lib/video-edit.ts`: new `videoEditJobs`, a pure function that validates
  the submission and builds one job per target with the target asset first. Avatar
  references expand to their crops and add the identity clause, exactly as Generate does.
- `apps/web/src/lib/video-flow.ts`: new `videoEditOnly`, true when `edit` is a model's
  only mode.
- `apps/web/src/lib/use-model-choices.ts`: `ModelOption.editOnly` is set for video
  models, both supported and catalog only.
- `apps/web/src/components/video/composer.tsx`: the new composer. Generate keeps the old
  flow modes (start frame, start and end frame, references) with their slot labels and
  duration/resolution/audio selectors. Edit has a Targets row (video picker, capped at
  six) and a References row (images and avatars, capped by the model's schema). More than
  one job creates a batch folder first, folder creation failure does not block the
  submit, and the notice reports how many renders were queued.
- `apps/web/src/routes/video.tsx`: rebuilt. Loader plus `keepPreviousData` query on
  `loadGenerationWall({ data: { kind: 'video' } })`, three second polling while anything
  is queued or running, paused while the picker is open. Search, render and active
  counts, failed cleanup, folder grouping and the wall cards all come from
  `~/components/home/wall-cards`. The old wizard, recent strip and preview dialog are
  gone.
- `apps/web/src/server/library.functions.ts`: `loadGenerationWall` and
  `loadReferenceLibrary` take a `kind` filter. The wall filters generations by kind; the
  reference library returns video assets and no avatars when asked for video.
- `apps/web/src/components/home/reference-picker.tsx`: `kind` prop. It filters the library
  and its tabs, renders video tiles as inline `<video>` instead of a thumbnail, accepts
  `video/*` uploads, and keys the query by kind.
- `apps/web/src/components/home/wall-cards.tsx`: the collection modal counts and names
  its items from the mixed card kinds instead of always saying "images", and deleting a
  generation invalidates `['video-wall']`.
- `apps/web/src/server/generation.server.ts`: missing asset errors say "input" instead of
  "input image", since a target video can be the missing one.
- `docs/superpowers/specs/2026-11-23-video-edits-design.md` and
  `docs/superpowers/plans/2026-11-23-video-edits.md`: the design and the step plan.

Four smaller fixes landed on the same branch after the feature:

- `apps/web/src/components/video/composer.tsx`: the prompt field has a real label and
  takes its accessible name from it instead of relying on placeholder text, the slot
  chips no longer clip on a 48 px tile, muted labels met AA contrast, and the queued
  notice lost its em dash.
- `apps/web/src/routes/video.tsx`: a failed wall refresh keeps the cards on screen and
  offers a retry, instead of replacing the whole wall with an error panel. The fixed
  composer no longer covers the last card on a phone.

## How to verify

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

The new logic has its own tests:

```sh
pnpm --filter @sunnygen/web exec tsx --test src/lib/video-edit.test.ts
pnpm --filter @sunnygen/core exec tsx --test src/video-modes.test.ts
pnpm --filter @sunnygen/providers exec tsx --test src/flows.test.ts
```

`video-edit.test.ts` covers the target first ordering, the blank prompt and no target
rejections, avatar expansion and `videoEditOnly`. `video-modes.test.ts` covers edit
classification, the single string reference field, the operations that must stay
skipped, and `bestVideoMode`. `flows.test.ts` covers the Sunra and fal request bodies:
source video in the video field, references after it, prompt limit and required
defaults. `tsx --test` runs with the package as its working directory, so the path is
relative to `apps/web`, `packages/core` or `packages/providers`.

To check by hand, start the app with `./sunnygen`, open `/video`, and pick Edit. Upload
or select a target video, add an avatar or an image as a reference, describe the change
and submit. With several targets the wall should show one group card per batch and the
renders should appear as they finish.

Fresh clones and existing installs both need a catalog sync before Edit has anything in
it, because no edit mode is hand written. The version bump does that on the next catalog
refresh; if Edit lists no model, check the provider keys and the catalog sync in
settings.

## Limits

- Edit only exists where a synced provider schema proves it. Nothing in `models.ts`
  declares one, so an offline or never synced install shows an empty Edit tab.
- Operations that require a field the adapter cannot fill are not offered. Kling
  `motion-control` is a real edit shaped endpoint, but it needs `image_url` and
  `character_orientation` beside `video_url`, so it stays skipped. Extend, interpolate,
  upscale and other prompt-plus-video endpoints are skipped too, because they have no
  reference field.
- The composer caps a submit at six target videos. Each target is its own paid
  generation and there is no combined cost preview, only the per model price in the
  combobox.
- The edit prompt is a plain instruction plus the avatar identity clause. There are no
  per-model edit prompt profiles for video the way there are for image edits.
- Edit reference slots come from the schema's `maxItems`, and fall back to one slot when
  the field does not state a limit. A provider with a smaller hard limit would be found
  at submit time, not in the picker.
- Target video size, length and codec are not validated in the picker. A provider's own
  rejection is the first thing that reports an unusable target.
- The video wall and the Home wall are separate queries. A video deleted from one page
  disappears from the other only after its own query refetches.
