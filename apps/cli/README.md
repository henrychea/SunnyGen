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

`--install-service` registers a service that starts at login (macOS) or boot (Linux)
and restarts after a crash.

- **macOS:** writes `~/Library/LaunchAgents/dev.sunnygen.server.plist`. The job runs
  this launcher with `SUNNYGEN_SERVICE=1`, `KeepAlive` on unsuccessful exits, and logs
  in `~/Library/Logs/sunnygen.log` / `sunnygen.err.log`. Its `PATH` includes the active
  Node binary, fnm shims, and Homebrew bins.
- **Linux:** writes `~/.config/systemd/user/sunnygen.service` and enables lingering so
  the user manager starts it at boot. `ExecStart` runs the production entry directly
  (`node apps/web/.output/server/index.mjs`) on `0.0.0.0:$PORT`, so the service needs a
  build but no pnpm. Logs: `journalctl --user -u sunnygen.service -f`.
  It also writes `sunnygen-cobalt.service` (oneshot: `docker compose up -d cobalt`,
  `ExecStop`: `docker compose down`), enabled but only able to start once the Docker
  daemon is reachable by this user.

The build is refreshed automatically when sources are newer than the production
entry; `--build` forces it. Only one server runs at a time — the launcher refuses
a manual start while the service is loaded and refuses a second process on
the same port.

## Files

- `bin/sunnygen.mjs` — argument parsing, help, command dispatch.
- `src/server.mjs` — build staleness, production/dev lifecycle, mDNS, tunnel, URLs.
- `src/system.mjs` — launchd service and Docker/cobalt commands.
- `src/shared.mjs` — paths, process/port helpers, Tailscale and LAN detection.
