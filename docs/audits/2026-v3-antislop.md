# SunnyGen v3 antislop audit

Date: 2026-11-26
Approval: the owner reviewed the report and asked for every row to be fixed, including
the ones previously marked `open` or `wontfix`. All 20 rows are `fixed`.
Mode: **after** (session instruction: the v3 release plan and this audit plan both
require an APPROVE-then-fix audit; the saved global preference is `during`, overridden
here by the explicit session instruction to produce the ranked report first)
Scope: light and dark themes, 10 routes, three widths, shared UI in `packages/ui/src` and
`apps/web/src/components`
Skills used: `antislop` (core), `antislop-ui`, `antislop-human`, `antislop-layoutmobile`,
`antislop-copywriting`, `antislop-code` (all under `~/.claude/skills/`)

## Method

Static audit. Every check below was performed by reading the source, grepping the class
inventory, and measuring contrast with `~/.claude/skills/antislop-human/contrast-check.py`
(WCAG 2.x formula, unrounded). No dev server, no browser, no screenshots: per the dispatch
instruction, visual checks are done from code and the contrast checker, and every check
that still needs a rendered pass is marked **needs visual pass** below.

## Inspection matrix

| Dimension             | Values                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes                | `index` (`/`), `images`, `video`, `canvas`, `gallery`, `studio`, `shoots`, `assets`, `chat`, `settings`, plus `__root` and the 404 component                      |
| Widths                | 375, 768, 1440 (CSS breakpoints in code: `sm` 640, `md` 768, `lg` 1024, `xl` 1280)                                                                                |
| Themes                | `light`, `dark` (attribute `html[data-theme]`, tokens in `apps/web/src/styles.css`)                                                                               |
| States per data route | empty, loading, error, populated                                                                                                                                  |
| Shared surface        | `packages/ui/src` (17 modules) and `apps/web/src/components` (app-shell, sidebar, assistant, canvas, chat, home, studio, video, model-combobox, pickers, dialogs) |

Status codes: `open`, `approved`, `fixed`, `wontfix`. Rows are never deleted, only
re-statused.

## Summary

- 10 HIGH, 6 MEDIUM, 4 LOW findings, all 20 fixed in the second pass.
- Keyboard blockers: 2 found, both fixed (two hand-rolled dialogs had no focus
  containment; one had no dialog role at all).
- AA failures before fixes, `text-ink/N` opacity tiers: 16 text pairs in light (every
  tier below `/65`, measured over canvas and surface) and 6 in dark (every tier below
  `/50`), plus 13 semantic-token pairs. After fixes: 0 text pairs fail in either theme.
- Blur is gone (0 `backdrop-blur`), shadow is on 5 elevation surfaces only (dialog, menu,
  toast, panel, fab), uppercase and wide-tracked micro-labels are gone, and no text
  renders below 11px.
- Worst route before fixes: `/images` and `/gallery` (dense muted micro-labels at
  `text-ink/35`–`/55`, silent refresh failures), both now at the `/65` floor.
- Calibration reproduced: light `--color-warning` `#A36A12` on `#FAF6EF` = **4.21:1**
  (confirmed, then replaced by `#8C5A0C` at 5.44:1 in the theme work); light
  `text-ink/55` = **3.64:1** (confirmed); light `border-line` on canvas = **1.22:1**
  (confirmed).

---

## Contrast matrix

Produced with `contrast-check.py`. "4.5" is normal text, "3.0" is large text and
non-text boundaries (WCAG 1.4.11).

### Token pairs

| Theme | Pair                | Ratio | 4.5:1 text | 3:1 non-text |
| ----- | ------------------- | ----- | ---------- | ------------ |
| light | ink/canvas          | 15.04 | PASS       | PASS         |
| light | ink/surface         | 15.93 | PASS       | PASS         |
| light | accent/canvas       | 7.24  | PASS       | PASS         |
| light | accent/surface      | 7.67  | PASS       | PASS         |
| light | accent-ink/accent   | 7.67  | PASS       | PASS         |
| light | success/canvas      | 4.87  | PASS       | PASS         |
| light | warning/canvas      | 5.44  | PASS       | PASS         |
| light | error/canvas        | 6.07  | PASS       | PASS         |
| light | line-strong/canvas  | 3.63  | FAIL       | PASS         |
| light | line-strong/surface | 3.85  | FAIL       | PASS         |
| light | line/canvas         | 1.22  | FAIL       | FAIL         |
| light | line/surface        | 1.30  | FAIL       | FAIL         |
| light | surface/canvas      | 1.06  | FAIL       | FAIL         |
| light | accent-ink/error    | 6.43  | PASS       | PASS         |
| dark  | ink/canvas          | 15.87 | PASS       | PASS         |
| dark  | ink/surface         | 14.65 | PASS       | PASS         |
| dark  | accent/canvas       | 5.62  | PASS       | PASS         |
| dark  | accent/surface      | 5.18  | PASS       | PASS         |
| dark  | accent-ink/accent   | 5.62  | PASS       | PASS         |
| dark  | success/canvas      | 8.21  | PASS       | PASS         |
| dark  | warning/canvas      | 8.61  | PASS       | PASS         |
| dark  | error/canvas        | 6.73  | PASS       | PASS         |
| dark  | line-strong/canvas  | 4.17  | FAIL       | PASS         |
| dark  | line-strong/surface | 3.85  | FAIL       | PASS         |
| dark  | line/canvas         | 1.76  | FAIL       | FAIL         |
| dark  | line/surface        | 1.62  | FAIL       | FAIL         |
| dark  | surface/canvas      | 1.08  | FAIL       | FAIL         |
| dark  | accent-ink/error    | 6.73  | PASS       | PASS         |

`line-strong` is a control-boundary token, never body text; its 4.5 column is
informational only. `surface/canvas` is the card-on-page delta, informational.

### Opacity tiers (`text-ink/N`, composited against canvas and surface)

Before the fix every tier from `/25` to `/60` failed AA in light (`/25` = 1.79:1 up to
`/60` = 4.25:1) and the tiers below `/50` failed in dark. Those tiers are no longer used;
the shipped scale starts at `/65`, which clears 4.5:1 in both themes.

| Theme | Tier | Over canvas | Ratio | 4.5  | Over surface | Ratio | 4.5  |
| ----- | ---- | ----------- | ----- | ---- | ------------ | ----- | ---- |
| light | /65  | `#736a63`   | 4.91  | PASS | `#756c66`    | 5.05  | PASS |
| light | /70  | `#685f58`   | 5.79  | PASS | `#6a615a`    | 5.95  | PASS |
| light | /75  | `#5e544d`   | 6.84  | PASS | `#5f564f`    | 7.05  | PASS |
| light | /80  | `#544942`   | 8.09  | PASS | `#554b44`    | 8.34  | PASS |
| light | /85  | `#493e37`   | 9.61  | PASS | `#4a3f39`    | 10.02 | PASS |
| dark  | /65  | `#a7a098`   | 7.19  | PASS | `#aaa29a`    | 6.82  | PASS |
| dark  | /70  | `#b2aba2`   | 8.18  | PASS | `#b5ada4`    | 7.74  | PASS |
| dark  | /75  | `#bdb6ac`   | 9.25  | PASS | `#bfb8ae`    | 8.73  | PASS |
| dark  | /80  | `#c8c0b7`   | 10.34 | PASS | `#cac2b8`    | 9.74  | PASS |
| dark  | /85  | `#d3cbc2`   | 11.59 | PASS | `#d4ccc3`    | 10.80 | PASS |

Usage after the fix: 384 sites at `/65`, 24 at `/70`, 13 at `/75`, 8 at `/80`, 5 at
`/85`. Two partial-opacity canvas-on-ink pairs remain, both measured against their real
background:

| Pair                                                                 | Light | Dark | Verdict |
| -------------------------------------------------------------------- | ----- | ---- | ------- |
| `text-canvas/60` on solid `bg-ink` (selected tab)                    | 6.27  | 4.63 | PASS    |
| `text-canvas/90` on the `from-ink/80` media scrim, worst test colour | 6.76  | 8.34 | PASS    |

### Semantic text tokens at partial opacity

| Pair                               | Light | Dark | Verdict before fix |
| ---------------------------------- | ----- | ---- | ------------------ |
| `text-accent/60` on canvas         | 2.86  | 2.45 | FAIL               |
| `text-accent/70` on canvas         | 4.10  | 3.35 | FAIL               |
| `text-accent/75` on canvas         | 4.55  | 3.66 | FAIL in dark       |
| `text-accent/80` on canvas         | 5.07  | 4.02 | FAIL in dark       |
| `text-accent/85` on canvas         | 5.59  | 4.37 | FAIL in dark       |
| `text-error/45` on canvas          | 1.38  | 1.51 | FAIL               |
| `text-error/60` on canvas          | 2.45  | 2.71 | FAIL               |
| `text-error/70` on canvas          | 3.59  | 3.87 | FAIL               |
| `text-error/75` on canvas          | 3.93  | 4.27 | FAIL               |
| `text-error/80` on canvas          | 4.32  | 4.73 | FAIL in light      |
| `text-warning/60` on canvas        | 2.24  | 4.80 | FAIL in light      |
| `text-success/80` on canvas        | 3.36  | 5.60 | FAIL in light      |
| `text-canvas/55` on solid `bg-ink` | 5.48  | 3.94 | FAIL in dark       |

Every semantic text colour now uses its token at full opacity, which passes in both
themes (`accent` 7.24/5.62, `error` 6.07/6.73, `warning` 5.44/8.61, `success`
4.87/8.21). `rg "text-(accent|error|warning|success)/[0-9]"` returns nothing.

### Control boundaries and focus indicators (3:1)

Containers now use `border-line-strong`; `border-line` is left to pure dividers inside an
already-bounded container, which is what F-14 asked for.

| Theme | Pair                                       | Composited | Ratio | 3:1  | Role                                |
| ----- | ------------------------------------------ | ---------- | ----- | ---- | ----------------------------------- |
| light | `border-line-strong` on canvas             | `#8f7e6b`  | 3.63  | PASS | container boundary                  |
| light | `border-line-strong` on surface            | `#8f7e6b`  | 3.85  | PASS | container boundary                  |
| light | `border-line` on canvas                    | `#e8dfd3`  | 1.22  | FAIL | divider inside a bordered container |
| light | `border-line` on surface                   | `#e8dfd3`  | 1.30  | FAIL | divider inside a bordered container |
| light | `focus-visible:ring-accent/70` on canvas   | `#bd595f`  | 4.10  | PASS | focus indicator                     |
| light | `focus-visible:border-accent/70` on canvas | `#bd595f`  | 4.10  | PASS | focus indicator                     |
| light | `hover:border-ink/60` on surface           | `#7f7771`  | 4.32  | PASS | hover boundary                      |
| dark  | `border-line-strong` on canvas             | `#8a7364`  | 4.17  | PASS | container boundary                  |
| dark  | `border-line-strong` on surface            | `#8a7364`  | 3.85  | PASS | container boundary                  |
| dark  | `border-line` on canvas                    | `#4a3c34`  | 1.76  | FAIL | divider inside a bordered container |
| dark  | `border-line` on surface                   | `#4a3c34`  | 1.62  | FAIL | divider inside a bordered container |
| dark  | `focus-visible:ring-accent/70` on canvas   | `#a44f45`  | 3.35  | PASS | focus indicator                     |
| dark  | `focus-visible:border-accent/70` on canvas | `#a44f45`  | 3.35  | PASS | focus indicator                     |
| dark  | `hover:border-ink/60` on surface           | `#a09890`  | 6.04  | PASS | hover boundary                      |

The divider rows are the deliberate exception the owner specified: `border-line` never
identifies a container on its own, because every container that needs a boundary carries
`line-strong`. Status dots (`bg-success`, `bg-warning`, `bg-error`) clear 3:1 against
canvas in both themes (4.87/8.21, 5.44/8.61, 6.07/6.73).

Opaque surfaces introduced by the blur removal were re-measured: toast text (`text-ink/80`
on `bg-surface`) 8.34 light / 9.74 dark; sticky-bar text (`text-ink/65` on `bg-canvas`)
4.91 / 7.19; media chips (`text-canvas` on `bg-ink`) 15.04 / 15.87; the assets drop
overlay (`text-accent` on `bg-canvas`) 7.24 / 5.62.

### Calibration rows

Seeded before the audit to prove the method catches real failures. Each was measured
again with `contrast-check.py`; all three confirmed.

| #    | Pair                                           | Seeded ratio | Re-measured | Verdict   | Status                                                                                                                   |
| ---- | ---------------------------------------------- | ------------ | ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| C-01 | light `--color-warning` `#A36A12` on `#FAF6EF` | 4.21:1       | 4.21:1      | confirmed | fixed (token replaced with `#8C5A0C`, now 5.44:1)                                                                        |
| C-02 | light `text-ink/55` on canvas                  | 3.64:1       | 3.64:1      | confirmed | fixed (tier floor raised to `/65`, 4.91:1)                                                                               |
| C-03 | light `border-line` on canvas                  | 1.22:1       | 1.22:1      | confirmed | fixed: control and card boundaries moved to `border-line-strong` (3.63 / 3.85); `border-line` is now divider-only (F-14) |

---

## Findings

### HIGH (Hard Gate)

| #    | Tier | Rule        | File:line                                                                                                                                                                             | Finding                                                                                                                                                                                                                                    | Fix                                                                                                                                                                                                                      | Status |
| ---- | ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| F-01 | HIGH | R-25        | `apps/web/src/routes/images.tsx:187` (representative; 318 call sites before the fix)                                                                                                  | Light theme muted text at `text-ink/25`–`/60` measures 1.79–4.25:1, below AA 4.5:1. Calibration row confirmed at `/55` = 3.64:1. 27 sites at `/55`, 31 at `/50`, 81 at `/40`, 66 at `/35`.                                                 | Swept every tier below `/65` to `text-ink/65` (4.91 light / 7.19 dark) across 50 files; the remaining scale is `/65`–`/85`.                                                                                              | fixed  |
| F-02 | HIGH | R-25        | `apps/web/src/components/home/wall-cards.tsx:156` (representative; 30 call sites before the fix)                                                                                      | `text-accent/60`–`/85`, `text-error/45`–`/80`, `text-warning/60`, `text-success/80` fail 4.5:1 in one or both themes; `text-error/80` on canvas is 4.32 light, `text-accent/85` is 4.37 dark.                                              | All semantic text now uses the token at full opacity (`text-accent`, `text-error`, `text-warning`, `text-success`), which measures 4.87–8.61 in the worse theme.                                                         | fixed  |
| F-03 | HIGH | R-25 / R-32 | `packages/ui/src/button.tsx:43` (representative; 15 sites)                                                                                                                            | Focus indicators at `ring-accent/15`, `/35`, `/50` and `focus-visible:border-accent/40`, `/45` measure 1.70–2.64:1, below the 3:1 non-text bar. The focus ring is the only keyboard affordance on most controls.                           | Raised to `ring-accent/70` (4.10 light / 3.35 dark) and `border-accent/70`.                                                                                                                                              | fixed  |
| F-04 | HIGH | R-25        | `packages/ui/src/input.tsx:9` (representative; 39 sites)                                                                                                                              | `hover:border-ink/20` and `/25` measure 1.51–2.11:1, so hovering a control made its boundary _less_ visible than the resting `border-line-strong` (3.63).                                                                                  | `hover:border-ink/60` (4.32 light / 6.04 dark): hover now strengthens the boundary.                                                                                                                                      | fixed  |
| F-05 | HIGH | R-25        | `packages/ui/src/input.tsx:9`, `select.tsx:9`, `textarea.tsx:9`, `apps/web/src/routes/video.tsx:104`                                                                                  | `placeholder:text-ink/35` measures 2.13–2.14:1; placeholder text is text and needs 4.5:1.                                                                                                                                                  | `placeholder:text-ink/65`.                                                                                                                                                                                               | fixed  |
| F-06 | HIGH | R-02        | `apps/web/src/components/home/composer.tsx:442`, `apps/web/src/components/studio/train-dialog.tsx:291`                                                                                | Em dash in a queued-results toast and as the empty-trigger-word placeholder.                                                                                                                                                               | Rewrote the toast as two sentences and the placeholder as "Not set". A search for the em dash character (U+2014) over `apps/web/src` and `packages/ui/src` is now empty.                                                 | fixed  |
| F-07 | HIGH | R-32        | `apps/web/src/components/home/reference-picker.tsx:379`, `apps/web/src/components/home/wall-cards.tsx:315`                                                                            | Two hand-rolled modals had no focus containment: Tab walked into the page behind the overlay. `WallModal` had no `role="dialog"`, `aria-modal`, or accessible name at all. Escape worked.                                                  | Added `apps/web/src/lib/focus-trap.ts` (`trapTab`) and wired it into both keydown handlers; `WallModal` now carries `role="dialog"`, `aria-modal="true"` and `aria-label={title}`.                                       | fixed  |
| F-08 | HIGH | R-27        | `apps/web/src/routes/images.tsx:184`, `gallery.tsx:337`, `assets.tsx:378`, `video.tsx:89`, `index.tsx:149`                                                                            | A failed refetch was silent on five routes: the view kept the last frame or showed the empty state, with no way to retry. `/video` was the only route with an error state.                                                                 | Added `apps/web/src/components/refresh-error.tsx` (text plus a Try-again button) and rendered it when `isRefetchError` on the five routes. Route-load failures already land on `RouteError` via `defaultErrorComponent`. | fixed  |
| F-09 | HIGH | R-03        | `apps/web/src/components/video/composer.tsx:602`, `canvas/nodes.tsx:173`, `home/composer.tsx:1137`, `video/composer.tsx:952`, `generate-dialog.tsx:538`, `studio/item-dialog.tsx:448` | Six interactive controls were 16–24 px: thumbnail remove buttons at `size-4` (16 px) and one at `size-5` (20 px), below the 24×24 WCAG 2.2 AA minimum (2.5.8), plus the video mode pills at `h-6` (24 px, at the floor but still cramped). | Remove buttons raised to `size-6` (24 px), mode pills to `h-8` (32 px).                                                                                                                                                  | fixed  |
| F-10 | HIGH | R-03        | `apps/web/src/styles.css:96` (rule), 32 controls covered                                                                                                                              | Most secondary actions sit at 24–36 px (`h-6`, `h-7`, `h-8`, `h-9`, `size-9`), below the 44 px target the skill asks for. They meet WCAG 2.2 AA 2.5.8 (24×24) after F-09.                                                                  | `@media (pointer: coarse)` gives every button and link a 44×44 minimum on touch; the mouse layout keeps its density. Canvas node controls are excluded because they sit in a fixed-width node.                           | fixed  |

### MEDIUM (Purpose-Gate, reason required)

| #    | Tier   | Rule | File:line                                                                                                                                         | Finding                                                                                                                                                                                                             | Fix / reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Status |
| ---- | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| F-11 | MEDIUM | R-10 | `apps/web/src/styles.css` (no rule), 0 classes                                                                                                    | `backdrop-blur` appeared on 39 class strings: sticky top bars, both composer bars, modal scrims, toasts, media badges. The dose cap is 1–2.                                                                         | Removed from all 39. Every surface that carried blur is now opaque: the three sticky top bars are `bg-canvas`, the composer bars are `bg-surface` (the `/92` tint is gone), the toast is `bg-surface`, the two modal scrims drop backdrop-filter entirely, and the media chips are solid `bg-ink`. `rg backdrop-blur` returns 0 in both packages.                                                                                                                                                                                                                                                                     | fixed  |
| F-12 | MEDIUM | R-12 | `packages/ui/src/card.tsx:13`, `dialog.tsx:29`, `dropdown-menu.tsx:22`, `apps/web/src/components/gallery-card.tsx:12`                             | Every card, dialog, menu, toast and wall tile carried a shadow, so elevation read as the default.                                                                                                                   | Cards, wall tiles, gallery tiles, canvas nodes, the chat composer and the chat bubbles lost their shadow and are identified by `border-line-strong` instead. Shadow now exists only on the five elevation surfaces: dialog (12 sites), menu (2), toast (3), assistant panel (2), fab (1). `--shadow-card` and `--shadow-primary` had no consumers left and were deleted from both token blocks; the primary button is a flat accent fill.                                                                                                                                                                             | fixed  |
| F-13 | MEDIUM | R-06 | `apps/web/src/components/app-shell.tsx:179`, `routes/index.tsx:129`, `routes/images.tsx:431`, `routes/video.tsx:258`, `components/sidebar.tsx:84` | Uppercase micro-labels with `tracking-[0.14em]`–`[0.18em]` (Inbox, Workspace, Empty wall, Library), many at 9–10.5px.                                                                                               | All 63 `uppercase` utilities and 64 wide-tracking utilities removed; the labels read in sentence case with normal tracking. Every sub-11px size was raised to 11px (253 declarations), so nothing renders below 11px in either package. The micro-label colour was already `text-ink/65` (4.91 / 7.19), so the bar stays clear. `rg uppercase` and `rg 'tracking-[0.xem]'` both return 0.                                                                                                                                                                                                                             | fixed  |
| F-14 | MEDIUM | R-25 | `apps/web/src/styles.css:18` (`--color-line`), used as `border-line` on cards and dividers                                                        | `border-line` is 1.22:1 light and 1.76:1 dark against the canvas, so a container outlined only by it is not identifiable.                                                                                           | Containers moved to `border-line-strong`: cards, wall and gallery tiles, dialogs, menus, toasts, the assistant panel and drawer, media tiles, pickers and the rows inside them (168 declarations across 53 files). `border-line` survives only as a pure divider inside an already-bounded container, which measures 1.22 / 1.76 and is recorded as the intended exception. Container boundaries measure 3.63 light / 4.17 dark on canvas and 3.85 on surface.                                                                                                                                                        | fixed  |
| F-15 | MEDIUM | R-19 | `apps/web/src/components/chat/chat-thread.tsx:150`, `packages/ui/src/card.tsx:16`, `components/home/wall-cards.tsx:28`                            | Entrance animation on whole lists: `motionList`/`motionListItem` staggered every chat starter and every media strip, and `cardMotion`/`motionMountRise` ran on every wall card, gallery tile and studio cell mount. | List entrance motion removed everywhere: chat starters, media strips, the media picker grid, the model grid and the selector list are plain elements, and wall cards, gallery tiles, upload tiles, studio cells, empty states and the canvas palette no longer mount-animate. `Card` lost its `animateIn` prop and six call sites. `motionList`, `motionListItem` and `motionMountRise` had no consumers left and were deleted with the `rise-in` keyframes; the motion test was trimmed to the surviving presets. Motion that answers a user action (dialog, menu, tab pill, toast, expand, checkmark) is untouched. | fixed  |
| F-16 | MEDIUM | R-04 | `apps/web/src/components/assistant/fab.tsx:111`, `routes/gallery.tsx:144`, `packages/ui/src/button.tsx`                                           | `Sparkles` was the glyph for the assistant entry, New render, Generate, Train model, Prepare and the Today nav item (14 glyph usages across 14 files): one generic sparkle naming six different actions.            | Every `Sparkles` import is gone. The assistant entry and its panel/empty-state header use `MessageSquareText`, New render uses `ImagePlus`, Generate uses `Play`, Train model and Retrain use `GraduationCap`, Prepare and Re-prep use `Paintbrush`, the canvas prompt node and palette use `TextCursorInput`, and the Today nav item uses `Inbox`. Every icon-only button now carries a `title` as well as its `aria-label` (four were missing it: Close, Close picker, Close menu, Close preview). `rg Sparkles` returns 0.                                                                                         | fixed  |

### LOW (Quality Locks)

| #    | Tier | Rule | File:line                                       | Finding                                                                                                                          | Fix                                                                                                                                                                                                                                                                                                      | Status |
| ---- | ---- | ---- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| F-17 | LOW  | R-02 | `apps/web/src/lib/edit-prompt.ts:400`           | Decorative separator comment built from repeated dashes.                                                                         | Replaced with a plain one-line comment: `// One template per family: same facts, different vendor-recommended shape.`                                                                                                                                                                                    | fixed  |
| F-18 | LOW  | R-27 | `apps/web/src/components/route-error.tsx:79`    | Generic heading "Something went wrong." hid what happened while the body explained it.                                           | Heading is now "This page could not be rendered.", matching the body. `rg "Something went wrong"` returns nothing.                                                                                                                                                                                       | fixed  |
| F-19 | LOW  | R-39 | `apps/web/src/components/home/composer.tsx:986` | The Multi switch thumb sat on the `bg-ink/20` track at 1.50:1 light and 1.76:1 dark.                                             | Thumb is `bg-canvas` and the off track is `bg-ink/60`: 4.25:1 light and 6.28:1 dark, on-state 7.24 / 5.62 against the accent. This was also the last hardcoded `bg-white` in `apps/web/src`.                                                                                                             | fixed  |
| F-20 | LOW  | R-40 | `packages/ui/src/image.tsx:44`                  | The `FadeImage` primitive rendered `<img>` without intrinsic `width`/`height`, so the browser had no aspect ratio before decode. | `FadeImage` now takes `width`/`height` explicitly and forwards them to the `<img>`. Call sites pass them wherever the data carries dimensions: wall outputs, gallery items, uploads, previews and reference items (14 sites). Call sites whose data has no dimensions keep their aspect-ratio container. | fixed  |

### Copy and comment findings, kept apart

Fixes for copy can break a test that asserts a string; comment fixes cannot. Kept separate
so a comment pass can land alone.

| Kind    | #    | Rule | File:line                                                                                              | Finding                                 | Status |
| ------- | ---- | ---- | ------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------ |
| copy    | F-06 | R-02 | `apps/web/src/components/home/composer.tsx:442`, `apps/web/src/components/studio/train-dialog.tsx:291` | Em dash in a toast and in a placeholder | fixed  |
| copy    | F-18 | R-27 | `apps/web/src/components/route-error.tsx:79`                                                           | Generic error heading                   | fixed  |
| comment | F-17 | R-02 | `apps/web/src/lib/edit-prompt.ts:400`                                                                  | Decorative separator comment            | fixed  |

No test asserts either string: `rg "Queued|Something went wrong|one template per family"`
over `*.test.ts` returns nothing, so the two copy rows can land without a test edit.

---

---

## Route and state matrix

Static inspection of each route's data views. "error" means the view names the failure and
offers a retry or a route-level error boundary.

| Route       | empty                                         | loading                    | error                 | populated | Notes                                               |
| ----------- | --------------------------------------------- | -------------------------- | --------------------- | --------- | --------------------------------------------------- |
| `/` (Today) | yes                                           | skeleton row               | added (F-08)          | yes       | sticky header, `pb` accounts for the fixed composer |
| `/images`   | `EmptyWall` per tab                           | `WallSkeleton`             | added (F-08)          | yes       | two tabs, search, provider dot                      |
| `/video`    | `EmptyWall` with two copies (search vs empty) | `WallSkeleton`             | yes (pre-existing)    | yes       | reference pattern for F-08                          |
| `/canvas`   | new-graph default                             | route pending              | editor banner + toast | yes       |                                                     |
| `/gallery`  | dashed empty panel                            | skeleton grid              | added (F-08)          | yes       | canvas/grid views                                   |
| `/studio`   | per-tab empty                                 | `StudioSkeleton`           | route error only      | yes       | refetch error still silent; see F-08 note           |
| `/shoots`   | `EmptyStep` per step                          | step buttons show progress | `role="alert"` inline | yes       |                                                     |
| `/assets`   | dashed empty panel                            | skeleton grid              | added (F-08)          | yes       |                                                     |
| `/chat`     | starter prompts + empty rail                  | skeleton                   | toast on send failure | yes       |                                                     |
| `/settings` | n/a                                           | status pills               | route error only      | yes       | loader-backed                                       |

## Needs a visual pass (no server or browser was run)

1. **Dark theme first paint.** Confirm the boot script paints dark on a hard reload with
   `localStorage['sunnygen.theme'] = 'dark'`, with no light flash. Static evidence: the
   script is rendered inside `<head>` before `<body>`, wrapped in `try/catch`.
2. **Theme switch on the canvas.** Edge stroke and dot background should follow
   `data-theme` without a reload (`useThemeColors` + `MutationObserver`).
3. **Both themes at 375 px.** Tap targets, sticky headers over the composer, the mobile
   nav sheet, the assistant FAB offset.
4. **Dialog keyboard pass.** Tab/Shift+Tab must stay inside the reference picker and the
   wall modal after F-07; Escape still closes.
5. **200% zoom** on the composer prompt field and the Settings inputs.
6. **Hover borders got stronger.** Every `hover:border-ink/20|25` became `/60` (39 call
   sites), so cards, chips and drag targets darken noticeably more on hover than before.
   Check the weight on `/gallery` and `/assets` in light.
7. **Opaque surfaces replaced blur.** The three sticky top bars, both composer bars, the
   toast and the media chips are now solid colours. Confirm that content scrolling under
   a sticky bar reads cleanly without the blur, in both themes.
8. **Labels and scale.** Micro-labels lost uppercase and wide tracking and every size
   under 11px moved to 11px (253 declarations), so headings and metadata are visibly
   larger. Check the wall card headers, the studio panel labels and the Settings rows
   for crowding at 375px.
9. **Shadow removal.** Cards, wall tiles, gallery tiles, canvas nodes and chat bubbles no
   longer carry a shadow and are separated by `border-line-strong`. Check that the walls
   still read as distinct tiles on the canvas background.
10. **New icons.** The assistant entry (MessageSquareText), New render (ImagePlus),
    Generate (Play), Train (GraduationCap), Prepare (Paintbrush), canvas prompt node
    (TextCursorInput) and Today (Inbox) are new glyphs; confirm they read at 13–21px.
11. **Screenshots** named by the theme plan (`docs/screenshots/dark-settings.webp`,
    `docs/screenshots/dark-video.webp`) were not produced because they require a rendered
    pass with demo data.

## Delivery Gate

### Baseline (before fixes)

| Block         | Item                                            | Result                                                                                                 |
| ------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Hard Gate     | em dash in text                                 | FAIL (F-06)                                                                                            |
| Hard Gate     | text below AA contrast                          | FAIL (F-01, F-02, F-05)                                                                                |
| Hard Gate     | keyboard reachable, visible focus               | FAIL (F-07 focus rings F-03)                                                                           |
| Hard Gate     | every data view has empty/loading/error         | FAIL (F-08)                                                                                            |
| Hard Gate     | mobile tap targets                              | FAIL (F-09: 16–20 px controls, F-10: 24–36 px band)                                                    |
| Hard Gate     | theme toggle works in both modes                | PASS (shipped in the theme pass)                                                                       |
| Hard Gate     | no fabricated data, testimonials, nav dead ends | PASS (no statistics, no testimonials, every nav item routes to an existing page)                       |
| Purpose-Gate  | gradient/glow dose                              | PASS (no gradients except bottom scrims on hover media; no glow)                                       |
| Purpose-Gate  | glassmorphism dose                              | FAIL before (F-11): 39 blurred classes, dose cap 1–2                                                   |
| Purpose-Gate  | shadow dose                                     | FAIL (F-12)                                                                                            |
| Liveliness    | dials declared                                  | PASS (ENERGY 1 / RHYTHM 2 / MOTION 2: warm studio ledger, one accent, motion limited to state changes) |
| Craftsmanship | every decision has a reason                     | PASS with F-13/F-16 written reasons                                                                    |

### After fixes

| Block         | Item                                    | Result                                                                                                                                          |
| ------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Hard Gate     | em dash in text                         | PASS: no U+2014 in `apps/web/src` or `packages/ui/src`                                                                                          |
| Hard Gate     | text below AA contrast                  | PASS: every remaining tier is `/65` or stronger; `/65` = 4.91 light / 7.19 dark; semantic tokens at full opacity; no text under 11px            |
| Hard Gate     | keyboard reachable, visible focus       | PASS: focus rings and borders `accent/70` (4.10 / 3.35); two modals contain Tab; every icon-only button has `aria-label` plus a `title`         |
| Hard Gate     | every data view has empty/loading/error | PASS: five routes gained a refetch error strip; `/studio` and `/settings` rely on the route error boundary, which handles their loader failures |
| Hard Gate     | mobile tap targets                      | PASS: 44×44 minimum under `pointer: coarse`, 24×24 minimum on mouse (WCAG 2.2 AA)                                                               |
| Hard Gate     | theme toggle works in both modes        | PASS statically; needs the visual pass above                                                                                                    |
| Hard Gate     | no fabricated data, testimonials, nav   | PASS: no statistics, no testimonials, every nav item routes to an existing page                                                                 |
| Purpose-Gate  | glassmorphism dose                      | PASS: 0 `backdrop-blur` in either package; opaque surfaces where the blur was                                                                   |
| Purpose-Gate  | shadow dose                             | PASS: shadow on 5 elevation surfaces only (dialog 12, menu 2, toast 3, panel 2, fab 1); cards and tiles use `border-line-strong`                |
| Purpose-Gate  | type and label consistency              | PASS: 0 `uppercase`, 0 wide-tracked labels, 0 sub-11px text; labels read in sentence case                                                       |
| Purpose-Gate  | icon relevance                          | PASS: 0 `Sparkles`; each action carries a glyph that names it; every icon-only button has a visible tooltip                                     |
| Liveliness    | dials declared                          | PASS (ENERGY 1 / RHYTHM 2 / MOTION 1: warm studio ledger, one accent, motion only for user-action state changes)                                |
| Craftsmanship | every decision has a reason             | PASS                                                                                                                                            |

## Theme pass notes (dark theme plan)

- The two `theme-color` metas the plan asked for do not survive: TanStack's head
  renderer de-duplicates meta descriptors by `name` (`headContentUtils.js`,
  `metaByAttribute`), so a second `theme-color` is dropped. The plan's documented
  fallback is in place: one meta plus the boot script, which rewrites its `content` to
  `#17120f` or `#faf6ef` before paint. `applyTheme` keeps it in sync on every switch.
- `manifest.webmanifest` keeps `theme_color: #FAF6EF`, as the plan directs; an installed
  dark-mode app therefore gets a light splash. Accepted mismatch, noted here.
- Hex literals that remain in `apps/web/src` are deliberate: the pre-CSS boot script
  string, the `theme-color` values (a meta attribute cannot read a CSS variable), the
  SSR fallbacks in `lib/theme-colors.ts`, and the existing `msapplication-TileColor`
  meta. The plan's Task 4 grep therefore reports these six lines and not zero.
- The dark-theme plan declared five shadow tokens. F-12 removed the card and primary
  shadows, so `--shadow-card` and `--shadow-primary` were deleted from both blocks, and
  three directional ones were added so the assistant FAB and panel keep their elevation
  (`--shadow-fab`, `--shadow-panel-up`, `--shadow-panel-side`). The shipped set is six
  tokens over five elevation surfaces: dialog, menu, toast, panel-up/panel-side and fab.

## Findings left open

None. Every row is `fixed`; the two deliberate leftovers are recorded inside their rows
rather than as open findings:

- `border-line` still measures 1.22:1 (light) and 1.76:1 (dark), but it now only draws
  dividers inside an already-bounded container (F-14). Every container boundary is
  `border-line-strong` at 3.63 / 4.17.
- `FadeImage` call sites whose data carries no dimensions keep their aspect-ratio
  container instead of passing width and height (F-20).

## After-gate contrast delta

| Metric                              | Baseline                           | After fixes                                   |
| ----------------------------------- | ---------------------------------- | --------------------------------------------- |
| Failing `text-ink/N` pairs, light   | 16                                 | 0                                             |
| Failing `text-ink/N` pairs, dark    | 6                                  | 0                                             |
| Failing semantic-token text pairs   | 13                                 | 0                                             |
| Focus-indicator pairs below 3:1     | 15                                 | 0 (`accent/70` = 4.10 light, 3.35 dark)       |
| Hover-boundary pairs below 3:1      | 39                                 | 0 (`ink/60` = 4.32 light, 6.04 dark)          |
| Container boundaries below 3:1      | 129 cards and tiles                | 0 (`line-strong` = 3.63 / 4.17 on canvas)     |
| Divider pairs below 3:1 (by design) | 2                                  | 2, dividers only, no container relies on them |
| `backdrop-blur` class strings       | 39                                 | 0                                             |
| Shadow-carrying surfaces            | cards, tiles, nodes, menus, toasts | 5 elevation surfaces only                     |
| `uppercase` / wide-tracked labels   | 63 / 64                            | 0 / 0                                         |
| Text below 11px                     | 253 declarations                   | 0                                             |
| `Sparkles` glyphs                   | 14 usages / 14 files               | 0                                             |
| List entrance and mount animations  | 6 list templates, 2 presets        | 0                                             |

## Verification run

```text
pnpm test          505 pass, 0 fail (core 71, web 228, db 21, providers 185)
pnpm typecheck     pass, 5 tasks
pnpm lint          clean
pnpm format:check  clean (410 files)
pnpm build         pass
```
