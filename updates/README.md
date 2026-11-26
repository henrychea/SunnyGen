# Updates

Release notes for this repo, written for the owner. One dated file per shipped change,
newest first. Each note says what changed, why, how to verify it, and what still has
limits. These are working notes, not marketing copy.

| File                                                                                                         | Date       | Covers                                                                             |
| ------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------- |
| [2026-11-25-video-copy.md](2026-11-25-video-copy.md)                                                         | 2026-11-25 | v3.4: frame extraction, agent shot list, per shot recreate, joined clip            |
| [2026-11-25-v2.1.0.md](2026-11-25-v2.1.0.md)                                                                 | 2026-11-25 | v2.1.0 release: PRs #18 to #25, one section per area, and the upgrade notes        |
| [2026-11-25-avatar-panels.md](2026-11-25-avatar-panels.md)                                                   | 2026-11-25 | PR #25: three whole avatar images, no crops or boards, Sunra cache fix, LoRA split |
| [2026-11-24-home-today-shoots.md](2026-11-24-home-today-shoots.md)                                           | 2026-11-24 | PR #23: Today inbox, Home renamed to Images, and the shoot planner                 |
| [2026-11-24-studio-previews-wall.md](2026-11-24-studio-previews-wall.md)                                     | 2026-11-24 | PR #22: studio previews, scene prep, and the Studio generation wall                |
| [2026-11-24-avatar-wizard-uploads-toasts.md](2026-11-24-avatar-wizard-uploads-toasts.md)                     | 2026-11-24 | PR #21: avatar wizard uploads, named uploads, migration 4, toasts                  |
| [2026-11-24-lightbox-delete.md](2026-11-24-lightbox-delete.md)                                               | 2026-11-24 | PR #20: lightbox delete fix and Delete all                                         |
| [2026-11-23-avatar-edit-face-swap.md](2026-11-23-avatar-edit-face-swap.md)                                   | 2026-11-23 | PR #19: avatar edit prompts ask for the face swap                                  |
| [2026-11-23-video-edits.md](2026-11-23-video-edits.md)                                                       | 2026-11-23 | PR #18: reference-driven video edits, wall-first video tab                         |
| [2026-11-22-avatar-profiles.md](2026-11-22-avatar-profiles.md)                                               | 2026-11-22 | PR #12: avatar profile schema, prompt builders, wizard, UI fixes                   |
| [2026-11-22-avatar-crops.md](2026-11-22-avatar-crops.md)                                                     | 2026-11-22 | PR #13: second face crop read the back view, plus the crop backfill script         |
| [2026-11-22-body-proportions-and-per-model-prompts.md](2026-11-22-body-proportions-and-per-model-prompts.md) | 2026-11-22 | PR #16: body transfer and per-model edit prompt profiles                           |
| [2026-11-22-other-merged-work.md](2026-11-22-other-merged-work.md)                                           | 2026-11-22 | PR #14 garment views and PR #15 selector menu on small screens                     |

## Verification tools

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

Media is written next to the database in `media/` by default; pass `--media <dir>` to
point somewhere else.
