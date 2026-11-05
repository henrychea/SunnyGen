import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export const ROOT = path.resolve(here, '..', '..', '..')
export const WEB_DIR = path.join(ROOT, 'apps', 'web')
export const CLI_ENTRY = path.join(ROOT, 'apps', 'cli', 'bin', 'sunnygen.mjs')
export const SERVER_ENTRY = path.join(WEB_DIR, '.output', 'server', 'index.mjs')

export const RUN_DIR = path.join(ROOT, '.sunnygen')
export const SERVER_PID = path.join(RUN_DIR, 'sunnygen.pid')
export const SERVER_LOG = path.join(RUN_DIR, 'sunnygen.log')
export const MDNS_PID = path.join(RUN_DIR, 'mdns.pid')
export const MDNS_LOG = path.join(RUN_DIR, 'mdns.log')
export const TUNNEL_PID = path.join(RUN_DIR, 'tunnel.pid')
export const TUNNEL_LOG = path.join(RUN_DIR, 'tunnel.log')

export const HOME = os.homedir()
export const SERVICE_LABEL = 'dev.sunnygen.server'
export const SERVICE_PLIST = path.join(HOME, 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`)
export const SERVICE_LOG = path.join(HOME, 'Library', 'Logs', 'sunnygen.log')
export const SERVICE_ERR_LOG = path.join(HOME, 'Library', 'Logs', 'sunnygen.err.log')

export const HOST = '0.0.0.0'
export const DEFAULT_PORT = 8977
export const DEFAULT_MDNS_NAME = 'sunnygen'

export function nodeSupportsApp(version = process.versions.node) {
  const [major, minor] = String(version).replace(/^v/, '').split('.').map(Number)
  return major > 22 || (major === 22 && (minor ?? 0) >= 20)
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function exists(target) {
  try {
    fs.accessSync(target)
    return true
  } catch {
    return false
  }
}

export function which(command) {
  if (command.includes(path.sep)) return exists(command) ? command : null
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, command)
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return candidate
    } catch {
      // keep looking
    }
  }
  return null
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    ...options,
  })
  if (result.error) return 1
  return result.status ?? 1
}

export function captureResult(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    ...options,
  })
}

export function capture(command, args, options = {}) {
  const result = captureResult(command, args, options)
  if (result.error || result.status !== 0) return ''
  return (result.stdout ?? '').trim()
}

export function spawnLogged(command, args, { logFile, env = process.env, cwd = ROOT } = {}) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  const fd = fs.openSync(logFile, 'w')
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', fd, fd],
  })
  child.unref()
  fs.closeSync(fd)
  return child.pid
}

export function spawnForeground(command, args, env) {
  return spawn(command, args, { cwd: ROOT, env, stdio: 'inherit' })
}

export function readPid(file) {
  try {
    const value = Number.parseInt(fs.readFileSync(file, 'utf8').trim(), 10)
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function processAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

export async function stopProcess(pid) {
  if (!pid || !processAlive(pid)) return false
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    return false
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(100)
    if (!processAlive(pid)) return true
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // already gone
  }
  return true
}

export function stopHelper(pidFile) {
  const pid = readPid(pidFile)
  if (pid && processAlive(pid)) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }
  fs.rmSync(pidFile, { force: true })
}

export function portOwner(port) {
  const result = captureResult('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'])
  if (result.status !== 0) return null
  const pid = (result.stdout ?? '').trim().split('\n')[0]
  return pid || null
}

export function canConnect(port, timeout = 500) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeout)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

export async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await canConnect(port)) return true
    await sleep(250)
  }
  return false
}

export function readEnvFiles(names = ['.env', '.env.local']) {
  const values = {}
  for (const name of names) {
    const file = path.join(ROOT, name)
    if (!exists(file)) continue
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (!match) continue
      let value = match[2].trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      values[match[1]] = value
    }
  }
  return values
}

export function lanIp() {
  for (const iface of ['en0', 'en1']) {
    const value = capture('ipconfig', ['getifaddr', iface])
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return value
  }
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address
    }
  }
  return null
}

export function tailscaleBin() {
  const onPath = which('tailscale')
  if (onPath) return onPath
  const app = '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
  return exists(app) ? app : null
}

export function tailscaleIp() {
  const bin = tailscaleBin()
  if (!bin) return null
  const value = capture(bin, ['ip', '-4']).split('\n')[0]?.trim()
  return value && /^\d{1,3}(\.\d{1,3}){3}$/.test(value) ? value : null
}

export function tailscaleDns() {
  const bin = tailscaleBin()
  if (!bin) return null
  const raw = capture(bin, ['status', '--json'])
  if (!raw) return null
  try {
    const name = JSON.parse(raw)?.Self?.DNSName
    return typeof name === 'string' && name ? name.replace(/\.$/, '') : null
  } catch {
    return null
  }
}

export function tailFile(file, count) {
  try {
    const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n')
    return lines.slice(-count).join('\n')
  } catch {
    return ''
  }
}

export function xmlEscape(value) {
  return String(value).replace(/[&<>"]/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      default:
        return '&quot;'
    }
  })
}

export function relative(target) {
  return path.relative(ROOT, target) || '.'
}
