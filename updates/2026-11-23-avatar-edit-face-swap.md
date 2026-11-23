# Avatar edits now ask for the face swap

- Date: 2026-11-23
- Status: open, PR pending

## Summary

Every avatar edit prompt now opens with an explicit instruction to replace the person in
the target photo with the avatar, copying the face, facial features, skin tone and hair
from the identity references. The keep line no longer protects the target's hair, so the
only face and hair that survive are the avatar's.

## Why

Avatar edits on Nano Banana 2.1 (Sunra) and Seedream 5.0 Flash came back as the target
photo nearly unchanged. The Sunra request logs showed all four images arrived (target,
front face, full body, three-quarter face), so the queue and the crop plan were fine. The
keyword prompt built by `buildKeywordEditPrompt` said "`<target>` is the target photo",
described the avatar, replaced the body, and then said "Keep `<target>`'s pose, clothing,
hair unless changed, background, lighting and camera." It never asked for a face swap and
it told the model to keep the target's hair, so Gemini obeyed it literally. GPT Image and
Seedream swapped the face on their own, which hid the gap.

## What changed

- `apps/web/src/lib/edit-prompt.ts`: `buildKeywordEditPrompt` emits one new sentence
  directly after the identity line, in every family: "Replace the person in `<target>`
  with the avatar: copy the face, facial features, skin tone and hair from `<identity
  refs>`", naming the identity references with their roles (front face, full body,
  three-quarter face). With no identity avatar slots it falls back to "the avatar
  description". The sentence is worded positively and carries no "do not", so the
  nano-banana profile's no-negatives rule still holds. The keep line drops "hair unless
  changed" and now reads "Keep `<target>`'s pose, clothing, background, lighting and
  camera." The swap sentence lives in the fixed head of the trim loop, so no tier removes
  it; only the identity clause still gives way under a length cap.
- `apps/web/src/lib/edit-prompt.test.ts`: the role and anchor test expects the new keep
  line, a new test asserts the nano-banana and qwen prompts contain the replace-person
  sentence and never contain "hair unless changed", and the qwen stress instruction moves
  from 400 to 300 characters because the fixed floor is now 467 characters.
- `apps/web/src/lib/edit-prompt.profiles.test.ts`: the seven locked family snapshots gain
  the swap line and the shorter keep line. Qwen's clause gives up its last anchor (the
  parting) to make room.

## How to verify

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check

SUNNYGEN_DATA_DIR=<data-dir> \
  pnpm --filter @sunnygen/web exec tsx scripts/prompt-lab.ts \
  --avatar <avatar-name> --target <asset-id> \
  --models sunra:google/gemini-nano-banana-2.1,sunra:openai/gpt-image-2.5-flare \
  --out .temp/prompt-lab
```

The offline lab prints one prompt per model. The nano-banana prompt should carry the
replace-person line as its third line and a keep line with no hair in it. To check live,
edit a portrait with an avatar on Nano Banana 2.1: the result's face and hair should be
the avatar's, and the keep line should only protect pose, clothing, background, lighting
and camera.

## Limits

- Qwen's 800 character cap now leaves about 330 characters for the typed instruction
  (774 characters at a 61 character instruction, 796 at 300). A longer instruction reports
  an overflow instead of trimming the boilerplate further. Before this change the room was
  about 400 characters.
- The swap sentence is not verified live yet. This change is prompt text only, and no
  generation was run against a provider while writing it.
- The face swap is still one instruction among many. A model that ignores it keeps the
  target face; nothing compares the result's face with the avatar afterwards.
- The demo database has no avatar profile, so the prompt lab cannot render a keyword
  prompt from it at all. The sample run in the report used a throwaway copy of the demo
  database with a profile injected.
