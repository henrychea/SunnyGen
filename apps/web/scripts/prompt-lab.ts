/**
 * Prompt lab: build the exact edit request the app would send for one avatar and one target,
 * per model, without spending anything. `--live` runs each request once through the real
 * provider adapter and writes a contact sheet.
 *
 *   pnpm --filter @sunnygen/web exec tsx scripts/prompt-lab.ts \
 *     --avatar K4 --target <asset-id-or-file> --models fal:fal-ai/qwen-image-edit-2509,sunra:nano-banana-pro \
 *     --out .temp/prompt-lab [--instruction "..."] [--live --yes]
 *
 * The database is opened read-only and nothing is written back: no generations, assets or jobs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  EDIT_PROMPT_PROFILES,
  IMAGE_MODELS,
  PROVIDERS,
  avatarModelFamily,
  editProfile,
  parseAvatarCrops,
  parseAvatarProfile,
  type AvatarCrop,
  type AvatarProfile,
  type GenerationParams,
  type ImageModelDefinition,
  type ProviderId,
} from '@sunnygen/core'
import { databasePath, mediaDir } from '@sunnygen/db/paths'
import { decryptSecret, isSecretSetting } from '@sunnygen/db/secrets'
import { getAdapter, type AdapterContext, type ProviderAsset, type ProviderOutput } from '@sunnygen/providers'
import { catalogModelDefinition } from '../src/lib/catalog-model'
import { defaultAspectRatio, defaultQuality } from '../src/lib/model-params'
import { editReferencePlan } from '../src/lib/avatar-references'
import { buildEditPromptResult, orderEditAssets, type EditReference } from '../src/lib/edit-prompt'

const DEFAULT_INSTRUCTION = 'keep the same expression and make the light warmer and softer'
const TARGET_ID = 'lab-target'

interface Args {
  avatar: string
  target: string
  models: string[]
  out: string
  instruction: string
  ratio: string | null
  quality: string | null
  db: string
  live: boolean
  yes: boolean
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=')
    const next = argv[index + 1]
    const value = inline ?? (next && !next.startsWith('--') ? ((index += 1), next) : '')
    flags.set(key as string, value)
  }
  const required = ['avatar', 'target', 'models'] as const
  for (const key of required) {
    if (!flags.get(key)) throw new Error(`Pass --${key} <value>`)
  }
  return {
    avatar: flags.get('avatar') as string,
    target: flags.get('target') as string,
    models: (flags.get('models') as string)
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
    out: resolve(flags.get('out') || join('.temp', 'prompt-lab')),
    instruction: flags.get('instruction') || DEFAULT_INSTRUCTION,
    ratio: flags.get('ratio') || null,
    quality: flags.get('quality') || null,
    db: resolve(flags.get('db') || databasePath),
    live: flags.has('live'),
    yes: flags.has('yes'),
  }
}

interface StoredCatalog {
  entries: Array<Record<string, unknown>>
}

interface LabModel {
  key: string
  provider: ProviderId
  definition: ImageModelDefinition
  price: string | null
}

function readCatalog(db: DatabaseSync, provider: ProviderId): StoredCatalog | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`models.catalog.${provider}`) as
    | { value: string }
    | undefined
  if (!row) return null
  try {
    const parsed = JSON.parse(row.value) as StoredCatalog
    return Array.isArray(parsed.entries) ? parsed : null
  } catch {
    return null
  }
}

function resolveModel(db: DatabaseSync, key: string): LabModel {
  const [provider, ...rest] = key.split(':')
  const modelId = rest.join(':')
  if ((provider !== 'sunra' && provider !== 'fal') || !modelId) {
    throw new Error(`Model "${key}" must look like sunra:<id> or fal:<endpoint>`)
  }
  const known = IMAGE_MODELS.find((model) => model.id === modelId && model.providers.includes(provider))
  if (known) return { key, provider, definition: known, price: known.price ?? null }

  const entry = readCatalog(db, provider)?.entries.find((candidate) => candidate.key === key)
  if (!entry) throw new Error(`Model "${key}" is not in the ${provider} catalog; sync it in the app first`)
  return {
    key,
    provider,
    definition: catalogModelDefinition(entry as never) as ImageModelDefinition,
    price: typeof entry.price === 'string' ? entry.price : null,
  }
}

function extensionFor(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  return 'png'
}

function mimeForFile(path: string): string {
  const extension = extname(path).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  return 'image/png'
}

function safeMediaPath(path: string): string {
  const absolute = resolve(mediaDir, path)
  if (!absolute.startsWith(resolve(mediaDir))) throw new Error(`Invalid media path ${path}`)
  return absolute
}

interface LoadedAsset {
  id: string
  mime: string
  buffer: Buffer
}

function loadAsset(db: DatabaseSync, assetId: string): LoadedAsset {
  const row = db.prepare('SELECT id, mime, path FROM assets WHERE id = ?').get(assetId) as
    | { id: string; mime: string; path: string }
    | undefined
  if (!row) throw new Error(`No asset ${assetId}`)
  return { id: row.id, mime: row.mime, buffer: readFileSync(safeMediaPath(row.path)) }
}

function loadTarget(db: DatabaseSync, source: string): LoadedAsset {
  if (existsSync(source)) {
    const path = resolve(source)
    return { id: TARGET_ID, mime: mimeForFile(path), buffer: readFileSync(path) }
  }
  return loadAsset(db, source)
}

interface AvatarItem {
  id: string
  name: string
  assetId: string | null
  profile: AvatarProfile
  crops: AvatarCrop[]
}

function loadAvatar(db: DatabaseSync, name: string): AvatarItem {
  const rows = db
    .prepare(
      `SELECT id, name, asset_id AS assetId, data FROM studio_items WHERE kind = 'avatar' ORDER BY name`,
    )
    .all() as Array<{ id: string; name: string; assetId: string | null; data: string }>
  const row =
    rows.find((candidate) => candidate.name === name) ??
    rows.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase()) ??
    rows.find((candidate) => candidate.name.toLowerCase().includes(name.toLowerCase()))
  if (!row) {
    throw new Error(`No avatar named "${name}". Available: ${rows.map((item) => item.name).join(', ')}`)
  }
  const data = JSON.parse(row.data) as Record<string, unknown>
  const profile = parseAvatarProfile(data.avatarProfile)
  if (!profile) throw new Error(`Avatar "${row.name}" has no usable profile`)
  return {
    id: row.id,
    name: row.name,
    assetId: row.assetId,
    profile,
    crops: parseAvatarCrops(data.crops) ?? [],
  }
}

interface PlanSlot {
  id: string
  role: string
  asset: LoadedAsset
}

interface Plan {
  model: LabModel
  family: ReturnType<typeof avatarModelFamily>
  maxChars: number | undefined
  prompt: string
  overflow: { overBy: number; maxChars: number } | null
  params: GenerationParams
  slots: PlanSlot[]
}

function planFor(
  db: DatabaseSync,
  model: LabModel,
  avatar: AvatarItem,
  target: LoadedAsset,
  args: Args,
): Plan {
  const references = editReferencePlan(
    [{ id: avatar.assetId ?? avatar.id, avatar: true, profile: avatar.profile, crops: avatar.crops }],
    model.key,
  )
  const profile = editProfile(model.key)
  const ordered = orderEditAssets(references, target.id, profile)
  const byId = new Map<string, LoadedAsset>([[target.id, target]])
  for (const id of ordered) if (id !== target.id && !byId.has(id)) byId.set(id, loadAsset(db, id))
  const roleById = new Map(
    references.map((reference) => [reference.assetIds?.[0] ?? reference.id, roleOf(reference)] as const),
  )
  return {
    model,
    family: avatarModelFamily(model.key),
    maxChars: EDIT_PROMPT_PROFILES[avatarModelFamily(model.key)].maxChars,
    ...buildEditPromptResult(args.instruction, references, profile, { modelId: model.key }),
    params: {
      aspectRatio: args.ratio ?? defaultAspectRatio(model.definition),
      quality: args.quality ?? defaultQuality(model.definition),
    },
    slots: ordered.map((id) => ({
      id,
      role: id === target.id ? 'target photo' : (roleById.get(id) ?? 'reference'),
      asset: byId.get(id) as LoadedAsset,
    })),
  }
}

function roleOf(reference: Partial<EditReference>): string {
  return reference.role ?? (reference.avatar ? 'reference sheet' : 'supporting reference')
}

function promptBlock(prompt: string): string {
  return ['```text', prompt, '```'].join('\n')
}

function capLabel(overflow: Plan['overflow'], maxChars: number | undefined): string {
  if (overflow) return `over the ${overflow.maxChars}-character cap by ${overflow.overBy}`
  if (maxChars === undefined) return 'no cap'
  return `under the ${maxChars}-character cap`
}

function modelSection(plan: Plan, outputs: string[] = []): string {
  const { model, family, maxChars, prompt, overflow, params, slots } = plan
  const cap = capLabel(overflow, maxChars)
  const lines = [
    `## ${model.key}`,
    '',
    `- family: \`${family}\``,
    `- price: ${model.price ?? 'not in the catalog'}`,
    `- prompt: ${prompt.length} characters (${cap})`,
    `- params: ${JSON.stringify(params)}`,
    `- assets: ${slots.map((slot, index) => `${index + 1} ${slot.role}`).join(', ')}`,
    '',
    promptBlock(prompt),
    '',
  ]
  if (outputs.length > 0) lines.push(...outputs.map((output) => `- output: ${output}`), '')
  return lines.join('\n')
}

function writeReport(
  outDir: string,
  args: Args,
  avatar: AvatarItem,
  target: LoadedAsset,
  plans: Plan[],
  outputs: Map<string, string[]>,
): void {
  const header = [
    '# Prompt lab',
    '',
    `- avatar: ${avatar.name} (${avatar.id})`,
    `- target: ${target.id}`,
    `- instruction (${args.instruction.length} characters): ${args.instruction}`,
    `- mode: ${args.live ? 'live' : 'offline'}`,
    `- generated: ${new Date().toISOString()}`,
    '',
  ].join('\n')
  const sections = plans.map((plan) => modelSection(plan, outputs.get(plan.model.key) ?? []))
  writeFileSync(join(outDir, 'report.md'), [header, ...sections].join('\n'))
}

function writeRequests(
  outDir: string,
  args: Args,
  avatar: AvatarItem,
  target: LoadedAsset,
  plans: Plan[],
): void {
  const payload = {
    avatar: { id: avatar.id, name: avatar.name },
    target: { id: target.id, mime: target.mime, bytes: target.buffer.length },
    instruction: args.instruction,
    models: plans.map((plan) => ({
      model: plan.model.key,
      provider: plan.model.provider,
      family: plan.family,
      price: plan.model.price,
      prompt: plan.prompt,
      characters: plan.prompt.length,
      overflow: plan.overflow,
      params: plan.params,
      assets: plan.slots.map((slot, index) => ({
        position: index + 1,
        id: slot.id,
        role: slot.role,
        mime: slot.asset.mime,
        bytes: slot.asset.buffer.length,
      })),
    })),
  }
  writeFileSync(join(outDir, 'requests.json'), `${JSON.stringify(payload, null, 2)}\n`)
}

function providerKey(db: DatabaseSync, provider: ProviderId): string | null {
  const setting = PROVIDERS.find((entry) => entry.id === provider)?.keySetting
  const row = setting
    ? (db.prepare('SELECT value FROM settings WHERE key = ?').get(setting) as { value: string } | undefined)
    : undefined
  const stored = row
    ? isSecretSetting(setting as string)
      ? decryptSecret(setting as string, row.value)
      : row.value
    : null
  const fromEnv = provider === 'sunra' ? process.env.SUNRA_API_KEY : process.env.FAL_KEY
  const value = (stored || fromEnv || '').trim()
  return value && !/^your_.*_here$/i.test(value) ? value : null
}

function adapterContext(db: DatabaseSync, provider: ProviderId): AdapterContext {
  const apiKey = providerKey(db, provider)
  if (!apiKey) throw new Error(`No ${provider} API key stored; add it in Settings or the environment`)
  // uploads: null keeps the provider upload cache out of the database.
  return { apiKey, baseUrl: null, deployment: null, fetch, uploads: null }
}

async function runLive(db: DatabaseSync, plan: Plan, outDir: string): Promise<string[]> {
  const slug = plan.model.key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const directory = join(outDir, 'outputs', slug)
  mkdirSync(directory, { recursive: true })
  const adapter = getAdapter(plan.model.provider)
  const context = adapterContext(db, plan.model.provider)
  const assets: ProviderAsset[] = plan.slots.map((slot) => ({
    buffer: slot.asset.buffer,
    mime: slot.asset.mime,
    fileName: basename(slot.id),
  }))
  const submit = await adapter.submit(context, {
    kind: 'image',
    model: plan.model.definition,
    prompt: plan.prompt,
    params: plan.params,
    assets,
  })
  let outputs: ProviderOutput[] = submit.outputs ?? []
  if (submit.status === 'running' && submit.providerJobId && adapter.poll) {
    const job = { providerJobId: submit.providerJobId, model: plan.model.definition, kind: 'image' as const }
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await new Promise((done) => setTimeout(done, 2000))
      const poll = await adapter.poll(context, job)
      if (poll.status === 'succeeded') {
        outputs = poll.outputs ?? []
        break
      }
      if (poll.status === 'failed') throw new Error(poll.error ?? 'Provider failed the request')
    }
  }
  return outputs.map((output, index) => {
    const file = join(directory, `output-${index + 1}.${extensionFor(output.mime)}`)
    writeFileSync(file, output.buffer)
    return join('outputs', slug, basename(file))
  })
}

function saveAssets(outDir: string, plans: Plan[], target: LoadedAsset): Map<string, string> {
  const files = new Map<string, string>()
  const save = (asset: LoadedAsset, name: string) => {
    const file = `${name}.${extensionFor(asset.mime)}`
    writeFileSync(join(outDir, file), asset.buffer)
    files.set(asset.id, file)
  }
  save(target, 'target')
  for (const plan of plans) {
    plan.slots.forEach((slot, index) => {
      if (files.has(slot.id)) return
      save(slot.asset, `ref-${index + 1}-${slot.id.replace(/[^a-z0-9]+/gi, '-')}`)
    })
  }
  return files
}

function writeContactSheet(
  outDir: string,
  avatar: AvatarItem,
  target: LoadedAsset,
  plans: Plan[],
  files: Map<string, string>,
  outputs: Map<string, string[]>,
): void {
  const cell = (src: string, label: string) =>
    `<figure><img src="${src}" alt="${label}"><figcaption>${label}</figcaption></figure>`
  const first = plans[0]
  const referenceCells = first
    ? first.slots
        .filter((slot) => slot.id !== target.id)
        .map((slot, index) => cell(files.get(slot.id) ?? '', `ref ${index + 1} · ${slot.role}`))
        .join('')
    : ''
  const sections = plans
    .map((plan) => {
      const produced = outputs.get(plan.model.key) ?? []
      const cells = produced.map((file) => cell(file, plan.model.key)).join('')
      return `<section><h2>${plan.model.key}</h2><p>${plan.family} · ${plan.prompt.length} characters${
        plan.overflow ? ` · OVER by ${plan.overflow.overBy}` : ''
      }</p><div class="row">${cells || '<p class="miss">no output</p>'}</div></section>`
    })
    .join('\n')
  const html = `<!doctype html>
<meta charset="utf-8">
<title>Prompt lab · ${avatar.name}</title>
<style>
  body { background: #faf6ef; color: #2a1e17; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 24px; }
  h1 { font-size: 20px; } h2 { font-size: 15px; margin: 20px 0 4px; }
  .row { display: flex; flex-wrap: wrap; gap: 12px; }
  figure { margin: 0; } img { max-height: 320px; border-radius: 8px; display: block; }
  figcaption { font-size: 12px; opacity: .7; margin-top: 4px; } .miss { opacity: .6; }
</style>
<h1>Prompt lab · ${avatar.name} · target ${target.id}</h1>
<h2>target and references</h2>
<div class="row">${cell(files.get(target.id) ?? '', 'target')}${referenceCells}</div>
${sections}
`
  writeFileSync(join(outDir, 'index.html'), html)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  mkdirSync(args.out, { recursive: true })
  const db = new DatabaseSync(args.db, { readOnly: true })
  const avatar = loadAvatar(db, args.avatar)
  const target = loadTarget(db, args.target)
  const plans = args.models.map((key) => planFor(db, resolveModel(db, key), avatar, target, args))

  if (!args.live) {
    saveAssets(args.out, plans, target)
    writeRequests(args.out, args, avatar, target, plans)
    writeReport(args.out, args, avatar, target, plans, new Map())
    for (const plan of plans) {
      console.log(
        `${plan.model.key} · ${plan.family} · ${plan.prompt.length} chars${plan.overflow ? ` · OVER by ${plan.overflow.overBy}` : ''}`,
      )
    }
    console.log(`\nOffline report: ${join(args.out, 'report.md')}`)
    return
  }

  console.log('Estimated cost per model (catalog prices):')
  for (const plan of plans)
    console.log(`  ${plan.model.key} — ${plan.model.price ?? 'price not in the catalog'}`)
  const blocked = plans.filter((plan) => plan.overflow)
  if (blocked.length > 0) {
    throw new Error(
      `Refusing to submit: ${blocked.map((plan) => `${plan.model.key} is ${plan.overflow?.overBy} over ${plan.overflow?.maxChars}`).join(', ')}`,
    )
  }
  if (!args.yes) {
    throw new Error('Live mode spends money: re-run with --yes once the estimate above looks right')
  }

  const outputs = new Map<string, string[]>()
  for (const plan of plans) {
    const files = await runLive(db, plan, args.out)
    outputs.set(plan.model.key, files)
    console.log(`${plan.model.key} → ${files.join(', ') || 'no output returned'}`)
  }
  const assetFiles = saveAssets(args.out, plans, target)
  writeRequests(args.out, args, avatar, target, plans)
  writeReport(args.out, args, avatar, target, plans, outputs)
  writeContactSheet(args.out, avatar, target, plans, assetFiles, outputs)
  console.log(`\nLive report: ${join(args.out, 'report.md')}\nContact sheet: ${join(args.out, 'index.html')}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
