# Contributing to SunnyGen

SunnyGen is a small, local-first project built in the open. Bug reports, documentation
fixes, new providers, and careful refactors are all welcome.

The short version: **be kind, keep it focused, and leave the code easier to understand
than you found it.**

## Be kind

- Assume good faith. Someone may be new to the stack, the language, or the project.
- Critique the change, not the person. Explain the tradeoff you see.
- Ask questions before assuming intent. "What problem does this solve?" is a useful
  question, not an accusation.
- Share context in reviews: point to the file, the behavior, and the reason. Links and
  small examples help more than "this is wrong."
- Credit other people's work. If a review or an issue shaped your change, say so.
- No gatekeeping. Beginner questions and small fixes are welcome.

The same goes for maintainers. A blunt review is still a review; a clear, friendly one
gets the change merged faster.

## Make a meaningful addition

A meaningful change solves a real problem for someone using or maintaining SunnyGen.

- **Start with the problem.** For a bug, describe the steps to reproduce it. For a
  feature, explain the use case. Open an issue before large changes so the design can be
  discussed first.
- **Keep pull requests narrow.** One feature or one fix per branch. Split unrelated
  cleanup into its own PR.
- **Match the existing patterns.** Read the nearby code before adding a new helper,
  state store, or dependency. The repo is deliberately small; new abstractions need a
  reason to exist.
- **Add a test when behavior can regress.** Pure logic belongs in `packages/*` with a
  `node:test` file next to it. Server and UI changes should include a manual test plan.
- **Update the docs.** If a command, setting, file format, or user-facing behavior
  changes, update the README or the relevant package README in the same PR.
- **Avoid drive-by edits.** Formatting-only commits, dependency upgrades unrelated to
  the change, and broad renames make review harder. Keep them separate.
- **Measure performance claims.** A benchmark or a profile is more useful than a guess.
- **Do not commit secrets or local state.** `.env`, `data/`, `data/media/`, and
  `data/secrets.key` stay out of git. Tests must use temporary directories, never the
  real database.

## Set up

SunnyGen needs Node 22.20 or newer and pnpm 9.

```bash
git clone https://github.com/henrychea/SunnyGen.git
cd SunnyGen
pnpm install
pnpm dev          # Vite dev server on http://localhost:8977
```

For a production build:

```bash
./sunnygen        # builds when stale, serves on 0.0.0.0:8977
```

`AGENTS.md` describes the monorepo layout, server-only file conventions, and the data
directories.

## Before opening a pull request

Run the same checks CI uses:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

Add `pnpm format` if the formatter reports changes. For UI work, include a screenshot or
a short recording. For server work, include the request or command you used to verify the
change.

## Branches and commits

- Branch from `main` and use a descriptive name, for example `feat/studio-packs` or
  `fix/tunnel-origin`.
- One logical change per commit. Keep the subject imperative and at most 72 characters.
- The repo uses short prefixes: `feat:`, `fix:`, `docs:`, `chore:`.
- Explain the why in the body when the subject is not enough. Do not describe every
  line of the diff.
- Rebase or squash as needed before review. Do not force-push a branch while someone is
  reviewing it unless you warn them first.

## Pull requests

A useful pull request answers three questions:

1. What changed?
2. Why is it needed?
3. How did you verify it?

Include the commands or scenarios you ran, and call out anything you could not test.
Small screenshots and before/after comparisons are welcome. Keep the description factual
and free of generated noise.

Reviews may ask for changes, a smaller scope, or a different approach. That is normal.
If a PR goes quiet, a polite nudge after a week is fine. This is a personal project, so
reviews happen when time allows.

## Security

Do not open a public issue for a vulnerability that could expose keys, local files, or
the host. Use GitHub's private vulnerability reporting on the repository's **Security**
tab, or contact the maintainer directly.

## License

By contributing, you agree that your changes are released under the project's MIT
license. See [LICENSE](LICENSE).
