import fs from 'node:fs'
import path from 'node:path'
import {
  CLI_ENTRY,
  HOME,
  MDNS_PID,
  ROOT,
  SERVER_ENTRY,
  SERVICE_ERR_LOG,
  SERVICE_LABEL,
  SERVICE_LOG,
  SERVICE_PLIST,
  SERVER_PID,
  TUNNEL_PID,
  canConnect,
  capture,
  captureResult,
  exists,
  nodeSupportsApp,
  processAlive,
  portOwner,
  readPid,
  run,
  sleep,
  stopHelper,
  stopProcess,
  which,
  xmlEscape,
} from './shared.mjs'

const LAUNCH_AGENTS_DIR = path.dirname(SERVICE_PLIST)
const LOGS_DIR = path.dirname(SERVICE_LOG)
const SYSTEMD_UNIT_NAME = 'sunnygen.service'
const SYSTEMD_DIR = path.join(HOME, '.config', 'systemd', 'user')
const SYSTEMD_UNIT = path.join(SYSTEMD_DIR, SYSTEMD_UNIT_NAME)
const COBALT_UNIT_NAME = 'sunnygen-cobalt.service'
const COBALT_UNIT = path.join(SYSTEMD_DIR, COBALT_UNIT_NAME)

function userTarget() {
  return `gui/${process.getuid()}/${SERVICE_LABEL}`
}

function linuxSystemd() {
  return process.platform === 'linux' && Boolean(which('systemctl'))
}

function systemctl(args) {
  return captureResult('systemctl', ['--user', ...args])
}

function serviceNode() {
  const fnmDefault = path.join(HOME, '.local', 'share', 'fnm', 'aliases', 'default', 'bin', 'node')
  const candidates = process.platform === 'linux' ? ['/usr/bin/node', fnmDefault] : [fnmDefault]
  for (const candidate of candidates) {
    if (exists(candidate) && nodeSupportsApp(capture(candidate, ['-v']))) return candidate
  }
  return process.execPath
}

export function serviceLoaded() {
  if (process.platform === 'darwin') return captureResult('launchctl', ['print', userTarget()]).status === 0
  if (linuxSystemd()) return systemctl(['is-active', '--quiet', SYSTEMD_UNIT_NAME]).status === 0
  return false
}

export function serviceInstalled() {
  if (process.platform === 'darwin') return exists(SERVICE_PLIST)
  if (linuxSystemd()) return exists(SYSTEMD_UNIT)
  return false
}

function bootout() {
  captureResult('launchctl', ['bootout', `gui/${process.getuid()}`, SERVICE_PLIST])
  captureResult('launchctl', ['bootout', userTarget()])
}

function displayPath(target) {
  return target.startsWith(HOME) ? `~${target.slice(HOME.length)}` : target
}

async function stopManualInstance() {
  const runningPid = readPid(SERVER_PID)
  if (runningPid && processAlive(runningPid)) await stopProcess(runningPid)
  fs.rmSync(SERVER_PID, { force: true })
  stopHelper(MDNS_PID)
  stopHelper(TUNNEL_PID)
}

async function waitForPortRelease(port) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const owner = portOwner(port)
    if (!owner && !(await canConnect(port))) return
    if (attempt === 19) {
      throw new Error(
        `Port ${port} is already in use${owner ? ` (PID ${owner})` : ''} — stop that server before installing the login service.`,
      )
    }
    await sleep(250)
  }
}

function ensureLinger() {
  const user = process.env.USER ?? process.env.LOGNAME
  if (!user) return
  if (capture('loginctl', ['show-user', user, '-p', 'Linger']) === 'Linger=yes') return
  if (captureResult('loginctl', ['enable-linger', user]).status !== 0) {
    console.log(`  Boot start needs lingering — run: sudo loginctl enable-linger ${user}`)
  }
}

function dockerAccess() {
  if (!which('docker')) return 'missing'
  if (captureResult('docker', ['info'], { stdio: 'ignore' }).status === 0) return 'ready'
  return exists('/var/run/docker.sock') ? 'denied' : 'stopped'
}

async function installCobaltUnit() {
  const docker = which('docker')
  const access = dockerAccess()
  if (!docker || access === 'missing') return 'missing'

  const testBin = which('test') ?? '/usr/bin/test'
  const unit = `[Unit]
Description=SunnyGen cobalt (social import)
Documentation=file://${ROOT}/compose.yaml

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${ROOT}
# Fail fast instead of hanging when the Docker daemon is not reachable.
ExecStartPre=${testBin} -S /var/run/docker.sock
ExecStart="${docker}" compose up -d --remove-orphans cobalt
ExecStop="${docker}" compose down
TimeoutStartSec=600
Restart=on-failure
RestartSec=30

[Install]
WantedBy=default.target
`

  fs.mkdirSync(SYSTEMD_DIR, { recursive: true })
  fs.writeFileSync(COBALT_UNIT, unit, 'utf8')
  systemctl(['daemon-reload'])
  const enable = systemctl(['enable', COBALT_UNIT_NAME])
  if (enable.status !== 0) {
    throw new Error(`systemctl --user enable ${COBALT_UNIT_NAME} failed:\n${(enable.stderr ?? '').trim()}`)
  }
  if (access !== 'ready') return access
  return systemctl(['restart', COBALT_UNIT_NAME]).status === 0 ? 'started' : 'failed'
}

export async function installService({ port, name, mdns, tunnel }) {
  if (process.platform === 'darwin') {
    await installLaunchdService({ port, name, mdns, tunnel })
    return
  }
  if (linuxSystemd()) {
    await installSystemdService({ port })
    return
  }
  throw new Error('The login service supports macOS (launchd) and Linux (systemd --user) only.')
}

async function installLaunchdService({ port, name, mdns, tunnel }) {
  if (!nodeSupportsApp()) {
    throw new Error('Node 22.20 or newer is required before installing the login service.')
  }

  if (serviceLoaded()) {
    bootout()
    await sleep(1000)
  }
  await stopManualInstance()
  await waitForPortRelease(port)

  const node = serviceNode()
  const nodeDir = path.dirname(node)
  const searchPath = [
    nodeDir,
    path.join(HOME, '.local', 'share', 'fnm', 'aliases', 'default', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(HOME, '.local', 'bin'),
    path.join(HOME, 'Library', 'pnpm'),
    path.join(HOME, '.cargo', 'bin'),
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ].join(':')

  const args = [node, CLI_ENTRY, '--port', String(port)]
  if (mdns) args.push('--name', name)
  else args.push('--no-mdns')
  if (tunnel) args.push('--tunnel')

  const argumentXml = args.map((argument) => `    <string>${xmlEscape(argument)}</string>`).join('\n')

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${argumentXml}
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(ROOT)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xmlEscape(searchPath)}</string>
    <key>PORT</key>
    <string>${port}</string>
    <key>SUNNYGEN_SERVICE</key>
    <string>1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${xmlEscape(SERVICE_LOG)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(SERVICE_ERR_LOG)}</string>
</dict>
</plist>
`

  fs.mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true })
  fs.mkdirSync(LOGS_DIR, { recursive: true })
  fs.writeFileSync(SERVICE_PLIST, plist, 'utf8')

  if (which('plutil')) {
    const lint = captureResult('plutil', ['-lint', SERVICE_PLIST])
    if (lint.status !== 0) {
      fs.rmSync(SERVICE_PLIST, { force: true })
      throw new Error(`Generated plist is invalid:\n${(lint.stderr ?? '').trim()}`)
    }
  }

  captureResult('launchctl', ['enable', userTarget()])
  const bootstrap = captureResult('launchctl', ['bootstrap', `gui/${process.getuid()}`, SERVICE_PLIST])
  if (bootstrap.status !== 0) {
    throw new Error(
      `launchctl bootstrap failed:\n${(bootstrap.stderr ?? '').trim()}\nSee ${displayPath(SERVICE_ERR_LOG)}.`,
    )
  }
  captureResult('launchctl', ['enable', userTarget()])

  console.log(`Installed ${SERVICE_LABEL} — SunnyGen starts at login on port ${port}.`)
  console.log('  Status  ./sunnygen --service-status')
  console.log(`  Logs    ${displayPath(SERVICE_LOG)}`)
  console.log('  Remove  ./sunnygen --uninstall-service')
}

async function installSystemdService({ port }) {
  if (!nodeSupportsApp()) {
    throw new Error('Node 22.20 or newer is required before installing the login service.')
  }
  if (!exists(SERVER_ENTRY)) {
    throw new Error('No production build found — run ./sunnygen --build once before installing the service.')
  }

  if (serviceInstalled()) {
    systemctl(['stop', SYSTEMD_UNIT_NAME])
    await sleep(500)
  }
  await stopManualInstance()
  await waitForPortRelease(port)

  const node = serviceNode()
  const unit = `[Unit]
Description=SunnyGen
Documentation=file://${ROOT}/README.md

[Service]
Type=simple
WorkingDirectory=${ROOT}
Environment=NODE_ENV=production
Environment=PORT=${port}
Environment=HOST=0.0.0.0
Environment=NITRO_PORT=${port}
Environment=NITRO_HOST=0.0.0.0
ExecStart="${node}" "${SERVER_ENTRY}"
Restart=always
RestartSec=3
# The Nitro node server closes its listener on SIGTERM but keeps the event loop
# alive when it runs under a service manager, so systemd must follow up with
# SIGKILL. Eight seconds leaves room for the 5s graceful drain.
TimeoutStopSec=8

[Install]
WantedBy=default.target
`

  fs.mkdirSync(SYSTEMD_DIR, { recursive: true })
  fs.writeFileSync(SYSTEMD_UNIT, unit, 'utf8')

  const reload = systemctl(['daemon-reload'])
  if (reload.status !== 0) {
    fs.rmSync(SYSTEMD_UNIT, { force: true })
    throw new Error(`systemctl --user daemon-reload failed:\n${(reload.stderr ?? '').trim()}`)
  }

  const enable = systemctl(['enable', SYSTEMD_UNIT_NAME])
  if (enable.status !== 0) {
    throw new Error(`systemctl --user enable failed:\n${(enable.stderr ?? '').trim()}`)
  }

  const started = systemctl(['restart', SYSTEMD_UNIT_NAME])
  if (started.status !== 0) {
    throw new Error(
      `systemctl --user restart failed:\n${(started.stderr ?? '').trim()}\nLogs: journalctl --user -u ${SYSTEMD_UNIT_NAME}`,
    )
  }

  await sleep(1500)
  if (systemctl(['is-active', '--quiet', SYSTEMD_UNIT_NAME]).status !== 0) {
    throw new Error(
      `SunnyGen did not stay running.\nLogs: journalctl --user -u ${SYSTEMD_UNIT_NAME} -n 40 --no-pager`,
    )
  }

  ensureLinger()

  console.log(`Installed ${SYSTEMD_UNIT_NAME} — SunnyGen starts at boot on port ${port}.`)
  console.log('  Status  ./sunnygen --service-status')
  console.log(`  Logs    journalctl --user -u ${SYSTEMD_UNIT_NAME} -f`)
  console.log('  Remove  ./sunnygen --uninstall-service')

  const cobalt = await installCobaltUnit()
  if (cobalt === 'started') {
    console.log(`Installed ${COBALT_UNIT_NAME} — the cobalt container starts with your session.`)
  } else if (cobalt === 'missing') {
    console.log('  Cobalt  skipped — Docker is not installed')
  } else if (cobalt === 'stopped') {
    console.log(`Installed ${COBALT_UNIT_NAME} — it starts after:`)
    console.log('          sudo systemctl enable --now docker')
  } else if (cobalt === 'denied') {
    console.log(`Installed ${COBALT_UNIT_NAME} — it starts after your user can reach the socket:`)
    console.log('          sudo usermod -aG docker "$USER"   (then log out and back in)')
  } else {
    console.log(`Installed ${COBALT_UNIT_NAME} — did not start; see journalctl --user -u ${COBALT_UNIT_NAME}`)
  }
}

export function uninstallService() {
  if (process.platform === 'darwin') {
    bootout()
    captureResult('launchctl', ['disable', userTarget()])
    stopHelper(MDNS_PID)
    stopHelper(TUNNEL_PID)
    fs.rmSync(SERVICE_PLIST, { force: true })
    console.log(`Removed ${SERVICE_LABEL}.`)
    return
  }
  if (linuxSystemd()) {
    systemctl(['disable', '--now', SYSTEMD_UNIT_NAME])
    if (exists(COBALT_UNIT)) systemctl(['disable', '--now', COBALT_UNIT_NAME])
    stopHelper(MDNS_PID)
    stopHelper(TUNNEL_PID)
    fs.rmSync(SYSTEMD_UNIT, { force: true })
    fs.rmSync(COBALT_UNIT, { force: true })
    systemctl(['daemon-reload'])
    console.log(`Removed ${SYSTEMD_UNIT_NAME} and ${COBALT_UNIT_NAME}.`)
    return
  }
  throw new Error('The login service supports macOS (launchd) and Linux (systemd --user) only.')
}

export function restartService() {
  if (process.platform === 'darwin') {
    if (!serviceInstalled()) {
      throw new Error('Login service is not installed — run ./sunnygen --install-service')
    }
    const status = captureResult('launchctl', ['kickstart', '-k', userTarget()])
    if (status.status !== 0) {
      throw new Error(
        `Could not restart ${SERVICE_LABEL}:\n${(status.stderr ?? '').trim()}\nTry ./sunnygen --install-service`,
      )
    }
    console.log(`Restarted ${SERVICE_LABEL}.`)
    console.log(`  Logs  ${displayPath(SERVICE_LOG)}`)
    return
  }
  if (linuxSystemd()) {
    if (!serviceInstalled()) {
      throw new Error('Login service is not installed — run ./sunnygen --install-service')
    }
    const status = systemctl(['restart', SYSTEMD_UNIT_NAME])
    if (status.status !== 0) {
      throw new Error(
        `Could not restart ${SYSTEMD_UNIT_NAME}:\n${(status.stderr ?? '').trim()}\nTry ./sunnygen --install-service`,
      )
    }
    console.log(`Restarted ${SYSTEMD_UNIT_NAME}.`)
    console.log(`  Logs  journalctl --user -u ${SYSTEMD_UNIT_NAME} -f`)
    return
  }
  throw new Error('The login service supports macOS (launchd) and Linux (systemd --user) only.')
}

export function stopService() {
  if (process.platform === 'darwin') {
    if (!serviceInstalled() && !serviceLoaded()) {
      throw new Error('Login service is not installed.')
    }
    stopHelper(MDNS_PID)
    stopHelper(TUNNEL_PID)
    bootout()
    console.log(`Stopped ${SERVICE_LABEL} (still installed; it starts again at the next login).`)
    console.log('  Remove permanently  ./sunnygen --uninstall-service')
    return
  }
  if (linuxSystemd()) {
    if (!serviceInstalled()) {
      throw new Error('Login service is not installed.')
    }
    stopHelper(MDNS_PID)
    stopHelper(TUNNEL_PID)
    systemctl(['stop', SYSTEMD_UNIT_NAME])
    if (exists(COBALT_UNIT)) systemctl(['stop', COBALT_UNIT_NAME])
    console.log(`Stopped ${SYSTEMD_UNIT_NAME} (still enabled; it starts again at the next boot).`)
    console.log('  Remove permanently  ./sunnygen --uninstall-service')
    return
  }
  throw new Error('The login service supports macOS (launchd) and Linux (systemd --user) only.')
}

export function serviceStatus() {
  console.log('SunnyGen login service:')
  if (process.platform === 'darwin') {
    console.log(`  Label  ${SERVICE_LABEL}`)
    if (!serviceInstalled()) {
      console.log('  Not installed — run ./sunnygen --install-service')
    } else {
      const detail = captureResult('launchctl', ['print', userTarget()])
      if (detail.status !== 0) {
        console.log('  Installed but not loaded — run ./sunnygen --install-service')
      } else {
        const seen = new Set()
        const lines = (detail.stdout ?? '')
          .split('\n')
          .filter((line) => /^\s*(state|pid|program|last exit code|path)\s*=/.test(line))
        for (const line of lines) {
          const key = line.split('=')[0].trim()
          if (seen.has(key)) continue
          seen.add(key)
          console.log(`  ${line.trim()}`)
        }
      }
      console.log(`  Plist  ${displayPath(SERVICE_PLIST)}`)
      console.log(`  Logs   ${displayPath(SERVICE_LOG)}`)
    }
  } else if (linuxSystemd()) {
    console.log(`  Unit   ${SYSTEMD_UNIT_NAME}`)
    if (!serviceInstalled()) {
      console.log('  Not installed — run ./sunnygen --install-service')
    } else {
      const active = capture('systemctl', ['--user', 'is-active', SYSTEMD_UNIT_NAME]) || 'inactive'
      const enabled = capture('systemctl', ['--user', 'is-enabled', SYSTEMD_UNIT_NAME]) || 'disabled'
      const pid = capture('systemctl', ['--user', 'show', SYSTEMD_UNIT_NAME, '-p', 'MainPID', '--value'])
      console.log(`  State  ${active} (${enabled})`)
      if (pid && pid !== '0') console.log(`  PID    ${pid}`)
      console.log(`  Path   ${displayPath(SYSTEMD_UNIT)}`)
      console.log(`  Logs   journalctl --user -u ${SYSTEMD_UNIT_NAME} -f`)
      if (exists(COBALT_UNIT)) {
        const cobaltActive = capture('systemctl', ['--user', 'is-active', COBALT_UNIT_NAME]) || 'inactive'
        console.log(`  Cobalt ${COBALT_UNIT_NAME} ${cobaltActive}`)
      }
    }
  } else {
    console.log('  Unsupported — the login service needs launchd (macOS) or systemd --user (Linux).')
  }
  console.log('')
  console.log('Cobalt (Docker):')
  cobaltStatus()
}

export function cobaltStatus() {
  const access = dockerAccess()
  if (access === 'missing') {
    console.log('  Docker not found — cobalt cannot run.')
    return
  }
  if (access === 'stopped') {
    console.log('  Docker daemon not running — start it with: sudo systemctl enable --now docker')
    return
  }
  if (access === 'denied') {
    console.log('  Docker socket not reachable — add your user to the docker group.')
    return
  }
  run('docker', ['compose', 'ps', 'cobalt'])
}

export function startCobalt({ stack = false } = {}) {
  if (!which('docker')) {
    throw new Error('Docker is required for cobalt — install Docker Desktop or OrbStack.')
  }
  if (run('docker', ['info'], { stdio: 'ignore' }) !== 0) {
    throw new Error('Docker is not running — start Docker Desktop or OrbStack first.')
  }
  const args = stack ? ['compose', 'up', '-d'] : ['compose', 'up', '-d', 'cobalt']
  if (run('docker', args) !== 0) {
    throw new Error('Could not start cobalt.')
  }
  console.log('Cobalt is up on http://127.0.0.1:9000.')
}

export function ensureCobalt() {
  if (!which('docker')) {
    console.log('  Cobalt     unavailable (Docker not installed)')
    return
  }
  if (run('docker', ['info'], { stdio: 'ignore' }) !== 0) {
    console.log('  Cobalt     unavailable (Docker is not running)')
    return
  }
  const running = capture('docker', ['compose', 'ps', '--status', 'running', '--services', 'cobalt'])
  if (running.split('\n').includes('cobalt')) {
    console.log('  Cobalt     running')
    return
  }
  const status = run('docker', ['compose', 'up', '-d', 'cobalt'], { stdio: 'ignore' })
  console.log(
    status === 0 ? '  Cobalt     started' : '  Cobalt     failed to start — social import unavailable',
  )
}
