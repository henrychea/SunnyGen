# Avatar profiles and the avatar wizard

- Date: 2026-11-22
- Status: merged, PR #12, merge commit `143335e`

## Summary

Avatars now carry a stored profile, and every prompt describes the character from that
profile instead of re-sending collage sheets. The profile covers source and likeness,
identity, face, hair, body, outfit, style flags and bans, plus sheet and panel settings.
A six-step wizard builds it, identity keywords keep the description inside each model's
budget, and four prompt entry points consume it.

## Why

The old flow attached whole reference sheets and panels to every edit. Image models tend
to ignore a collage of many faces and poses, and the avatar's identity was retyped in
free text each time. A structured profile gives the prompt builders one source of truth.

## What changed

**Profile.** `packages/core/src/avatar-profile.ts` defines `AvatarProfile` with nine
groups: `source` (portrait, likeness percent, keep and change traits), `identity`
(gender, age, ethnicity, height in cm, optional weight in kg), `face`, `hair`, `body`,
`outfit`, `style`, `sheet` and `panel`. The same file exports defaults, presets and
`parseAvatarProfile`, which parses on every read and rejects anyone under 18.

**Prompt builders and keywords.** `buildReferenceSheetPrompt` and
`buildPanelSheetPrompt` are pure functions on the profile and reproduce the reference
sheet and 4x4 panel prompts from the defaults. `identityKeywords()` ranks face geometry,
then brows and eyes, then body, then hair, then outfit. `identityClause()` joins them
under a model budget: 250 characters for Qwen, 350 for Grok, 600 for the other families.

**Crops instead of sheets.** `packages/core/src/avatar-references.ts` and
`apps/web/src/lib/avatar-references.ts` plan a profiled avatar as individual crops rather
than one sheet. `apps/web/src/server/avatar-crops.server.ts` writes those crops from the
4x4 panel when a cell is at least 1024 px (`PANEL_CROP_MIN_SIDE`). Stored crops are reused
as-is.

**Storage.** `apps/web/src/server/studio.functions.ts` writes `avatarProfile` into the
`studio_items.data` JSON column and denormalises `identityKeywords` beside it. There is no
migration. Avatars without a profile keep the old sheet and panel path.

**Wizard.** `apps/web/src/components/studio/avatar-wizard.tsx` has six steps: Source,
Identity, Hair & body, Outfit & style, Sheet, Review. It opens from New avatar in
`apps/web/src/routes/studio.tsx` and from Edit profile in
`apps/web/src/components/studio/library-grid.tsx`. It generates the sheet and panel in
place, can run Extract keywords from sheet, and offers Save profile only. No provider
call happens without a click.

_Updated 2026-11-24: the in-wizard generation and the Extract keywords from sheet button were replaced by copying the two prompts and uploading the results, plus a Paste prompt dialog that extracts from a pasted prompt; see [2026-11-24-avatar-wizard-uploads-toasts.md](2026-11-24-avatar-wizard-uploads-toasts.md)._

**Consumers.** Edit uses the profile in `apps/web/src/lib/edit-prompt.ts`; Studio look
uses it in `apps/web/src/components/studio/look-builder.tsx`; Home generate appends the
clause in `apps/web/src/components/home/composer.tsx`; Video does the same in
`apps/web/src/routes/video.tsx`.

**UI defects fixed in the PR.**
`apps/web/src/components/studio/avatar-wizard.tsx` got a dialog height cap and a
scrolling body. The portrait picker in
`apps/web/src/components/home/reference-picker.tsx` now uses `LAYER.picker`, so it
renders above the dialog instead of behind it. Chip selection gained a non-colour state,
helper text moved above the AA contrast floor, and Save profile only stopped requiring
both generated images.

**Smaller commits.** `a2f671c` numbers provider mock uploads from the asset's file name
(`packages/providers/src/fixtures.ts`) because concurrent uploads had raced the initiation
counter, so `sunra-1` and `sunra-2` could swap. `9636a04` moves the Selector menu to Base
UI Popover (`packages/ui/src/selector.tsx`). Popover handles placement, outside-click and
Escape dismissal, and focus return; the hand-rolled portal, placement code and window
listeners are gone. `LAYER.menu` stays in `packages/ui/src/layers.ts` because Base UI
still portals to body and leaves stacking to the app.

## How to verify

```sh
pnpm test
pnpm typecheck
```

Then open Studio, choose New avatar, walk the six steps by keyboard, and save a profile.
Prompt goldens, keyword budgets, crop planning and profile parsing are covered in
`packages/core/src/avatar-profile.test.ts`, `packages/core/src/avatar-references.test.ts`
and `apps/web/src/lib/avatar-references.test.ts`.

## Limits

- The paid Generate calls and live vision extraction were not exercised in the PR. Both
  use the existing generation and OpenRouter clients and are covered by mocked tests.
- Older avatars have no profile until one is saved or extracted.
- The 1024 px crop floor means older, smaller panels never get crops from the app.
  `apps/web/scripts/backfill-avatar-crops.ts` covers them.
