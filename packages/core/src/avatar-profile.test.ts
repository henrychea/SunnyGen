import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_AVATAR_PROFILE,
  buildPanelSheetPrompt,
  buildReferenceSheetPrompt,
  identityClause,
  identityKeywords,
  parseAvatarProfile,
  type AvatarProfile,
} from './avatar-profile'

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

const WITH_PORTRAIT: AvatarProfile = {
  ...DEFAULT_AVATAR_PROFILE,
  source: { ...DEFAULT_AVATAR_PROFILE.source, portraitAssetId: 'portrait-asset' },
}

const GOLDEN_SHEET = normalize(`
Create a professional-grade original character reference sheet. Use the uploaded portrait only as a 70% likeness guide, not as an identity to copy.

Likeness rule: The finished character must read as a different person with a strong family resemblance to the reference — about 70% similar. Keep the ethnicity, age range, skin tone, hair color and texture, general face-shape family, and body proportions. Change the specific identity features: eye shape and eyelid crease, nose bridge and tip, lip contour, jawline and chin, cheekbones, eyebrow shape, ear shape, facial proportions, and makeup. Do not copy, trace, face-swap, or reproduce the reference person's exact face, expression, pose, lighting, or facial geometry. The result must be an original face, not a clone. Side by side, they should look like close relatives, not the same person.

Core Requirements: All images in the entire sheet must depict the same original adult East Asian woman, maintaining consistent face shape, facial feature proportions, eyes, eyebrows, nose, mouth, skin tone, hair color, hairstyle, and body type—do not swap faces between panels, do not stylize as anime, do not add a CG feel, do not overdo skin smoothing.

Character Features: Adult East Asian female, 168 cm tall, soft oval face, slender jawline, petite chin, large and natural almond-shaped eyes, slender naturally arched eyebrows, slim nose bridge, dainty nose tip, soft and full lip shape, fair and natural skin tone, dark brown near-black long hair, slightly wavy, natural center-parted fringe, very slim and hourglass figure, long legs, large bust.

Basic Attire: Black fitted long-sleeved square-neck short skirt, black stockings, black high heels.

Layout: White to light beige clean background, professional reference sheet, grid layout, English annotations: content section and section names only, clear and easy to read.

Content Sections:
1. Basic Settings / Basic Profile
2. Full-Body Angles: Front, Side, Back, Diagonal Front, Diagonal Back
3. Face Angles: Front, 45 Degrees, Side Profile, Diagonal Upper, Diagonal Lower
4. Expressions: Neutral, Natural Smile, Serious, Surprised, Troubled
5. Hair Details: Front, Side, Back
6. Hands: Rest, Side, Palm
7. Facial Features: Eyes, Eyebrows, Nose, Mouth, Ears
8. Skin Texture: Facial Skin, Body Skin
9. Body Details: Shoulders, Abdomen, Back, Legs, Hands
10. Everyday Outfit & Scene Examples: Loungewear, Casual Wear, Coffee Shop, Work/School, Travel

Overall Style: Realistic Photography Feel, Natural Light, Realistic Skin Texture, Realistic Hair Strands, Realistic Human Proportions, High-Quality Character Consistency Reference Table.

Identity lock for every panel: same new face, same body, same hair, same outfit. Do not revert to the uploaded portrait's face in any panel. 4K res with Ratio 4:3. Remove the profile text and keep only the category ones. Remove the background so it is plain white. No box outlines. No text at the bottom.
`)

const GOLDEN_PANEL = normalize(
  'Reference the sheet and make a 4 by 4 reference sheet, sixteen panels of the same original character, front, back, sides, four expressions, four poses, four detail crops, flat white background. 4K quality, no text and borders.',
)

test('the default profile reproduces the reference sheet prompt', () => {
  assert.equal(normalize(buildReferenceSheetPrompt(WITH_PORTRAIT)), GOLDEN_SHEET)
})

test('the default profile reproduces the 4x4 panel prompt', () => {
  assert.equal(normalize(buildPanelSheetPrompt(DEFAULT_AVATAR_PROFILE)), GOLDEN_PANEL)
})

test('the likeness section disappears when no portrait is attached', () => {
  const prompt = buildReferenceSheetPrompt(DEFAULT_AVATAR_PROFILE)
  assert.doesNotMatch(prompt, /Likeness rule/)
  assert.doesNotMatch(prompt, /uploaded portrait/)
  assert.match(prompt, /^Create a professional-grade original character reference sheet\./)
})

test('kept and changed likeness traits follow the profile', () => {
  const profile: AvatarProfile = {
    ...WITH_PORTRAIT,
    source: { ...WITH_PORTRAIT.source, likenessPercent: 55, keep: ['skinTone'], change: ['makeup'] },
  }
  const prompt = buildReferenceSheetPrompt(profile)
  assert.match(prompt, /55% likeness guide/)
  assert.match(prompt, /about 55% similar/)
  assert.match(prompt, /Keep the skin tone\./)
  assert.match(prompt, /Change the specific identity features: makeup\./)
})

test('sheet toggles drive the layout, borders, labels and footer text', () => {
  const profile: AvatarProfile = {
    ...DEFAULT_AVATAR_PROFILE,
    sheet: {
      ...DEFAULT_AVATAR_PROFILE.sheet,
      sections: { ...DEFAULT_AVATAR_PROFILE.sheet.sections, hands: false, outfits: false },
      background: 'white',
      labels: 'none',
      borders: true,
      footerText: true,
      ratio: '3:4',
      resolution: '2K',
    },
  }
  const prompt = buildReferenceSheetPrompt(profile)
  assert.match(prompt, /Plain white clean background/)
  assert.match(prompt, /2K res with Ratio 3:4/)
  assert.match(prompt, /Keep thin box outlines\./)
  assert.match(prompt, /Add the section names at the bottom\./)
  assert.doesNotMatch(prompt, /Hands: Rest/)
  assert.doesNotMatch(prompt, /Everyday Outfit/)
  assert.match(prompt, /8\. Body Details/)
})

test('panel counts drive the panel prompt', () => {
  const profile: AvatarProfile = {
    ...DEFAULT_AVATAR_PROFILE,
    panel: {
      ...DEFAULT_AVATAR_PROFILE.panel,
      views: 3,
      expressions: 2,
      poses: 2,
      detailCrops: 2,
      text: true,
    },
  }
  const prompt = buildPanelSheetPrompt(profile)
  assert.match(prompt, /three views, two expressions, two poses, two detail crops/)
  assert.match(prompt, /nine panels/)
  assert.match(prompt, /with text, no borders/)
})

test('keywords group face geometry, hair, body and outfit', () => {
  const keywords = identityKeywords(DEFAULT_AVATAR_PROFILE)
  assert.deepEqual(keywords.face, [
    'soft oval face',
    'slender jaw',
    'petite chin',
    'slim bridge',
    'dainty tip',
    'full lips',
    'large almond eyes',
    'visible crease',
    'slender arched brows',
    'fair skin',
  ])
  assert.deepEqual(keywords.hair, [
    'dark brown near-black long hair',
    'slightly wavy',
    'natural center-parted fringe',
  ])
  assert.deepEqual(keywords.body, ['slim hourglass', 'long legs', 'large bust', '168 cm'])
  assert.deepEqual(keywords.outfit, [
    'Black fitted long-sleeved square-neck short skirt',
    'black stockings',
    'black high heels',
  ])
})

test('the identity clause keeps the tightest budget on Qwen', () => {
  const qwen = identityClause(DEFAULT_AVATAR_PROFILE, { modelFamily: 'qwen' })
  const generic = identityClause(DEFAULT_AVATAR_PROFILE, { modelFamily: 'generic' })
  assert.ok(qwen.length <= 250, qwen)
  assert.ok(generic.length <= 600, generic)
  assert.ok(generic.length > qwen.length)
  assert.match(qwen, /^26yo East Asian woman, soft oval face, slender jaw/)
  assert.match(qwen, /slim hourglass/)
  assert.doesNotMatch(qwen, /high heels/)
})

test('the clause spends its budget in priority order', () => {
  const clause = identityClause(DEFAULT_AVATAR_PROFILE, { budget: 140 })
  assert.ok(clause.length <= 140, clause)
  const face = clause.indexOf('soft oval face')
  const body = clause.indexOf('long legs')
  const hair = clause.indexOf('dark brown near-black long hair')
  assert.ok(face >= 0)
  assert.ok(body === -1 || body > face)
  assert.ok(hair === -1 || body === -1 || hair > body)
  assert.doesNotMatch(clause, /black stockings/)
})

test('omitting the body keeps the subject as the floor when the budget runs out', () => {
  const clause = identityClause(DEFAULT_AVATAR_PROFILE, { modelFamily: 'qwen', omitBody: true })
  assert.match(clause, /^26yo East Asian woman, soft oval face/)
  assert.doesNotMatch(clause, /slim hourglass|long legs|large bust|168 cm/)
  assert.equal(identityClause(DEFAULT_AVATAR_PROFILE, { budget: 5 }), '26yo East Asian woman')
})

test('a stored profile merges over the defaults and rejects minors', () => {
  const parsed = parseAvatarProfile({ identity: { age: 32, gender: 'male' }, hair: { length: 'short' } })
  assert.ok(parsed)
  assert.equal(parsed.identity.age, 32)
  assert.equal(parsed.identity.gender, 'male')
  assert.equal(parsed.hair.length, 'short')
  assert.equal(parsed.hair.color, DEFAULT_AVATAR_PROFILE.hair.color)
  assert.equal(parsed.sheet.sections.outfits, true)

  assert.equal(parseAvatarProfile({ identity: { age: 17 } }), null)
  assert.equal(parseAvatarProfile('nope'), null)
  assert.equal(parseAvatarProfile(null), null)
})

test('a weight is written into the prompt and the identity anchors', () => {
  const parsed = parseAvatarProfile({ identity: { heightCm: 165, weightKg: 49 } })
  assert.ok(parsed)
  assert.equal(parsed.identity.weightKg, 49)
  assert.match(buildReferenceSheetPrompt(parsed), /165 cm tall, 49 kg/)
  assert.ok(identityKeywords(parsed).body.includes('49 kg'))
  assert.ok(!identityKeywords(DEFAULT_AVATAR_PROFILE).body.some((entry) => entry.endsWith(' kg')))
})

test('a weight outside 30 to 200 kg is dropped instead of clamped', () => {
  assert.equal(parseAvatarProfile({ identity: { weightKg: 12 } })?.identity.weightKg, undefined)
  assert.equal(parseAvatarProfile({ identity: { weightKg: 400 } })?.identity.weightKg, undefined)
  assert.equal(parseAvatarProfile({ identity: { weightKg: 'unknown' } })?.identity.weightKg, undefined)
})

test('an eyelid anchor that repeats the eye shape is not listed twice', () => {
  const hooded: AvatarProfile = {
    ...DEFAULT_AVATAR_PROFILE,
    face: { ...DEFAULT_AVATAR_PROFILE.face, eyeShape: 'hooded' },
  }
  const keywords = identityKeywords(hooded)
  assert.ok(keywords.face.some((entry) => entry.includes('hooded eyes')))
  assert.equal(keywords.face.filter((entry) => entry === 'hooded').length, 0)
  assert.ok(identityKeywords(DEFAULT_AVATAR_PROFILE).face.includes('visible crease'))
})
