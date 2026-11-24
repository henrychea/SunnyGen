# Studio previews, scene prep, and a Studio wall

- Date: 2026-11-24
- Status: open, PR #22

## Summary

Wardrobe and scene cards now open a full size preview instead of a 60px thumbnail: one
dialog with the prepared image, a thumbnail strip for every view, and an Original /
Prepared switch. Scenes gained the Prepare action garments already had, backed by a new
scene prompt that clears people and clutter and returns a clean background plate.
Generation references now use a scene's prepared plate when it has one. Studio renders
also stopped hiding in Gallery: the Studio page has a wall at the top that shows queued,
failed, and finished studio work, grouped by batch folder, refreshing every 3 seconds
while something is running, and opening in the existing lightbox with delete, delete
all and references.

## Why

Prep costs one image generation per view, but the only way to see what it produced was a
small cropped card thumbnail, so the owner could not judge a prepared garment or scene
before spending a shoot on it. Scenes had no prep at all, so a room photo with people or
a mannequin in it was fed straight into the shoot prompt. And every studio result landed
in Gallery in a new folder, which meant leaving Studio to find out whether an angle had
finished, and no way to tell a slow run from a failed one from inside the page where the
run was started.

## What changed

- `packages/core/src/studio.ts`: `scenePrepPrompt(name, notes)`, next to
  `garmentPrepPrompt`. It asks for a background plate of the location in image 1, removes
  people, mannequins and temporary clutter, keeps location, architecture, surfaces,
  lighting, shadows, perspective and camera angle unchanged, forbids adding or moving
  objects, and requires a photoreal result. Covered by a unit test in
  `packages/core/src/studio.test.ts`.
- `apps/web/src/server/studio.functions.ts`: `prepareSceneFn` mirrors `prepareGarmentFn`
  (same `studio.prepModel` setting and `nano-banana-2` fallback, same `submitGeneration`
  path, saved to the scene's `cleanAssetId` as soon as it lands, returns the DTO, 16:9).
  The submit and poll loop that both prepare functions need moved into one `prepImage`
  helper, and model validation into `prepModel`. Prep submits now stamp
  `origin: 'studio'` and `studioJob: 'garment-prep' | 'scene-prep'`; LoRA training stamps
  `origin: 'studio'` and `studioJob: 'lora-train'`.
- `apps/web/src/components/studio/preview-dialog.tsx`: new `StudioPreviewDialog`, a Base
  UI dialog through `DialogSurface`. Large `MediaCard`, `MediaThumbStrip` for views
  (garment angles, or the single scene view), Original / Prepared toggle that is disabled
  when nothing is prepared yet, a Prepare or Re-prep action in the header, and Esc /
  arrow-key switching. Unprepared items show their originals.
- `apps/web/src/components/studio/library-grid.tsx`: the card image is a Preview button
  for garments and scenes, scenes show the prepared plate as their thumbnail once one
  exists, and the Prepare button and Needs prep badge now cover scenes too. The badge
  skips the built-in scene, which has no upload and cannot be prepped.
- `apps/web/src/routes/studio.tsx`: one prepare mutation now serves garments and scenes,
  with success and error toasts, and the preview dialog is opened from card state.
- Scene references: `apps/web/src/components/studio/look-builder.tsx` reads
  `cleanAssetId ?? assetId` in the three places that decided which scene image a shoot
  uses: `sceneAssetId` (which drives `hasSceneImage`, the reference count and the prompt's
  scene index), `referenceIdsFor` (the actual reference list), and the `fitReferences`
  overflow check. Those are the only call sites that pick a scene asset for generation.
- `apps/web/src/server/library.functions.ts`: `loadGenerationWall` takes an optional
  `origin: 'all' | 'studio'` filter, defaulting to `all`, so Home and Video are unchanged.
- `apps/web/src/lib/wall-groups.ts`: grouping (folder batches, multi-output batches, job
  cards, status ordering) extracted from `routes/index.tsx` and `routes/video.tsx` into
  one helper, which both pages and the Studio wall now use. Covered by
  `apps/web/src/lib/wall-groups.test.ts`.
- `apps/web/src/components/studio/wall.tsx`: `StudioWall` renders the six newest entries
  in a bounded scroll area above the library, with a render / active / failed count and
  the existing `WallModal` for the lightbox. `routes/studio.tsx` loads the wall and folders
  in the route loader, polls every 3s while anything is queued or running, and the look
  builder and prepare mutation invalidate it so a new job shows up immediately.
- `apps/web/src/components/studio/look-builder.tsx`: angle submits stamp
  `origin: 'studio'` and `studioJob: 'angles'`.

## How to verify

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

By hand, against a throwaway copy of the demo database:

```sh
SUNNYGEN_DATA_DIR=<copy-of-demo-db-dir> PORT=8981 NITRO_PORT=8981 \
  pnpm --filter @sunnygen/web dev
```

Open Studio. The wall at the top lists recent renders, grouped by folder, with running and
failed job cards; clicking a batch opens the lightbox with delete, delete all and
references. On Wardrobe, click a garment card image: the dialog shows the prepared image,
the thumbnail strip switches views, the Original / Prepared toggle swaps between the
upload and the prepared asset, arrow keys switch views and Esc closes. On Scenes, an
unprepared scene shows Prepare with the Needs prep badge, a prepared one shows Re-prep and
opens with its plate. With a provider key set, Prepare should toast on success or on error.

## Limits

- No real provider call was made. Screenshots use a throwaway demo database with seeded
  studio generations and seeded prepared assets, so the prepare round trip, the angle run,
  and the polling while a real job is in flight were not exercised end to end.
- `origin` / `studioJob` live in the generation params JSON, not a column, so the wall
  filter runs in memory after the per-status limits. A studio wall that fills 30 running /
  30 queued / 20 failed / 80 finished slots per status is theoretical, but there is no
  index behind it.
- `studioJob` is recorded but not shown on cards yet; card labels stay prompt, model and
  provider.
- Home still shows every generation, studio ones included. The filter is opt-in per caller;
  nothing is hidden or shown twice on Home.
- After PR #21 the avatar sheet and panel are uploaded, not generated, so the wall only
  picks up angle runs, garment prep, scene prep and LoRA training. The avatar panel crop
  work does not appear there.
- The wall shows the six newest entries with the newest work first; older studio renders
  are still in Gallery.
- The built-in White studio scene has no uploaded image, so its card is empty and stretches
  to match its neighbours in the scenes grid.
- Delete all in the lightbox still uses `window.confirm`.
