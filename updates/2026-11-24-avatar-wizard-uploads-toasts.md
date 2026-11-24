# Avatar wizard uploads, uploads get names, changes toast

- Date: 2026-11-24
- Status: open, PR pending

## Summary

The avatar wizard no longer generates images. You fill in the profile, copy the reference
sheet prompt and the 4x4 panel prompt into your own image tool, then upload the two results
in the Review step. The wizard can also fill itself from the prompt you pasted, through
Paste prompt in step 1 or the new Import avatar modal, and it lists what the prompt did not
state instead of guessing. Every file a user uploads now becomes a new asset with the
original file name; if that name is taken, the new one gets a `-<uuid v4>` suffix. A new
database migration stores those names. Studio uploads are listed in Assets as uploads,
avatar crops stay internal, and every create, save, move, delete and upload action in the
app shows a toast. The Assets page folder list is now the same chip control as Gallery.

## Why

Generating the sheet and panel inside the app often produced the wrong avatar and offered no
retry, so the owner generates them in their own tool where they can iterate. Separately,
re-uploading an image that already existed (a saved render, a studio sheet) returned the old
asset silently: nothing new appeared in Assets, and it was unclear whether the upload had
worked. Deduplicating user uploads also meant the second upload of the same file was simply
lost. Finally, CRUD actions mostly failed silently and gave no confirmation that anything
happened.

## What changed

- `apps/web/src/components/studio/avatar-wizard.tsx`: `runGeneration`, the Generate
  reference sheet and Generate 4x4 panel buttons, the image model combobox and the model
  state are gone. Step 1 keeps the likeness slider and the keep/change chips (always
  enabled) and adds an Attach a portrait in your AI toggle; the portrait picker tile and
  Clear portrait button are removed. Step 6 keeps both prompts with Copy and adds two upload
  slots, Reference sheet and 4x4 panel, which open the existing ReferencePicker on its
  Uploads tab and set `characterSheetAssetId` / the panel asset. Save avatar still requires
  name, sheet and panel; Save profile only stays for existing items.
- `packages/core/src/avatar-profile.ts`: `source.usePortrait` (default false). The sheet
  prompt writes the likeness rule when `usePortrait` is true or a saved profile still has a
  `portraitAssetId`, so older profiles behave as before. Prompt wording is now "the attached
  portrait".
- Paste prompt and Import avatar: `apps/web/src/server/avatar-profile.server.ts` gained a
  text variant of the extraction request (`PROMPT_EXTRACTION_PROMPT`) that reuses the same
  OpenRouter call and parser as the image variant. `extractAvatarFromPrompt` returns
  `{ profile, missing }`, where `missing` lists dotted paths (for example
  `identity.heightCm`) read from the raw reply before defaults are applied, null fields are
  dropped before parsing, and an age under 18 is rejected with a clear error.
  `extractAvatarFromPromptFn` is the server function. In the UI,
  `components/studio/avatar-prompt-extract.tsx` owns the textarea, Extract button, error and
  missing list; the wizard opens it in a small Paste prompt dialog and the studio Avatars tab
  has an Import avatar modal (`components/studio/import-avatar-dialog.tsx`) with name,
  prompt, extracted traits, the same two upload slots and an Open in wizard action.
- Uploads: `storeBuffer` takes `unique` and `name`. `/api/upload` and `/api/studio-upload`
  pass `unique: true` with the original `File.name`, so a user upload always writes a new row
  and a new file. `sanitizeAssetName` keeps the base name, and `uniqueAssetName` appends
  `-<crypto.randomUUID()>` before the extension when that name is taken
  (`door-photo-3f2c9a1e-8b4d-4c6e-9a7f-1d2e3b4c5d6f.jpg`). Internal callers (provider
  outputs, avatar crops, pack import, social imports) keep the sha dedupe. `AssetRecord` and
  `PublicAsset` expose `name`, and the picker and the Assets cards show it with the old
  source/size/date label as the fallback.
- Migration 4 (`packages/db/src/migrations.ts`): `ALTER TABLE assets ADD COLUMN name TEXT`,
  drops the unique `assets_sha256` index and recreates it as a non-unique index. It is
  appended after the existing migrations, so a version 3 database only runs this step. It
  already ran on prod on 2026-11-24 (`user_version` 4, 283 assets unchanged) and the backup
  taken before it is `~/.local/share/sunnygen-prod/data/sunnygen.db.bak-20261124-before-migration4`.
- Sources: `/api/studio-upload` and the user-provided images imported from a studio pack now
  store with source `upload`, so they appear in Assets. Avatar crops in
  `apps/web/src/server/avatar-crops.server.ts` stay `studio`.
- `scripts/backfill-studio-uploads.ts`: re-lists old studio uploads (`source = 'studio'` and
  not referenced as an avatar crop) as `upload`. Usage:
  `pnpm tsx scripts/backfill-studio-uploads.ts --db <path to sunnygen.db> --dry-run` prints
  the count and each id; without `--dry-run` it writes the change. The owner runs it on prod.
- CRUD toasts: uploads, pack and Cobalt imports, asset delete/move/new folder, gallery
  move/delete and failure dismiss, wall lightbox delete all and both single deletes, studio
  delete/prepare/train/avatar and item saves, settings provider/OpenRouter/Azure/prep model
  and catalog actions, generation submit/retry/cleanup, chat delete and manual pipeline save
  now toast on success and on error. Autosave, polling and reads stay silent.
- Assets page: the folder sidebar is replaced by `FolderChips` above the content, with a New
  folder action next to it. `FolderButton` is deleted; the old sidebar buttons were never
  drop targets, so no drag and drop behaviour was lost.

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

Open Studio, Avatars, New avatar. Fill the profile, open Review, and check that both prompts
copy and that the two upload slots accept files. Upload the same file twice: the second one
appears as `name-<uuid>.png` and both show in Assets with their names. Use Paste prompt with
a real prompt and an OpenRouter key to see the extracted traits and the missing list, then
Import avatar with the same prompt to save an avatar in one step. Delete, move and create
folders on Assets and Gallery, and check each action toasts.

## Limits

- The real OpenRouter text extraction is not exercised by tests. Unit tests use a fake
  fetcher for the request shape, the missing-field list, the under-18 rejection and the
  missing-key path; the live model reply is only covered by hand.
- Assets created before migration 4 have no stored name, so they keep the old source, size
  and date label until they are re-uploaded.
- Avatar crops are only produced when a panel cell is at least 1024 px
  (`PANEL_CROP_MIN_SIDE`), so a panel smaller than 4096 x 4096 saves with no crop tiles.
- Delete all in the wall lightbox still uses `window.confirm`, not an app dialog.
- Re-uploading the same bytes is now intentional duplication: the sha index is no longer
  unique, so the library can hold several identical files with different names.
