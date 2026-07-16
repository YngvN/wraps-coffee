// CommonJS on purpose: package.json sets "type": "module", which would make a
// plain .js file load as ESM here; Electron's main process is simplest as CJS.
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } = require('electron')
const http = require('node:http')
const path = require('node:path')
const displayManager = require('./displayManager.cjs')
const roleSetup = require('./roleSetup.cjs')
const { connectDisplayMachinesSync } = require('./syncClient.cjs')

let tray = null
let kioskWindow = null
let currentRole = null

const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 60000
const HEARTBEAT_INTERVAL_MS = 20_000

/**
 * Resolves once a GET request to `url` gets any HTTP response, or rejects
 * after `timeoutMs` — used to wait for the local `vite preview` + sync
 * server (started by start-wraps-coffee.bat just before this process) to
 * finish booting, so the window doesn't load before it can respond.
 */
function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for ${url}`))
          return
        }
        setTimeout(attempt, POLL_INTERVAL_MS)
      })
    }
    attempt()
  })
}

/** Like `waitForServer`, but never gives up — each attempt still times out after `POLL_TIMEOUT_MS`, but a failure just retries instead of rejecting. Used by the `display` role, which should sit showing "Waiting for connection" indefinitely (the main server might not be up yet, or a network blip) rather than quit. */
async function waitForServerForever(url) {
  for (;;) {
    try {
      await waitForServer(url, POLL_TIMEOUT_MS)
      return
    } catch (error) {
      console.error(error)
    }
  }
}

function splashWindow(message) {
  const window = new BrowserWindow({ width: 480, height: 200, frame: false, resizable: false, center: true })
  window.loadURL(
    `data:text/html,<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#eee"><p>${encodeURIComponent(message)}</p></body>`,
  )
  return window
}

/**
 * Icon in the notification area ("hidden taskbar" icons on Windows) - the
 * kiosk window has no title bar or close button by design, so this is the
 * only way to tell at a glance that the app is running, bring it back to
 * the front, or quit it without going through Task Manager. Reuses the
 * existing PWA app icon (public/android-chrome-192x192.png) rather than
 * shipping a separate tray-specific asset.
 */
function createTray() {
  const iconPath = path.join(__dirname, '..', 'public', 'android-chrome-192x192.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('Wraps & Coffee')

  const showWindow = () => {
    if (!kioskWindow) return
    kioskWindow.show()
    kioskWindow.focus()
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Wraps & Coffee', click: showWindow },
      { type: 'separator' },
      {
        label: 'Reconfigure role...',
        click: async () => {
          currentRole = await roleSetup.reconfigureRole()
          app.relaunch()
          app.quit()
        },
      },
      {
        label: 'Regenerate machine ID',
        click: () => {
          // Guards a "golden image" cloned across several physical machines
          // from silently sharing one identity and clobbering each other's
          // monitor lists on every heartbeat — see roleSetup.cjs's own note.
          currentRole = roleSetup.regenerateMachineId() ?? currentRole
        },
      },
      { type: 'separator' },
      { label: 'Quit Wraps & Coffee', click: () => app.quit() },
    ]),
  )
  tray.on('click', showWindow)
}

/** POSTs this machine's own presence/monitor list to the server — best-effort, matching `src/lib/localServer.ts`'s `registerDisplayHeartbeat` (the browser-side equivalent used by `/display-connect`), just via Node's own `http` instead of `fetch`. */
function sendHeartbeat(baseUrl, machineID, label, monitors) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      machineID,
      label,
      connectionType: 'electron',
      monitors: monitors.map((monitor) => ({ id: monitor.id, label: monitor.label })),
    })
    let requestUrl
    try {
      requestUrl = new URL('/display-machines/heartbeat', baseUrl)
    } catch (error) {
      console.error('[heartbeat] invalid base URL', error)
      resolve()
      return
    }
    const req = http.request(
      requestUrl,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        res.resume()
        resolve()
      },
    )
    req.on('error', () => resolve())
    req.write(body)
    req.end()
  })
}

/**
 * Backs the admin dashboard's own minimize/fullscreen/close window-control
 * buttons (see `preload.cjs`, `src/hooks/useElectronWindowControls.ts`) —
 * kiosk mode has no native title bar for these, so the page draws its own
 * and calls back here. Registered once, globally, but resolves the actual
 * `BrowserWindow` from `event.sender` rather than assuming `kioskWindow`, so
 * it stays correct if this preload script is ever attached to more than one
 * window. "Fullscreen" here means kiosk mode specifically (not plain OS
 * fullscreen) — Electron treats the two as distinct, and kiosk mode is what
 * actually hides the frame/taskbar this app relies on.
 */
function registerWindowControlHandlers() {
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle('window:toggle-fullscreen', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return false
    const next = !window.isKiosk()
    window.setKiosk(next)
    return next
  })
  ipcMain.handle('window:is-fullscreen', (event) => BrowserWindow.fromWebContents(event.sender)?.isKiosk() ?? false)
}

/** Wires the console/error-forwarding + optional DevTools setup already established for the original single kiosk window onto any managed window — kept as one shared helper rather than duplicating it per window. */
function instrumentWindow(window) {
  window.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
    console.log(`[page console] ${sourceId}:${line} ${message}`)
  })
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[did-fail-load] ${errorCode} ${errorDescription} (${validatedURL})`)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[render-process-gone]', details)
  })
  if (process.env.WRAPS_COFFEE_DEBUG === '1') {
    window.webContents.openDevTools({ mode: 'detach' })
  }
}

/** Starts the heartbeat loop + live sync subscription that keeps this machine's own managed monitors (every monitor except `excludeDisplayId`, if given) in line with admin-made Screen assignments — shared by both roles below. */
function startDisplayManagement(baseUrl, wsUrl, role, excludeDisplayId) {
  const heartbeat = () => sendHeartbeat(baseUrl, role.machineID, role.label, displayManager.detectMonitors(excludeDisplayId))
  heartbeat()
  const heartbeatInterval = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS)

  connectDisplayMachinesSync(wsUrl, (machines) => {
    const mine = machines.find((machine) => machine.machineID === role.machineID)
    if (mine) displayManager.reconcile(baseUrl, mine.monitors, excludeDisplayId)
  })

  const redetect = () => heartbeat()
  screen.on('display-added', redetect)
  screen.on('display-removed', redetect)
  screen.on('display-metrics-changed', redetect)

  return () => clearInterval(heartbeatInterval)
}

/** `role: 'server'` — this machine runs the local server (started by `start-wraps-coffee.bat` before Electron launches). The primary window stays the admin dashboard, exactly as before this feature existed; any *additional* monitors get managed signage windows, and are the only ones ever reportable/assignable (the primary is deliberately excluded — see `displayManager.cjs`'s own note on why, closing the "admin could hijack their own login screen" hole). */
async function startServerRole(role) {
  const baseUrl = 'http://localhost:4173'
  const wsUrl = 'ws://localhost:4000'
  const appUrl = process.env.WRAPS_COFFEE_URL ?? `${baseUrl}/admin/login`

  const loadingWindow = splashWindow('Starting Wraps & Coffee…')

  try {
    await waitForServer(appUrl, POLL_TIMEOUT_MS)
  } catch (error) {
    console.error(error)
    app.quit()
    return
  }

  kioskWindow = new BrowserWindow({
    kiosk: true,
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  })
  instrumentWindow(kioskWindow)
  kioskWindow.loadURL(appUrl)
  kioskWindow.once('ready-to-show', () => {
    loadingWindow.close()
    kioskWindow.show()
  })

  const primaryDisplayId = screen.getPrimaryDisplay().id
  startDisplayManagement(baseUrl, wsUrl, role, primaryDisplayId)
}

/** `role: 'display'` — no local server, no admin-login window at all; every detected monitor (there is no "primary admin display" to exclude) gets a managed signage window, pointed at the discovered/configured `serverHost` instead of localhost. */
async function startDisplayRole(role) {
  const baseUrl = `http://${role.serverHost}:4173`
  const wsUrl = `ws://${role.serverHost}:4000`

  const loadingWindow = splashWindow('Waiting for connection…')
  await waitForServerForever(`${baseUrl}/admin/login`)
  loadingWindow.close()

  startDisplayManagement(baseUrl, wsUrl, role, null)
}

async function main() {
  // Removes the native File/Edit/View/Window/Help menu bar app-wide -
  // without this, only the windows this file explicitly sets
  // `autoHideMenuBar: true` on (the main kiosk window, managed monitor
  // windows) avoid it; any *other* window Electron creates on its own
  // behalf - e.g. the admin dashboard's "Open" button doing a plain
  // `window.open()`, which Electron turns into a brand-new default
  // BrowserWindow unless told otherwise - would still show it. A kiosk app
  // has no use for that menu on any window, ever, so this is app-wide
  // rather than something to repeat per window.
  Menu.setApplicationMenu(null)

  registerWindowControlHandlers()
  createTray()
  currentRole = await roleSetup.getOrCreateRole()
  if (currentRole.role === 'display') await startDisplayRole(currentRole)
  else await startServerRole(currentRole)
}

app.whenReady().then(main)

app.on('window-all-closed', () => {
  app.quit()
})
