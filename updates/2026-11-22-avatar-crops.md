# Avatar identity crops read the face row

- Date: 2026-11-22
- Status: merged, PR #13, merge commit `7fc2ed5`

## Summary

The second identity crop was read from row 0, column 1 of the 4x4 panel, which is the
back view in the panel contract. It now reads row 1, column 1. Prompts no longer label a
back view as "three-quarter face" and they send a second face again.

## Why

`buildPanelSheetPrompt` lays out four body angles in row 0 and four faces in row 1. The
cell map in `packages/core/src/avatar-references.ts` had `face-three-quarter` pointing
at row 0, column 1. Every edit prompt therefore described someone's back as the
three-quarter face and never included a second face reference.

## What changed

- `packages/core/src/avatar-references.ts`: `AVATAR_CROP_CELLS` now maps
  `face-three-quarter` to row 1, column 1. A comment above the map names the panel
  contract so the next edit does not drift again.
- `apps/web/scripts/backfill-avatar-crops.ts`: a new script that writes crops for
  avatars whose panels are below the 1024 px creation floor. It reads each avatar's
  panel, extracts the three cells, stores them on the item, and skips rows that already
  have crops. `--force` redoes them; `--dry-run` prints the cell sizes and changes
  nothing. Re-running without `--force` is idempotent.
- The app only creates crops when a cell is at least `PANEL_CROP_MIN_SIDE` (1024 px) in
  `apps/web/src/server/avatar-crops.server.ts`. Stored crops are used as-is, so the
  backfill can put older avatars on the crop path at native panel size without changing
  that floor.

## How to verify

```sh
pnpm --filter @sunnygen/core test

pnpm --filter @sunnygen/web exec tsx scripts/backfill-avatar-crops.ts \
  --db <path-to-sunnygen.db> --dry-run
```

The dry run prints each avatar, its panel and cell sizes, and whether crops already
exist. Run the same command without `--dry-run` to write them. Then check the roles:

```sh
sqlite3 <path-to-sunnygen.db> \
  "select name, json_array_length(json_extract(data,'$.crops')) from studio_items where kind='avatar';"
```

## Limits

- The crop role is still named `face-three-quarter`, but these panels contain a second
  frontal expression, not a true three-quarter angle. The role name was left alone so
  stored crops stay valid.
- Existing avatars already had crop data when the PR merged, so the code fix mainly
  matters for newly created avatars, which would otherwise keep receiving the back-view
  crop.
- The script has a 128 px minimum cell (`MIN_CELL`) so small panels still produce a
  usable but soft crop. A crop that small is a stopgap, not a quality fix.
- The dry run is the only safe first step on a live database. There is no separate
  preview file; the script writes media and item data when `--dry-run` is absent.
