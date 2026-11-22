# Updates

Release notes for this repo, written for the owner. One dated file per shipped change,
newest first. Each note says what changed, why, how to verify it, and what still has
limits. These are working notes, not marketing copy.

| File                                                                                                         | Date       | Covers                                                                     |
| ------------------------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------- |
| [2026-11-22-avatar-profiles.md](2026-11-22-avatar-profiles.md)                                               | 2026-11-22 | PR #12: avatar profile schema, prompt builders, wizard, UI fixes           |
| [2026-11-22-avatar-crops.md](2026-11-22-avatar-crops.md)                                                     | 2026-11-22 | PR #13: second face crop read the back view, plus the crop backfill script |
| [2026-11-22-body-proportions-and-per-model-prompts.md](2026-11-22-body-proportions-and-per-model-prompts.md) | 2026-11-22 | PR #16: body transfer and per-model edit prompt profiles                   |
| [2026-11-22-other-merged-work.md](2026-11-22-other-merged-work.md)                                           | 2026-11-22 | PR #14 garment views and PR #15 selector menu on small screens             |

## Verification tools

Two scripts in the repo cover the prompt and crop work.

Prompt lab builds the exact edit prompt, ordered assets and params per model without
spending anything. It reads the database read-only.

```sh
SUNNYGEN_DATA_DIR=<data-dir> \
  pnpm --filter @sunnygen/web exec tsx scripts/prompt-lab.ts \
  --avatar <avatar-name> --target <asset-id-or-file> \
  --models sunra:nano-banana-pro,sunra:black-forest-labs/flux-3-image \
  --out .temp/prompt-lab
```

The offline run prints one line per model and writes `report.md` and `requests.json`.
Add `--live --yes` to print the catalog cost, run the real generations through the
existing adapters, and write an `index.html` contact sheet. Model keys must be in
`IMAGE_MODELS` or the synced provider catalog. Through `pnpm --filter`, `--out` is
relative to `apps/web`, so `.temp/prompt-lab` lands in `apps/web/.temp/prompt-lab`.

Crop backfill writes avatar crops for panels below the 1024 px crop floor. Run the dry
run first, then the same command without `--dry-run`. Re-runs skip stored crops unless
`--force` is passed.

```sh
pnpm --filter @sunnygen/web exec tsx scripts/backfill-avatar-crops.ts \
  --db <path-to-sunnygen.db> --dry-run
```

Media is written next to the database in `media/` by default; pass `--media <dir>` to
point somewhere else.
