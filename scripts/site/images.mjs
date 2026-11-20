import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sharp = createRequire(import.meta.url)('sharp')
const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const shots = join(root, 'docs/screenshots')
const out = join(root, 'site/assets')

export const IMAGES = {
  studio: [480, 768, 1024],
  'studio-wardrobe': [480, 768, 1024],
  canvas: [480, 768, 1024],
  gallery: [480, 768, 1024],
  assets: [480, 768, 1024],
  assistant: [480, 768, 1024],
  'studio-models': [640, 1024, 1600],
  'studio-train-settings': [640, 1024, 1600],
  'studio-train-images': [640, 1024, 1600],
  'studio-train-review': [640, 1024, 1600],
  'home-lora': [640, 1024, 1600],
}

const OG = {
  home: ['studio', 'Self-hosted AI', 'image and video', { left: 160, top: 90, width: 864, height: 640 }],
  'lora-training': [
    'studio-train-settings',
    'FLUX LoRA',
    'training',
    { left: 600, top: 320, width: 720, height: 540 },
  ],
  'node-canvas': [
    'canvas',
    'Node canvas for',
    'AI pipelines',
    { left: 160, top: 0, width: 864, height: 640 },
  ],
  'ai-avatar-studio': [
    'studio-wardrobe',
    'AI avatar and',
    'lookbook studio',
    { left: 160, top: 0, width: 864, height: 640 },
  ],
  'self-hosted': ['gallery', 'Your models.', 'Your machine.', { left: 160, top: 0, width: 864, height: 640 }],
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

async function responsive() {
  mkdirSync(join(out, 'img'), { recursive: true })
  for (const [name, widths] of Object.entries(IMAGES)) {
    for (const w of widths) {
      const base = sharp(join(shots, `${name}.webp`)).resize({ width: w })
      await base
        .clone()
        .webp({ quality: 78 })
        .toFile(join(out, 'img', `${name}-${w}.webp`))
      await base
        .clone()
        .avif({ quality: 55, effort: 6 })
        .toFile(join(out, 'img', `${name}-${w}.avif`))
    }
  }
}

async function og() {
  mkdirSync(join(out, 'og'), { recursive: true })
  for (const [slug, [shot, l1, l2, region]] of Object.entries(OG)) {
    const card = await sharp(join(shots, `${shot}.webp`))
      .extract(region)
      .resize({ width: 560, height: 420, fit: 'cover', position: 'top' })
      .toBuffer()
    const frame = Buffer.from(
      `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <rect width="1200" height="630" fill="#FAF6EF"/>
        <rect x="0" y="0" width="1200" height="10" fill="#A31621"/>
        <rect x="586" y="126" width="588" height="448" rx="20" fill="#E8DFD3"/>
        <g transform="translate(64 72)">
          <rect width="56" height="56" rx="14" fill="#A31621"/>
          <circle cx="28" cy="28" r="8" fill="#FAF6EF"/>
          <g stroke="#FAF6EF" stroke-width="3" stroke-linecap="round">
            <path d="M28 10.5v6M28 39.5v6M10.5 28h6M39.5 28h6M16 16l4.4 4.4M35.6 35.6l4.4 4.4M40 16l-4.4 4.4M20.4 35.6L16 40"/>
          </g>
          <text x="74" y="38" font-family="Space Grotesk Light, Noto Sans, sans-serif" font-size="30" font-weight="600" fill="#2A1E17">SunnyGen</text>
        </g>
        <text font-family="Space Grotesk Light, Noto Sans, sans-serif" font-size="54" font-weight="700" fill="#2A1E17" letter-spacing="-1">
          <tspan x="64" y="250">${escape(l1)}</tspan>
          <tspan x="64" y="312">${escape(l2)}</tspan>
        </text>
        <text font-family="Noto Sans, sans-serif" font-size="24" fill="#5E4D42">
          <tspan x="64" y="400">Free, open source, MIT.</tspan>
          <tspan x="64" y="436">Bring your own API keys.</tspan>
          <tspan x="64" y="472">Runs on your machine.</tspan>
        </text>
        <text x="64" y="568" font-family="Noto Sans, sans-serif" font-size="20" fill="#A31621">github.com/henrychea/SunnyGen</text>
      </svg>`,
    )
    const mask = Buffer.from(`<svg width="560" height="420"><rect width="560" height="420" rx="12"/></svg>`)
    const rounded = await sharp(card)
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer()
    await sharp(frame)
      .composite([{ input: rounded, left: 600, top: 140 }])
      .png({ palette: true, quality: 90, compressionLevel: 9 })
      .toFile(join(out, 'og', `${slug}.png`))
  }
}

async function icons() {
  const svg = readFileSync(join(root, 'apps/web/public/favicon.svg'))
  mkdirSync(join(out, 'icons'), { recursive: true })
  await sharp(svg, { density: 300 })
    .resize(180, 180)
    .flatten({ background: '#A31621' })
    .png()
    .toFile(join(out, 'icons', 'apple-touch-icon.png'))
  for (const s of [192, 512]) {
    await sharp(svg, { density: 600 })
      .resize(s, s)
      .png()
      .toFile(join(out, 'icons', `icon-${s}.png`))
  }
}

await responsive()
await og()
await icons()
