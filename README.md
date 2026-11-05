<p align="center">
  <img src="apps/web/public/favicon.svg" alt="SunnyGen" width="64" />
</p>

<p align="center">
  <strong>Build AI image and video pipelines visually.</strong><br/>
  A local-first studio for prompts, models, references, and repeatable workflows.
</p>

---

# SunnyGen

SunnyGen is a self-hosted visual studio for image and video generation. It runs as a
local web app, keeps projects and media on your disk, and lets you choose the provider
behind every render.

- Infinite node canvas for reusable pipelines
- Image and video generation across providers
- Avatar + wardrobe lookbook Studio
- Gallery, folders, uploads, and social references
- Prompt assistant with response modes
- Local SQLite storage and local media files

No subscription. No shared credit pool. Bring your own provider keys.

---

# Requirements

- Node.js 22.20 or newer (Node 24 recommended)
- pnpm 9.15
- Optional: Docker for social imports
- Optional: `codex` and `codex-imagegen` for the Codex provider

---

# Quick start

```bash
pnpm install
./sunnygen
```

Open <http://localhost:8977>. For development:

```bash
pnpm dev
```

Open <http://localhost:8977> and add a provider key in **Settings → Providers**.

---

# Providers

| Provider             | Runs                               | Credential                      |
| -------------------- | ---------------------------------- | ------------------------------- |
| **Sunra.ai**         | Curated image and video models     | Sunra API key                   |
| **fal.ai**           | GPT Image 2 on fal                 | fal API key                     |
| **Azure AI Foundry** | GPT Image 2 in your own deployment | Azure key, base URL, deployment |
| **Codex CLI**        | GPT Image 2 through a ChatGPT plan | Local `codex` login             |
| **OpenRouter**       | Assistant chat only                | OpenRouter key                  |

Keys are stored in the local SQLite database. Environment fallbacks:
`SUNRA_API_KEY`, `FAL_KEY`, `AZURE_API_KEY`, `OPENROUTER_API_KEY`.

When the selected provider is not configured, generation falls back to another
configured provider that supports the same model.

---

# The app

## Canvas

`/canvas` is the workflow editor. Add prompt, media, and generate nodes, connect them,
and run the graph. Generation nodes execute in dependency order; each node keeps its
own model, ratio, quality, duration, resolution, and references.

Graphs autosave to SQLite. **Open** switches between saved pipelines.

## Gallery

`/gallery` lists finished renders. Use **New render** for a one-off generation, paste a
social link to import references, move results into folders, download, or delete.

## Studio

`/studio` builds catalogue looks:

- **Avatars** — two uploaded sheets: a character sheet and a 4×4 identity panel sheet.
- **Wardrobe** — garments by slot, with prep for on-model and supplier photos.
- **Poses** — body-stance references.
- **Scenes** — background references plus a built-in white studio.

Pick an avatar, up to six garments, a pose, a scene, and one to four angles. Each angle
is one generation over the same reference list.

## Assets

`/assets` stores uploads and social references. Files are deduplicated by SHA-256 and
served from `/api/media/<id>` with byte-range support.

## Assistant

`/chat` uses OpenRouter for prompt drafting and rewrites. It is never used for image or
video generation.

---

# Data & privacy

| What     | Default location   |
| -------- | ------------------ |
| Database | `data/sunnygen.db` |
| Media    | `data/media/`      |

Override with `SUNNYGEN_DATA_DIR` and `SUNNYGEN_MEDIA_DIR`. Deleting both directories is
a full reset.

SunnyGen has no account system. If you expose it beyond localhost, put an authenticating
proxy in front of it (for example Cloudflare Access).

---

# Launcher

```bash
./sunnygen                 # build if stale, serve on 0.0.0.0:8977
./sunnygen --dev           # Vite dev server with hot reload
./sunnygen --port 3000
./sunnygen --background    # detach, log to .sunnygen/
./sunnygen --stop
./sunnygen --name studio   # publish studio.local over Bonjour
./sunnygen --no-mdns
./sunnygen --tunnel        # Cloudflare Tunnel connector
./sunnygen --help
```

It prints the local, LAN, Tailscale, and MagicDNS URLs when they are available.

### Login service (macOS)

```bash
./sunnygen --install-service
./sunnygen --service-status
./sunnygen --restart-service
./sunnygen --stop-service
./sunnygen --uninstall-service
```

The launchd job runs the production server and restarts it after a crash. Logs:
`~/Library/Logs/sunnygen.log` and `~/Library/Logs/sunnygen.err.log`.

Only one server may run at a time.

---

# Social imports (optional)

Social links are resolved by a local [cobalt](https://github.com/imputnet/cobalt)
container:

```bash
./sunnygen --cobalt
./sunnygen --cobalt-status
docker compose logs -f cobalt
```

Cobalt listens on `127.0.0.1:9000`. Set `COBALT_API_URL` if you host it elsewhere, and
`COBALT_API_KEY` when your instance requires auth. Without cobalt, the rest of the app
keeps working.

---

# Codex provider (optional)

The Codex provider runs GPT Image 2 through your own ChatGPT plan instead of API
credits. It needs the `codex` CLI, `codex-imagegen`, and a logged-in session on the
machine running SunnyGen; containers cannot reach host binaries. See
[`codex-imagegen-cli`](https://github.com/jdmnk/codex-imagegen-cli) for installation.

**Settings → Providers → Codex CLI** shows whether the CLI and login are ready.

---

# Repository layout

```
apps/
  web/          TanStack Start app (routes, server functions, UI)
  cli/          ./sunnygen launcher
packages/
  core/         Domain types, model catalog, pure studio/workflow logic
  db/           SQLite schema and repositories
  providers/    Sunra, fal, Azure, and Codex adapters
  ui/           Shared React primitives and theme
```

Turborepo orchestrates tasks; pnpm workspaces manage packages.

---

# Development

```bash
pnpm dev          # app dev server
pnpm build        # production build
pnpm typecheck    # TypeScript across the workspace
pnpm test         # unit tests
pnpm lint         # ESLint
```

Useful filters:

```bash
pnpm --filter @sunnygen/web dev
pnpm --filter @sunnygen/providers test
```

---

# License

MIT — see [`LICENSE`](LICENSE).
