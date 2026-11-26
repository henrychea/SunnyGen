# Video copy: frames, a shot list, and a joined clip

- Date: 2026-11-25
- Status: shipped in 3.0.0, branch `henrychea/v3-video-copy`

## Summary

The Video tab has a Copy button beside Generate | Edit. It opens a four step panel: pick a
source video, extract frames with ffmpeg, edit any frame in the existing image edit
composer, have a coding agent read the frames into a validated shot list (or paste one),
then recreate each shot with the existing start+end frame video mode and join the clips
into one new asset. Every stage writes to one `video_copies` row, so a reload resumes at
the stage it reached.

## Why

Copying a reference clip used to mean watching it, writing one prompt for the whole thing,
and hoping. The app already had the parts that make a shot-by-shot copy possible: media
assets with thumbnails, the image edit composer, video models that take a start and an end
frame, and a job table with a poller and retries. What was missing was a way to turn a
reference video into keyframes, a validated shot list, and one generation per shot. Doing
that as ordinary generations means the wall, cost accounting, retries and cleanup all
apply without new machinery.

## What changed

- `packages/providers/src/ffmpeg.ts`: the ffmpeg wrapper. `isFfmpegAvailable`,
  `ffmpegVersion`, `probeVideo` (ffprobe JSON to duration, size, fps, codec), and pure
  argument builders `videoFrameArgs`, `sceneFrameArgs`, `concatArgs`. `runFfmpeg` spawns
  with an argument array and `shell: false`, caps stderr at 64 KB, and kills the process
  at the timeout. `-fps_mode vfr` replaces the older `-vsync vfr`, which ffmpeg 9 removed
  and ffmpeg 5.1+ accepts.
- `packages/providers/src/agents.ts`: `AGENT_IDS` (claude, codex, omp, pi), labels,
  `detectAgents` (one `--version` probe per binary, cached for the process), `agentCommand`
  (pure argv, per CLI: `claude -p … --add-dir <media dir>`, `codex exec
  --skip-git-repo-check -i <frame> … <prompt>`, `omp -p --add-dir=<dir> @<frame> … <prompt>`,
  `pi -p @<frame> … <prompt>`), `runAgentText` (spawn in `tmpdir()`, no shell, 2 MB stdout
  cap, 180 s timeout), and `runAgentShotList`, which passes the frames through, parses the
  answer, and retries once with the parse error appended.
- `packages/core/src/video-frames.ts`: `MAX_COPY_FRAMES` (48), `MAX_COPY_SHOTS` (24),
  `frameTimes`
  for scene, every-N-seconds and timestamp plans, `capFrameTimes` (evenly thinned,
  first and last kept), and `framesWithinBudget`.
- `packages/core/src/video-shot-list.ts`: zod `videoShotSchema` and
  `videoShotListSchema`, plus `parseShotList`, which strips a code fence, parses JSON,
  validates the schema, then checks the cross-field rules. Failures come back as strings
  naming the shot, never as exceptions.
- `packages/core/src/generation.ts`: `VIDEO_COPY_STATUSES`, `VideoCopyStatus`,
  `VideoCopyShot` (a shot plus the generation that realises it) and `VideoCopyRecord`.
- `packages/db`: migration 6 adds `video_copies` with `output_asset_id`,
  `frame_asset_ids`, `shots`, `agent`, `error`, `folder_id` and
  `CREATE INDEX video_copies_created`. `repositories/video-copies.ts` reads and writes it;
  every write moves `updated_at`, and deleting a copy leaves its frames and clips alone.
- `apps/web/src/server/video-copy.server.ts`: extraction, analysis, the copy view and the
  join. Extraction checks ffmpeg, the asset exists and is a video, ffprobe can read it, the
  clip is 600 s or shorter, and the plan fits the 24 frame cap before any provider traffic.
  Frames are written to a temp directory, stored as ordinary image assets, and the temp
  directory is removed in a `finally`. Analysis resolves frame paths, builds the prompt,
  runs the agent and stores the shots; a failure records the error on the row instead of
  leaving it mid-stage. The join probes every clip and uses `-c copy` only when codec,
  size and fps match, otherwise a libx264 re-encode; the result is capped at 100 MB and
  stored as a video asset.
- `apps/web/src/server/video-copy.functions.ts`: `probeSourceFn`, `extractFramesFn`,
  `analyzeCopyFn`, `loadCopyFn`, `saveCopyShotsFn`, `joinCopyFn`.
- `apps/web/src/lib/video-copy.ts`: `copyShotJobs`, which maps each shot to the nearest
  frame on either side, refuses a shot whose two frames are the same, refuses more than 24
  shots, and appends the style clause. Ties go to the earlier frame.
- `apps/web/src/components/video/copy-panel.tsx`, `apps/web/src/lib/edit-handoff.ts`,
  `components/home/composer.tsx`: the four step panel, the frame strip with per frame Edit
  links and Send all to Edit, the shot table with an editable prompt and Remove, per shot
  Retry, the model picker filtered by `videoModesFor(models, 'frames')`, and Join clips.
- `apps/web/src/routes/video.tsx`, `components/video/composer.tsx`: the Copy button beside
  Generate | Edit and the panel mount.
- `apps/web/src/server/settings.functions.ts`, `routes/settings.tsx`: `loadMediaToolsStatus`
  and a Media tools card that reports ffmpeg as Ready with its version or Missing with the
  apt and Homebrew commands, plus `loadAgentStatus` for the panel.
- `Dockerfile`: the runtime stage installs `ffmpeg` beside `ca-certificates`. The image
  grows roughly 60 to 100 MB.
- `README.md`: the requirement line names ffmpeg and ffprobe and says the image ships them.
- `docs/superpowers/`: the v3 release spec and this plan, so the branch carries them.

## How to verify

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

The new logic has its own tests, none of which spawn ffmpeg, an agent CLI, or a provider:

```sh
pnpm exec tsx --test packages/providers/src/ffmpeg.test.ts
pnpm exec tsx --test packages/providers/src/agents.test.ts
pnpm exec tsx --test packages/core/src/video-frames.test.ts
pnpm exec tsx --test packages/core/src/video-shot-list.test.ts
pnpm exec tsx --test packages/db/src/video-copies.test.ts
pnpm exec tsx --test apps/web/src/lib/video-copy.test.ts
pnpm exec tsx --test apps/web/src/server/video-copy.server.test.ts
```

`ffmpeg.test.ts` asserts the argument arrays for a path containing a space and a
semicolon and both concat shapes. `agents.test.ts` covers the argv per agent and the single
retry with an injected runner. `video-frames.test.ts` covers sampling, clamping and the cap
keeping both ends. `video-shot-list.test.ts` covers a good fenced list and five bad ones.
`video-copies.test.ts` covers the JSON round trip of the shot order and the timestamp move.
`video-copy.test.ts` covers the frame mapping, the same-frame refusal, the cap and the tie
break. `video-copy.server.test.ts` covers the agent prompt and the showinfo parser.

To check by hand (needs `pnpm dev:demo`, a neutral source clip, and real provider keys for
the last two steps):

1. Open `/video`, press Copy, and pick a clip. The frame count appears before you run, and
   Extract stays disabled with the reason when the plan is over 48 frames or ffmpeg is
   missing.
2. Step 2 shows the frames with their timestamps. Edit opens the image composer with that
   frame as an edit target; Send all to Edit hands over the whole strip.
3. Step 3 lists only installed agents. Read the frames shows the parse error and the raw
   answer when the agent answers with prose; the paste box is the path when no CLI exists.
4. Step 4 shows the shot table. Recreate files the batch in a `<source> copy` folder and
   fills the per shot state as each generation finishes. A failed shot keeps its own Retry.
   Join clips returns one asset under `/api/media/<id>`, which appears on the video wall.

## Limits

- Shot drift is real: the model's frames mode length is fixed per model, so a 2 s shot and
  a 4 s shot come back the same length. The joined clip is usually within one shot of the
  source, not equal to it.
- There is no stabilisation, no transcode normalisation beyond the join, and no timeline or
  trim controls. The shot table edits prompts and membership only.
- 48 frames and 24 shots per copy, 600 s source, 100 MB joined result. Frames are cheap to
  add, a shot is a paid generation, so the two caps differ. Extraction refuses an over-budget
  plan before spending anything; scene detection thins instead, because the frame count is
  unknown until the pass ends.
- Concatenation trusts ffprobe. Clips whose codecs match on paper but not in practice fall
  back only on a mismatch in codec, size or fps, not on a mux failure. A re-encode of clips
  with different frame rates came back shorter than the sum of its parts (5.08 s from two
  3 s clips), because the concat demuxer keeps the stream's own timing.
- An agent CLI is not in the Docker image. In a container the agent step stays disabled
  with the reason and the paste path is the way through.
- Frame timestamps ride in the asset name (`Frame @ 3.00s`), because the copy row has no
  per-frame column. Renaming a frame asset in the library loses its time, and the shot
  mapping skips it.
- The join is idempotent through `output_asset_id`, but two clients pressing Join at the
  same moment can still run ffmpeg twice; the last writer wins.
- The copy row does not yet tag frames with the source's NSFW flag. That belongs with the
  NSFW mode work and is a merge time follow-up.
