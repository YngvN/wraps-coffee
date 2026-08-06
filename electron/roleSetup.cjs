// CommonJS on purpose, same reason as electron/main.cjs.
const { BrowserWindow, ipcMain } = require('electron')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')

// Same directory convention as every other small machine-level setting (see
// server/screen-address-settings.json) rather than a loose file at the app
// root - covered by the installer's existing [UninstallDelete] cleanup for
// server\data. Deliberately NOT run through server/backup.ts's mirrorFile:
// machine identity shouldn't be cloned onto a restored/different physical
// machine. Don't "fix" this exclusion without re-reading that reasoning.
const ROLE_FILE = path.join(__dirname, '..', 'server', 'data', 'display-role.json')

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

/** Shows the bundled setup-wizard.html and resolves with whatever it submits via IPC. A trusted, local, bundled page only - nodeIntegration/no context isolation here is a deliberate simplification for this one internal setup window, not a pattern to copy for anything loading remote content. */
function showWizard() {
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
  })
}

/**
 * Reads the persisted machine identity, or (first run only) shows the setup
 * wizard to ask for a label, then persists it. Every install runs the
 * `role: 'server'` role (see `electron/main.cjs`) - the remote "Display
 * only" role that used to be chosen here was removed; a device that only
 * needs to show a display (no local server) is now covered by the
 * purpose-built ADHDisplay Companion app instead of this installer/wizard.
 * Never re-prompts on a later launch - see the tray's "Rename this
 * machine..." item (electron/main.cjs) for changing the label afterward.
 */
async function getOrCreateRole() {
  const existing = readRole()
  if (existing) return existing

  const answer = await showWizard()

  return writeRole({
    role: 'server',
    machineID: crypto.randomUUID(),
    label: answer.label || os.hostname(),
  })
}

/** Re-runs the wizard unconditionally (the tray's "Rename this machine..." item) - only the label can actually change now that there's no role choice. */
async function reconfigureRole() {
  const answer = await showWizard()
  const existing = readRole()
  return writeRole({
    role: 'server',
    machineID: existing?.machineID ?? crypto.randomUUID(),
    label: answer.label || os.hostname(),
  })
}

/**
 * Assigns a fresh machine identity without touching role/label -
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
