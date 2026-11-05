#!/usr/bin/env node
import { DEFAULT_MDNS_NAME, DEFAULT_PORT, readEnvFiles } from '../src/shared.mjs'
import { start, stopBackground } from '../src/server.mjs'
import {
  cobaltStatus,
  installService,
  restartService,
  serviceLoaded,
  serviceStatus,
  startCobalt,
  stopService,
  uninstallService,
} from '../src/system.mjs'

for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error) => {
    // A closed pipe (for example `./sunnygen --help | head`) must not kill a
    // running server, so EPIPE is ignored and only real errors are rethrown.
    if (error.code !== 'EPIPE') throw error
  })
}

const USAGE = `SunnyGen launcher — build, serve, and expose the app on your network.

Usage
  ./sunnygen [options]

Run
  (no flags)          Build when stale, then serve on 0.0.0.0:\${PORT:-8977}
  --dev               Serve with hot reload instead of a production build
  --build             Force a fresh production build, then serve
  --port <number>     Listen on another port (default 8977, or $PORT)
  --background, -d    Detach and log to .sunnygen/sunnygen.log
  --stop              Stop the background server, mDNS, and tunnel

Network
  --name <name>       Publish <name>.local with Bonjour (default sunnygen)
  --no-mdns           Do not publish a .local hostname
  --tunnel            Start, or detect, the Cloudflare Tunnel connector

Cobalt (Docker)
  --stack             Start the compose stack (cobalt)
  --cobalt            Start the cobalt container
  --cobalt-status     Show cobalt container state

macOS login service (launchd)
  --install-service   Install dev.sunnygen.server and start it now
  --service-status    Show service and cobalt state
  --restart-service   Restart the launchd job
  --stop-service      Stop the job until the next login
  --uninstall-service Remove the job and its plist

  -h, --help          Show this help

Environment
  PORT                Default port (8977)
  MDNS_NAME           Default .local name (sunnygen)
  SUNNYGEN_DATA_DIR   SQLite location      SUNNYGEN_MEDIA_DIR  media location
  CLOUDFLARE_TUNNEL_TOKEN  Connector token when --tunnel is used

Only one server may run at a time. The launchd job blocks manual starts while loaded.
`

function parse(argv) {
  const options = {
    mode: 'prod',
    port: null,
    background: false,
    stop: false,
    forceBuild: false,
    mdns: true,
    name: null,
    tunnel: false,
    stack: false,
    cobalt: false,
    cobaltStatus: false,
    installService: false,
    serviceStatus: false,
    restartService: false,
    stopService: false,
    uninstallService: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    let argument = argv[index]
    let inlineValue

    if (argument.startsWith('--port=')) {
      inlineValue = argument.slice('--port='.length)
      argument = '--port'
    } else if (argument.startsWith('--name=')) {
      inlineValue = argument.slice('--name='.length)
      argument = '--name'
    }

    switch (argument) {
      case '--dev':
        options.mode = 'dev'
        break
      case '--build':
        options.forceBuild = true
        break
      case '--port': {
        const value = inlineValue ?? argv[(index += 1)]
        if (value === undefined || value === '') throw new Error('--port needs a number')
        options.port = value
        break
      }
      case '--background':
      case '-d':
        options.background = true
        break
      case '--stop':
        options.stop = true
        break
      case '--stack':
        options.stack = true
        break
      case '--cobalt':
        options.cobalt = true
        break
      case '--cobalt-status':
        options.cobaltStatus = true
        break
      case '--tunnel':
        options.tunnel = true
        break
      case '--no-mdns':
        options.mdns = false
        break
      case '--name': {
        const value = inlineValue ?? argv[(index += 1)]
        if (!value) throw new Error('--name needs a value')
        options.name = value
        break
      }
      case '--install-service':
        options.installService = true
        break
      case '--service-status':
        options.serviceStatus = true
        break
      case '--restart-service':
        options.restartService = true
        break
      case '--stop-service':
        options.stopService = true
        break
      case '--uninstall-service':
        options.uninstallService = true
        break
      case '-h':
      case '--help':
        options.help = true
        break
      default:
        throw new Error(`Unknown option: ${argument}`)
    }
  }

  return options
}

function resolvePort(value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid port: ${value}`)
  }
  return port
}

async function main() {
  let options
  try {
    options = parse(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    console.error('')
    console.error(USAGE.trimEnd())
    process.exitCode = 1
    return
  }

  if (options.help) {
    process.stdout.write(USAGE)
    return
  }

  const env = readEnvFiles()
  const port = resolvePort(options.port ?? (process.env.PORT || env.PORT || DEFAULT_PORT))
  const name = options.name ?? (process.env.MDNS_NAME || env.MDNS_NAME || DEFAULT_MDNS_NAME)

  if (!/^[a-zA-Z0-9-]+$/.test(name)) {
    throw new Error(`Invalid mDNS name: ${name} (letters, digits, and dashes only)`)
  }

  if (options.cobaltStatus) {
    cobaltStatus()
    return
  }
  if (options.stack) {
    startCobalt({ stack: true })
    return
  }
  if (options.cobalt) {
    startCobalt()
    return
  }
  if (options.uninstallService) {
    uninstallService()
    return
  }
  if (options.installService) {
    await installService({ port, name, mdns: options.mdns, tunnel: options.tunnel })
    return
  }
  if (options.serviceStatus) {
    serviceStatus()
    return
  }
  if (options.restartService) {
    restartService()
    return
  }
  if (options.stopService) {
    stopService()
    return
  }
  if (options.stop) {
    if (serviceLoaded()) {
      throw new Error('SunnyGen is running as the launchd service — use ./sunnygen --stop-service.')
    }
    await stopBackground()
    return
  }

  await start({
    mode: options.mode,
    port,
    background: options.background,
    forceBuild: options.forceBuild,
    mdns: options.mdns,
    name,
    tunnel: options.tunnel,
  })
}

main().catch((error) => {
  console.error('')
  console.error(error.message)
  process.exitCode = 1
})
