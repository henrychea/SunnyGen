# NSFW visibility coverage (v3.3)

Every function that reads `assets` or `generations` in this worktree, and how it is filtered.
Default is **hidden**: a read returns `nsfw = 1` rows only when the caller passes
`includeNsfw`, and the only sources for that value are the `sunnygen.nsfw` cookie or a job row
the server already owns.

## Repository layer (`packages/db`)

| Function                                                                 | Filter                          | Who passes what                                                                                                                                                             |
| ------------------------------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getAsset(id, { includeNsfw })`                                          | `AND (? = 1 OR nsfw = 0)`       | Media gate passes the cookie; the pipeline, cleanup and size checks pass `true`                                                                                             |
| `getAssetsByIds(ids, { includeNsfw })`                                   | same, ids via `json_each(?)`    | Loaders pass the cookie; `loadProviderAssets`, derived-asset cleanup pass `true`                                                                                            |
| `findAssetBySha256(sha256, nsfw)`                                        | matches the row's own class     | Upload/storage dedupe: a safe upload never reuses an NSFW row, and the reverse                                                                                              |
| `listAssets(filter)`                                                     | `nsfw = 0` unless `includeNsfw` | `loadAssets`, `loadMediaAssets`, `loadReferenceLibrary` pass the cookie                                                                                                     |
| `countAssets(filter)`                                                    | same                            | `loadDashboard` passes the cookie                                                                                                                                           |
| `getGeneration(id, { includeNsfw })`                                     | `AND (? = 1 OR nsfw = 0)`       | `getGenerationView`, `cancelGeneration`, `setGenerationReview` pass the cookie; poller and webhook pass `true`                                                              |
| `listGenerations(filter)`                                                | `nsfw = 0` unless `includeNsfw` | `loadGenerationWall`, `loadGallery`, `loadFailedGenerations`, `loadDashboard`, `loadToday`, `loadLoraRuns` pass the cookie; poller recovery and derived cleanup pass `true` |
| `countGenerations(filter)`                                               | same                            | `loadDashboard` passes the cookie                                                                                                                                           |
| `findGenerationByProviderJob` / `findGenerationByProviderRequest`        | unfiltered by design            | Webhook/poller plumbing, keyed by a provider id the server issued                                                                                                           |
| `listPendingGenerations`                                                 | unfiltered by design            | Poller restart: a job must finish whatever mode made it                                                                                                                     |
| `listStudioItems` / `getStudioItem` / `countStudioItems`                 | no column to filter             | `studio_items` has no flag; the studio loader hides an item whose files are hidden                                                                                          |
| `deleteAsset` / `deleteGeneration` / `deleteFailedGenerations` / `move*` | writes                          | No read exposure                                                                                                                                                            |

Predicates are bound parameters and `json_each(?)` id lists; no SQL text is built from data.

## Tagging

| Path                                              | Source of `nsfw`                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `submitGeneration` → `createGeneration`           | cookie, read once per submit                                                                 |
| Inline success outputs (`generation.functions`)   | same cookie value                                                                            |
| Poller (`generation-poller.server.ts`)            | `generation.nsfw` from the row, not the cookie                                               |
| Webhook (`webhooks.server.ts`)                    | `current.nsfw` from the row                                                                  |
| `/api/upload`, `/api/studio-upload`               | cookie                                                                                       |
| `importPack` (studio packs)                       | cookie, read once per import                                                                 |
| `importSocialPost` / `importSocialLinks`          | cookie                                                                                       |
| Avatar training cells (`panelCells`)              | the panel asset they were cut from                                                           |
| Retry (`useRetryGeneration` → `submitGeneration`) | re-submits in NSFW mode, so the cookie is on; a safe-mode client cannot reach the row at all |

## Server functions and loaders (`apps/web/src/server`)

| Function                                | Filter                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `loadGenerationWall`                    | `listGenerations` ×4 + `getAssetsByIds` with the cookie                                         |
| `loadGallery`                           | `listGenerations` + `getAssetsByIds` with the cookie; an item with no visible output is dropped |
| `loadAssets`                            | `listAssets` with the cookie                                                                    |
| `loadFailedGenerations`                 | `listGenerations` with the cookie                                                               |
| `loadMediaAssets`                       | `listAssets` with the cookie                                                                    |
| `loadReferenceLibrary`                  | `listAssets` with the cookie; an avatar reference is dropped when any of its files is hidden    |
| `loadFolders`                           | folder names only; counts are computed from the already-filtered lists                          |
| `loadDashboard`                         | `listGenerations`, `getAssetsByIds`, `countGenerations` ×3, `countAssets` with the cookie       |
| `loadToday`                             | `loadGenerationWall` plus `listGenerations` with the cookie                                     |
| `setGenerationReview`                   | `getGeneration` with the cookie (not found in safe mode)                                        |
| `getGenerationView`, `cancelGeneration` | `getGeneration` + `getAssetsByIds` with the cookie                                              |
| `loadStudioLibrary`                     | items hidden when any owned asset is hidden (safe mode only)                                    |
| `loadLoraRuns`                          | `listGenerations({ kind: 'lora' })` with the cookie                                             |
| `trainAvatarLora`                       | `getAssetsByIds` with the cookie (hidden inputs report as missing)                              |
| `prepareAvatarTrainingSet`              | refuses an avatar whose panel or sheet is hidden                                                |
| `prepareSceneFn` / garment prep         | jobs run through `submitGeneration`, which tags them                                            |
| `loadProviderAssets` (pipeline)         | `getAssetsByIds(..., true)` — a job must run whatever the mode                                  |
| `deleteDerivedAssets`                   | `listGenerations(..., true)` + `getAsset(..., true)` — cleanup only                             |
| `deleteStudioItemWithAssets`            | writes only                                                                                     |
| `readAssetBuffer` / `removeAssetFile`   | `getAsset(..., true)` — bytes for a job, or a file being deleted                                |

## Routes

| Route                      | Handling                                                                         |
| -------------------------- | -------------------------------------------------------------------------------- |
| `GET /api/media/$id`       | cookie read once; thumbnail and byte stream both 404 for a hidden asset          |
| `HEAD /api/media/$id`      | same as GET                                                                      |
| `POST /api/upload`         | tags from the cookie                                                             |
| `POST /api/studio-upload`  | tags from the cookie                                                             |
| `POST /api/studio-import`  | tags from the cookie (via `importPack`)                                          |
| `POST /api/social/resolve` | tags from the cookie (via `importSocialPost`)                                    |
| `POST /api/assistant`      | reads no assets; any image it renders comes from `/api/media` and hits that gate |

## Not filtered, deliberately

- `assetNameTaken` — name-collision check on the write path, no content.
- `selectStudioUploads` — takes raw rows from the backfill script.
- `workflow` rows and `chats` rows — canvas graphs and chat transcripts hold asset **ids**;
  the bytes they point at are refused by the media route, so a stale graph shows a broken
  tile rather than a leak.
- Thumbnails are generated on demand behind the media gate and never become rows of their
  own, so there is nothing to tag.

## Tests

- `packages/db/src/assets.test.ts` — safe/Nsfw list, count, by-id, upload dedupe class,
  studio exclusion, folder scoping.
- `packages/db/src/generations.test.ts` — same for generations, plus the partial
  `updateGeneration` contract the rewritten statement must keep.
- `packages/db/src/migrations.test.ts` — v3 → v5 keeps rows and lands `nsfw = 0` on both
  tables.
- `apps/web/src/server/media-nsfw.server.test.ts` — bytes and thumbnails refused in safe
  mode, served in NSFW mode, unaffected for a safe asset.
