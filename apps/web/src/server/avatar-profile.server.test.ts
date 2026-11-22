import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  awaitProfileExtraction,
  buildProfileExtractionRequest,
  extractAvatarProfile,
  parseExtractedProfile,
  PROFILE_EXTRACTION_PROMPT,
} from './avatar-profile.server'

const IMAGE = 'data:image/jpeg;base64,c2hlZXQ='

const EXTRACTED = {
  identity: { gender: 'female', age: 31, ethnicity: 'East Asian', heightCm: 170 },
  face: {
    faceShape: 'soft oval',
    jawline: 'slender',
    chin: 'petite',
    eyeSize: 'large',
    eyeShape: 'natural almond-shaped',
    eyebrows: 'slender naturally arched',
    noseBridge: 'slim',
    noseTip: 'dainty',
    lips: 'soft and full',
    skinTone: 'fair and natural',
  },
  hair: { color: 'dark brown near-black', length: 'long', texture: 'slightly wavy', parting: 'center part' },
  body: { build: 'slim', legs: 'long', bust: 'medium' },
  outfit: { top: 'black fitted turtleneck', legwear: 'black tights', shoes: 'black ankle boots' },
}

function reply(content: string, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch
}

test('the extraction request carries the sheet as a vision message and is not sent', () => {
  const request = buildProfileExtractionRequest({ imageDataUrl: IMAGE, key: 'sk-test', model: 'test/model' })
  assert.equal(request.model, 'test/model')
  assert.match(String(request.url), /chat\/completions$/)
  const body = JSON.parse(String(request.init.body)) as {
    model: string
    messages: Array<{ content: Array<{ type: string; image_url?: { url: string } }> }>
  }
  assert.equal(body.model, 'test/model')
  const parts = body.messages[0]?.content ?? []
  assert.equal(parts[0]?.type, 'text')
  assert.equal(parts[1]?.image_url?.url, IMAGE)
  assert.ok(PROFILE_EXTRACTION_PROMPT.includes('Never return an age under 18'))
  const headers = request.init.headers as Record<string, string>
  assert.equal(headers.Authorization, 'Bearer sk-test')
})

test('a mocked reply fills the profile and keeps the defaults for the rest', async () => {
  const profile = await awaitProfileExtraction(
    buildProfileExtractionRequest({ imageDataUrl: IMAGE, key: 'sk-test' }),
    reply(`\`\`\`json\n${JSON.stringify(EXTRACTED)}\n\`\`\``),
  )
  assert.equal(profile.identity.age, 31)
  assert.equal(profile.face.faceShape, 'soft oval')
  assert.equal(profile.outfit.shoes, 'black ankle boots')
  assert.equal(profile.sheet.sections.outfits, true)
  assert.equal(profile.source.likenessPercent, 70)
})

test('a reply for a minor is rejected instead of stored', async () => {
  const minor = { ...EXTRACTED, identity: { ...EXTRACTED.identity, age: 16 } }
  await assert.rejects(
    awaitProfileExtraction(
      buildProfileExtractionRequest({ imageDataUrl: IMAGE, key: 'sk-test' }),
      reply(JSON.stringify(minor)),
    ),
    /usable profile/,
  )
  assert.equal(parseExtractedProfile('{"identity":{"age":16}}'), null)
})

test('the extraction never runs without a key', async () => {
  let calls = 0
  const fetcher = (async () => {
    calls += 1
    return new Response('{}')
  }) as typeof fetch
  await assert.rejects(extractAvatarProfile({ imageDataUrl: IMAGE, key: ' ' }, fetcher), /OpenRouter API key/)
  assert.equal(calls, 0)
})

test('upstream errors surface instead of a silent empty profile', async () => {
  await assert.rejects(
    awaitProfileExtraction(
      buildProfileExtractionRequest({ imageDataUrl: IMAGE, key: 'sk-test' }),
      (async () =>
        new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch,
    ),
    /rate limited/,
  )
})
