# Two 2x2 panels, a region grid on the sheet, and three boards per avatar

- Date: 2026-11-24
- Status: open, stacked on PR #24

## Summary

An avatar now has three images instead of one 4x4 panel: a reference sheet, a body panel and a
face panel. Each view gets a 2048 px cell instead of 1024. One button cuts every crop from the
default boxes — 2x2 quadrants on both panels, the fixed region boxes on the sheet — and composes
three boards: face and body as 4096 x 4096 2x2 grids, details as a 4095 x 2738 3x2 grid. Those
boards are what a model receives, in that order, with each board's tiles named by cell position
("top-left front, top-right three-quarter, …"). A tile that cuts something off is fixed by
Adjust, which gives that one role a freeform box anywhere in the image.

## Why

The 4x4 panel gave each view only 1024 px, so the renders came out blurry and full-body figures
overflowed their cell: the Full Body crop cut at the feet and the feet showed at the top of both
face crops. Splitting the body and the face into two 2x2 panels doubles each view's pixels, and
letting the owner drag the boxes fixes the overflow without regenerating anything. Sending three
merged boards instead of a handful of separate crops keeps the identity first and stops models
that only name two or three avatar references from dropping the body.

## What changed

- `packages/core/src/avatar-profile.ts`: `buildBodyPanelPrompt` and `buildFacePanelPrompt`
  replace the 4x4 panel prompt. Both state the 4096 canvas, the four 2048 px cells, the exact
  top-left box and the 96 px white margin, and name each cell. `buildReferenceSheetPrompt` keeps
  every section but replaces the free collage wording with fixed regions on a 4096 x 3072
  canvas — each section names its pixel box, and a switched-off section leaves its region empty
  white instead of moving its neighbours.
- `packages/core/src/avatar-regions.ts` (from PR #24, now used): region roles and their three
  sources, default boxes, `parseCropRegions` validation (inside the image, at least 256 px a
  side), `boardLayout` (grids on white: 2x2 for the face and body boards, 3x2 for details, 24 px
  gutters, inside 4096, tiles fitted into their cell and never enlarged), board tile order and
  `plannedBoardAssets`.
- `apps/web/src/server/avatar-crops.server.ts`: `saveAvatarRegions` validates the three images,
  cuts every region from the original with sharp without upscaling, composes the face, body and
  details boards, and stores `data.cropRegions` plus `data.boards`. `avatarRegionsDto` reports
  the three sources, the boxes, the boards, the legacy crops and a `legacy` flag.
  `assertSheetSize` enforces the sheet's 4096 long side.
- `apps/web/src/server/studio.functions.ts`: `loadAvatarRegionsFn` and `saveAvatarRegionsFn`.
  `saveStudioItemFn` now re-checks the sheet (long side) and the face panel (4096 square) when
  they change, not only the body panel.
- `apps/web/src/components/studio/avatar-sheet-uploads.tsx`, `avatar-wizard.tsx`,
  `import-avatar-dialog.tsx`: three upload slots — reference sheet, body panel, face panel — each
  with its own Copy prompt, and the Review step asks for all three. The Sheet step drops the
  view/expression/pose/detail counts; resolution stays.
- `apps/web/src/components/studio/avatar-crops-panel.tsx`: one line of copy, a Generate crops
  button (Regenerate once tiles exist) that is disabled with the reason until the sheet and both
  panels are 4K, the tile grid with role and pixel size, and the three boards underneath. Each
  tile has Adjust, and Reset once its box has moved off the default.
- `apps/web/src/components/studio/avatar-crop-adjuster.tsx` (new): one freeform box for one role
  on the image it came from. It moves and resizes anywhere inside the image, across cell lines,
  clamped to the edges and 256 px, and saving re-cuts that tile and rebuilds the boards.
- Any new image in a slot (including Swap panels) clears the derived data: `cropTiles`,
  `cropRegions`, `boards` and the legacy cells leave the form through
  `withoutDerived`/`dataForPanelChange`, and the server then deletes the tile and board files
  that avatar cut (`deleteDerivedAssets`) once no generation or other item references them.
  Uploaded originals (`source: 'upload'`) are never deleted.
- `apps/web/src/lib/avatar-references.ts`: references prefer boards — face, then body, then
  details, each slot naming its tiles ("face board: front, three-quarter, side profile,
  expressions"). A family that names fewer references takes the earlier boards, so qwen gets the
  face and body boards. Crops still drive avatars that have no boards.
- `apps/web/src/lib/edit-prompt.ts`: the body directive read the body board and asks for the
  bust, waist, hip, buttock and leg curves from its side profile tile. The qwen tier trimming is
  unchanged.
- Avatars saved before the split keep loading: no face panel means the `legacy` flag, the cell
  crops stay, and the editor says they are on the old single-panel layout until a face panel is
  uploaded.

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

Import an avatar with the sheet, the body panel and the face panel: the picker rejects a panel
under 4096 and a sheet under 4096 on its long side. Open Crops and press Generate crops: 13 tiles
appear with their sizes and the three boards below. Press Adjust on Side body, move the box up so
the feet are inside it, save, and the body board rebuilds with the corrected tile. Submit an edit with nano-banana and read the prompt: the face,
body and details boards are named in that order with their tiles, and the body sentence asks for
the curves from the side profile tile.

## Limits

- No provider run is exercised: the boards, their sizes and the prompt text are covered by unit
  tests, but no model has been asked to render from them yet.
- The region editor has no automated test. Dragging, clamping and the save round trip were only
  reasoned through; the validation rules and the board math do have tests.
- Old avatars stay on the legacy cell crops until the owner uploads a face panel; there is no
  migration that cuts the old 4x4 panel into the two new ones.
- The sheet's fixed regions assume a 4096 x 3072 canvas. A sheet from another aspect still works
  because the boxes are validated against the real image size, but the default boxes may not line
  up with what the sheet actually drew.
- `data.crops` (the legacy crops) are no longer written by the region path. They stay on the
  item so old avatars keep working, and they are not cleaned up.
