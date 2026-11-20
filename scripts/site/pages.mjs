import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SITE_URL = 'https://henrychea.github.io/SunnyGen/'
const REPO = 'https://github.com/henrychea/SunnyGen'
const AUTHOR = { name: 'Henry Chea', url: 'https://github.com/henrychea' }
const VERSION = '2.0.0'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../site')
const BASE_PATH = new URL(SITE_URL).pathname

const IMG = {
  studio: [1024, 853, [480, 768, 1024]],
  'studio-wardrobe': [1024, 711, [480, 768, 1024]],
  canvas: [1024, 711, [480, 768, 1024]],
  gallery: [1024, 853, [480, 768, 1024]],
  assets: [1024, 711, [480, 768, 1024]],
  assistant: [1024, 711, [480, 768, 1024]],
  'studio-models': [1600, 900, [640, 1024, 1600]],
  'studio-train-settings': [1600, 900, [640, 1024, 1600]],
  'studio-train-images': [1600, 900, [640, 1024, 1600]],
  'studio-train-review': [1600, 900, [640, 1024, 1600]],
  'home-lora': [1600, 900, [640, 1024, 1600]],
}

const SIZES = {
  full: '(min-width: 72rem) 69rem, (min-width: 40rem) calc(100vw - 3rem), calc(100vw - 2rem)',
  half: '(min-width: 72rem) 39rem, (min-width: 60rem) 56vw, (min-width: 40rem) calc(100vw - 3rem), calc(100vw - 2rem)',
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const srcset = (root, name, ext) =>
  IMG[name][2].map((w) => `${root}assets/img/${name}-${w}.${ext} ${w}w`).join(', ')

function picture(root, name, alt, { size = 'half', hero = false, caption } = {}) {
  const [w, h, widths] = IMG[name]
  const img = `<img src="${root}assets/img/${name}-${widths.at(-1)}.webp" srcset="${srcset(root, name, 'webp')}" sizes="${SIZES[size]}" width="${w}" height="${h}" alt="${esc(alt)}" ${hero ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'}>`
  return `<figure class="shot"><picture><source type="image/avif" srcset="${srcset(root, name, 'avif')}" sizes="${SIZES[size]}"><source type="image/webp" srcset="${srcset(root, name, 'webp')}" sizes="${SIZES[size]}">${img}</picture>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`
}

const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="16" fill="#A31621"/><circle cx="32" cy="32" r="9" fill="#FAF6EF"/><g stroke="#FAF6EF" stroke-width="3.5" stroke-linecap="round"><path d="M32 12v7M32 45v7M12 32h7M45 32h7M18.3 18.3l5 5M40.7 40.7l5 5M45.7 18.3l-5 5M23.3 40.7l-5 5"/></g></svg>`
const GH = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.34c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"/></svg>`

const NAV = [
  ['ai-avatar-studio/', 'Studio'],
  ['node-canvas/', 'Canvas'],
  ['lora-training/', 'LoRA training'],
  ['self-hosted-ai-image-generator/', 'Self-hosting'],
  ['install/', 'Quick start'],
  ['faq/', 'FAQ'],
]

const ctas = (root, primary = 'github') => {
  const gh = `<a class="btn ${primary === 'github' ? 'btn-primary' : 'btn-secondary'}" href="${REPO}">${GH}View on GitHub</a>`
  const qs = `<a class="btn ${primary === 'github' ? 'btn-secondary' : 'btn-primary'}" href="${root}install/">Quick start</a>`
  return `<div class="cta">${primary === 'github' ? gh + qs : qs + gh}</div>`
}

const PERSON = { '@type': 'Person', '@id': `${SITE_URL}#author`, name: AUTHOR.name, url: AUTHOR.url }
const APP = {
  '@type': ['SoftwareApplication', 'SoftwareSourceCode'],
  '@id': `${SITE_URL}#software`,
  name: 'SunnyGen',
  description:
    'Free, open-source, self-hosted AI image and video generation studio with a node-based canvas, an avatar and lookbook Studio, and FLUX LoRA training. Bring your own API keys.',
  url: SITE_URL,
  applicationCategory: 'MultimediaApplication',
  applicationSubCategory: 'AI image and video generation',
  operatingSystem: 'macOS, Linux, Docker',
  softwareVersion: VERSION,
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  license: 'https://opensource.org/licenses/MIT',
  codeRepository: REPO,
  programmingLanguage: 'TypeScript',
  runtimePlatform: 'Node.js 22.20+',
  author: { '@id': `${SITE_URL}#author` },
  image: `${SITE_URL}assets/og/home.png`,
  screenshot: ['studio', 'canvas', 'gallery', 'studio-models'].map((n) => ({
    '@type': 'ImageObject',
    url: `${SITE_URL}assets/img/${n}-${IMG[n][2].at(-1)}.webp`,
    width: IMG[n][0],
    height: IMG[n][1],
  })),
  featureList: [
    'Node-based infinite canvas for reusable image and video pipelines',
    'Studio for avatars, wardrobe, poses, scenes, and 1-4 angle lookbooks',
    'FLUX LoRA training on your own avatars through fal.ai',
    'Bring-your-own API keys for Sunra.ai, fal.ai, Azure AI Foundry, Codex CLI, and OpenRouter',
    'Local SQLite database and media on disk, no account, no telemetry',
    'Encrypted API key storage',
    'Installable PWA on desktop and mobile',
    'Docker image',
  ],
}

const faqLd = (items) => ({
  '@type': 'FAQPage',
  mainEntity: items.map(([q, a]) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') },
  })),
})

const faqHtml = (items, level = 'h3') =>
  items.map(([q, a]) => `<${level}>${esc(q)}</${level}><p>${a}</p>`).join('\n')

function layout(p) {
  const root =
    p.path === '' ? '' : p.path === '404' ? BASE_PATH : '../'.repeat(p.path.split('/').filter(Boolean).length)
  const url = p.path === '404' ? `${SITE_URL}404.html` : SITE_URL + p.path
  const og = `${SITE_URL}assets/og/${p.og || 'home'}.png`
  const crumbs = p.crumb ? [['Home', SITE_URL], ...p.crumb.map(([n, u]) => [n, SITE_URL + u])] : null
  const graph = [...(p.ld || [])]
  if (crumbs) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map(([name, item], i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name,
        item,
      })),
    })
  }
  if (p.path !== '' && p.path !== '404') {
    graph.push({
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: p.title,
      description: p.description,
      isPartOf: { '@id': `${SITE_URL}#website` },
      about: { '@id': `${SITE_URL}#software` },
      inLanguage: 'en',
    })
  }
  const ld = graph.length
    ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`
    : ''
  const hero = p.preload
    ? `<link rel="preload" as="image" type="image/avif" href="${root}assets/img/${p.preload[0]}-${IMG[p.preload[0]][2].at(-1)}.avif" imagesrcset="${srcset(root, p.preload[0], 'avif')}" imagesizes="${SIZES[p.preload[1]]}" fetchpriority="high">`
    : ''
  const nav = NAV.map(
    ([href, label]) =>
      `<li><a href="${root}${href}"${p.path === href ? ' aria-current="page"' : ''}>${label}</a></li>`,
  ).join('')
  const crumbHtml = crumbs
    ? `<nav class="crumbs wrap" aria-label="Breadcrumb"><ol>${crumbs
        .map(([n], i) =>
          i === crumbs.length - 1
            ? `<li><span aria-current="page">${esc(n)}</span></li>`
            : `<li><a href="${i === 0 ? root || './' : root + p.crumb[i - 1][1]}">${esc(n)}</a></li>`,
        )
        .join('')}</ol></nav>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
${p.path === '404' ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
<meta name="theme-color" content="#FAF6EF">
<meta name="color-scheme" content="light">
<meta name="author" content="${AUTHOR.name}">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${root}assets/icons/apple-touch-icon.png">
<link rel="manifest" href="${root}site.webmanifest">
<link rel="preload" href="${root}assets/fonts/space-grotesk.woff2" as="font" type="font/woff2" crossorigin>
${hero}
<link rel="stylesheet" href="${root}assets/site.css">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SunnyGen">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(p.ogTitle || p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${og}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(p.ogAlt || 'SunnyGen, a self-hosted AI image and video studio')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.ogTitle || p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${og}">
<meta name="twitter:image:alt" content="${esc(p.ogAlt || 'SunnyGen, a self-hosted AI image and video studio')}">
${ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
<div class="wrap">
<a class="brand" href="${root || './'}"${p.path === '' ? ' aria-current="page"' : ''}>${LOGO}SunnyGen</a>
<nav class="nav" aria-label="Main"><ul>${nav}<li><a href="${REPO}">GitHub</a></li></ul></nav>
</div>
</header>
${crumbHtml}
<main id="main">
${p.body(root)}
</main>
<footer class="site-footer">
<div class="wrap">
<div class="cols">
<div>
<a class="brand" href="${root || './'}">${LOGO}SunnyGen</a>
<p>A free, MIT-licensed, self-hosted studio for AI image and video generation. Your models. Your machine. Your library.</p>
</div>
<nav aria-label="Features"><h2>Features</h2><ul>
<li><a href="${root}ai-avatar-studio/">AI avatar studio</a></li>
<li><a href="${root}node-canvas/">Node canvas</a></li>
<li><a href="${root}lora-training/">FLUX LoRA training</a></li>
<li><a href="${root}self-hosted-ai-image-generator/">Self-hosted generator</a></li>
</ul></nav>
<nav aria-label="Project"><h2>Project</h2><ul>
<li><a href="${root}install/">Quick start</a></li>
<li><a href="${root}faq/">FAQ</a></li>
<li><a href="${REPO}">Source on GitHub</a></li>
<li><a href="${REPO}/blob/main/LICENSE">MIT license</a></li>
</ul></nav>
</div>
<p class="fine">Built by <a href="${AUTHOR.url}">${AUTHOR.name}</a> with TanStack Start, React, and TypeScript. Screenshots show demo content.</p>
</div>
</footer>
</body>
</html>
`
}

const HOME_FAQ = [
  [
    'Is SunnyGen free?',
    'Yes. SunnyGen is MIT-licensed and costs nothing to run. You pay the providers you connect, such as Sunra.ai, fal.ai, Azure, or your own ChatGPT plan through the Codex CLI, at their prices, with no subscription and no markup.',
  ],
  [
    'Which AI models does it support?',
    'Nano Banana 2 and Pro, Seedream 5.0 Lite and Pro, GPT Image 2, Grok Imagine, FLUX.1 LoRA, Veo 3.1, and Kling 3.0, routed through Sunra.ai, fal.ai, Azure AI Foundry, or the Codex CLI.',
  ],
  [
    'Where are my images and API keys stored?',
    'On your machine. Renders, uploads, references, and the SQLite database live under data/. Provider keys are encrypted in SQLite with AES-256-GCM and only sent to the provider you choose.',
  ],
  [
    'Can I train a LoRA on my own character?',
    'Yes. Any avatar in Studio can become a FLUX LoRA from 10 to 40 crops of its character sheet and 4×4 panel, at $2 per 1,000 training steps on your own fal.ai account.',
  ],
]

const FAQ = [
  ...HOME_FAQ,
  [
    'Does SunnyGen need an account or send telemetry?',
    'No. There is no account system and no telemetry. The app talks only to the providers you configure, with your own keys.',
  ],
  [
    'Does it run fully offline?',
    'Generation needs a network connection to the provider you choose; everything else is local. An installed PWA still opens its shell offline, but renders, assets, and provider calls need the local server.',
  ],
  [
    'What does FLUX LoRA training cost?',
    'Training runs on fal.ai at $2 per 1,000 steps: 500 steps for $1.00, 1,000 for $2.00, and 2,000 for $4.00, charged to your own fal account. FLUX.1 LoRA renders cost $0.035 per megapixel, about $0.035 for a one-megapixel image.',
  ],
  [
    'Does it work on mobile?',
    'The interface is responsive and installs as a PWA on iOS and Android. Renders still go through your SunnyGen server, so reach it over your LAN, Tailscale, or a Cloudflare Tunnel.',
  ],
  [
    'Can I self-host SunnyGen with Docker?',
    'Yes. The root Dockerfile builds a production image that serves on port 8977 and mounts the data directory from the host. You can also run it directly with Node.js and the ./sunnygen launcher.',
  ],
  [
    'Is it safe to expose SunnyGen to the internet?',
    'SunnyGen has no login. If you expose it beyond localhost or your private network, put an authenticating proxy in front of it, for example Cloudflare Access.',
  ],
  [
    'Which providers can I connect?',
    'Sunra.ai, fal.ai, Azure AI Foundry, and a local Codex CLI for generation, plus OpenRouter for the prompt assistant only. If the selected provider is not configured, SunnyGen falls back to another configured provider that supports the same model.',
  ],
  [
    'What is SunnyGen built with?',
    'TanStack Start, React, and TypeScript in a pnpm and Turborepo monorepo, with a node:sqlite database and media files on disk.',
  ],
]

const featureCards = (root) => `<ul class="cards four">
<li class="card"><h3><a href="${root}ai-avatar-studio/">Avatar studio</a></h3><p>Avatars, wardrobe slots, poses, scenes, and 1–4 angle lookbooks.</p><span class="more" aria-hidden="true">Studio →</span></li>
<li class="card"><h3><a href="${root}node-canvas/">Node canvas</a></h3><p>Chain prompts, references, and models into pipelines you can re-run.</p><span class="more" aria-hidden="true">Canvas →</span></li>
<li class="card"><h3><a href="${root}lora-training/">LoRA training</a></h3><p>Train a FLUX LoRA on an avatar for $2 per 1,000 steps.</p><span class="more" aria-hidden="true">Training →</span></li>
<li class="card"><h3><a href="${root}self-hosted-ai-image-generator/">Self-hosted</a></h3><p>SQLite and media on your disk. No account, no telemetry.</p><span class="more" aria-hidden="true">Self-hosting →</span></li>
</ul>`

const providersTable = `<div class="table-wrap"><table>
<thead><tr><th scope="col">Provider</th><th scope="col">Models</th><th scope="col">Credential</th></tr></thead>
<tbody>
<tr><td>Sunra.ai</td><td>Nano Banana, Seedream, GPT Image, Veo, Kling, Grok Imagine</td><td>Sunra API key</td></tr>
<tr><td>fal.ai</td><td>GPT Image 2, FLUX.1 LoRA, LoRA training</td><td>fal API key</td></tr>
<tr><td>Azure AI Foundry</td><td>GPT Image 2 in your own deployment</td><td>Key, base URL, deployment</td></tr>
<tr><td>Codex CLI</td><td>GPT Image 2 through a ChatGPT plan</td><td>Local <code>codex</code> login</td></tr>
<tr><td>OpenRouter</td><td>Prompt assistant only</td><td>OpenRouter key</td></tr>
</tbody></table></div>`

const install = `<pre><code>git clone https://github.com/henrychea/SunnyGen.git
cd SunnyGen
pnpm install
./sunnygen</code></pre>`

const PAGES = [
  {
    path: '',
    title: 'SunnyGen: Self-Hosted AI Image and Video Generator',
    description:
      'Free, open-source AI image and video studio you run yourself: node canvas pipelines, an avatar Studio, and FLUX LoRA training. Bring your own keys.',
    og: 'home',
    preload: ['studio', 'full'],
    ld: [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}#website`,
        url: SITE_URL,
        name: 'SunnyGen',
        description: 'Self-hosted, open-source AI image and video generation studio.',
        inLanguage: 'en',
        publisher: { '@id': `${SITE_URL}#author` },
      },
      PERSON,
      APP,
      faqLd(HOME_FAQ),
    ],
    body: (r) => `<section class="hero wrap" aria-labelledby="title">
<span class="eyebrow">Your models. Your machine. Your library.</span>
<h1 id="title">The self-hosted studio for AI image and video generation</h1>
<p class="lead">SunnyGen is a free, open-source AI image and video generator that runs on your own machine. Build reusable pipelines on a node canvas, shoot avatars and lookbooks in Studio, and train FLUX LoRAs on your own characters, all with your own API keys.</p>
${ctas(r)}
<ul class="facts"><li>MIT licensed</li><li>No account</li><li>No telemetry</li><li>No markup on renders</li></ul>
${picture(r, 'studio', 'SunnyGen Studio outfit builder: one avatar, five wardrobe pieces in garment slots, pose and scene pickers, and angle controls for a multi-angle render', { size: 'full', hero: true, caption: 'Studio: one avatar, up to six garments, one camera angle per render. Demo content.' })}
</section>

<section class="section" aria-labelledby="what">
<div class="wrap">
<div class="section-head">
<h2 id="what">One local app for the whole image workflow</h2>
<p>A self-hosted alternative to cloud AI studios. Chain prompts, models, and reference images into workflows that render on your own provider accounts, and keep every project, key, and asset on your disk.</p>
</div>
${featureCards(r)}
</div>
</section>

<section class="section" aria-labelledby="studio">
<div class="wrap">
<div class="row">
<div>
<span class="num">01 / Studio</span>
<h2 id="studio">Avatars, wardrobe, and multi-angle lookbooks</h2>
<p>Pick a saved avatar, stack up to six garments in slot order, choose a pose and scene, then render one to four angles over the same reference list. Prep on-model and supplier photos into clean product references without leaving the app.</p>
<p><a href="${r}ai-avatar-studio/">Explore the AI avatar studio</a></p>
</div>
${picture(r, 'studio-wardrobe', 'SunnyGen wardrobe library with garment slots, source types, and prep actions')}
</div>
<div class="row flip">
<div>
<span class="num">02 / Canvas</span>
<h2>Pipelines, not one-off prompts</h2>
<p>An infinite node editor with prompt, media, generate, note, and comment nodes. Graphs autosave and run in dependency order, so you can save a canvas and re-run it with new references.</p>
<p><a href="${r}node-canvas/">See the node-based canvas</a></p>
</div>
${picture(r, 'canvas', 'SunnyGen node canvas: a Prompt node wired into a Generate image node set to Nano Banana 2, plus an Image input node for a reference')}
</div>
<div class="row">
<div>
<span class="num">03 / LoRA</span>
<h2>Train a FLUX LoRA on your own avatar</h2>
<p>Choose 10–40 crops from an avatar's character sheet, pick Fast, Balanced, or Best, and set a trigger word. Training runs on your fal.ai account at $2 per 1,000 steps, with the total cost shown before you start.</p>
<p><a href="${r}lora-training/">Read how LoRA training works</a></p>
</div>
${picture(r, 'studio-train-settings', 'SunnyGen Train model dialog, step 2 of 3: Fast 500 steps $1.00, Balanced 1,000 steps $2.00, Best 2,000 steps $4.00, and a trigger word field')}
</div>
<div class="row flip">
<div>
<span class="num">04 / Gallery</span>
<h2>Every render lands in your own library</h2>
<p>Image and video renders show up in a canvas wall or grid with folders, failed-job retry, a lightbox, and downloads. Uploads and imported references are deduplicated by SHA-256 and ready to reuse.</p>
<p><a href="${r}self-hosted-ai-image-generator/">Why self-host your AI image generator</a></p>
</div>
${picture(r, 'gallery', 'SunnyGen gallery as a canvas wall of finished AI image renders, with folder filters, an images and videos toggle, and a canvas or grid switch')}
</div>
</div>
</section>

<section class="section" aria-labelledby="models">
<div class="wrap">
<div class="section-head">
<h2 id="models">Bring your own keys, pick your models</h2>
<p>Nano Banana 2 and Pro, Seedream 5.0 Lite and Pro, GPT Image 2, Grok Imagine, FLUX.1 LoRA, Veo 3.1, and Kling 3.0. Keys are encrypted in your local database and only sent to the provider you choose.</p>
</div>
${providersTable}
<p>The app is free. You pay providers at their own prices: LoRA training is $2 per 1,000 steps, and FLUX.1 LoRA renders are $0.035 per megapixel on fal.ai.</p>
</div>
</section>

<section class="section" aria-labelledby="start">
<div class="wrap row">
<div>
<h2 id="start">Running in four commands</h2>
<p>You need Node.js 22.20 or newer and pnpm. Clone the repo, install, and start the launcher. It builds when needed and serves on port 8977.</p>
<p>Then open <code>http://localhost:8977</code> and add a provider key under Settings → Providers.</p>
<p><a href="${r}install/">Full quick start guide</a></p>
</div>
<div>${install}</div>
</div>
</section>

<section class="section" aria-labelledby="faq">
<div class="wrap prose faq">
<h2 id="faq">Frequently asked questions</h2>
${faqHtml(HOME_FAQ)}
<p><a href="${r}faq/">All questions and answers</a></p>
</div>
</section>

<section class="section closing" aria-labelledby="go">
<div class="wrap">
<h2 id="go">Own your AI image studio</h2>
<p class="lead">Free and open source under the MIT license. No account, no shared credit pool, no markup.</p>
${ctas(r)}
</div>
</section>`,
  },
  {
    path: 'self-hosted-ai-image-generator/',
    title: 'Self-Hosted AI Image Generator, Free and Open Source',
    description:
      'Run your own AI image and video generator: SQLite and media on disk, encrypted keys, no account, no telemetry. MIT-licensed, Docker and PWA ready.',
    og: 'self-hosted',
    preload: ['gallery', 'full'],
    crumb: [['Self-hosted AI image generator', 'self-hosted-ai-image-generator/']],
    ld: [PERSON, APP],
    body: (r) => `<section class="page-hero wrap" aria-labelledby="title">
<span class="eyebrow">Self-hosting</span>
<h1 id="title">A self-hosted AI image generator that keeps your library on disk</h1>
<p class="lead">SunnyGen runs on your machine. Projects, renders, references, and encrypted provider keys live in a local folder, and generation goes straight to the provider accounts you own.</p>
${ctas(r, 'quick')}
${picture(r, 'gallery', 'SunnyGen gallery as a canvas wall of finished AI image renders, with folder filters and a canvas or grid switch', { size: 'full', hero: true, caption: 'The gallery: renders, folders, retries, and downloads, served from your own disk.' })}
</section>

<section class="section" aria-labelledby="why">
<div class="wrap prose">
<h2 id="why">Why self-host your image generation</h2>
<ul>
<li><strong>No account.</strong> There is no sign-up and no login to a SunnyGen service.</li>
<li><strong>No shared credit pool.</strong> You pay each provider directly, at its own price, with no markup.</li>
<li><strong>No telemetry.</strong> The app talks only to the providers you configure.</li>
<li><strong>Boring storage.</strong> A SQLite database and content-addressed media files, with no cloud bucket.</li>
<li><strong>Hackable.</strong> Small TypeScript packages in a MIT-licensed monorepo.</li>
</ul>
</div>
</section>

<section class="section" aria-labelledby="data">
<div class="wrap prose">
<h2 id="data">What stays on your machine</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">What</th><th scope="col">Default location</th></tr></thead>
<tbody>
<tr><td>Database</td><td><code>data/sunnygen.db</code></td></tr>
<tr><td>Media: uploads, references, renders</td><td><code>data/media/</code></td></tr>
<tr><td>Master key for encrypted API keys</td><td><code>data/secrets.key</code></td></tr>
</tbody></table></div>
<p>Move them with <code>SUNNYGEN_DATA_DIR</code> and <code>SUNNYGEN_MEDIA_DIR</code>. Provider and assistant keys are encrypted in SQLite with AES-256-GCM. Set <code>SUNNYGEN_SECRET</code> to supply the master key yourself.</p>
<h3>Library tools</h3>
<p>Uploads and imported references are deduplicated by SHA-256 and streamed with byte-range support. Social post links can be imported through an optional local <a href="https://github.com/imputnet/cobalt">cobalt</a> container; without it, the rest of the app keeps working.</p>
</div>
<div class="wrap row pair">
${picture(r, 'assets', 'SunnyGen asset library with uploaded garment references, file sizes, folders, and image, video, and audio filters', { caption: 'Assets: uploads and imported references, ready to reuse.' })}
${picture(r, 'assistant', 'SunnyGen assistant drafting a warm autumn lookbook direction, with a response mode and model picker', { caption: 'Assistant: prompt drafting through OpenRouter, never used for generation.' })}
</div>
</section>

<section class="section" aria-labelledby="keys">
<div class="wrap">
<div class="section-head">
<h2 id="keys">Bring your own API keys</h2>
<p>Connect the providers you already pay for. If the selected provider is not configured, SunnyGen falls back to another configured provider that supports the same model.</p>
</div>
${providersTable}
<h3>Supported models</h3>
<ul class="facts"><li>Nano Banana 2 and Pro</li><li>Seedream 5.0 Lite and Pro</li><li>GPT Image 2</li><li>Grok Imagine</li><li>FLUX.1 LoRA</li><li>Veo 3.1</li><li>Kling 3.0</li></ul>
</div>
</section>

<section class="section" aria-labelledby="run">
<div class="wrap prose">
<h2 id="run">Run it where you work</h2>
<h3>On your network</h3>
<p>The <code>./sunnygen</code> launcher prints local, LAN, Tailscale, and MagicDNS URLs, and can publish a Bonjour name so phones and other laptops can connect. <code>./sunnygen --tunnel</code> starts a Cloudflare Tunnel connector.</p>
<h3>As a service or in Docker</h3>
<p><code>./sunnygen --install-service</code> registers a login service that restarts after a crash: launchd on macOS, <code>systemd --user</code> on Linux. A root Dockerfile builds a production image that serves on port 8977 with the data directory mounted from the host.</p>
<h3>As an app on desktop and mobile</h3>
<p>SunnyGen is an installable PWA with a standalone window and a cached shell, so the interface opens even when the server is unreachable.</p>
<div class="note"><p>SunnyGen has no login. If you expose it beyond localhost or your private network, put an authenticating proxy in front of it, for example Cloudflare Access.</p></div>
<p style="margin-top:1.5rem"><a href="${r}install/">Install SunnyGen</a> · <a href="${r}faq/">Read the FAQ</a></p>
</div>
</section>`,
  },
  {
    path: 'node-canvas/',
    title: 'Node-Based Canvas for AI Image Pipelines | SunnyGen',
    description:
      'Wire prompts, reference images, and models into reusable AI image and video pipelines on an infinite node canvas. Autosaves, runs in dependency order.',
    og: 'node-canvas',
    preload: ['canvas', 'full'],
    crumb: [['Node canvas', 'node-canvas/']],
    ld: [PERSON, APP],
    body: (r) => `<section class="page-hero wrap" aria-labelledby="title">
<span class="eyebrow">Canvas</span>
<h1 id="title">Build reusable AI image pipelines on a node canvas</h1>
<p class="lead">Connect prompt, media, and generate nodes on an infinite canvas. Save the graph once, then re-run it with new references instead of rewriting prompts.</p>
${ctas(r, 'quick')}
${picture(r, 'canvas', 'SunnyGen node canvas: a Prompt node wired into a Generate image node set to Nano Banana 2, plus an Image input node for a reference', { size: 'full', hero: true, caption: 'A prompt and a reference image feeding one Generate node.' })}
</section>

<section class="section" aria-labelledby="nodes">
<div class="wrap prose">
<h2 id="nodes">Five node types</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Node</th><th scope="col">What it does</th></tr></thead>
<tbody>
<tr><td>Prompt</td><td>Holds the text that drives a render.</td></tr>
<tr><td>Media</td><td>Brings in an image or video as a reference.</td></tr>
<tr><td>Generate</td><td>Renders with its own model and settings.</td></tr>
<tr><td>Note</td><td>Keeps instructions next to the graph.</td></tr>
<tr><td>Comment</td><td>Annotates a part of the pipeline.</td></tr>
</tbody></table></div>
<h2>How a pipeline runs</h2>
<ol class="steps">
<li><strong>Connect.</strong> Wire a Prompt node, and any reference media, into a Generate node.</li>
<li><strong>Choose models per node.</strong> Each Generate node picks its own model, for example Nano Banana 2, Seedream, or GPT Image 2.</li>
<li><strong>Run all.</strong> The graph executes in dependency order, so upstream results feed downstream nodes.</li>
<li><strong>Collect results.</strong> Every finished render lands in the gallery automatically.</li>
</ol>
<h2>Why a canvas instead of a chat box</h2>
<p>One-off prompts are hard to repeat. A saved canvas keeps the prompt, references, and model choices together, autosaves as you work, and runs again on new inputs. It suits product shots, character series, and any look you want to reproduce.</p>
</div>
</section>

<section class="section" aria-labelledby="more">
<div class="wrap row flip">
<div>
<h2 id="more">Results go straight to your gallery</h2>
<p>Canvas renders join one-off renders from the home prompt bar in a canvas wall or grid, with folders, failed-job retry, a lightbox, and downloads. Files stay in your local media folder.</p>
<p><a href="${r}self-hosted-ai-image-generator/">How SunnyGen stores your library</a></p>
<p><a href="${r}ai-avatar-studio/">Prefer a guided flow? Try Studio</a></p>
</div>
${picture(r, 'gallery', 'SunnyGen gallery canvas wall of finished renders with folder filters')}
</div>
</section>`,
  },
  {
    path: 'ai-avatar-studio/',
    title: 'AI Avatar and Lookbook Studio, Self-Hosted | SunnyGen',
    description:
      'Dress an AI avatar in up to six garments, set a pose and scene, and render a 1–4 angle lookbook. Garment prep and pack import. Free and open source.',
    og: 'ai-avatar-studio',
    preload: ['studio', 'full'],
    crumb: [['AI avatar studio', 'ai-avatar-studio/']],
    ld: [PERSON, APP],
    body: (r) => `<section class="page-hero wrap" aria-labelledby="title">
<span class="eyebrow">Studio</span>
<h1 id="title">An AI avatar studio for outfits, poses, and multi-angle lookbooks</h1>
<p class="lead">Studio is the main workspace in SunnyGen. Pick a saved avatar, stack garments in slot order, choose a pose and scene, and render one to four camera angles over the same reference list.</p>
${ctas(r, 'quick')}
${picture(r, 'studio', 'SunnyGen Studio outfit builder: one avatar, five wardrobe pieces in garment slots, pose and scene pickers, and Front, Three-quarter, Side, and Back angle controls', { size: 'full', hero: true, caption: 'One avatar, five garments, two angles selected. Demo content.' })}
</section>

<section class="section" aria-labelledby="flow">
<div class="wrap prose">
<h2 id="flow">From avatar to lookbook</h2>
<ol class="steps">
<li><strong>Avatar.</strong> Save a character with its character sheet, so every render starts from the same likeness.</li>
<li><strong>Wardrobe.</strong> Add up to six garments in slot order: top, bottom, dress, outerwear, shoes, bag, or accessory.</li>
<li><strong>Pose and scene.</strong> Pick saved pose and scene references, or leave either open.</li>
<li><strong>Angles.</strong> Choose Front, Three-quarter, Side, or Back. SunnyGen renders one generation per angle, all over the same references.</li>
</ol>
</div>
</section>

<section class="section" aria-labelledby="wardrobe">
<div class="wrap row">
<div>
<h2 id="wardrobe">A wardrobe library with garment prep</h2>
<p>Each piece stores its slot, source type, notes, and a prepared clean reference. Source types are flat-lay, on-model, and supplier photos; on-model and supplier shots can be prepped into clean product references inside the app.</p>
</div>
${picture(r, 'studio-wardrobe', 'SunnyGen wardrobe library with garment slots, source types, and prep actions')}
</div>
</section>

<section class="section" aria-labelledby="packs">
<div class="wrap prose">
<h2 id="packs">Move libraries between machines with packs</h2>
<p>Poses, wardrobe, scenes, and avatars import as packs: a <code>.zip</code> or a folder of images with an optional <code>sunnygen-pack.json</code> mapping.</p>
<ul>
<li>Images only: PNG, JPG, WebP, AVIF, and GIF.</li>
<li>Up to 250 MB and 500 items per pack.</li>
<li>Duplicate names are skipped, not overwritten, and one bad file never cancels the rest.</li>
</ul>
<h2>Keep a face consistent with LoRA</h2>
<p>Any Studio avatar can become a FLUX LoRA, so the same likeness carries into every later render. <a href="${r}lora-training/">See how LoRA training works</a>.</p>
<p><a href="${r}node-canvas/">Build the same look as a reusable canvas pipeline</a></p>
</div>
</section>`,
  },
  {
    path: 'lora-training/',
    title: 'FLUX LoRA Training on Your Own Avatars | SunnyGen',
    description:
      'Train a FLUX LoRA on your own avatar from 10–40 crops at $2 per 1,000 steps on your fal.ai account, then render with it. Self-hosted and open source.',
    og: 'lora-training',
    ogAlt: 'SunnyGen Train model dialog with Fast, Balanced, and Best training lengths',
    preload: ['studio-train-settings', 'full'],
    crumb: [['FLUX LoRA training', 'lora-training/']],
    ld: [
      PERSON,
      APP,
      {
        '@type': 'HowTo',
        name: 'Train a FLUX LoRA on an avatar in SunnyGen',
        estimatedCost: { '@type': 'MonetaryAmount', currency: 'USD', value: '2.00' },
        step: [
          {
            '@type': 'HowToStep',
            name: 'Images',
            text: 'Pick an avatar and select 10 to 40 crops from its character sheet and 4×4 panel.',
          },
          {
            '@type': 'HowToStep',
            name: 'Settings',
            text: 'Choose Fast (500 steps), Balanced (1,000 steps), or Best (2,000 steps) and set a trigger word.',
          },
          {
            '@type': 'HowToStep',
            name: 'Review',
            text: 'Check the image count, length, trigger word, and total cost, confirm permission, and start training.',
          },
          {
            '@type': 'HowToStep',
            name: 'Render',
            text: 'Attach the avatar in the prompt bar and generate with the FLUX.1 LoRA model.',
          },
        ],
      },
    ],
    body: (r) => `<section class="page-hero wrap" aria-labelledby="title">
<span class="eyebrow">LoRA training</span>
<h1 id="title">Train a FLUX LoRA on your own avatar</h1>
<p class="lead">Turn any Studio avatar into a FLUX LoRA, then reuse that likeness in every later render. Training runs on your own fal.ai account at $2 per 1,000 steps, with the total shown before you start.</p>
${ctas(r, 'quick')}
${picture(r, 'studio-train-settings', 'SunnyGen Train model dialog, step 2 of 3: training length presets Fast 500 steps $1.00, Balanced 1,000 steps $2.00, Best 2,000 steps $4.00, and a trigger word field', { size: 'full', hero: true, caption: 'Three training lengths and one trigger word per model.' })}
</section>

<section class="section" aria-labelledby="cost">
<div class="wrap prose">
<h2 id="cost">What LoRA training costs</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Length</th><th scope="col">Steps</th><th scope="col">Cost on fal.ai</th></tr></thead>
<tbody>
<tr><td>Fast</td><td>500</td><td>$1.00</td></tr>
<tr><td>Balanced</td><td>1,000</td><td>$2.00</td></tr>
<tr><td>Best</td><td>2,000</td><td>$4.00</td></tr>
</tbody></table></div>
<p>Renders with your trained model use FLUX.1 LoRA on fal.ai at $0.035 per megapixel, about $0.035 for a one-megapixel image. SunnyGen adds no markup; charges go to your own fal account.</p>
</div>
</section>

<section class="section" aria-labelledby="how">
<div class="wrap">
<div class="section-head"><h2 id="how">How training works</h2></div>
<div class="row">
<div>
<span class="num">Step 1</span>
<h3>Choose the training images</h3>
<p>Pick an avatar you already keep in Studio and select 10–40 crops cut from its character sheet and 4×4 panel.</p>
</div>
${picture(r, 'studio-train-images', 'SunnyGen Train model dialog, step 1 of 3: 17 of 17 images selected, a character sheet and panel crops of one avatar')}
</div>
<div class="row flip">
<div>
<span class="num">Step 2</span>
<h3>Pick a length and trigger word</h3>
<p>Fast, Balanced, or Best sets the step count. The trigger word is added to the front of every prompt that uses the model.</p>
</div>
${picture(r, 'studio-train-settings', 'Training length presets and the trigger word field')}
</div>
<div class="row">
<div>
<span class="num">Step 3</span>
<h3>Review and start</h3>
<p>The review lists the image count, training length, trigger word, and total cost. Confirm you have permission to train on the person's likeness, then start training.</p>
</div>
${picture(r, 'studio-train-review', 'SunnyGen Train model review: 17 images, Balanced 1,000 steps, trigger word ava, total cost $2.00, a likeness permission checkbox, and a Start training button')}
</div>
</div>
</section>

<section class="section" aria-labelledby="use">
<div class="wrap">
<div class="row flip">
<div>
<h2 id="use">Track runs and render with your model</h2>
<p>The Studio Models tab lists every run with its status, steps, cost, and training date. A failed run keeps its reason and a retry button.</p>
<p>A trained model shows up as FLUX.1 LoRA in the home prompt bar, with a strength slider and its per-megapixel price. Attach the avatar as a reference and generate.</p>
<p><a href="${r}ai-avatar-studio/">Build avatars in Studio</a> · <a href="${r}faq/">LoRA questions in the FAQ</a></p>
</div>
<div>
${picture(r, 'studio-models', 'SunnyGen Studio Models tab listing trained FLUX LoRA models with status, step count, cost, and training date, plus a retry button on a failed run')}
${picture(r, 'home-lora', 'SunnyGen home prompt bar generating with the FLUX.1 LoRA model from an avatar reference, with the LoRA strength slider and per-megapixel price')}
</div>
</div>
</div>
</section>`,
  },
  {
    path: 'install/',
    title: 'Install SunnyGen: Quick Start Guide',
    description:
      'Install SunnyGen in four commands with Node.js and pnpm, add a provider key, and render your first image. Docker, service, LAN, and PWA setup included.',
    og: 'home',
    crumb: [['Quick start', 'install/']],
    ld: [
      PERSON,
      {
        '@type': 'HowTo',
        name: 'Install SunnyGen',
        totalTime: 'PT10M',
        tool: [
          { '@type': 'HowToTool', name: 'Node.js 22.20 or newer' },
          { '@type': 'HowToTool', name: 'pnpm 9.15' },
        ],
        step: [
          {
            '@type': 'HowToStep',
            name: 'Clone',
            text: 'git clone https://github.com/henrychea/SunnyGen.git and cd SunnyGen.',
          },
          { '@type': 'HowToStep', name: 'Install', text: 'Run pnpm install.' },
          { '@type': 'HowToStep', name: 'Start', text: 'Run ./sunnygen and open http://localhost:8977.' },
          {
            '@type': 'HowToStep',
            name: 'Add a provider',
            text: 'Add a Sunra.ai, fal.ai, Azure, or Codex credential under Settings → Providers.',
          },
        ],
      },
    ],
    body: (r) => `<section class="page-hero wrap prose" aria-labelledby="title">
<span class="eyebrow">Quick start</span>
<h1 id="title">Install SunnyGen in four commands</h1>
<p class="lead">You need Node.js 22.20 or newer (24 recommended) and pnpm 9.15. Docker is optional.</p>
</section>

<section class="section" aria-labelledby="steps">
<div class="wrap prose">
<h2 id="steps">Install and start</h2>
${install}
<p>The launcher builds when the source is newer than the last build and serves on <code>0.0.0.0:8977</code>. Open <code>http://localhost:8977</code>.</p>
<h2>Your first render</h2>
<ol class="steps">
<li><strong>Settings → Providers.</strong> Add a Sunra.ai, fal.ai, Azure, or Codex credential.</li>
<li><strong>Canvas.</strong> Connect a Prompt node to a Generate node and press <strong>Run all</strong>.</li>
<li><strong>Gallery.</strong> Every finished render lands here automatically.</li>
</ol>
<p>Prefer hot reload while you hack on it? Run <code>pnpm dev</code>.</p>
</div>
</section>

<section class="section" aria-labelledby="options">
<div class="wrap prose">
<h2 id="options">Run options</h2>
<h3>Reach it from other devices</h3>
<pre><code>./sunnygen --name studio     # http://studio.local:8977
./sunnygen --port 3000
./sunnygen --background      # detach, log to .sunnygen/
./sunnygen --tunnel          # Cloudflare Tunnel connector</code></pre>
<p>The launcher prints local, LAN, Tailscale, and MagicDNS URLs.</p>
<h3>Keep it running as a service</h3>
<pre><code>./sunnygen --install-service
./sunnygen --service-status
./sunnygen --restart-service</code></pre>
<p>This uses launchd on macOS and <code>systemd --user</code> on Linux, and restarts the app after a crash.</p>
<h3>Run it in Docker</h3>
<pre><code>docker compose -p sunnygen-prod up -d --build</code></pre>
<p>The image serves on port 8977 and mounts the data directory from the host.</p>
<h3>Install as an app</h3>
<ul>
<li><strong>Chrome or Edge:</strong> use the install icon in the address bar.</li>
<li><strong>iPhone or iPad (Safari):</strong> Share → Add to Home Screen.</li>
<li><strong>Android (Chrome):</strong> Menu → Install app.</li>
</ul>
<h3>Optional extras</h3>
<p>Social imports need a local cobalt container: <code>./sunnygen --cobalt</code>. The Codex provider needs the <code>codex</code> CLI logged in on the same machine. Environment fallbacks for keys: <code>SUNRA_API_KEY</code>, <code>FAL_KEY</code>, <code>AZURE_API_KEY</code>, <code>OPENROUTER_API_KEY</code>.</p>
<div class="note"><p>SunnyGen has no login. Before you expose it beyond your private network, put an authenticating proxy such as Cloudflare Access in front of it.</p></div>
${ctas(r)}
</div>
</section>`,
  },
  {
    path: 'faq/',
    title: 'SunnyGen FAQ: Pricing, Models, Privacy, Self-Hosting',
    description:
      'Answers about SunnyGen: is it free, which AI models and providers it supports, where data is stored, LoRA training costs, mobile, Docker, and security.',
    og: 'home',
    crumb: [['FAQ', 'faq/']],
    ld: [faqLd(FAQ)],
    body: (r) => `<section class="page-hero wrap prose" aria-labelledby="title">
<span class="eyebrow">FAQ</span>
<h1 id="title">Frequently asked questions</h1>
<p class="lead">Short answers about cost, models, privacy, and running SunnyGen yourself.</p>
</section>
<section class="section" aria-label="Questions and answers">
<div class="wrap prose faq">
${faqHtml(FAQ, 'h2')}
<p style="margin-top:2rem">More detail: <a href="${r}install/">quick start</a>, <a href="${r}lora-training/">LoRA training</a>, <a href="${r}self-hosted-ai-image-generator/">self-hosting</a>.</p>
${ctas(r)}
</div>
</section>`,
  },
  {
    path: '404',
    title: 'Page not found | SunnyGen',
    description: 'This page does not exist. Go to the SunnyGen home page, quick start, or FAQ.',
    body: (r) => `<section class="page-hero wrap prose" aria-labelledby="title">
<span class="eyebrow">404</span>
<h1 id="title">Page not found</h1>
<p class="lead">The page you asked for does not exist or has moved.</p>
<ul>
<li><a href="${r}">SunnyGen home</a></li>
<li><a href="${r}install/">Quick start</a></li>
<li><a href="${r}faq/">FAQ</a></li>
</ul>
</section>`,
  },
]

const llms = `# SunnyGen

> Free, MIT-licensed, self-hosted, local-first AI image and video generation studio. Node-based infinite canvas for reusable pipelines, a Studio for avatars and lookbooks, and FLUX LoRA training on your own avatars. Bring your own API keys; no account, no telemetry.

- Source: ${REPO}
- License: MIT
- Author: ${AUTHOR.name} (${AUTHOR.url})
- Built with: TanStack Start, React, TypeScript; SQLite (node:sqlite) and media files on disk
- Install: git clone ${REPO}.git && cd SunnyGen && pnpm install && ./sunnygen, then open http://localhost:8977
- Requirements: Node.js 22.20+ and pnpm 9.15; Docker optional

## Features

- Canvas: infinite node editor with prompt, media, generate, note, and comment nodes; autosave; runs in dependency order
- Studio: avatars, up to six garments in slots, poses, scenes, and 1-4 angle lookbooks; garment prep; pack import
- LoRA: FLUX LoRA training on a Studio avatar from 10-40 crops through fal.ai at $2 per 1,000 steps; FLUX.1 LoRA renders at $0.035 per megapixel
- Gallery and assets: canvas wall or grid, folders, retry, lightbox, downloads; SHA-256 deduplicated uploads; social imports through cobalt
- Assistant: prompt drafting through OpenRouter, never used for generation
- Providers: Sunra.ai, fal.ai, Azure AI Foundry, Codex CLI, OpenRouter (assistant only)
- Models: Nano Banana 2 and Pro, Seedream 5.0 Lite and Pro, GPT Image 2, Grok Imagine, FLUX.1 LoRA, Veo 3.1, Kling 3.0
- Privacy: no account, no telemetry, API keys encrypted with AES-256-GCM in local SQLite
- Runs as: PWA on desktop and mobile, Docker image, launchd or systemd service; LAN, Tailscale, and Cloudflare Tunnel friendly

## Pages

- [Home](${SITE_URL}): overview
- [AI avatar studio](${SITE_URL}ai-avatar-studio/): avatars, wardrobe, poses, scenes, lookbooks
- [Node canvas](${SITE_URL}node-canvas/): reusable image and video pipelines
- [FLUX LoRA training](${SITE_URL}lora-training/): training flow and costs
- [Self-hosted AI image generator](${SITE_URL}self-hosted-ai-image-generator/): storage, keys, providers, deployment
- [Quick start](${SITE_URL}install/): install and run
- [FAQ](${SITE_URL}faq/): common questions
`

const manifest = {
  name: 'SunnyGen',
  short_name: 'SunnyGen',
  description: 'Self-hosted, open-source AI image and video generation studio.',
  lang: 'en',
  start_url: BASE_PATH,
  scope: BASE_PATH,
  display: 'browser',
  background_color: '#FAF6EF',
  theme_color: '#FAF6EF',
  icons: [
    { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    { src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
}

const write = (rel, content) => {
  const file = join(OUT, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

for (const p of PAGES) write(p.path === '404' ? '404.html' : `${p.path}index.html`, layout(p))

const today = new Date().toISOString().slice(0, 10)
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.filter((p) => p.path !== '404')
  .map((p) => `  <url><loc>${SITE_URL}${p.path}</loc><lastmod>${today}</lastmod></url>`)
  .join('\n')}
</urlset>
`,
)
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`)
write('llms.txt', llms)
write('site.webmanifest', `${JSON.stringify(manifest, null, 2)}\n`)
write('.nojekyll', '')
