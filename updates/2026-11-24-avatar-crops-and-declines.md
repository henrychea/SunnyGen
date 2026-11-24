# Crops follow the panel, references are labelled for what they are, a decline is not a fault

- Date: 2026-11-24
- Status: open

## Summary

Three fixes around avatars and failed generations. A save that sets or changes an avatar's 4x4
panel now rebuilds its crops from that panel and drops the crops cut from the old one, so an
avatar can never keep crops that do not belong to its panel — and an empty crop list no longer
counts as done. When an avatar has no crops, its two references are labelled for what they are,
`reference sheet` for the character sheet and `4x4 panel` for the panel, instead of calling both
of them a reference sheet. When fal or Sunra refuses a request, the failure says the model
declined it, records reason `declined` with `retryable: false`, and the Retry button is replaced
by Copy prompt instead of inviting a retry that cannot work.

## Why

On prod, avatar B1.1 had a 4096 x 4096 panel (`b11_character_16_panel_sheet_4K.png`) but
`data.crops` was `[]`. A later `fal-ai/nano-banana-2.1` edit then sent the target, the sheet and
the whole panel, and the prompt labelled both avatar references "reference sheet".

- `parseAvatarCrops([])` returns `[]`, not `undefined`, so `existingCrops` treated a stored empty
  list as "already cropped" and `ensureAvatarCrops` returned it without cutting anything. A save
  that replaced the panel also kept the crops from the previous one, because the editor posts the
  item's `data` back and the save passed it through unchanged.
- The no-crops fallback in `avatarAssetSlots` gave every asset the same role, so the model could
  not tell which of the two images was the sheet and which was the grid.
- The submit path flattened any provider error body to its raw detail text and failed the
  generation with no code, reason or retryable flag, so a model refusal looked like a transient
  fault and offered Retry.

## What changed

- `apps/web/src/server/avatar-crops.server.ts`: `existingCrops` now treats an empty stored list
  as uncropped, so the panel is cropped again. A new `dataForPanelChange(data, panelChanged)`
  drops `crops` when the save seals a different panel, next to the rule that produced them.
- `apps/web/src/server/studio.functions.ts`: `saveStudioItemFn` computes `panelChanged` once (new
  item or a different `assetId`), keeps the existing under-4096 refusal for a changed panel, and
  passes the data through `dataForPanelChange`. `ensureAvatarCrops` then rebuilds from the new
  panel. A Save profile only, or any save that keeps the panel, still keeps the stored crops.
- `apps/web/src/lib/avatar-references.ts`: the fallback labels the asset that matches
  `sheetAssetId` as `reference sheet` and the rest as `4x4 panel`. `sheetAssetId` is carried by
  `AvatarReference` (`reference-avatar.ts`, from `characterSheetAssetId`), `ReferenceItem`
  (`reference-images.ts`) and the picker's avatar mapping (`reference-picker.tsx`).
- `packages/providers/src/http.ts`: `responseFailure` returns the message and whether the body is
  a refusal. A refusal is a `msg` or `message` starting with "Could not generate images with the
  given prompts and images" on an `invalid_request` entry in `error`, `message` or `detail`.
  `responseError` is now a thin wrapper over it, so existing callers are unchanged.
- `packages/providers/src/types.ts`: `ProviderError` carries an optional `failure`, and
  `DECLINED_FAILURE` (`invalid_request` / `declined` / not retryable) with `DECLINED_ERROR`
  ("The model declined this request (no charge). Try a different target photo or model.").
- `packages/providers/src/fal/client.ts`, `packages/providers/src/sunra/client.ts`: a declined
  submit throws that failure instead of the raw body. Sunra has no fixture for this shape; it
  shares the parser so it behaves the same if it ever sends one.
- `apps/web/src/server/generation.functions.ts`: a failed submit now stores `errorCode`,
  `errorReason` and `errorRetryable` from the `ProviderError`, matching what the poller and the
  webhook already did. `errorRetryable: false` is what swaps Retry for Copy prompt in
  `failure-actions.tsx`.

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

Open Studio, Avatars, and edit a saved avatar with a 4096 panel: replace the panel and save. The
Crops section fills with three crops cut from the new panel (1024 px cells for a 4096 panel, so
different cell sizes are the proof the old crops were discarded). Save profile only and the crops
stay. Then submit an edit the model refuses: the card reads "The model declined this request (no
charge). Try a different target photo or model.", the badge shows `invalid_request · declined`,
and the action is Copy prompt, not Retry.

## Limits

- A refusal is recognised by that exact message prefix and the `invalid_request` type. A model
  that words its refusal differently still surfaces as a plain provider error and stays
  retryable; the text is not pattern-matched more loosely on purpose.
- The Sunra refusal shape is unverified; only fal's is covered by a test.
- Avatars whose panel is under 4096 px still cannot be cropped. They keep whatever crops they
  already had, and only get new ones once a 4096+ panel is uploaded.
- No prompt rewriting or automatic workaround was added: a declined request still needs a
  different target photo or model.
