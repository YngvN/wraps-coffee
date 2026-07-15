// CommonJS on purpose, same reason as electron/main.cjs.
const { BrowserWindow, ipcMain } = require('electron')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { Bonjour } = require('bonjour-service')

// Same directory convention as every other small machine-level setting (see
// server/screen-address-settings.json) rather than a loose file at the app
// root - covered by the installer's existing [UninstallDelete] cleanup for
// server\data. Deliberately NOT run through server/backup.ts's mirrorFile:
// machine identity shouldn't be cloned onto a restored/different physical
// machine. Don't "fix" this exclusion without re-reading that reasoning.
const ROLE_FILE = path.join(__dirname, '..', 'server', 'data', 'display-role.json')
const PROBE_TIMEOUT_MS = 3000
// Must match server/mdns.ts's own SERVER_PRESENCE_SERVICE_TYPE - this file
// can't share that module directly (a separate Node/TS process), so the
// service type string is deliberately duplicated here.
const SERVER_PRESENCE_SERVICE_TYPE = 'wrapscoffee-server'

function readRole() {
  if (!existsSync(ROLE_FILE)) return null
  try {
    return JSON.parse(readFileSync(ROLE_FILE, 'utf-8'))
  } catch {
    return null
  }
}

function writeRole(role) {
  mkdirSync(path.dirname(ROLE_FILE), { recursive: true })
  writeFileSync(ROLE_FILE, JSON.stringify(role, null, 2), 'utf-8')
  return role
}

/**
 * Browses the LAN briefly for an existing Wraps & Coffee server (see
 * `server/mdns.ts`'s `advertiseServerPresence`) - used only to pre-select a
 * sensible default in the first-run wizard below, never to silently
 * auto-configure without asking.
 */
function probeForServer(timeoutMs) {
  return new Promise((resolve) => {
    const bonjour = new Bonjour()
    let settled = false

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      browser.stop()
      bonjour.destroy()
      resolve(result)
    }

    const browser = bonjour.find({ type: SERVER_PRESENCE_SERVICE_TYPE }, (service) => {
      const host = service.addresses?.find((address) => address.includes('.')) ?? service.host
      finish({ host, wsPort: Number(service.txt?.wsPort ?? service.port), contentPort: Number(service.txt?.contentPort ?? 4173) })
    })

    const timer = setTimeout(() => finish(null), timeoutMs)
  })
}

/** Shows the bundled setup-wizard.html and resolves with whatever it submits via IPC. A trusted, local, bundled page only - nodeIntegration/no context isolation here is a deliberate simplification for this one internal setup window, not a pattern to copy for anything loading remote content. */
function showWizard(probeResult) {
  return new Promise((resolve) => {
    const wizardWindow = new BrowserWindow({
      width: 480,
      height: 460,
      resizable: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    })
    wizardWindow.setMenuBarVisibility(false)
    wizardWindow.loadFile(path.join(__dirname, 'setup-wizard.html'))

    const handleSubmit = (_event, answer) => {
      ipcMain.removeListener('role-setup:submit', handleSubmit)
      wizardWindow.close()
      resolve(answer)
    }
    ipcMain.on('role-setup:submit', handleSubmit)

    wizardWindow.webContents.on('did-finish-load', () => {
      wizardWindow.webContents.send('role-setup:probe-result', probeResult)
    })
  })
}

/**
 * Reads the persisted role/machine identity, or (first run only) probes the
 * LAN and shows the setup wizard to ask/confirm one, then persists it.
 * Never re-prompts on a later launch — see the tray's "Reconfigure role..."
 * item (electron/main.cjs) for changing it afterward.
 */
async function getOrCreateRole() {
  const existing = readRole()
  if (existing) return existing

  const probeResult = await probeForServer(PROBE_TIMEOUT_MS)
  const answer = await showWizard(probeResult)

  return writeRole({
    role: answer.role,
    serverHost: answer.role === 'display' ? answer.serverHost : undefined,
    machineID: crypto.randomUUID(),
    label: answer.label || os.hostname(),
  })
}

/** Re-runs the wizard unconditionally (the tray's "Reconfigure role..." item) - probes fresh rather than reusing whatever was found at first install, since the network may have changed since then. */
async function reconfigureRole() {
  const probeResult = await probeForServer(PROBE_TIMEOUT_MS)
  const answer = await showWizard(probeResult)
  const existing = readRole()
  return writeRole({
    role: answer.role,
    serverHost: answer.role === 'display' ? answer.serverHost : undefined,
    machineID: existing?.machineID ?? crypto.randomUUID(),
    label: answer.label || os.hostname(),
  })
}

/**
 * Assigns a fresh machine identity without touching role/serverHost/label -
 * the fix for the realistic failure mode where a "golden image" clone gets
 * reused across several physical machines and they'd otherwise all share
 * one identity, clobbering each other's monitor lists on every heartbeat.
 */
function regenerateMachineId() {
  const existing = readRole()
  if (!existing) return null
  return writeRole({ ...existing, machineID: crypto.randomUUID() })
}

module.exports = { getOrCreateRole, reconfigureRole, regenerateMachineId, readRole }
