# Lightbox delete unsticks and gains Delete all

- Date: 2026-11-24
- Status: open, PR #20

## Summary

Deleting a render inside the home or video wall lightbox now finishes cleanly: the Delete
button returns to its idle state and the group moves on to the next item. The lightbox also
has a Delete all action that clears a whole group after a confirmation, including the
queued and failed renders that the gallery branch of the modal does not show.

## Why

The group lightbox reuses a single `MediaActionBar` for every item and never unmounts it
after a delete, and `remove()` only called `setBusy(null)` inside its catch block. A
successful delete left `busy` set to `delete`, so the shared bar kept rendering "Deleting…"
with the button disabled for the next item. Separately, clearing a folder meant deleting
its items one at a time, and the failed and queued renders, which only exist as job cards in
the modal, had no delete path at all.

## What changed

- `apps/web/src/components/media-action-bar.tsx`: `remove()` resets `busy` in a `finally`
  block and keeps the error message in `catch`. This covers the group lightbox, the single
  render modal and the gallery usage, which all share the bar. `ACTION_CLASS` is exported so
  the new button matches the existing action styling.
- `apps/web/src/lib/wall-delete.ts`: `uniqueGenerationIds` collects the generation ids
  behind a group's cards, deduped in first-seen order. One generation can back several
  output cards, so both the delete pass and the confirm count work on ids, not cards.
- `apps/web/src/lib/wall-delete.test.ts`: three unit tests for dedupe, order and an empty
  group.
- `apps/web/src/components/home/wall-cards.tsx`: a `DeleteAllButton` sits in the group
  lightbox header next to the close button, in both the gallery branch and the branch that
  holds only queued and failed cards. It asks `window.confirm` for "Delete all N items in
  this group?" first, then deletes every generation in the group, deletes the folder when
  the group came from one, invalidates `home-generations`, `video-wall`, `gallery` and
  `folders`, and closes the modal. The button reads "Deleting…" while it runs. If a delete
  call fails it shows an error, stops, keeps the modal open and resets. The gallery branch
  hands the button the full group card list, outputs plus job cards, minus the ids already
  deleted one by one, so the count in the confirm matches what gets deleted.
  `CollectionModal` and `WallModal` take an optional `folderId`.
- `apps/web/src/routes/index.tsx` and `apps/web/src/routes/video.tsx`: groups built from a
  folder carry that `folderId` through `groupModal` into `WallModal`. Groups built from one
  generation's outputs carry no folder.

## How to verify

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

To exercise it by hand, run the web app against a throwaway copy of the demo database and
open a folder group that mixes finished, failed and queued renders.

```sh
SUNNYGEN_DATA_DIR=<copy-of-demo-db-dir> PORT=8979 NITRO_PORT=8979 \
  pnpm --filter @sunnygen/web dev
```

Delete one render with the bar's Delete button: the lightbox advances and the button reads
Delete again instead of staying on Deleting. Then use Delete all: the confirm names the
number of renders in the group, cancelling it deletes nothing, and accepting it removes
every render in the group plus the folder itself, closes the modal and drops the group from
the wall. A group that only holds queued or failed cards gets the same button in its header,
and rows for those generations disappear from the database.

## Limits

- The confirmation is `window.confirm`, not an app dialog. Keyboard and screen reader
  behaviour is whatever the browser gives the native prompt.
- Deletes run one by one rather than in a batch request, so a failure part way through
  leaves the earlier renders deleted, shows the error and stops.
- Upload (asset) folders have no Delete all. The button only appears for groups of
  generation cards.
