# Other merged work

- Date: 2026-11-22
- Status: merged, PR #14 (`08aa300`) and PR #15 (`5954c51`)

## Per-garment angle views and seven shot angles (PR #14)

### Summary

A garment can store photos from several angles, and each studio shot now sends the view
that best matches its camera angle instead of always sending the front.

### Why

Wardrobe pieces arrive as front, back, left, right, top and underside photos, but Studio only ever sent one
front reference. Every turned shot made the model invent seams, prints and lining it had never seen.

### What changed

- `STUDIO_ANGLES` in `packages/core/src/domain.ts` has seven values: front,
  three-quarter, left, right, back, top and under. The old `side` angle split into left
  and right.
- A garment keeps its front photo in `assetId` and `cleanAssetId` and stores the extra
  views in `data.views`. `parseGarmentViews` in `packages/core/src/studio.ts` reads both
  and returns one ordered list, so older garments keep working with no migration.
- The wardrobe dialog in `apps/web/src/components/studio/item-dialog.tsx` has a seven
  tile angle grid per garment. Library cards show the view count and prepare the views
  that are missing (`apps/web/src/components/studio/library-grid.tsx`).
- The prep prompt names the view, fills every un-prepped view, and saves after each one,
  so a later failure does not discard a paid generation.
- Shot planning picks the closest available view per garment through `pickGarmentView`
  and the `VIEW_PREFERENCE` table, for example left, then three-quarter, then front. The
  view goes into the reference list and the prompt names which view the image shows.
  `missingViewWarnings` reports a tagged garment with no view for the shot angle.
- Pack manifests accept a per-item `views: [{ angle, file, cleanFile? }]` field
  (`packages/core/src/packs.ts`). Invalid, duplicate and front entries are reported
  instead of imported, and `README.md` documents the field.

### How to verify

```sh
pnpm --filter @sunnygen/core test
pnpm --filter @sunnygen/web test
```

Open a garment, add back and left photos, then run front, back and left shots. The prompt
should name the matching view and the library card should show the view count.

### Limits

Views are garment-only; poses and scenes stay single-image. A shot uses one view per garment, not a multi-view
composite. Site copy in `scripts/site/pages.mjs` still says "1-4 angle lookbooks" and was left alone.

## Selector menu on small screens (PR #15)

### Summary

The shared Selector menu fits a phone viewport, and its search field is now opt-in behind a `Search` pill.

### Why

`ModelCombobox` asks for a 440 px minimum width, so on a 390 px screen the popup hung off the right edge.
It also opened with the search field focused, putting the keyboard over a list the user had not seen yet.

### What changed

- `packages/ui/src/selector.tsx` sets `minWidth` and `maxWidth` to
  `min(<prop>px, calc(100vw - 16px))`. The 440 px floor collapses to the screen width on
  mobile, and Base UI's shift keeps the popup inside the viewport. Desktop is unchanged
  while the viewport is wider than the floor.
- The popup opens on the rows with a `Search` pill in the chip row. Tapping it mounts and
  focuses the input; closing the popup or picking a row collapses it again. `initialFocus`
  targets the menu, not the input, and the input is 16 px below `sm` so iOS does not zoom.
- Enter only selects when the popup or the search field has focus. The chips handle their
  own Enter instead of also selecting whichever row is active.
- Filtering is unchanged: label, company, provider, source id, price and limitation, with
  the active provider filter still applied.

### How to verify

Run `pnpm test`, then open a model menu at 390 px wide. It should stay inside the viewport,
open on the list, and focus the field after one tap on `Search`. Escape closes the menu,
not the dialog.

### Limits

The mobile fit was verified from the CSS clamp and Base UI collision handling, not on a device or in a
browser before merge. Desktop behaviour changed: the menu no longer opens with the cursor in a search field,
and one tap on `Search` brings it back. When a menu is searchable and has no provider filters, the compact
toolbar row costs one line of vertical space.
