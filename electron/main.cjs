// CommonJS on purpose: package.json sets "type": "module", which would make a
// plain .js file load as ESM here; Electron's main process is simplest as CJS.
const { app, BrowserWindow } = require('electron')
const http = require('node:http')

// Kept in sync with the URL constant at the top of installer/start-wraps-coffee.bat.
// Point this at a specific /screens/:screenId instead of /admin if this machine
// is a signage screen rather than the owner's own dashboard machine.
const APP_URL = process.env.WRAPS_COFFEE_URL ?? 'http://localhost:4173/admin'

const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 60000

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

async function createWindow() {
  const loadingWindow = new BrowserWindow({
    width: 480,
    height: 200,
    frame: false,
    resizable: false,
    center: true,
  })
  loadingWindow.loadURL(
    'data:text/html,<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#eee"><p>Starting Wraps &amp; Coffee&hellip;</p></body>',
  )

  try {
    await waitForServer(APP_URL, POLL_TIMEOUT_MS)
  } catch (error) {
    console.error(error)
    app.quit()
    return
  }

  const kioskWindow = new BrowserWindow({
    kiosk: true,
    autoHideMenuBar: true,
  })
  kioskWindow.loadURL(APP_URL)
  kioskWindow.once('ready-to-show', () => loadingWindow.close())
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})
