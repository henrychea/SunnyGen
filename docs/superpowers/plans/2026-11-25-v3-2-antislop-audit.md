# Full Antislop Audit Implementation Plan

> **For agentic workers:** Executed by Orca Pi workers. Task 1 must finish before any
> other task. Tasks 2 to 5 produce sections of one report and may run in parallel.
> Task 6 (write and rank the report) needs all of them. Tasks 7 to 9 (fixes) need the
> owner's approval of specific finding numbers and must run in that order: 7, then 8,
> then 9. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auditing every route and shared component of SunnyGen in both themes at three widths, producing one ranked findings report at `docs/audits/2026-v3-antislop.md`, then fixing the approved findings.

**Architecture:** The antislop core runs in AFTER mode: the audit produces a numbered, ranked findings list with `file:line` evidence and a rule ID per row, the owner picks numbers, and only those get fixed. Six skill files supply the checks: `antislop` (gate and rules), `antislop-ui` (visual), `antislop-human` (contrast script, keyboard, states), `antislop-layoutmobile` (reflow, tap targets), `antislop-copywriting` (text), `antislop-code` (comments).

**Tech Stack:** The six skill files under `~/.claude/skills/`, `python3` for `contrast-check.py`, demo data through `pnpm dev:demo`, Markdown for the report.

**Spec:** `docs/superpowers/specs/2026-11-25-v3-release-design.md` (section 2)

**Depends on:** `docs/superpowers/plans/2026-11-25-v3-1-dark-theme.md`. The dark theme lands first, because an audit of one theme is half an audit and the light-only fixes would be re-opened immediately.

## Global Constraints

- **Do not commit.** Leave every change in the working tree and report.
- **Demo data only.** `pnpm dev:demo` (port 8978, data in `~/.local/share/sunnygen-demo/data`, copied at `.temp/demo-app`). Never open `data/sunnygen.db`, never the Docker `sunnygen-prod` container, never real media. Seed the demo folder with neutral, non-identifying images.
- **Stop the demo server when a task ends.** Do not leave it running.
- **No fixes before approval.** Tasks 2 to 6 produce a report only. Editing a file before the owner approves its finding number breaks the process this plan exists for.
- **One finding, one row.** Every row cites a file and a line that exist at audit time, the rule ID, and a one-line reason. No "general polish" rows.
- **No invented numbers.** Every contrast ratio is either produced by `contrast-check.py` or computed with the WCAG formula from `antislop-human`; quote the exact output.
- The system prompt must not be edited, and `docs/image-providers.md` is the owner's untracked file. Leave it alone.
- Report and any new doc land in `docs/`; `oxlint` ignores `docs/**`, `oxfmt` does not.

## Review Focus

1. An audit run at one width and one theme misses most of what it exists to find. Pinned in Task 1: a fixed matrix of 10 routes x 3 widths x 2 themes, each cell visited.
2. Eyeballed contrast is the standard failure of this kind of work. Pinned in Task 2: the script runs on every token pair and the three known light-theme failures must reproduce (warning 4.21, `text-ink/55` 3.64, `line` 1.22).
3. A report with no line numbers cannot be fixed. Pinned in Task 6: the report template rejects a row without `file:line`.
4. Fixing LOW findings before HIGH ones hides the gate failures behind cosmetic churn. Pinned in Task 6's ranking rule and Tasks 7 to 9 order.
5. "Fixed" without re-running the gate is an unverified claim. Pinned in Task 10: the Delivery Gate is re-run and its PASS/FAIL lines are pasted into the report.

---

### Task 1: Load the skills and fix the inspection matrix

**Files:**

- Create: `docs/audits/2026-v3-antislop.md` (header, method, matrix; sections filled in later tasks)
- Read: `~/.claude/skills/antislop/SKILL.md`,
  `~/.claude/skills/antislop-ui/SKILL.md`,
  `~/.claude/skills/antislop-human/SKILL.md`,
  `~/.claude/skills/antislop-layoutmobile/SKILL.md`,
  `~/.claude/skills/antislop-copywriting/SKILL.md`,
  `~/.claude/skills/antislop-code/SKILL.md`

**Interfaces:**

- Consumes: the dark theme from the previous plan (both themes must exist).
- Produces: the report skeleton and the matrix every later task fills:
  - routes: `apps/web/src/routes/` `index`, `images`, `video`, `canvas`, `gallery`,
    `studio`, `shoots`, `assets`, `chat`, `settings`
  - widths: 375, 768, 1440 (narrow the real viewport; do not use a device list)
  - themes: `light`, `dark`
  - states per data route: empty, loading, error, populated
  - shared surface: `packages/ui/src` (17 modules) and `apps/web/src/components`
    (`app-shell`, `sidebar`, `assistant`, `canvas`, `chat`, `home`, `studio`, `video`,
    `model-combobox`, pickers, dialogs)

- [ ] **Step 1: Resolve the antislop mode**

Read the core skill and resolve the mode per its rules. If the owner has a saved global
preference of `during`, ask once: this release needs AFTER, because the report is the
deliverable. Record the resolved mode and its source in the report header, for example
`Mode: after (session instruction)`. Do not start inspection before the mode is settled.

- [ ] **Step 2: Write the report header and matrix**

Open `docs/audits/2026-v3-antislop.md` with: title, date, mode and source, the six skill
files used, the matrix above, and an empty findings table with these columns:

```markdown
| # | Tier | Rule | File:line | Finding | Fix | Status |
```

Status is `open`, `approved`, `fixed`, or `wontfix`. Rows are never deleted, only
re-statused, so the report stays historical.

- [ ] **Step 3: Build the demo dataset**

Run `pnpm dev:demo`, and with demo data only, make sure the app can show: an empty wall,
a failed generation, a queued one, a multi-output group, a folder group, a video, an
audio asset, an avatar with three images, and a LoRA. The error and empty states matter
as much as the happy path (`antislop` R-27). Stop the server when the state exists and
record how each state is reached, so later tasks reproduce it.

- [ ] **Step 4: Seed the known-failure calibration rows**

Add three rows with status `open` and the note `calibration`: light `--color-warning`
`4.21:1` against `#FAF6EF`, light `text-ink/55` at `3.64:1`, light `border-line` at
`1.22:1` against the canvas. These were measured before the audit and prove the method
catches real failures. If Task 2 cannot reproduce them, the method is wrong, not the app.

- [ ] **Step 5: Verify and report**

Run: `pnpm exec oxfmt docs/audits/2026-v3-antislop.md && pnpm format:check`
Expected: clean. No commit. Report the resolved mode, the matrix, and the three
calibration numbers.

### Task 2: Contrast matrix for both themes

**Files:**

- Modify: `docs/audits/2026-v3-antislop.md` (contrast section)
- Read: `apps/web/src/styles.css` (both token blocks)

**Interfaces:**

- Consumes: the ten tokens from the dark theme plan (`canvas`, `surface`, `ink`, `line`,
  `line-strong`, `accent`, `accent-ink`, `success`, `warning`, `error`).
- Produces: a table of every token pair used as text-on-background or control-on-
  background, in both themes, each row with the measured ratio and the pass/fail at 4.5:1
  (normal text) and 3:1 (large text and non-text boundaries).

- [ ] **Step 1: Run the script on the token pairs**

For every pair, run both colours through the checker:

```sh
python3 ~/.claude/skills/antislop-human/contrast-check.py "#17120f" "#f4ece1"
```

Use the real hex values. Pairs to cover, per theme: ink on canvas, ink on surface,
accent on canvas, accent on surface, accent-ink on accent, success on canvas, warning on
canvas, error on canvas, line-strong on canvas, line-strong on surface, line on canvas,
surface on canvas (informational).

- [ ] **Step 2: Run the opacity tiers**

`text-ink/55`, `/60`, `/65`, `/70`, `/75`, `/80` compile to a colour-mix, so the token
pair alone does not tell you the answer. Measure the composited colour at each tier
against canvas and surface, both themes. Record the tier, the computed hex, and the ratio.
Any tier used for body text must clear 4.5:1; a tier used only for micro-labels still
must, unless the text is 18px or larger (then 3:1).

- [ ] **Step 3: Check the control boundaries**

Inputs, selector triggers, checkbox outlines, focus rings, and status dots are non-text
(3:1, WCAG 1.4.11). Measure `border-line` and `border-line-strong` against the surface
they sit on, and the focus ring (`ring-accent/35`, `border-accent/40`) against canvas.
A focus ring at 35% accent over canvas is the most likely failure in the app.

- [ ] **Step 4: Fill the table and add findings**

Add one row per failing pair to the findings table, tier HIGH (R-25 or the non-text
criterion), with the exact ratio in the Finding column and the smallest fix (raise the
token, drop the opacity tier, switch to `line-strong`).

- [ ] **Step 5: Verify and report**

Run: `pnpm exec oxfmt docs/audits/2026-v3-antislop.md`
Expected: no change or a formatting-only change. No commit. Report the pair table and the
count of failing pairs per theme. The three calibration rows must now be either confirmed
or contradicted, with the number that proves it.

### Task 3: Route and component sweep at three widths

**Files:**

- Modify: `docs/audits/2026-v3-antislop.md` (visual, layout, motion sections)

**Interfaces:**

- Consumes: the matrix from Task 1, the demo dataset.
- Produces: findings with rule IDs from `antislop-ui` (R-01, R-04, R-07, R-09, R-10,
  R-12, R-13, R-19, R-22) and `antislop-layoutmobile` (R-03 plus its checklist).

- [ ] **Step 1: Sweep the 10 routes at 1440 in both themes**

For each cell, check and record: one focal point, hierarchical contrast, shadow and blur
dose, accent used once not everywhere, icons that mean something, motion with a purpose,
and any surface that kept a light colour after the theme switch. Screenshot the cell when
a finding needs a picture; keep screenshots in `.temp/audit/` and describe them in the
row.

- [ ] **Step 2: Re-sweep at 768 and 375**

At 768, look for the "two-state layout" failure: content that neither stacks with intent
nor fits the grid (`antislop-layoutmobile`, Two-State Layout). At 375, look for
horizontal overflow, text escaping its container, cards clipping, and the mobile nav.
Measure every tap target against 44x44, including the video composer's mode pills and the
wall card action buttons.

- [ ] **Step 3: Check sticky and fixed bars**

`apps/web/src/routes/video.tsx:80` and `apps/web/src/routes/index.tsx:126` use sticky top
bars, and the composers are fixed at the bottom. Confirm they do not cover content, do
not cover a focused input with the on-screen keyboard, and respect
`pwa-safe-top` / `pwa-safe-bottom` from `apps/web/src/styles.css:81-89`.

- [ ] **Step 4: Check motion**

Every animation must stop or become trivial under `prefers-reduced-motion: reduce`
(`apps/web/src/styles.css:113-123` handles the skeleton and view transitions;
`MotionConfig reducedMotion="user"` in `apps/web/src/routes/__root.tsx:51` handles motion).
Record any animation that still runs, any animation longer than 5 seconds without a pause,
and any entrance animation applied to a whole list.

- [ ] **Step 5: Fill rows and verify**

Add one row per finding, with `file:line`. Run `pnpm exec oxfmt docs/audits/2026-v3-antislop.md`.
No commit. Report counts per route and the three worst cells.

### Task 4: Human pass (keyboard, focus, states, semantics)

**Files:**

- Modify: `docs/audits/2026-v3-antislop.md` (accessibility section)

**Interfaces:**

- Consumes: Task 1's dataset.
- Produces: findings under R-26, R-27, R-32, R-34, R-39, plus the `antislop-human`
  checklist.

- [ ] **Step 1: Keyboard-walk every route**

Tab through each route in order. Record: any element skipped, any focus that lands on a
hidden element, any control not operable with Enter or Space, any dialog not closable
with Escape, and any focus ring that is invisible or under 3:1 against its neighbours.
The dialogs to check specifically: `packages/ui/src/dialog.tsx`, the wall modal in
`apps/web/src/components/home/wall-cards.tsx`, the resize dialog, and the assistant panel
in `apps/web/src/components/assistant`.

- [ ] **Step 2: Check the three states on every data view**

Empty, loading, error. Use the dataset from Task 1. Record any view with a missing state,
a spinner with no text, or an error that does not say what happened. The wall already
handles this at `apps/web/src/routes/video.tsx:147-227`; compare the other routes to it.

- [ ] **Step 3: Check names, roles and affordances**

Every icon-only button needs an accessible name; every image needs `alt`; every field a
visible label; every enabled control `cursor: pointer` (set once in the base layer at
`apps/web/src/styles.css:65-77`). Divs and spans pretending to be buttons are findings.

- [ ] **Step 4: Check zoom and text resize**

At 200% zoom, confirm nothing clips and no horizontal scroll appears. Check the composer
prompt field and the Settings inputs.

- [ ] **Step 5: Fill rows and verify**

Run: `pnpm exec oxfmt docs/audits/2026-v3-antislop.md`. No commit. Report the count of
keyboard blockers, which is the highest-value number in the audit.

### Task 5: Copy and comment pass

**Files:**

- Modify: `docs/audits/2026-v3-antislop.md` (copy section, comment section)
- Read: every user-facing string in `apps/web/src/routes` and `apps/web/src/components`,
  and every comment in `apps/web/src` and `packages`

**Interfaces:**

- Consumes: `antislop` R-02, R-15, R-16, R-17, R-18, R-36, R-38; `antislop-copywriting`;
  `antislop-code`.
- Produces: copy findings and comment findings, kept in separate tables so the comment
  fixes can be applied in isolation (the code skill's guardrail is that only comments
  change).

- [ ] **Step 1: Sweep the copy**

Grep for the mechanical tells first, then read the strings:

```sh
rg -n "—" apps/web/src packages/ui/src --glob '*.tsx'
rg -n "Unlock|elevate|seamless|effortless|powerful|cutting.edge|next.gen|revolutionary|AI.powered" apps/web/src --glob '*.tsx' -i
rg -n "Get Started|Learn More|Try Now|Explore|Discover" apps/web/src --glob '*.tsx'
rg -n "Something went wrong|An error occurred|Failed\." apps/web/src --glob '*.tsx'
```

Then read the empty states, error states, and button labels on every route. A generic
error that hides the reason is an R-27 finding, not only a copy finding.

- [ ] **Step 2: Sweep the comments**

```sh
rg -n "^\\s*//\\s*[-=*_#]{3,}" apps/web/src packages --glob '*.ts' --glob '*.tsx'
rg -n "^\\s*//\\s*(TODO|FIXME)\\s*$|// (Step \\d|First,|Next,|Finally)" apps/web/src packages --glob '*.ts' --glob '*.tsx'
```

Plus a read of the ten densest files by comment count. Record decorative separators,
restated obvious lines, workflow narration, vague TODOs, and emoji in comments. Do not
record a comment that carries a real fact (a provider quirk, a limit, a workaround);
`antislop-code` protects those.

- [ ] **Step 3: Separate the tables**

Copy findings can change behaviour in tests (a renamed label breaks a query or a
snapshot). Comment findings cannot. Keep them apart so Task 9 can land without touching
copy.

- [ ] **Step 4: Verify and report**

Run: `pnpm exec oxfmt docs/audits/2026-v3-antislop.md`. No commit. Report the count of
copy findings, the count of comment findings, and the three worst user-facing strings.

### Task 6: Rank the report and get approval

**Files:**

- Modify: `docs/audits/2026-v3-antislop.md` (ranking, summary, delivery-gate reference)
- Read: the `antislop` Delivery Gate and the four gate blocks

**Interfaces:**

- Consumes: every row from Tasks 2 to 5.
- Produces: the final numbered report. Numbering is stable from here on; fixing a row
  keeps its number.

- [ ] **Step 1: Assign tiers**

HIGH for Hard Gate failures (R-02, R-03, R-17, R-18, R-23 to R-28, R-32 to R-40).
MEDIUM for Purpose-Gate failures (a technique with no written reason). LOW for Quality
Locks and consistency. A row whose tier is arguable goes up, not down.

- [ ] **Step 2: Sort and summarise**

Sort by tier, then by how many people the finding blocks (keyboard and contrast first,
decoration last). Write a five-line summary at the top: totals per tier, the number of
keyboard blockers, the number of AA failures per theme, and the one route in the worst
state.

- [ ] **Step 3: Write the gate baseline**

Run the Delivery Gate now, before any fix, and paste its PASS/FAIL lines into the report
with the status `baseline`. Task 10 re-runs it and pastes the `after` lines beside them.
A PASS claimed without evidence line-by-line is not a PASS.

- [ ] **Step 4: Ask for approval**

Report the summary and stop. The owner picks numbers; numbers not mentioned are not
touched. Do not start Task 7 without that list in writing.

- [ ] **Step 5: Verify and report**

Run: `pnpm exec oxfmt docs/audits/2026-v3-antislop.md && pnpm format:check`
Expected: clean. No commit. Report the summary block and the approval request verbatim.

### Task 7: Fix the approved HIGH findings

**Files:**

- Modify: whatever the approved HIGH rows cite
- Modify: `docs/audits/2026-v3-antislop.md` (status per fixed row)

**Interfaces:**

- Consumes: the approved HIGH number list.
- Produces: fixes only. No refactors, no new components, no token renames beyond what a
  row requires.

- [ ] **Step 1: Group the rows by file**

One pass per file, so a single read covers all findings in it. Do not jump between files.

- [ ] **Step 2: Fix, smallest change first**

A contrast failure is a token or class change. A missing state is the smallest component
that shows text. A dead control is removed or wired, never labelled "coming soon" unless
the row says so.

- [ ] **Step 3: Keep the tests green after each file**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: green after each file, so a break is attributable to one change.

- [ ] **Step 4: Update the report**

Set each fixed row's status to `fixed` and append the change in one line (`text-ink/55 →
text-ink/70 in 9 call sites`). Leave `wontfix` rows with the owner's reason.

- [ ] **Step 5: Verify and report**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all green. No commit. Report per-row status and any row that could not be fixed
as described.

### Task 8: Fix the approved MEDIUM findings

**Files:**

- Modify: whatever the approved MEDIUM rows cite

**Interfaces:**

- Consumes: the approved MEDIUM number list, plus the "written reason" requirement of the
  Purpose-Gate.
- Produces: either a fix, or a one-line written reason in the report that keeps the
  technique. Both outcomes are valid; silence is not.

- [ ] **Step 1: For each row, decide fix or keep-with-reason**

A gradient, glow, badge, or motion that serves hierarchy or identity gets a reason and
stays. One that exists because it looked "app-like" gets removed. Write the decision in
the row.

- [ ] **Step 2: Apply the fixes in one pass per area**

Areas: shadows and blur, gradients and glow, badges and eyebrows, icons, motion, and
layout rhythm. Do not mix areas in one change.

- [ ] **Step 3: Re-run the checks**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: green.

- [ ] **Step 4: Verify and report**

Run: `pnpm format:check`
Expected: clean. No commit. Report the fix/keep split with the reasons.

### Task 9: Apply the approved comment and copy fixes

**Files:**

- Modify: comments only for the comment rows
- Modify: strings for the copy rows

**Interfaces:**

- Consumes: the approved LOW/MEDIUM comment and copy rows.
- Produces: comments that carry facts, and copy without the mechanical tells.

- [ ] **Step 1: Comments first, nothing else in the diff**

Apply the comment rows with the `antislop-code` guardrail: only comments change, never
code, imports, formatting, or identifiers. Run `pnpm typecheck` after, to prove the code
is untouched in effect.

- [ ] **Step 2: Copy second**

Apply the copy rows. Update any test that asserts a changed string, and say which test in
the report.

- [ ] **Step 3: Verify and report**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all green. No commit. Report comments changed, strings changed, tests updated.

### Task 10: Re-run the gate and close the report

**Files:**

- Modify: `docs/audits/2026-v3-antislop.md` (after-gate lines, final status)

**Interfaces:**

- Consumes: everything above.
- Produces: a report whose every row is `fixed` or `wontfix` with a reason, and an
  `after` gate block beside the `baseline` block.

- [ ] **Step 1: Re-run the contrast matrix**

Task 2's table again, on the fixed code. Any pair that moved must be re-measured, not
assumed. Paste the new values in a second column.

- [ ] **Step 2: Re-run the Delivery Gate**

All four blocks, with one evidence line per item. Any FAIL blocks delivery: fix, re-run,
then report.

- [ ] **Step 3: Re-walk the three worst cells**

The routes and widths called out in Task 6's summary, in both themes, at 375 and 1440.

- [ ] **Step 4: Verify and report**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all green. No commit. Report the after-gate block, the row status totals, and
the delta in failing contrast pairs per theme.
