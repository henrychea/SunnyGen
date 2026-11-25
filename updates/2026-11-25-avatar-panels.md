# Three whole avatar images, no crops, and the send path fixed

- Date: 2026-11-25
- Status: open, stacked on PR #24

## Summary

An avatar now has three upload slots — a reference sheet, a body panel and a face panel — and a
model receives those three whole images. Nothing is cut into tiles first: the crops, the
adjustable region boxes and the three composed boards are gone from both the UI and the server.
Each image leaves the disk at the size it was uploaded and is resized only in the copy uploaded
for one request, under a unique file name. A Sunra job that cannot fetch an input now forgets the
cached upload so a retry sends the image again. Assets lists only the owner's own files: anything
a studio item owns is hidden there and deleted along with the item. Edit prompts are one template
per model family, LoRA training cuts each 2x2 panel into its four cells, and an avatar saved
before the split keeps working on its single 4x4 panel.

## Why

The old 4x4 panel gave each view 1024 px, so renders were blurry and full-body figures overflowed
their cell. Two 2x2 panels double the pixels per view, and that alone was enough: the models read
the panels themselves, so cutting the panels into crop tiles and recomposing them as boards only
added a second, stale copy of the same pixels. Every new upload invalidated the tiles, the editor
had to keep them in step by hand, and the edit prompt spent its length naming tiles the model
could already see. Sending the originals keeps one copy of the truth and drops a whole editing
surface.

The Sunra failure was separate: a job that died at poll time with `input_fetch_failed` kept its
upload row forever, so every retry reused the same dead `assets.sunra.ai` URL.

## What changed

### Uploads and what is sent

- `apps/web/src/components/studio/avatar-sheet-uploads.tsx`, `avatar-wizard.tsx`: three upload
  slots — reference sheet, body panel, face panel — each with its own Copy prompt, and the Review
  step asks for all three. The sheet must be 4096 px on its long side; both panels 4096 square.
- `packages/core/src/avatar-references.ts`: `avatarImagePlan` returns the three whole images in
  send order (face panel, body panel, sheet). `avatarImageLimit` caps a family at its documented
  count, so qwen takes the two panels and loses the sheet. An avatar with no face panel returns
  no plan and its own id list goes as it stands.
- `apps/web/src/lib/avatar-references.ts`: `avatarAssetSlots` labels each whole image by the cells
  it holds ("face panel: top-left front, top-right three-quarter, …"), because the panels are 2x2
  layouts and the label rides into the prompt verbatim.
- `apps/web/src/lib/reference-avatar.ts`: the reference carries `facePanelAssetId` and
  `bodyPanelAssetId` next to the sheet, and `assetIds` lists all three so the picker counts them.
- `apps/web/src/components/home/reference-picker.tsx` passes both panel ids through.

### Send-time resize and file names

- `packages/providers/src/normalize.ts`: the stored original is never touched. The copy uploaded
  for a request is resized to the provider's documented ceiling, JPEG quality 80 for opaque
  images and PNG or WebP only when the alpha channel is really transparent, and it gets its own
  name (`<stem>-<uuid>-<stamp>.<ext>`) so a resized copy can never shadow the original at the
  provider. The upload cache still keys on content, so the extra name does not split it.
- Sunra documents no fetch limit for an input URL, so its copy is capped at 6 MB; fal keeps the
  shared limit. An 18.1 MB board was rejected by Sunra in 0.6 s, while 6.2 MB and 7.6 MB fetched
  fine.

### Sunra cache fix

- `apps/web/src/server/generation-poller.server.ts`: when a poll result reports that the inputs
  are stale (`input_fetch_failed`), the poller asks the provider module to forget them before the
  generation is marked failed. That clears both the stored `provider_uploads` row and the
  in-process upload map, so the next retry uploads the input again instead of reusing the dead
  URL. Covered by `apps/web/src/server/generation-poller.test.ts`.

### Assets and studio files

- `packages/db/src/repositories/assets.ts`: `excludeStudioAssets` filters every file a studio item
  owns in SQL, so the page size, the offset and the count describe the same visible list.
- `apps/web/src/server/library.functions.ts`, `dashboard.functions.ts`: the library and the
  dashboard count hide those files; the Assets page shows the owner's own uploads and social
  files.
- `apps/web/src/server/studio-assets.server.ts` (new): deleting a studio item deletes every file
  it owns, rows included, and keeps a file another item still points at. A generation that used a
  deleted file as an input keeps its prompt and output and shows the input as missing.
- `packages/db/src/repositories/studio.ts`: `studioItemAssetIds` walks the item's columns and
  every nested `assetId`/`cleanAssetId`/`…AssetId`, so a new kind cannot forget its files.

### Prompts

- `apps/web/src/lib/edit-prompt.ts`, `packages/core/src/edit-prompt-profiles.ts`: one template per
  model family, each rendering the same facts with that vendor's shape, length cap and trim
  tiers. The reasoning and the vendor sources are in [docs/edit-prompts.md](../../docs/edit-prompts.md).
  Tests: `edit-prompt.panels.test.ts` (per-family snapshots on the three whole images) and
  `edit-prompt.profiles.test.ts` (avatars saved before the split).

### LoRA training

- `apps/web/src/lib/avatar-training.ts` (new): a two-panel avatar trains on the four cells of each
  2x2 panel, eight images; an avatar saved before the split keeps the 4x4 cut, sixteen images.
  `prepareAvatarTrainingSet` in `apps/web/src/server/studio.functions.ts` cuts them with sharp, and
  the character sheet still heads the set. `LORA_MIN_IMAGES` drops from 10 to 8, because eight
  cells plus the sheet is the largest set a two-panel avatar offers.

### Removed

- `packages/core/src/avatar-regions.ts`, `apps/web/src/server/avatar-crops.server.ts`,
  `apps/web/src/components/studio/avatar-crops-panel.tsx`, `avatar-crop-adjuster.tsx`,
  `apps/web/scripts/backfill-avatar-crops.ts`, and the crop/board types in
  `packages/core/src/avatar-references.ts` (`AvatarCrop`, `AvatarBoard`, `BOARD_ROLES`,
  `avatarCropPlan`, the cell grid and its parser).
- What is left of the old data is the purge: `apps/web/src/lib/avatar-derived.ts` lists the legacy
  keys, `apps/web/src/server/avatar-derived.server.ts` drops them on a panel change and deletes
  the files they pointed at once nothing references them.

## Findings

- Sunra and fal receive the same three images and the same prompt for a given family: both
  adapters take the same reference plan, and only the adapter, the endpoint and the send-time
  ceiling differ (fal's flux-2 models use the `@image%d` token). Renders of the same request
  through both providers differ in likeness, lighting and detail — that difference is the
  provider's model, not the request we build. `apps/web/scripts/prompt-lab.ts` prints the exact
  request per model, so a discrepancy can be attributed before spending anything.

## How to verify

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

Prompt lab builds the prompt, roles and asset order per model without spending anything, and
`--live --yes` runs the real requests and writes a contact sheet:

```sh
SUNNYGEN_DATA_DIR=<data-dir> \
  pnpm --filter @sunnygen/web exec tsx scripts/prompt-lab.ts \
  --avatar <avatar-name> --target <asset-id-or-file> \
  --models sunra:nano-banana-pro,fal:fal-ai/nano-banana-pro \
  --out .temp/prompt-lab
```

By hand, against a throwaway copy of the data directory: import an avatar with the sheet and both
panels, and the picker rejects a panel under 4096 and a sheet under 4096 on its long side. Submit
an edit with nano-banana and read the prompt: three whole images, each named by its cells, no
tiles and no boards. Open Assets: the avatar's three images are not listed. Delete the avatar and
its files are gone from `data/media` while a generation that used one still loads. Start LoRA
training on both a two-panel avatar and an old one: 9 images (sheet plus 8 cells) and 17
respectively.

## Limits

- No migration: an avatar saved before the split keeps its single 4x4 panel and sends the sheet
  and that panel whole. Uploading a face panel switches it to the new path.
- qwen names only two avatar images, so it never sees the sheet; its hair and hands fall back to
  the face panel.
- The resize ceiling for Sunra was found by trying sizes (6.2 MB and 7.6 MB fetched, 18.1 MB did
  not), not from documentation, which publishes no number.
- No live provider run is part of the gates. The prompt text, the asset order, the plan, the
  training split and the upload cache are covered by unit tests; the browser flows were checked
  by hand.
- Lowering `LORA_MIN_IMAGES` to 8 is a policy choice, not a provider requirement: the trainer
  accepts far fewer, and 8 is simply what a two-panel avatar can offer.
