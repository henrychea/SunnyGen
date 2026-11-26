# Video Copy Pipeline Implementation Plan

> **For agentic workers:** Executed by Orca Pi workers, one task per worker, in
> dependency order: Task 1 → Task 2 → Task 3 → (Task 4 ∥ Task 5 ∥ Task 6) → Task 7 →
> Task 8 → Task 9 → Task 10 → Task 11. Steps use checkbox (`- [ ]`) syntax for tracking.
> Workers other than Task 1 must wait for the tasks they consume.

**Goal:** Copy a source video's motion and structure: extract frames with ffmpeg, edit them through the existing image edit flow, have a coding agent read the frames into a validated shot list, regenerate each shot with the existing start+end frame video mode, and concatenate the clips into one new asset.

**Architecture:** Four stages behind one `video_copies` row. Frames are ordinary media assets, edits are the existing composer, and each shot is a normal `kind: 'video'` generation submitted through `submitGeneration`, so the wall, the job table, the poller, retries, and cost accounting all apply unchanged. The new pieces are an ffmpeg wrapper, an agent CLI runner, a zod shot-list contract, and a concat step.

**Tech Stack:** ffmpeg and ffprobe on the host or in the image, TypeScript, zod 4, `spawn` without a shell, node:sqlite migration, TanStack Start server functions, motion, `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-25-v3-release-design.md` (section 4)

**Depends on:** `docs/superpowers/plans/2026-11-25-v3-1-dark-theme.md` (the panel uses theme tokens), `docs/superpowers/plans/2026-11-25-v3-3-nsfw-mode.md` (shot generations must respect the mode at submit time, and added frames are assets with an `nsfw` flag).

## Global Constraints

- **Do not commit.** Leave every change in the working tree and report.
- **Do not start dev servers except for the checks a task names.** Those use
  `pnpm dev:demo` on port 8978 with demo data. Never the real database, never the Docker
  `sunnygen-prod` container.
- **No migration against a real database.** `SCHEMA_VERSION` goes from 5 to 6 inside
  `packages/db/src/migrations.test.ts` only.
- **No shell.** Every `spawn` call passes an argument array and `shell: false`. A frame
  path or a prompt from an agent is untrusted text and never becomes a shell word.
- **No execution of agent output.** The shot list is data. It becomes prompts and asset
  ids, never a command, never a URL the server fetches without the existing guards.
- **Fail loud on a missing binary.** ffmpeg, ffprobe, and each agent CLI are detected
  before use, and the error names the install command.
- **Reuse, do not rebuild.** Shot submissions go through `submitGeneration`
  (`apps/web/src/server/generation.functions.ts:60`), the frames-mode capability comes from
  `videoModesFor(models, 'frames')` (`apps/web/src/lib/video-flow.ts:42`), and the batch
  folder comes from `createFolderFn` (`apps/web/src/server/library.functions.ts:325`), the
  same way video edit mode does it.
- Keep conventions: `.server.ts` for server-only, `.functions.ts` for server functions,
  `*.test.ts` beside the code, no new runtime dependency.
- Demo terms: a source clip with real people is not used. Use a neutral clip (a room, a
  garment, an abstract loop) so the frames are safe to inspect in a screenshot.

## Review Focus

1. A 10-minute source with scene detection can produce hundreds of frames, and each shot
   is a paid video generation. Pinned in Task 2: a hard cap of 24 frames and 24 shots,
   enforced in a pure function with tests, before any provider traffic.
2. `spawn('ffmpeg', args)` with a concatenated string lets a file name become a flag or a
   command. Pinned in Task 1: argument arrays only, plus a test that asserts the built args
   for a path containing a space and a semicolon.
3. An agent that answers with prose, a fenced block, or five shots where the video has two
   scenes must fail, not generate garbage. Pinned in Task 4 (schema and cross-field rules)
   and Task 5 (one retry, then a readable failure).
4. Concatenating clips with different codecs, sizes, or frame rates with `-c copy` produces
   a file that will not play. Pinned in Task 8: probe both paths, prefer `-c copy`, fall
   back to a re-encode, and report which one ran.
5. A copy that is half generated and then abandoned leaves paid jobs running with no owner.
   Pinned in Task 7: every shot generation is recorded on the copy row before submit, so a
   resumed panel can find them, and Task 9 shows the leftover state.
6. The prod Docker image has no ffmpeg and no agent CLI. Pinned in Task 3 (image installs
   ffmpeg, Settings reports both) and Task 9 (the panel disables the agent step with the
   reason, and the manual paste path still works).

---

### Task 1: ffmpeg and ffprobe wrapper

**Files:**

- Create: `packages/providers/src/ffmpeg.ts`
- Test: `packages/providers/src/ffmpeg.test.ts`
- Modify: `packages/providers/src/index.ts` (add `export * from './ffmpeg'`)

**Interfaces:**

- Consumes: nothing.
- Produces (exact, used by Tasks 3, 7, 8):
  - `isFfmpegAvailable(): Promise<boolean>` — spawns `ffmpeg -version`, resolves `false`
    on `error`, resolves on exit code 0, follows `isCodexAvailable`
    (`packages/providers/src/codex.ts:33`).
  - `ffmpegVersion(): Promise<string | null>` — first line of `ffmpeg -version`.
  - `probeVideo(path: string): Promise<VideoProbe | null>` where
    `VideoProbe = { durationSeconds: number, width: number, height: number, fps: number, codec: string }`,
    from `ffprobe -v error -print_format json -show_format -show_streams`.
  - `videoFrameArgs(input: { path, times, outDir, width? }): string[][]` — one argument
    array per timestamp, `-ss <t> -i <path> -frames:v 1 -q:v 2 <out>`.
  - `sceneFrameArgs(input: { path, outDir, threshold? }): string[]` — `-vf
    select='gt(scene,0.3)',showinfo -vsync vfr`.
  - `concatArgs(input: { listPath, outPath, copy: boolean }): string[]` — `-f concat
    -safe 0 -i <list> [-c copy | -c:v libx264 -pix_fmt yuv420p -movflags +faststart]`.
  - `runFfmpeg(args: string[], options?: { timeoutMs?: number }): Promise<{ code: number, stderr: string }>` —
    `shell: false`, killed at the timeout (default 120s for frames, 600s for concat).

- [ ] **Step 1: Write the failing tests**

`packages/providers/src/ffmpeg.test.ts`, pure assertions only, no process spawn:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { concatArgs, videoFrameArgs } from './ffmpeg'

test('frame extraction passes each path as its own argument', () => {
  const args = videoFrameArgs({ path: '/tmp/a b;rm -rf.mp4', times: [0, 1.5], outDir: '/tmp/f' })
  assert.equal(args.length, 2)
  assert.equal(args[0]?.[0], '-ss')
  assert.ok(args[0]?.includes('/tmp/a b;rm -rf.mp4'))
  assert.equal(args[0]?.filter((part) => part === '-i').length, 1)
})

test('concat defaults to a copy and falls back to h264', () => {
  assert.ok(concatArgs({ listPath: '/tmp/l.txt', outPath: '/tmp/o.mp4', copy: true }).includes('copy'))
  assert.ok(
    concatArgs({ listPath: '/tmp/l.txt', outPath: '/tmp/o.mp4', copy: false }).join(' ').includes('libx264'),
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test packages/providers/src/ffmpeg.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the wrapper**

`runFfmpeg` uses `spawn(binary, args, { shell: false })`, buffers `stderr` (capped at
64 KB so a pathological log cannot grow unbounded), and rejects with the last 20 lines on
a non-zero exit. `probeVideo` returns `null` when ffprobe is missing, and callers treat
`null` as "cannot read this file" rather than guessing a duration.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsx --test packages/providers/src/ffmpeg.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verify the package**

Run: `pnpm --filter @sunnygen/providers typecheck && pnpm --filter @sunnygen/providers test`
Expected: clean, all tests green.

- [ ] **Step 6: Report**

No commit. Report the exact argument arrays produced for a frame, a scene pass, and a
concat, plus whether `ffmpeg -version` runs on this machine.

### Task 2: Frame timeline in core

**Files:**

- Create: `packages/core/src/video-frames.ts`
- Test: `packages/core/src/video-frames.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './video-frames'`)

**Interfaces:**

- Consumes: nothing (pure functions, no ffmpeg).
- Produces (exact, used by Tasks 7 and 9):
  - `MAX_COPY_FRAMES = 24`, `MAX_COPY_SHOTS = 24`
  - `type FrameMode = 'scene' | 'every' | 'timestamps'`
  - `frameTimes(input: { mode: FrameMode; durationSeconds: number; everySeconds?: number;
    timestamps?: number[]; sceneTimes?: number[] }): number[]` — returns ascending,
    de-duplicated, non-negative times under the duration; `'every'` samples from 0 to the
    end at the interval, `'scene'` takes the supplied times, `'timestamps'` takes the
    supplied list.
  - `capFrameTimes(times: number[], max?: number): number[]` — evenly thins to `max`
    while always keeping the first and last.
  - `framesWithinBudget(frameCount: number): boolean` — `frameCount <= MAX_COPY_FRAMES`.

- [ ] **Step 1: Write the failing tests**

```ts
test('every-seconds sampling covers the clip and stops at the end', () => {
  assert.deepEqual(frameTimes({ mode: 'every', durationSeconds: 30, everySeconds: 10 }), [0, 10, 20])
})

test('timestamps are clamped, sorted and de-duplicated', () => {
  assert.deepEqual(
    frameTimes({ mode: 'timestamps', durationSeconds: 10, timestamps: [8, -1, 8, 12, 2] }),
    [2, 8],
  )
})

test('the cap keeps the first and last frame', () => {
  const times = Array.from({ length: 100 }, (_, index) => index)
  const capped = capFrameTimes(times, 24)
  assert.equal(capped.length, 24)
  assert.equal(capped[0], 0)
  assert.equal(capped.at(-1), 99)
  assert.deepEqual(
    [...capped].sort((a, b) => a - b),
    capped,
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test packages/core/src/video-frames.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the planner**

Keep it arithmetic only. `capFrameTimes` picks indices `Math.round(i * (n - 1) / (max - 1))`
so the spacing is even and the ends are exact. No floating-point accumulation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsx --test packages/core/src/video-frames.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Verify the package**

Run: `pnpm --filter @sunnygen/core typecheck && pnpm --filter @sunnygen/core test`
Expected: clean, green.

- [ ] **Step 6: Report**

No commit. Report the exported signatures and the exact `capFrameTimes` rule.

### Task 3: Ship ffmpeg in the image and report both binaries

**Files:**

- Modify: `Dockerfile:35-38` (the runtime `apt-get install` line)
- Modify: `apps/web/src/server/settings.functions.ts` (add a media-tools status loader)
- Modify: `apps/web/src/routes/settings.tsx` (a `MediaToolsCard` modelled on `CodexCard`)
- Modify: `README.md` (the self-host paragraph that lists prerequisites)

**Interfaces:**

- Consumes (from Task 1): `isFfmpegAvailable`, `ffmpegVersion`.
- Produces:
  - `loadMediaToolsStatus(): Promise<{ ffmpeg: boolean; version: string | null }>` in
    `settings.functions.ts`
  - `MediaToolsCard` in `settings.tsx`, reading that loader and showing three states:
    checking, Ready (`ffmpeg 7.x`), Missing (with the install command for Debian and
    Homebrew).

- [ ] **Step 1: Install ffmpeg in the runtime stage**

Change the existing line to
`apt-get install -y --no-install-recommends ca-certificates ffmpeg;` and keep the
`rm -rf /var/lib/apt/lists/*`. Note the image grows by roughly 60 to 100 MB. No
`compose.yaml` change: the service already runs the image built from this Dockerfile.

- [ ] **Step 2: Add the status loader and card**

Follow `loadCodexStatus` (`apps/web/src/server/settings.functions.ts:122`) exactly, and
reuse `StatusBadge` in `settings.tsx`. The missing state must include the command:
`apt install ffmpeg` on Debian and Ubuntu, `brew install ffmpeg` on macOS.

- [ ] **Step 3: Document the prerequisite**

In `README.md` (the requirements line at `README.md:74`), add one sentence: the video copy
pipeline needs `ffmpeg` and `ffprobe` on `PATH`, and the Docker image ships them.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: clean. Then `docker build -t sunnygen:ffmpeg-test .` and
`docker run --rm sunnygen:ffmpeg-test node -e "require('node:child_process').execFileSync('ffmpeg',['-version'],{stdio:'inherit'})"`
if Docker is available. If Docker is not available, say so in the report instead of
claiming the image works.

- [ ] **Step 5: Report**

No commit. Report the build result or the reason it was not run, and the exact apt line.

### Task 4: Shot list contract

**Files:**

- Create: `packages/core/src/video-shot-list.ts`
- Test: `packages/core/src/video-shot-list.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: `MAX_COPY_SHOTS` from Task 2.
- Produces (exact, used by Tasks 5, 7, 9):
  - `type VideoShot = { start: number; end: number; subject: string; action: string;
    motion: string; camera: string; lighting: string; prompt: string }`
  - `type VideoShotList = { shots: VideoShot[] }`
  - `videoShotListSchema` (zod) and `videoShotSchema`
  - `parseShotList(text: string, durationSeconds: number): { shots: VideoShot[] } | { error: string }` —
    strips a fenced code block, parses JSON, validates the schema, then the cross-field
    rules; returns the first failure as an actionable string, never throws.
  - Cross-field rules: 1 to `MAX_COPY_SHOTS` shots; `start` strictly ascending; `end >
    start`; `end <= durationSeconds + 0.5`; every string non-empty after trim; `prompt`
    at most 2000 characters.

- [ ] **Step 1: Write the failing tests**

Cover one good list and five bad ones:

````ts
test('a fenced JSON shot list parses', () => {
  const text =
    '```json\n{"shots":[{"start":0,"end":3.2,"subject":"a room","action":"pans",' +
    '"motion":"slow","camera":"push in","lighting":"window light","prompt":"a slow push in"}]}\n```'
  const result = parseShotList(text, 6)
  assert.ok('shots' in result)
  assert.equal(result.shots.length, 1)
})

test('overlapping shots are rejected with the shot index', () => {
  // start/end out of order -> { error: /shot 2/ }
})

test('a shot past the clip end is rejected', () => {
  // end 9 on a 6s clip
})

test('prose instead of JSON is rejected without throwing', () => {
  // 'Here is the shot list: ...' -> { error: /JSON/ }
})

test('an empty prompt is rejected', () => {})

test('more than the cap is rejected', () => {})
````

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test packages/core/src/video-shot-list.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the contract**

Use `z.object` with `z.number().finite()` for `start` and `end`, `z.string().trim().min(1)`
for the text fields, and `z.array(videoShotSchema).min(1).max(MAX_COPY_SHOTS)`. Parse the
fence with one regex (`/```(?:json)?\s*([\s\S]*?)```/`) and fall back to the raw text.
Error strings name the shot number (`shot 2: end 9 is past the 6s clip`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsx --test packages/core/src/video-shot-list.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Report**

No commit. Report the schema shape and every error string as shipped; Task 5 puts the
schema into the agent prompt.

### Task 5: Agent CLI detection and JSON runner

**Files:**

- Create: `packages/providers/src/agents.ts`
- Test: `packages/providers/src/agents.test.ts`
- Modify: `packages/providers/src/index.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces (exact, used by Tasks 7 and 9):
  - `AGENT_IDS = ['claude', 'codex', 'omp', 'pi'] as const`
  - `type AgentId = (typeof AGENT_IDS)[number]`
  - `AGENT_LABELS: Record<AgentId, string>` — `Claude Code`, `Codex CLI`, `OMP`, `Pi`
  - `detectAgents(): Promise<Record<AgentId, boolean>>` — `--version` probe per binary,
    cached for the process lifetime.
  - `agentCommand(agent: AgentId, prompt: string): string[]` — pure, returns the argv
    without the binary name, so it is testable.
  - `runAgentText(input: { agent: AgentId; prompt: string; timeoutMs?: number }):
    Promise<{ ok: true; text: string } | { ok: false; error: string }>` — `spawn`, no
    shell, stdout cap 2 MB, timeout default 180s, `error` event resolves `ok: false` with
    "not installed".
  - `runAgentShotList(input: { agent: AgentId; prompt: string; durationSeconds: number }):
    Promise<{ shots: VideoShot[] } | { error: string }>` — `runAgentText`, then
    `parseShotList`; on a parse failure retries once with the error appended to the
    prompt, then returns the last error.

- [ ] **Step 1: Write the failing tests**

No real CLI is spawned. Test `agentCommand` and the retry logic with an injected runner:

```ts
test('each agent gets a non-interactive print command', () => {
  assert.deepEqual(agentCommand('claude', 'hi'), ['-p', 'hi'])
  assert.deepEqual(agentCommand('codex', 'hi'), ['exec', 'hi'])
  assert.deepEqual(agentCommand('omp', 'hi'), ['-p', 'hi'])
  assert.deepEqual(agentCommand('pi', 'hi'), ['-p', 'hi'])
})

test('a bad first answer triggers exactly one retry with the parse error', async () => {
  const prompts: string[] = []
  const result = await runAgentShotList({
    agent: 'claude',
    prompt: 'p',
    durationSeconds: 6,
    runner: async ({ prompt }) => {
      prompts.push(prompt)
      return prompts.length === 1 ? { ok: true, text: 'sorry, I cannot' } : { ok: true, text: VALID_LIST }
    },
  })
  assert.equal(prompts.length, 2)
  assert.match(prompts[1] ?? '', /JSON/)
  assert.ok('shots' in result)
})
```

Type the optional `runner` on `runAgentShotList` so the test can inject it; production
callers omit it. Note the two flags in the report: `codex exec` and `omp -p` / `pi -p` must
be confirmed against the installed binary's `--help` at implementation time, and the pure
builder is the only line to change if a flag differs.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test packages/providers/src/agents.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement detection and the runner**

Mirror `isCodexAvailable` for detection. For the run: `stdio: ['ignore', 'pipe', 'pipe']`,
kill on timeout with `proc.kill('SIGKILL')`, and never interpolate the prompt into a shell
string. `cwd` is `tmpdir()`, so a CLI that writes a session file does not litter the repo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsx --test packages/providers/src/agents.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verify the package**

Run: `pnpm --filter @sunnygen/providers typecheck && pnpm --filter @sunnygen/providers test`
Expected: clean, green.

- [ ] **Step 6: Report**

No commit. Report which agents this machine has installed (`detectAgents()` on the dev
box), the exact argv per agent, and the retry behaviour.

### Task 6: Migration 6 and the `video_copies` repository

**Files:**

- Modify: `packages/db/src/migrations.ts:1` (`SCHEMA_VERSION = 6`), `:3` (append migration)
- Create: `packages/db/src/repositories/video-copies.ts`
- Test: `packages/db/src/video-copies.test.ts`
- Modify: `packages/db/src/migrations.test.ts` (version and length assertions)
- Modify: `packages/core/src/generation.ts` (add `VideoCopyRecord` and the status union)

**Interfaces:**

- Consumes: nothing.
- Produces (exact, used by Tasks 7, 8, 9):
  - `VIDEO_COPY_STATUSES = ['extracted', 'analyzed', 'generating', 'joining', 'done', 'failed']`
  - `type VideoCopyRecord = { id, sourceAssetId, status, agent, shots, frameAssetIds,
    outputAssetId, error, folderId, createdAt, updatedAt }` where `shots` is
    `VideoCopyShot[]` and `frameAssetIds` is `string[]`.
  - `type VideoCopyShot = VideoShot & { generationId?: string }` — the agent's shot plus
    the generation that realises it, written before the next shot is submitted so a
    reload can resume a half-generated batch.
  - Repository: `createVideoCopy(input)`, `getVideoCopy(id)`, `listVideoCopies(limit?)`,
    `updateVideoCopy(id, patch)`, `deleteVideoCopy(id)`.
  - Migration 6 SQL exactly as the spec's Data/schema section prints it, including
    `output_asset_id`, `frame_asset_ids`, and `CREATE INDEX video_copies_created`.

- [ ] **Step 1: Write the failing tests**

In `packages/db/src/video-copies.test.ts`, temp-directory style copied from
`packages/db/src/assets.test.ts`: create a copy with two shots, read it back, assert the
shot order survives JSON round-trip, patch the status to `done` with an
`outputAssetId`, and assert `updatedAt` moved. In `migrations.test.ts`, assert
`SCHEMA_VERSION === 6`, `MIGRATIONS.length === 6`, and that a v4 database with rows
survives both migrations.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test packages/db/src/video-copies.test.ts packages/db/src/migrations.test.ts`
Expected: FAIL — table and module missing.

- [ ] **Step 3: Implement the migration and the repository**

Map rows to records with `JSON.parse` guarded the way
`packages/db/src/repositories/generations.ts:32` does. Every
write updates `updated_at`. `deleteVideoCopy` does not touch assets: frames and clips stay
in the library, because deleting a copy must not delete generated media the owner may still
want.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec tsx --test packages/db/src/video-copies.test.ts packages/db/src/migrations.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the package**

Run: `pnpm --filter @sunnygen/db typecheck && pnpm --filter @sunnygen/db test`
Expected: clean, green.

- [ ] **Step 6: Report**

No commit. Report the migration SQL, the record shape, and the repository signatures.

### Task 7: Server functions for extract and analyze

**Files:**

- Create: `apps/web/src/server/video-copy.server.ts`
- Create: `apps/web/src/server/video-copy.functions.ts`
- Test: `apps/web/src/server/video-copy.server.test.ts`

**Interfaces:**

- Consumes (from Tasks 1, 2, 4, 5, 6): `probeVideo`, `videoFrameArgs`, `sceneFrameArgs`,
  `runFfmpeg`, `frameTimes`, `capFrameTimes`, `parseShotList`, `detectAgents`,
  `runAgentShotList`, and the `video_copies` repository.
- Produces (exact, used by Tasks 8, 9):
  - `extractFrames({ sourceAssetId, mode, everySeconds?, timestamps?, folderId? }):
    Promise<{ copyId: string; frameAssetIds: string[] }>` — server function. Writes each
    frame with `storeBuffer({ kind: 'image', mime: 'image/jpeg', source: 'generated',
    nsfw })`, where `nsfw` comes from the source asset, so a copy of an NSFW clip cannot
    produce safe-tagged frames.
  - `analyzeCopy({ copyId, agent }): Promise<{ shots: VideoShot[] } | { error: string }>` —
    builds the prompt, runs the agent, validates, stores the shots and the agent on the
    copy row, status `analyzed`.
  - `loadCopy({ copyId })` — copy row plus per-shot generation status, read from
    `getGeneration`.
  - `shotPromptTemplate(input: { durationSeconds: number; frames: Array<{ index: number; atSeconds: number; path: string }> }): string` —
    pure, so the prompt is reviewable and testable.

- [ ] **Step 1: Write the failing test for the prompt**

`video-copy.server.test.ts` asserts the template contains the duration, one line per
frame with its timestamp and path, the word JSON, the schema field names (`subject`,
`action`, `motion`, `camera`, `lighting`, `prompt`, `start`, `end`), and the shot cap. No
process is spawned.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec tsx --test apps/web/src/server/video-copy.server.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement extraction**

Order of checks, each with its own error: media tools available; source asset exists and
is `kind: 'video'`; `probeVideo` returns a duration of at most 600s; the frame plan is
non-empty and within `MAX_COPY_FRAMES`. Write frames to a temp directory first
(`mkdtemp` under `tmpdir()`), `runFfmpeg` each timestamp, then `storeBuffer` each file and
remove the temp directory in a `finally`. Scene mode runs the scene pass, parses times out
of the `showinfo` stderr lines, then `capFrameTimes`.

- [ ] **Step 4: Implement analysis**

Resolve the frame paths as `join(mediaDir, asset.path)` from `@sunnygen/db`, build the
prompt, call `runAgentShotList`, and store the result. A missing agent returns
`{ error: 'Claude Code is not installed on this machine. Install it, or paste a shot list.' }`
naming the chosen agent. Never leave the copy row in `generating` on a failed analysis.

- [ ] **Step 5: Run the test and verify**

Run: `pnpm exec tsx --test apps/web/src/server/video-copy.server.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS, clean.

- [ ] **Step 6: Report**

No commit. Report the validation order, every error string, and the prompt template body
so the owner can judge it.

### Task 8: Shot submissions and the concat step

**Files:**

- Create: `apps/web/src/lib/video-copy.ts`
- Test: `apps/web/src/lib/video-copy.test.ts`
- Add to: `apps/web/src/server/video-copy.functions.ts` (`joinCopy`)
- Add to: `apps/web/src/server/video-copy.server.ts` (concat + probe comparison)

**Interfaces:**

- Consumes (from Task 7): copy record and shots.
- Produces:
  - `copyShotJobs(input: { shots: VideoShot[]; frames: Array<{ id: string; atSeconds: number }>; stylePrompt: string }): { error: string | null; jobs: Array<{ shotIndex: number; prompt: string; assetIds: [string, string] }> }` —
    for each shot, the frame nearest `start` and the frame nearest `end`; refuses when a
    shot has no frame on each side; refuses more than `MAX_COPY_SHOTS`; appends the style
    prompt to each shot prompt.
  - `joinCopy({ copyId }): Promise<{ assetId: string } | { error: string }>` — probes every
    shot clip, chooses copy or re-encode, writes the concat list, runs ffmpeg, stores the
    result with `storeBuffer({ kind: 'video', mime: 'video/mp4', source: 'generated',
    nsfw })`, and sets `outputAssetId` + status `done`. Idempotent: an existing
    `outputAssetId` returns it without running ffmpeg again.

- [ ] **Step 1: Write the failing tests for `copyShotJobs`**

```ts
test('each shot maps to the frames on either side', () => {
  const { jobs } = copyShotJobs({
    shots: [shot(0, 3), shot(3, 6)],
    frames: [
      { id: 'f0', atSeconds: 0 },
      { id: 'f1', atSeconds: 3 },
      { id: 'f2', atSeconds: 6 },
    ],
    stylePrompt: 'warm film',
  })
  assert.deepEqual(
    jobs.map((job) => job.assetIds),
    [
      ['f0', 'f1'],
      ['f1', 'f2'],
    ],
  )
  assert.match(jobs[0]?.prompt ?? '', /warm film/)
})

test('a shot with no end frame is refused, not guessed', () => {})
test('more shots than the cap is refused before submit', () => {})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec tsx --test apps/web/src/lib/video-copy.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `copyShotJobs`**

Nearest-frame lookup is a linear scan with a deterministic tie-break (the earlier frame).
Keep it pure and dependency-free so the composer can call it before any server traffic.

- [ ] **Step 4: Implement submission in the panel (Task 9 owns the UI)**

Submission itself reuses the existing path: for each job call
`submitGeneration({ data: { kind: 'video', model, prompt, assetIds, folderId,
params: { videoMode: 'frames' } } })`, exactly as video edit mode fans out in
`apps/web/src/components/video/composer.tsx`. Record each returned generation id on the
copy row (`VideoCopyShot.generationId`) before moving to the next shot, so a reload can
resume.

- [ ] **Step 5: Implement `joinCopy`**

Refuse unless every recorded generation is `succeeded` with one output. Probe all clips;
if `codec`, `width`, `height`, and `fps` match within tolerance, use `copy: true`,
otherwise `copy: false`. Write the list file into a `mkdtemp` directory with lines
`file '<absolute path>'` (single quotes escaped per the concat demuxer rules). Cap the
result at `MAX_UPLOAD_BYTES` (100 MB, `apps/web/src/server/media.server.ts:11`) and return
a clear error when the join is larger, rather than a failed `storeBuffer`.

- [ ] **Step 6: Run the tests and verify**

Run: `pnpm exec tsx --test apps/web/src/lib/video-copy.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS, clean.

- [ ] **Step 7: Report**

No commit. Report the frame-mapping rule, the copy/re-encode decision, and the size cap
behaviour.

### Task 9: Copy panel on the Video tab

**Files:**

- Create: `apps/web/src/components/video/copy-panel.tsx`
- Modify: `apps/web/src/routes/video.tsx` (a Copy button beside Generate | Edit, panel
  mounted next to `VideoComposer`)
- Modify: `apps/web/src/server/settings.functions.ts` (expose `detectAgents` results in the
  settings snapshot)
- Modify: `apps/web/src/components/home/reference-picker.tsx` only if the video picker needs
  a single-select mode

**Interfaces:**

- Consumes (from Tasks 7, 8): `extractFrames`, `analyzeCopy`, `loadCopy`, `joinCopy`,
  `copyShotJobs`; (from Task 3) media tools status; (from Task 5) installed agents.
- Produces: `<CopyPanel onClose />` with four steps, one screen each.

- [ ] **Step 1: Step 1, source and extraction**

A video picker (the existing `ReferencePicker` with `kind="video"`, single select). Mode
radio: Scene changes, Every N seconds (number input, default 10), Timestamps (comma
separated). Shows the frame count from `frameTimes` before submitting, and disables Run
when the count is over 24 or ffmpeg is missing, with the reason as text, not a tooltip.

- [ ] **Step 2: Step 2, frames**

A horizontal strip of the extracted frames with their timestamps, each a link into the
existing image edit composer prefilled with that frame. A "Send all to Edit" button and a
"Re-extract" action. Frame count and total size in one line.

- [ ] **Step 3: Step 3, analysis**

Agent selector, listing only installed agents, defaulting to the first; a disabled state
with the install hint when none is installed. A "Paste shot list" textarea as the manual
path (open question 11; ship it, because a prod Docker image has no CLI). Run analysis
shows the raw text on failure and the parse error beneath it.

- [ ] **Step 4: Step 4, shots and recreate**

A table: index, `start` to `end`, subject, camera, lighting, editable prompt, remove
button. The model selector filters to video models with a `'frames'` mode
(`videoModesFor(models, 'frames')`). A submit summary line: "12 shots, 12 generations,
\<model>" plus the catalog price when the entry has one. Recreate creates the batch folder
with `createFolderFn` when there is more than one shot, submits each job, then polls until
every generation is terminal. When all succeed, Join clips calls `joinCopy`; when one
fails, the row shows Retry for that shot only.

- [ ] **Step 5: Resume and states**

On mount, `loadCopy` restores the step from the stored status, so a reload mid-batch
returns to step 4 with the real per-shot status. Empty, loading, error, and partial states
are all visible text; a spinner alone is not a state.

- [ ] **Step 6: Verify on demo data**

Run: `pnpm dev:demo` and walk the whole flow with a neutral demo clip: extract 6 frames by
scene change, edit one, analyze with the installed agent (or paste a shot list when none is
installed), recreate 2 shots, join. Confirm the joined clip plays from `/api/media/<id>`,
appears on the video wall, and that a reload mid-batch resumes. Take one screenshot to
`.temp/copy-panel.png`. Stop the server.

- [ ] **Step 7: Verify**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all green.

- [ ] **Step 8: Report**

No commit. Report the four steps, the resume behaviour, the per-shot retry, and the join
result (asset id and duration).

### Task 10: End-to-end check on demo data

**Files:**

- Modify: whatever the run proves broken
- Create: `updates/2026-11-25-video-copy.md` (one working note, the repo's convention)

**Interfaces:**

- Consumes: everything above.
- Produces: a recorded run and one update note.

- [ ] **Step 1: Run the flow twice**

Once with an agent CLI, once with a pasted shot list. Record wall-clock time per stage,
the frame count, the shot count, and the joined duration against the source duration. The
joined duration should be within one shot length of the source; record the difference
rather than rounding it away.

- [ ] **Step 2: Break it on purpose**

Point a copy at a corrupt file, at an audio asset, and at a 12-minute clip. Each must fail
with its own message and leave no copy row stuck in `generating`.

- [ ] **Step 3: Check the mode interaction**

With NSFW mode on, extract frames from a tagged source and confirm the frames are tagged
too. With the mode off, confirm those frames are not returned by the asset loaders.

- [ ] **Step 4: Write the update note**

Follow the format of `updates/2026-11-23-video-edits.md`: what changed, why, how to verify,
limits (shot drift, no stabilisation, no timeline, 24-shot cap, 100 MB join cap, agent CLI
absent in Docker).

- [ ] **Step 5: Report**

No commit. Report the two runs, the three deliberate failures, the mode check, and the
note path.

### Task 11: Release 3.0.0

**Files:**

- Modify: `package.json`, `apps/web/package.json`, `apps/cli/package.json`,
  `packages/core/package.json`, `packages/db/package.json`,
  `packages/providers/package.json`, `packages/ui/package.json`,
  `packages/core/src/domain.ts` (`APP_VERSION`)
- Create: `updates/2026-11-25-v3.0.0.md`
- Modify: `updates/README.md` (a new first row in the table)

**Interfaces:**

- Consumes: the four released plans.
- Produces: `3.0.0` everywhere 2.1.0 appears, one release note, one changelog row.

- [ ] **Step 1: Follow the 2.1.0 release commit**

Run: `git show f64a007 --stat`
Expected: the ten files above. Use it as the checklist; nothing outside that list changes
in this task.

- [ ] **Step 2: Bump the version**

`3.0.0` in the seven `package.json` files and `APP_VERSION` in
`packages/core/src/domain.ts`. No other string changes.

- [ ] **Step 3: Write the release note**

One section per area (dark theme, antislop audit, NSFW mode, video copy), each linking the
note that shipped with its plan, plus an upgrade section: migrations 5 and 6 run on first
start, ffmpeg is now required for the copy pipeline and the Docker image ships it, the
provider safety checkers are on in safe mode now (a behaviour change), and the theme is
per browser.

- [ ] **Step 4: Update the changelog row**

`updates/README.md` gains a row for `2026-11-25-v3.0.0.md` at the top of the table.

- [ ] **Step 5: Verify**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build`
Expected: all green, build completes.

- [ ] **Step 6: Confirm the version surfaces**

Run: `pnpm dev:demo`, open any route, and read the version in the sidebar footer.
Expected: `3.0.0`. Stop the server.

- [ ] **Step 7: Report**

No commit. Report the file list, the build result, the sidebar version, and the release
note path.
