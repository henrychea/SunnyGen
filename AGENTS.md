# SunnyGen agent notes

TanStack Start + Turborepo monorepo. Local-first: SQLite through `packages/db`, media on
disk, client state in React Query and Zustand. Provider calls run server-side.

## Commands

| Command                           | Use                                          |
| --------------------------------- | -------------------------------------------- |
| `pnpm dev`                        | Vite dev server for `apps/web` on port 8977. |
| `pnpm build`                      | Production build.                            |
| `pnpm test`                       | Unit tests (`tsx --test`).                   |
| `pnpm format`                     | Oxfmt.                                       |
| `pnpm typecheck`                  | TypeScript across all packages.              |
| `pnpm lint`                       | Oxlint.                                      |
| `pnpm --filter @sunnygen/web dev` | Run only the web app.                        |

Run the production build with `./sunnygen`; the launcher builds when stale, serves
`0.0.0.0:8977`, and manages the macOS launchd job.

## Layout

```
apps/web/src/routes      File routes and server routes
apps/web/src/server      Server functions and server-only helpers
apps/web/src/components  UI components
packages/core            Shared contracts, model catalog, pure logic
packages/db              node:sqlite schema and repositories
packages/providers       Server-only provider adapters
packages/ui              React primitives, Tailwind theme
apps/cli                 sunnygen launcher
```

## Conventions

- Server-only modules use `.server.ts`; server functions use `.functions.ts`.
- Import server functions statically; do not dynamic-import them.
- Routes import shared UI from `@sunnygen/ui`, data contracts from `@sunnygen/core`.
- Media is stored under `data/media` and served from `/api/media/<assetId>`.
- Generation jobs persist in `generations` + `jobs`; one poller per process.
- Dialogs use Base UI primitives in `@sunnygen/ui` and render through `DialogSurface`.
- The theme is warm light: canvas `#FAF6EF`, surface `#FFFDF8`, ink `#2A1E17`,
  accent `#A31621`. Use theme classes (`bg-canvas`, `text-ink`, `border-line`).

## Data

- `data/sunnygen.db` — SQLite, WAL mode.
- `data/media/` — uploads, references, generated results.
- `SUNNYGEN_DATA_DIR` and `SUNNYGEN_MEDIA_DIR` override both.
- Provider keys live in `settings`; environment variables are the fallback.

Do not commit keys, the database, or media files.
