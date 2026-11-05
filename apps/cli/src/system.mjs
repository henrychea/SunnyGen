import fs from 'node:fs'
import path from 'node:path'
import {
  CLI_ENTRY,
  HOME,
  MDNS_PID,
  ROOT,
  SERVICE_ERR_LOG,
  SERVICE_LABEL,
  SERVICE_LOG,
  SERVICE_PLIST,
  SERVER_PID,
  TUNNEL_PID,
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

function userTarget() {
  return `gui/${process.getuid()}/${SERVICE_LABEL}`
}

function serviceNode() {
  const fnmDefault = path.join(HOME, '.local', 'share', 'fnm', 'aliases', 'default', 'bin', 'node')
  if (exists(fnmDefault) && nodeSupportsApp(capture(fnmDefault, ['-v']))) return fnmDefault
  return process.execPath
}

export function serviceLoaded() {
  if (process.platform !== 'darwin') return false
  return captureResult('launchctl', ['print', userTarget()]).status === 0
}

export function serviceInstalled() {
  return exists(SERVICE_PLIST)
}

function bootout() {
  captureResult('launchctl', ['bootout', `gui/${process.getuid()}`, SERVICE_PLIST])
  captureResult('launchctl', ['bootout', userTarget()])
}

function displayPath(target) {
  return target.startsWith(HOME) ? `~${target.slice(HOME.length)}` : target
}

export async function installService({ port, name, mdns, tunnel }) {
  if (process.platform !== 'darwin') {
    throw new Error('The login service is macOS-only.')
  }
  if (!nodeSupportsApp()) {
    throw new Error('Node 22.20 or newer is required before installing the login service.')
  }

  if (serviceLoaded()) {
    bootout()
    await sleep(1000)
  }
  const runningPid = readPid(SERVER_PID)
  if (runningPid && processAlive(runningPid)) {
    await stopProcess(runningPid)
  }
  fs.rmSync(SERVER_PID, { force: true })
  stopHelper(MDNS_PID)
  stopHelper(TUNNEL_PID)

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const owner = portOwner(port)
    if (!owner) break
    if (attempt === 19) {
      throw new Error(
        `Port ${port} is already in use (PID ${owner}) — stop that server before installing the login service.`,
      )
    }
    await sleep(250)
  }

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

export function uninstallService() {
  if (process.platform !== 'darwin') {
    throw new Error('The login service is macOS-only.')
  }
  bootout()
  captureResult('launchctl', ['disable', userTarget()])
  stopHelper(MDNS_PID)
  stopHelper(TUNNEL_PID)
  fs.rmSync(SERVICE_PLIST, { force: true })
  console.log(`Removed ${SERVICE_LABEL}.`)
}

export function restartService() {
  if (process.platform !== 'darwin') {
    throw new Error('The login service is macOS-only.')
  }
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
}

export function stopService() {
  if (process.platform !== 'darwin') {
    throw new Error('The login service is macOS-only.')
  }
  if (!serviceInstalled() && !serviceLoaded()) {
    throw new Error('Login service is not installed.')
  }
  stopHelper(MDNS_PID)
  stopHelper(TUNNEL_PID)
  bootout()
  console.log(`Stopped ${SERVICE_LABEL} (still installed; it starts again at the next login).`)
  console.log('  Remove permanently  ./sunnygen --uninstall-service')
}

export function serviceStatus() {
  console.log(`SunnyGen login service (${SERVICE_LABEL}):`)
  if (process.platform !== 'darwin') {
    console.log('  Unsupported — the login service is macOS-only.')
  } else if (!serviceInstalled()) {
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
  console.log('')
  console.log('Cobalt (Docker):')
  cobaltStatus()
}

export function cobaltStatus() {
  if (!which('docker')) {
    console.log('  Docker not found — cobalt cannot run.')
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
