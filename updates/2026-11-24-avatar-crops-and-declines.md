# Crops follow the panel, references are labelled for what they are, a decline is not a fault

- Date: 2026-11-24
- Status: open, PR #24

## Summary

Crops are now cut only from cells the owner picks, and the body gets a side-profile crop.
Saving an avatar with a new panel no longer cuts crops by itself: it clears the old crops and
the editor asks for cells. The crop grid comes from the panel, not from a hardcoded 4, so the
approved two-2x2-panel redesign only has to change the layout in one place. The rest of PR #24
stays: the panel/sheet labels, and a provider refusal is recorded as a declined, non-retryable
request instead of a transient fault.

## Why

On prod, avatar B1.1 had a 4096 x 4096 panel but `data.crops` was `[]`, and the edit built from
it labelled both the sheet and the panel "reference sheet". Automatic cropping was the wrong
answer twice over: `parseAvatarCrops([])` returns `[]`, so an empty stored list counted as
"already cropped", while a save that replaced the panel kept the crops cut from the old one. A
model refusal from fal came back as a raw 422 detail string on a normal, retryable failure.

Beyond that, the 4x4 panel gives each view only 1024 px and figures overflow their cell, so the
owner is replacing it with two 2x2 panels (body and face) each 2048 px per view. Crops therefore
have to be regions the owner can adjust, not fixed cells the server picks.

## What changed

- `apps/web/src/server/avatar-crops.server.ts`: `ensureAvatarCrops`, `existingCrops` and the
  default-cell cutter are gone. `saveAvatarCrops(item, cells)` validates the panel, cuts the
  chosen cell for every role with sharp and stores both `crops` and `cropCells`.
  `dataForPanelChange` now drops `crops` and `cropCells` when the save seals a different panel.
  `initialCropCells` returns the stored selection or the layout defaults.
- `apps/web/src/server/studio.functions.ts`: `saveStudioItemFn` no longer crops anything;
  `regenerateAvatarCropsFn` is replaced by `saveAvatarCropsFn({ avatarId, cells })`, which
  rejects any selection that does not name one in-grid cell per role. `loadAvatarCropsFn` now
  returns `cropCells` too.
- `apps/web/src/components/studio/avatar-crop-selector.tsx` (new): a role chip per crop and the
  panel as a clickable grid. Pick a role, click its cell, Save crops. The grid takes a
  `{ rows, columns }` prop, so it is not tied to 4x4.
- `apps/web/src/components/studio/avatar-crops-panel.tsx`: shows the selector, keeps the saved
  crops large with role, size and cell, and drops the old Regenerate button.
  `avatar-wizard.tsx`: stays open after a panel-changing save, jumps to Review and asks for the
  cells; a newly saved avatar can pick them immediately through the returned id.
- `packages/core/src/avatar-references.ts`: `body-side` joins the crop roles with a default cell
  from the panel layout (row 0, column 1). `avatarCropPlan` puts it third, so 3-ref families name
  front face, front body and side profile and demote the three-quarter face to a supporting
  image; qwen keeps its two references. `parseAvatarCropCells` and `panelCellSize` take the grid
  as a parameter (default 4x4) instead of assuming four columns.
- `packages/core/src/avatar-regions.ts` (new, foundation for the two-panel redesign): the region
  roles and their three sources, default boxes from the approved layouts, validation (inside the
  image, at least 256 px a side), the three merged boards with their tile order, and
  `plannedBoardAssets` for the identity-first order. Not wired into the app yet.
- `apps/web/src/lib/avatar-references.ts`: `reference sheet` for the sheet and `4x4 panel` for
  the panel when an avatar has no crops, carried by `sheetAssetId`; `side profile` label.
- `packages/providers/src/http.ts`, `types.ts`, `fal/client.ts`, `sunra/client.ts`:
  `responseFailure` detects a model refusal, and a declined submit throws `DECLINED_FAILURE`
  (`invalid_request` / `declined` / not retryable) with the text "The model declined this request
  (no charge). Try a different target photo or model." The submit path now stores
  `errorCode`, `errorReason` and `errorRetryable`, so the card offers Copy prompt instead of
  Retry.

## How to verify

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

By hand, against a throwaway copy of the demo database:

```sh
SUNNYGEN_DATA_DIR=<copy-of-demo-db-dir> PORT=8979 NITRO_PORT=8979 \
  pnpm --filter @sunnygen/web dev
```

Edit an avatar with a 4096 panel, replace the panel and save: the editor stays on Review and
asks for cells, and the Crops section shows the panel grid with the four roles preselected.
Click a role, click a cell, Save crops: four crops appear, each labelled with its cell. Then
submit an edit the model refuses: the card reads "The model declined this request (no charge)…",
the badge shows `invalid_request · declined`, and the action is Copy prompt.

## Limits

- The two-2x2-panel redesign is not implemented yet: only its region model landed. The app still
  speaks 4x4 panels, and `avatar-regions.ts` is not wired into the selector, the server or the
  edit prompt.
- Regions are cells of one grid today. The approved design wants draggable boxes per role across
  three images; that replaces the cell selector.
- A refusal is recognised by its message prefix and `invalid_request` type. A differently worded
  refusal still surfaces as a plain provider error and stays retryable. The Sunra shape is
  unverified.
- Old avatars keep their stored crops. An avatar with no crops sends the whole sheet and the
  whole panel, with correct labels.
- Real provider runs are not exercised by tests; board composition, region dragging and the new
  prompts have no coverage until they exist.
