# @sunnygen/cli

`./sunnygen` at the repository root is a thin Bash wrapper around this package.
The launcher uses Node built-ins only — no build step, no dependencies.

```bash
./sunnygen --help          # every flag
./sunnygen                 # build when stale, serve on 0.0.0.0:8977
./sunnygen --dev           # Vite dev server
./sunnygen --background    # detach; logs in .sunnygen/sunnygen.log
./sunnygen --stop
```

## Runtime files

| Path                                | Contents                                   |
| ----------------------------------- | ------------------------------------------ |
| `.sunnygen/sunnygen.pid`            | Background server PID                      |
| `.sunnygen/sunnygen.log`            | Background server output                   |
| `.sunnygen/mdns.{pid,log}`          | Bonjour registration while serving         |
| `.sunnygen/tunnel.{pid,log}`        | Cloudflare connector started by `--tunnel` |
| `apps/web/.output/server/index.mjs` | Production entry (`vite build` output)     |

## Login service

`--install-service` writes `~/Library/LaunchAgents/dev.sunnygen.server.plist`.
The job runs this launcher with `SUNNYGEN_SERVICE=1`, `KeepAlive` on unsuccessful
exits, and logs in `~/Library/Logs/sunnygen.log` / `sunnygen.err.log`. Its `PATH`
includes the active Node binary, fnm shims, and Homebrew bins.

The build is refreshed automatically when sources are newer than the production
entry; `--build` forces it. Only one server runs at a time — the launcher refuses
a manual start while the launchd job is loaded and refuses a second process on
the same port.

## Files

- `bin/sunnygen.mjs` — argument parsing, help, command dispatch.
- `src/server.mjs` — build staleness, production/dev lifecycle, mDNS, tunnel, URLs.
- `src/system.mjs` — launchd service and Docker/cobalt commands.
- `src/shared.mjs` — paths, process/port helpers, Tailscale and LAN detection.
