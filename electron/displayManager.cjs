// CommonJS on purpose, same reason as electron/main.cjs.
const { screen, BrowserWindow } = require('electron')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

/** monitorId (string) -> its currently-open managed BrowserWindow. */
const managedWindows = new Map()
/** monitorId (string) -> the URL last loaded into it — the guard that keeps an unrelated machine's heartbeat (which rewrites/rebroadcasts the *whole* admin.displayMachines array) from causing spurious window recreation/flicker here. */
const lastLoadedUrl = new Map()

// Same directory convention as electron/roleSetup.cjs's own display-role.json
// (see that file's comment) - physical-hardware state local to this exact
// machine, so this deliberately never goes through server/backup.ts's
// mirrorFile: cloning it onto a restored/different machine would be actively
// wrong, not just unnecessary.
const MONITOR_IDENTITIES_FILE = path.join(__dirname, '..', 'server', 'data', 'monitor-identities.json')

function readMonitorIdentities() {
  if (!existsSync(MONITOR_IDENTITIES_FILE)) return {}
  try {
    return JSON.parse(readFileSync(MONITOR_IDENTITIES_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

/**
 * Grows by one entry per physical monitor ever seen and is never pruned - a
 * monitor that's since been retired just leaves a harmless stale entry. At
 * cafe-scale monitor counts this stays a single-digit-entries file forever,
 * so this deliberately doesn't bother with pruning logic.
 */
function writeMonitorIdentities(identities) {
  mkdirSync(path.dirname(MONITOR_IDENTITIES_FILE), { recursive: true })
  writeFileSync(MONITOR_IDENTITIES_FILE, JSON.stringify(identities, null, 2), 'utf-8')
}

/**
 * `{ label, internal, sizeKey }` - deliberately excludes `display.id`/
 * `bounds` (Electron/Chromium's own transient per-session id, and window
 * position - both volatile across reboots) and `display.rotation` itself (a
 * user-changeable setting, not hardware identity). `sizeKey` is built from
 * the physical pixel dimensions (`display.size` scaled by `scaleFactor`,
 * approximating native resolution rather than the DPI-scaled DIPs Electron
 * reports directly - using the raw DIP value would mean toggling Windows
 * display scaling on the same physical monitor mints a fresh id) in
 * orientation-normalized `max x min` form, since `display.size` itself flips
 * with rotation (a 1920x1080 panel rotated to portrait reports 1080x1920) -
 * the max/min form is what actually makes the fingerprint rotation-invariant,
 * not merely omitting rotation from the fingerprint. `display.label` is only
 * populated on Windows/macOS per Electron's own docs; on Linux every display
 * falls into the `'(unlabeled)'` bucket and is disambiguated by position
 * only (acceptable - that install path is single-display kiosk hardware in
 * practice, not the multi-monitor Windows scenario this exists for).
 */
function fingerprintFor(display) {
  const label = display.label || '(unlabeled)'
  const w = Math.round(display.size.width * display.scaleFactor)
  const h = Math.round(display.size.height * display.scaleFactor)
  const sizeKey = `${Math.max(w, h)}x${Math.min(w, h)}`
  return { label, internal: display.internal, sizeKey }
}

/**
 * Resolves a locally-persisted, fingerprint-based stable id for each of
 * `displays`, reusing the same id across reboots/cable replugs instead of
 * Electron's own transient per-session `display.id`. When several
 * currently-attached displays share an identical fingerprint (e.g. two
 * identical monitor models at the same resolution), disambiguates
 * deterministically by left-to-right `bounds.x` order and pairs each
 * position with the Nth previously-persisted id sharing that fingerprint (in
 * the order those ids were first minted) - imperfect if the physical
 * left/right arrangement changes between boots (a survivor among two unplugged
 * identical twins can inherit the wrong one's id until both are reattached in
 * their original arrangement), but a documented, sane heuristic given no
 * EDID-serial access without a native module. Mints and persists a fresh
 * `crypto.randomUUID()` (same as roleSetup.cjs already does for machineID) on
 * a miss.
 */
function resolveMonitorIds(displays) {
  const identities = readMonitorIdentities()
  let dirty = false

  const groups = new Map()
  for (const display of displays) {
    const fingerprint = fingerprintFor(display)
    const key = `${fingerprint.label}|${fingerprint.internal}|${fingerprint.sizeKey}`
    if (!groups.has(key)) groups.set(key, { fingerprint, displays: [] })
    groups.get(key).displays.push(display)
  }

  const idByDisplayId = new Map()
  for (const { fingerprint, displays: group } of groups.values()) {
    const candidateIds = Object.entries(identities)
      .filter(([, value]) => value.label === fingerprint.label && value.internal === fingerprint.internal && value.sizeKey === fingerprint.sizeKey)
      .map(([id]) => id)
    const ordered = group.length > 1 ? [...group].sort((a, b) => a.bounds.x - b.bounds.x) : group

    ordered.forEach((display, index) => {
      let stableId = candidateIds[index]
      if (!stableId) {
        stableId = crypto.randomUUID()
        identities[stableId] = fingerprint
        candidateIds.push(stableId)
        dirty = true
      }
      idByDisplayId.set(display.id, stableId)
    })
  }

  if (dirty) writeMonitorIdentities(identities)
  return idByDisplayId
}

/**
 * Every physical monitor Electron currently detects, each paired with a
 * fingerprint-based id that stays stable across reboots/cable replugs (see
 * `resolveMonitorIds`) and a human label. `excludeDisplayId` (this machine's
 * own primary/admin display) is left out entirely so it can never be
 * assigned a Screen and hijacked.
 */
function detectMonitors(excludeDisplayId) {
  const displays = screen.getAllDisplays().filter((display) => display.id !== excludeDisplayId)
  const stableIds = resolveMonitorIds(displays)
  return displays.map((display) => ({
    id: stableIds.get(display.id),
    label: `${display.size.width}x${display.size.height}${display.internal ? ' (built-in)' : ''}`,
    display,
  }))
}

function urlForMonitor(baseUrl, assignedScreenID) {
  return assignedScreenID ? `${baseUrl}/screens/${assignedScreenID}?unattended=1` : `${baseUrl}/display-standby`
}

/**
 * Creates a kiosk window pinned to `display`'s own bounds. Positioned there
 * *before* enabling kiosk mode, and only actually enabled once the window
 * reports `ready-to-show` rather than immediately after construction — on
 * Windows, calling `setKiosk`/fullscreen too early can still land the
 * window on the wrong monitor if it hasn't finished settling at its target
 * position yet.
 */
function openManagedWindow(monitorId, display, url) {
  const window = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    show: false,
    autoHideMenuBar: true,
  })
  window.once('ready-to-show', () => {
    window.setKiosk(true)
    window.show()
  })
  window.loadURL(url)
  window.on('closed', () => {
    managedWindows.delete(monitorId)
    lastLoadedUrl.delete(monitorId)
  })
  managedWindows.set(monitorId, window)
  lastLoadedUrl.set(monitorId, url)
}

/**
 * Brings every currently-detected monitor's window in line with `monitors`
 * (this machine's own entry from `admin.displayMachines`, via
 * `electron/syncClient.cjs`) — opens a window for a newly-detected monitor,
 * closes one for a monitor no longer physically present, and only reloads
 * an existing window if its URL actually changed since the last reconcile.
 */
function reconcile(baseUrl, monitors, excludeDisplayId) {
  const detected = detectMonitors(excludeDisplayId)
  const detectedIds = new Set(detected.map((monitor) => monitor.id))

  for (const [monitorId, window] of managedWindows) {
    if (!detectedIds.has(monitorId)) window.close()
  }

  for (const monitor of detected) {
    const assignedScreenID = monitors.find((reported) => reported.id === monitor.id)?.assignedScreenID ?? null
    const url = urlForMonitor(baseUrl, assignedScreenID)
    const existingWindow = managedWindows.get(monitor.id)

    if (!existingWindow) {
      openManagedWindow(monitor.id, monitor.display, url)
      continue
    }
    if (lastLoadedUrl.get(monitor.id) !== url) {
      lastLoadedUrl.set(monitor.id, url)
      existingWindow.loadURL(url)
    }
  }
}

module.exports = { detectMonitors, reconcile }
