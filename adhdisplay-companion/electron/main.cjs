// CommonJS on purpose, matching the main ADHDisplay app's own electron/main.cjs
// naming convention — this package has no "type": "module" set, so a plain
// .cjs extension isn't strictly required here the way it is there, but kept
// anyway so the two shells read the same at a glance.
const { app, BrowserWindow, Tray, Menu, nativeImage, net, protocol } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const DIST_DIR = path.join(__dirname, '..', 'dist')

// Must be called before app.whenReady() resolves, same reasoning as the main
// app's own electron/main.cjs — this kiosk window has no user around to
// click anything first, so unmuted signage video needs to be able to
// autoplay without a prior gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Registers a custom "app://" scheme that serves the Expo web export
// (adhdisplay-companion/dist/, produced by `npm run build:web`) straight off
// disk via protocol.handle below — no local HTTP server, no port, no
// firewall rule needed. `standard: true` is what makes the web build's own
// root-absolute asset paths (e.g. "/assets/...") resolve correctly, the same
// way they would under a real http:// origin.
//
// Deliberately NOT `secure: true`, even though Electron's own docs example
// sets it: DisplayScreen.web.tsx embeds the LAN server's page — always plain
// http://, never TLS — in an <iframe>. If this shell's own origin were
// treated as "secure", that iframe would be blocked outright as mixed
// content instead of just loading. Do not "fix" this by adding secure: true.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

let tray = null
let kioskWindow = null

/** Serves `adhdisplay-companion/dist/<pathname>` for any `app://` request, defaulting to `index.html` at the root. */
function registerAppProtocol() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const relativePath = pathname === '/' || pathname === '' ? '/index.html' : pathname
    const filePath = path.join(DIST_DIR, decodeURIComponent(relativePath))
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

/**
 * Icon in the notification area — kiosk mode has no title bar or close
 * button by design, so this is the only way to tell the app is running,
 * bring it back to the front, or quit it without Task Manager. Reuses the
 * app's own icon asset rather than shipping a separate tray-specific one,
 * same pattern as the main app's own createTray().
 */
function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('ADHDisplay Companion')

  const showWindow = () => {
    if (!kioskWindow) return
    kioskWindow.show()
    kioskWindow.focus()
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show ADHDisplay Companion', click: showWindow },
      { type: 'separator' },
      { label: 'Quit ADHDisplay Companion', click: () => app.quit() },
    ]),
  )
  tray.on('click', showWindow)
}

/** Same console/error-forwarding + optional DevTools setup as the main app's own instrumentWindow(), gated behind its own distinct debug env var. */
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
  if (process.env.ADHDISPLAY_COMPANION_DEBUG === '1') {
    window.webContents.openDevTools({ mode: 'detach' })
  }
}

async function main() {
  // Removes the native File/Edit/View/Window/Help menu bar app-wide — kiosk
  // mode has no use for it, same as the main app's own electron/main.cjs.
  Menu.setApplicationMenu(null)

  registerAppProtocol()
  createTray()

  kioskWindow = new BrowserWindow({ kiosk: true, autoHideMenuBar: true, show: false })
  instrumentWindow(kioskWindow)
  kioskWindow.loadURL('app://companion/index.html')
  kioskWindow.once('ready-to-show', () => kioskWindow.show())
}

app.whenReady().then(main)

app.on('window-all-closed', () => {
  app.quit()
})
