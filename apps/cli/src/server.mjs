import fs from 'node:fs'
import path from 'node:path'
import {
  HOST,
  MDNS_LOG,
  MDNS_PID,
  ROOT,
  RUN_DIR,
  SERVER_ENTRY,
  SERVER_LOG,
  SERVER_PID,
  TUNNEL_LOG,
  TUNNEL_PID,
  WEB_DIR,
  canConnect,
  capture,
  exists,
  lanIp,
  nodeSupportsApp,
  portOwner,
  processAlive,
  readEnvFiles,
  readPid,
  relative,
  run,
  sleep,
  spawnForeground,
  spawnLogged,
  stopHelper,
  stopProcess,
  tailFile,
  tailscaleDns,
  tailscaleIp,
  waitForPort,
  which,
} from './shared.mjs'
import { ensureCobalt, serviceLoaded } from './system.mjs'

const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.output', '.tanstack', 'dist'])

function newestMtime(target) {
  let newest = 0
  const pending = [target]
  while (pending.length > 0) {
    const current = pending.pop()
    let stat
    try {
      stat = fs.statSync(current)
    } catch {
      continue
    }
    if (!stat.isDirectory()) {
      newest = Math.max(newest, stat.mtimeMs)
      continue
    }
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue
      pending.push(path.join(current, entry.name))
    }
  }
  return newest
}

function sourceMtime() {
  const targets = [
    path.join(WEB_DIR, 'src'),
    path.join(WEB_DIR, 'public'),
    path.join(WEB_DIR, 'vite.config.ts'),
    path.join(WEB_DIR, 'package.json'),
    path.join(WEB_DIR, 'tsconfig.json'),
    path.join(ROOT, 'package.json'),
    path.join(ROOT, 'pnpm-lock.yaml'),
    path.join(ROOT, 'turbo.json'),
    path.join(ROOT, 'tsconfig.base.json'),
  ]
  const packagesDir = path.join(ROOT, 'packages')
  try {
    for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      targets.push(path.join(packagesDir, entry.name, 'src'))
      targets.push(path.join(packagesDir, entry.name, 'package.json'))
    }
  } catch {
    // no packages directory
  }
  let newest = 0
  for (const target of targets) newest = Math.max(newest, newestMtime(target))
  return newest
}

export function needsBuild() {
  if (!exists(SERVER_ENTRY)) return true
  try {
    return sourceMtime() > fs.statSync(SERVER_ENTRY).mtimeMs
  } catch {
    return true
  }
}

function assertNodeVersion() {
  if (!nodeSupportsApp()) {
    throw new Error(
      `Node ${process.versions.node} is too old — SunnyGen needs Node 22.20 or newer (Node 24 recommended).`,
    )
  }
}

function ensureTooling() {
  assertNodeVersion()
  let pnpm = which('pnpm')
  if (!pnpm) {
    const corepack = which('corepack')
    if (corepack) run(corepack, ['enable'], { stdio: 'ignore' })
    pnpm = which('pnpm')
  }
  if (!pnpm) {
    throw new Error('pnpm is required. Install it with: corepack enable')
  }
  if (!exists(path.join(ROOT, 'node_modules')) || !exists(path.join(WEB_DIR, 'node_modules'))) {
    console.log('Installing dependencies…')
    const status = run(pnpm, ['install'])
    if (status !== 0) throw new Error('Dependency install failed.')
  }
  return pnpm
}

export async function buildProject({ force, pnpm }) {
  if (!force && !needsBuild()) {
    console.log('Build is up to date.')
    return
  }
  console.log(force ? 'Building SunnyGen…' : 'Sources changed — building SunnyGen…')
  const status = run(pnpm ?? ensureTooling(), ['run', 'build'])
  if (status !== 0) {
    throw new Error('Build failed. Fix the error above, then run ./sunnygen --build.')
  }
  if (!exists(SERVER_ENTRY)) {
    throw new Error(`Build finished without ${relative(SERVER_ENTRY)} — check the Vite/nitro output.`)
  }
}

async function assertPortFree(port) {
  const attempts = process.env.SUNNYGEN_SERVICE === '1' ? 20 : 1
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const owner = portOwner(port)
    if (!owner && !(await canConnect(port))) return
    if (attempt + 1 < attempts) {
      await sleep(500)
      continue
    }
    throw new Error(
      `Port ${port} is already in use${owner ? ` (PID ${owner})` : ''}.\nTry: ./sunnygen --port ${port + 1}`,
    )
  }
}

function clearStalePid() {
  const pid = readPid(SERVER_PID)
  if (!pid) {
    fs.rmSync(SERVER_PID, { force: true })
    return
  }
  if (processAlive(pid)) {
    throw new Error(`SunnyGen is already running (PID ${pid}) — use ./sunnygen --stop first.`)
  }
  fs.rmSync(SERVER_PID, { force: true })
}

function resolveTunnelToken(env) {
  const candidates = [
    process.env.CLOUDFLARE_TUNNEL_TOKEN,
    env.CLOUDFLARE_TUNNEL_TOKEN,
    readFileTrim(path.join(ROOT, '.sunnygen', 'tunnel-token')),
    readFileTrim(path.join(process.env.HOME ?? '', '.cloudflared', 'tunnel-token')),
  ]
  return candidates.find((value) => typeof value === 'string' && value.length > 0) ?? null
}

function readFileTrim(file) {
  try {
    return fs.readFileSync(file, 'utf8').replace(/\s+/g, '')
  } catch {
    return ''
  }
}

export function startMdns({ name, port }) {
  stopHelper(MDNS_PID)
  const bin = which('dns-sd')
  if (!bin) {
    console.log('  Local DNS  unavailable (dns-sd not found)')
    return false
  }
  const address = lanIp() ?? tailscaleIp()
  if (!address) {
    console.log('  Local DNS  unavailable (no LAN or Tailscale address)')
    return false
  }
  const pid = spawnLogged(
    bin,
    ['-P', 'SunnyGen', '_http._tcp', 'local.', String(port), `${name}.local`, address],
    { logFile: MDNS_LOG },
  )
  fs.writeFileSync(MDNS_PID, String(pid))
  return { pid, name }
}

export async function confirmMdns({ pid, name }) {
  await sleep(1000)
  const log = tailFile(MDNS_LOG, 20)
  if (/conflict/i.test(log)) {
    stopHelper(MDNS_PID)
    console.log(`  Local DNS  ${name}.local is already claimed — retry with --name something-else`)
    return false
  }
  if (!processAlive(pid)) {
    stopHelper(MDNS_PID)
    console.log('  Local DNS  dns-sd exited before registering the name')
    return false
  }
  return true
}

export async function startTunnel({ env }) {
  const running = capture('pgrep', ['-f', 'cloudflared.*tunnel.*run'])
  if (running) return { state: 'managed' }
  const bin = which('cloudflared')
  if (!bin) {
    console.log('  Tunnel     cloudflared not installed — brew install cloudflared')
    return { state: 'failed' }
  }
  stopHelper(TUNNEL_PID)
  const token = resolveTunnelToken(env)
  const args = token ? ['tunnel', 'run', '--token', token] : ['tunnel', 'run']
  const pid = spawnLogged(bin, args, { logFile: TUNNEL_LOG })
  fs.writeFileSync(TUNNEL_PID, String(pid))
  await sleep(2500)
  if (!processAlive(pid)) {
    const tail = tailFile(TUNNEL_LOG, 6)
    stopHelper(TUNNEL_PID)
    console.log('  Tunnel     failed to start — check the connector token or ~/.cloudflared/config.yml')
    if (tail) console.log(tail.replace(/^/gm, '             '))
    return { state: 'failed' }
  }
  return { state: 'started' }
}

function printUrls({ mode, port, name, mdns, tunnel, background }) {
  const address = lanIp()
  const tsIp = tailscaleIp()
  const tsDns = tailscaleDns()
  const service = process.env.SUNNYGEN_SERVICE === '1'
  const stopHint = service ? './sunnygen --stop-service' : background ? './sunnygen --stop' : 'Ctrl-C'

  console.log('')
  console.log(`SunnyGen is running (${mode === 'dev' ? 'development' : 'production'})`)
  console.log(`  Local      http://localhost:${port}`)
  if (address) console.log(`  LAN        http://${address}:${port}`)
  else console.log('  LAN        not detected — connect to Wi-Fi or Ethernet to share locally')
  if (tsIp) console.log(`  Tailscale  http://${tsIp}:${port}`)
  else console.log('  Tailscale  not detected — install and start Tailscale to share outside the LAN')
  if (tsDns) console.log(`  MagicDNS   http://${tsDns}:${port}`)
  if (mdns) console.log(`  Local DNS  http://${name}.local:${port}`)
  if (tunnel?.state === 'managed') {
    console.log('  Tunnel     Cloudflare connector already running (system service)')
    console.log(`             point the public hostname at http://localhost:${port}`)
  } else if (tunnel?.state === 'started') {
    console.log('  Tunnel     Cloudflare connector started')
    console.log(`             point the public hostname at http://localhost:${port}`)
  }
  console.log(`  Stop       ${stopHint}`)
  console.log('')
  if (!address && !tsIp) {
    console.log('  Note: macOS may ask whether to allow incoming connections for node — choose Allow.')
    console.log('')
  }
}

function serverCommand({ mode, pnpm }) {
  if (mode === 'dev') return { command: pnpm, args: ['--filter', '@sunnygen/web', 'dev'] }
  return { command: process.execPath, args: [SERVER_ENTRY] }
}

async function waitForBackgroundServer(pid, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!processAlive(pid)) return false
    if (await waitForPort(port, 250)) return true
    await sleep(200)
  }
  return false
}

async function startBackground({ command, args, env, port, mode }) {
  fs.mkdirSync(RUN_DIR, { recursive: true })
  fs.writeFileSync(SERVER_LOG, '')
  const pid = spawnLogged(command, args, { logFile: SERVER_LOG, env })
  fs.writeFileSync(SERVER_PID, String(pid))
  const timeout = mode === 'dev' ? 120_000 : 60_000
  const ready = await waitForBackgroundServer(pid, port, timeout)
  if (!ready) {
    const tail = tailFile(SERVER_LOG, 20)
    await stopProcess(pid)
    fs.rmSync(SERVER_PID, { force: true })
    throw new Error(`SunnyGen failed to start.${tail ? `\n\n${tail}` : ''}`)
  }
  return pid
}

export async function stopBackground() {
  stopHelper(TUNNEL_PID)
  stopHelper(MDNS_PID)
  const pid = readPid(SERVER_PID)
  if (!pid) {
    fs.rmSync(SERVER_PID, { force: true })
    console.log('No background SunnyGen process found.')
    return
  }
  if (!processAlive(pid)) {
    fs.rmSync(SERVER_PID, { force: true })
    console.log('No running SunnyGen process found.')
    return
  }
  await stopProcess(pid)
  fs.rmSync(SERVER_PID, { force: true })
  console.log(`Stopped SunnyGen (PID ${pid}).`)
}

export async function start({ mode, port, background, forceBuild, mdns, name, tunnel }) {
  if (process.env.SUNNYGEN_SERVICE !== '1' && serviceLoaded()) {
    throw new Error(
      'SunnyGen is running as the launchd service.\nUse ./sunnygen --service-status, --restart-service, or --stop-service.',
    )
  }
  clearStalePid()
  await assertPortFree(port)
  stopHelper(MDNS_PID)
  stopHelper(TUNNEL_PID)
  await sleep(300)

  const pnpm = ensureTooling()
  if (mode === 'prod') await buildProject({ force: forceBuild, pnpm })

  const envFiles = readEnvFiles()
  const env = {
    ...envFiles,
    ...process.env,
    NODE_ENV: mode === 'prod' ? 'production' : 'development',
    PORT: String(port),
    HOST,
    NITRO_PORT: String(port),
    NITRO_HOST: HOST,
  }
  const { command, args } = serverCommand({ mode, pnpm })

  let mdnsActive = false
  let tunnelState = null
  const beginHelpers = async () => {
    if (mdns) {
      const registration = startMdns({ name, port })
      mdnsActive = registration ? await confirmMdns(registration) : false
    }
    if (tunnel) tunnelState = await startTunnel({ env })
    ensureCobalt()
  }

  if (background) {
    const pid = await startBackground({ command, args, env, port, mode })
    await beginHelpers()
    printUrls({ mode, port, name, mdns: mdnsActive, tunnel: tunnelState, background: true })
    console.log(`  Logs       ${relative(SERVER_LOG)} (PID ${pid})`)
    console.log(`  Follow     tail -f ${relative(SERVER_LOG)}`)
    console.log('')
    return
  }

  await beginHelpers()
  printUrls({ mode, port, name, mdns: mdnsActive, tunnel: tunnelState, background: false })
  console.log('')

  const child = spawnForeground(command, args, env)
  let stopping = false
  const shutdown = () => {
    if (stopping) return
    stopping = true
    stopHelper(MDNS_PID)
    stopHelper(TUNNEL_PID)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  const code = await new Promise((resolve) => {
    child.once('error', (error) => {
      console.error(error.message)
      resolve({ exitCode: 1, signal: null })
    })
    child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }))
  })
  stopHelper(MDNS_PID)
  stopHelper(TUNNEL_PID)
  if (stopping || code.signal === 'SIGINT' || code.signal === 'SIGTERM') return
  const exitCode = code.exitCode ?? (code.signal ? 1 : 0)
  if (exitCode !== 0) {
    throw new Error(
      `SunnyGen exited with code ${exitCode}.${mode === 'dev' ? ' Check the Vite output above.' : ''}`,
    )
  }
}
