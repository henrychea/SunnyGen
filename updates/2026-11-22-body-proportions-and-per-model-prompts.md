# Body proportions and per-model edit prompts

- Date: 2026-11-22
- Status: merged, PR #16, merge commit `a1bb853`

## Summary

Avatar edits carried the face but kept the target photo's body. The prompt now replaces
the target's figure with the avatar's in a dedicated paragraph, the full-body crop moves
to the second reference slot, and each model family gets its own prompt shape through
`EDIT_PROMPT_PROFILES`. Qwen prompts that cannot fit the 800 character cap are now
refused by the composer instead of being silently truncated by the API.

## Why

The old prompt told the model "Do not slim, widen or beautify the body" and the
full-body reference arrived last as a small crop. That reads as "keep the target's
figure", and on Nano Banana the output kept the target's hips and thighs. Vendors also
document opposite advice: Gemini wants long, specific prompts, while Alibaba truncates
Qwen's `input.prompt` at 800 characters.

## What changed

**Body directive.** `apps/web/src/lib/edit-prompt.ts` now builds an imperative body
paragraph in `bodyDirective()`. It names the avatar's height, weight, build, bust and
legs, cites the full-body slot as `image 3 (full body)`, and takes shoulder width, chest,
waist, hips and thigh width from that image. The contradictory "keep the body" line is
gone from both the profiled and the legacy branches.

**Crop order.** `avatarCropPlan` in `packages/core/src/avatar-references.ts` returns
`face-front, body-front, face-three-quarter`. The body reference is the second image
after the target in every family, so it outranks the second face for proportions.

**Per-model profiles.** `packages/core/src/edit-prompt-profiles.ts` defines
`EDIT_PROMPT_PROFILES`, keyed by family. Each entry sets `clauseBudget`, `detail`
(`detailed` or `compact`), `bodyPlacement` (`early` or `late`), `negatives` (`allow` or
`avoid`), `restateBody`, `maxRefs`, and `maxChars` when the vendor documents a cap.

- `nano-banana`: 600 character clause, detailed, body early, positive phrasing, closing
  restatement, three refs. Google asks for specific prompts with named roles and a keep
  list.
- `qwen`: 800 character hard cap, 250 character clause, compact, body early, negatives
  allowed, two refs. Alibaba truncates `input.prompt` instead of failing, so the prompt
  has to fit.
- `flux`: 600 character clause, detailed, body late, negatives allowed, three refs. BFL
  wants the reference mapping up front and a narrative prompt.
- `seedream`: 600 character clause, detailed, body late, negatives allowed, three refs.
  BytePlus labels each role and asks for explicit keep and avoid constraints.
- `gpt-image`: 450 character clause, compact, body late, negatives allowed, three refs.
  OpenAI asks for a concise, explicit edit instruction with inputs referenced by order.
- `grok`: 350 character clause, compact, body early, negatives allowed, two refs. xAI
  documents short, direct prompts.
- `generic`: 600 character clause, detailed, body late, negatives allowed, three refs,
  the middle of every range.

**Overflow.** `buildEditPromptResult()` returns `{ prompt, overflow }`. For a capped
family it retries in a fixed order: drop supporting references, then reduce body detail
to the facts, then trim the identity clause toward its subject. The user's instruction is
never cut. A prompt that still exceeds the cap returns `overflow` with `overBy` and
`maxChars`, and the composer in `apps/web/src/components/home/composer.tsx` shows an
error and refuses to submit.

**Proof.** `apps/web/src/lib/edit-prompt.profiles.test.ts` covers 22 documented model
ids, per family snapshots, the 300 character instruction case, the unchanged legacy
prompt, and Qwen overflow at 900 characters. `apps/web/scripts/prompt-lab.ts` builds the
exact request per model for free and writes `report.md` and `requests.json`;
`--live --yes` prints the catalog cost, runs the real generations, and writes an
`index.html` contact sheet. The offline run against a sample avatar (slim build, 165 cm,
49 kg) measured 945 characters for Nano Banana, 665 for Qwen, 810 for FLUX and 725 for
GPT Image.

## How to verify

```sh
pnpm --filter @sunnygen/web test

SUNNYGEN_DATA_DIR=<data-dir> \
  pnpm --filter @sunnygen/web exec tsx scripts/prompt-lab.ts \
  --avatar <avatar-name> --target <asset-id-or-file> \
  --models sunra:nano-banana-pro --out .temp/prompt-lab
```

## Limits

- The visual result is proven by tests and the offline lab, not by a live generation in
  CI. One `--live --yes` run costs money and was not part of the merge.
- Qwen's catalog entry must be synced before the lab can resolve it; the other families
  work from `IMAGE_MODELS`.
- `face-three-quarter` is still the second frontal expression in these panels, not a
  true three-quarter angle. The role name is unchanged so stored crops stay valid.
