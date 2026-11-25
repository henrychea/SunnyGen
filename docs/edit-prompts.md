# Edit prompts per model family

What each vendor's own documentation says about prompting an image edit, and what our template
does with it. Only qwen publishes a hard limit; everywhere else the shape is a recommendation.
OpenAI and xAI are marked as having no documented guidance because their pages give none we can
cite, and guessing there would be worse than saying so.

Our implementation: `apps/web/src/lib/edit-prompt.ts`. One template per family, rendering the
same facts (image roles, face and hair and body features, keep list, integration list) with the
same trim tiers. Tests: `apps/web/src/lib/edit-prompt.panels.test.ts` (per-family snapshots) and
`apps/web/src/lib/edit-prompt.profiles.test.ts` (avatars saved before the split).

## The references we send

An avatar is three whole images, sent after the target (or first, when a family's target rule
puts the target first) and never cropped into tiles first. Resizing happens only at send time.

The prompt names each image by the cells it holds, because the panels are 2x2 layouts:

- `image N is the face panel: top-left front, top-right three-quarter, bottom-left side profile,
  bottom-right hands`
- `image N is the body panel: top-left front, top-right side profile, bottom-left back,
  bottom-right three-quarter`
- `image N is the character reference sheet: expressions, hair, hands, skin texture, facial
  features and body details`

The face section comes from the face panel, the body from the body panel's front and side profile
cells, and the hair, skin and hands from the sheet. A family that names only two avatar references
(qwen, grok) gets the two panels and loses the sheet, so its hair falls back to the face panel.
An avatar saved before the two-panel split has no face panel: it sends the sheet and its old 4x4
panel whole and keeps the keyword prompt with the identity clause.

## nano-banana (Google Gemini image)

- Source: <https://deepmind.google/models/gemini-image/prompt-guide>, <https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana>, <https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/>
- Length: no documented cap. The guides ask for specific, detailed prompts.
- Structure: subject, composition and style, plus photographic terms; for an edit, name the change
  and say how it should integrate into the existing image.
- Image references: images are described in prose next to the instruction; the guide's examples
  say "the first image" / "the second image" rather than a special token.
- Negatives: the guide recommends positive framing: describe the empty street, not "no cars".
- Hard limits: none documented.
- Ours: labelled sections, task first, positive phrasing, an explicit integration section
  (relight, grading, grain), and "every facial feature comes from image N" instead of a ban.

## gpt-image (OpenAI)

- Source: <https://platform.openai.com/docs/guides/image-generation>
- Length: no documented cap.
- Structure: no explicit guide found. The API reference describes the prompt as a full
  description of the desired image and the edits accept several input images.
- Image references: inputs are separate image parameters; the docs do not prescribe how to name
  them inside the prompt text.
- Negatives: no guidance.
- Hard limits: none documented.
- Ours: numbered, imperative requirements, task first, one-photo output, face and body sections.

## flux (Black Forest Labs)

- Source: <https://docs.bfl.ai/guides/prompting_guide_flux2>, <https://docs.bfl.ai/flux_2/flux2_image_editing>
- Length: no documented cap.
- Structure: "Subject + Action + Style + Context", written as prose. FLUX.2 edits take up to ten
  reference images; a structured JSON prompt is optional.
- Image references: described in the prose, no special token.
- Negatives: the guide states plainly that FLUX.2 does not support negative prompts and to
  describe what you want instead.
- Hard limits: none documented (JSON prompt optional).
- Ours: one narrative paragraph, positive only, no negative list anywhere.

## seedream (ByteDance BytePlus)

- Source: <https://ai.byteplus.com/ark/region:ap-southeast-1/docs/seedream-4-0-5-0-prompt-guide>, <https://docs.byteplus.com/en/docs/ModelArk/seedream-5-0-pro-editing-guide>
- Length: no documented cap.
- Structure: an editing prompt should separate the change from the elements that must stay fixed;
  explicit preservation instructions reduce ambiguity.
- Image references: images are referenced in the instruction; no special token is documented.
- Negatives: preservation is phrased positively, as what stays.
- Hard limits: none documented.
- Ours: a `Change:` block then a `Keep fixed:` block, in that order.

## qwen (Alibaba Qwen-Image-Edit)

- Source: <https://help.aliyun.com/en/model-studio/qwen-image-edit-api>, <https://support.huaweicloud.com/model-call-maas/model-call-012.html>
- Length: the documented prompt limit for the edit models is 800 characters, and overflow is
  truncated rather than rejected. Newer qwen-image-2.1/3.0 pages describe a larger token budget,
  so 800 is the safe ceiling for the ids in our catalog.
- Structure: a natural-language instruction is expected; no structure is prescribed.
- Image references: the API takes multiple images; the prompt refers to them by position.
- Negatives: a negative prompt field exists on some qwen models, separate from the prompt.
- Hard limits: yes, 800 characters.
- Ours: terse sentences naming the two panels (image 1 face, image 2 body), and the trim tiers
  keep the whole prompt at or under 800 with the task and the face replacement never cut.

## wan (Alibaba Wan image edit)

- Source: <https://help.aliyun.com/en/model-studio/wan-image-edit>
- Length: no documented cap.
- Structure: a natural-language instruction plus an editing function field in the task API; no
  prompt shape is prescribed.
- Image references: images are inputs to the task; the instruction refers to them by content.
- Negatives: no guidance.
- Hard limits: none documented.
- Ours: a short direct instruction, one change per sentence: which image holds the face, the
  body and the hair. Note: the catalog currently has no wan image-edit model (only `wan/wan-2.7`
  for video), so this template is unexercised by real ids and selected by the `wan` family
  pattern only.

## grok (xAI)

- Source: <https://docs.x.ai/docs/guides/image-generation>
- Length: no documented guidance found.
- Structure: no documented guidance found.
- Image references: no documented guidance found.
- Negatives: no documented guidance found.
- Hard limits: none documented.
- Ours: short and direct, no long lists, with the face panel and the body panel named in one
  sentence each.

## generic

- Source: none, it is the fallback for an undocumented endpoint in our catalog.
- Ours: the Google shape, slightly shorter.
