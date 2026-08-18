/** How a display registered itself: `electron` — a kiosk machine's own detected monitor (see `electron/displayManager.cjs`); `url` — a plain browser tab that visited `/display-connect` (no Electron involved), identified by a `localStorage`-persisted id instead of a real monitor; `mobile` — the ADHDisplay Companion app (Expo, Android/iOS/Windows/Linux), which must be approved by an admin clicking Approve in Display Manager (see `DisplayPairingRequest`) before its heartbeat is accepted, unlike the other two. */
export type DisplayConnectionType = 'electron' | 'url' | 'mobile'

/** One physical monitor (or, for a `url`-connection machine, the one synthetic "monitor" standing in for that browser tab). `id` is stable across heartbeats from the same machine/tab so an admin's `assignedScreenID` choice survives them. */
export interface DisplayMonitor {
  id: string
  label: string
  assignedScreenID: string | null
}

/** A `mobile` (ADHDisplay Companion) machine's own reported update mechanism: `1` (OTA-only, the default until device-owner status is known), `2` (silent APK install, device-owner provisioned), `3` (prompted APK install, "install unknown apps" granted). See the Update Channel spec §5.2/§1. */
export type DisplayUpdateTier = 1 | 2 | 3

/**
 * An admin-set ceiling on how large an image this display is allowed to request, in pixels of width.
 * `'auto'` (the default) lets the page pick purely from how large the image actually renders.
 *
 * Exists because a fleet is not uniform: the same screen shown on a current mini-PC and on a cheap
 * Android TV stick are very different workloads, and only an admin knows which units are weak. A cap
 * is a per-*unit* property (it describes the hardware) rather than a per-screen one, which is why it
 * lives here rather than on `ScreenConfig`.
 *
 * Values map onto the derivative ladder `server/uploads.ts` generates (`UPLOAD_VARIANT_SUFFIXES`) —
 * a cap picks the largest variant at or below it, so `480` resolves to `-tiny`, `1920` to `-medium`
 * (1600px, the largest derivative), and `3840` allows the untouched original.
 */
export type DisplayMaxImagePx = 'auto' | 3840 | 1920 | 800 | 480

/** The `DisplayMaxImagePx` options in the order Display Manager offers them, widest first. `1920` is what the UI recommends: it matches a 1080p panel, the most common display in a fleet. */
export const DISPLAY_MAX_IMAGE_PX_OPTIONS: DisplayMaxImagePx[] = ['auto', 3840, 1920, 800, 480]

/**
 * An admin-set **CSS layout width** for this display, in px — the viewport the kiosk page lays itself
 * out against, independent of how many physical pixels the panel actually has. `'auto'` (the default)
 * keeps `index.html`'s own `width=device-width`, i.e. exactly today's behavior.
 *
 * **Why this exists (measured on hardware, 2026-08-18).** Android's WebView enforces a **minimum font
 * size of 8 CSS px**. This fleet's TV reports a 960x540 CSS viewport, where a dense catalogue pane
 * (313x268 CSS px) needs roughly 5.3px text to fit — below the clamp. So `useShrinkToFitFontScale`
 * keeps shrinking the CSS value while the *rendered* size stays pinned at 8px, never fits, and bottoms
 * out at `MIN_SCALE` with the content still overflowing. Desktop has no such clamp, which is why the
 * same screen looked different there.
 *
 * The clamp is expressed in CSS px, so widening the CSS viewport shrinks the fraction of a pane it
 * covers. Forcing 1920 on that same TV moved the pane to 629 CSS px and resolved a scale of 0.71 at a
 * rendered 21px with zero overflow — comfortably above `MIN_LEGIBLE_SCALE`, i.e. the regime the
 * shrink-to-fit design was actually built for.
 *
 * **This is not the panel's resolution and does not change raster cost.** On the test unit
 * `devicePixelRatio` is 2 because Android's *density* is 320 (320/160), not because there are more
 * pixels; the drawing surface stays whatever `wm size` says. Widening the CSS viewport changes the
 * units layout is computed in, not the number of pixels painted.
 *
 * **Every offered tier cleared the clamp on the pane above when measured** — 1280 resolved 0.64 at a
 * rendered 12.5px, 1920 resolved 0.71 at 21.0px. (An earlier estimate here predicted 1280 would fail;
 * that was wrong because it assumed the required *scale* is constant across viewports. It is not: a
 * wider pane fits more text per line, so fewer lines are needed and a higher scale fits. Only measure
 * this, never derive it.) Headroom above the clamp still grows with the tier, so a denser pane than
 * the one tested can plausibly still clamp at 1280 while clearing at 1920 — which is why `1920` is
 * what the UI recommends.
 *
 * A per-*unit* property for the same reason `DisplayMaxImagePx` is: it describes the hardware, so it
 * belongs here rather than on `ScreenConfig`.
 */
export type DisplayRenderWidth = 'auto' | 3840 | 2560 | 1920 | 1280

/** The `DisplayRenderWidth` options in the order Display Manager offers them, widest first — 4K, 1440p, 1080p, 720p. `1920` is what the UI recommends; see `DisplayRenderWidth` for why `1280` is deliberately not a fix for font clamping. */
export const DISPLAY_RENDER_WIDTH_OPTIONS: DisplayRenderWidth[] = ['auto', 3840, 2560, 1920, 1280]

/** A machine (or browser tab) that has heartbeated itself in at least once — see `POST /display-machines/heartbeat` in `server/index.ts`. `machineID` is generated once and persisted (see `display-role.json` for Electron, `localStorage` for a `url` connection) so the same physical device/tab keeps being recognized across restarts/reloads. */
export interface DisplayMachine {
  machineID: string
  /** This machine's own self-reported name, re-sent (and so overwritten) on every heartbeat — never what an admin typed into Display Manager's own label field, see `customLabel`. */
  label: string
  /** An admin's own override for this machine's displayed name (Display Manager's own editable label field) — kept as a separate field, rather than writing straight into `label` itself, specifically so it survives this machine's own next heartbeat (which always overwrites `label` unconditionally) the same way `assignedScreenID` already survives one. `null`/absent falls back to showing `label`. */
  customLabel?: string | null
  connectionType: DisplayConnectionType
  monitors: DisplayMonitor[]
  lastSeenAt: string
  /**
   * Native app version fields, self-reported every heartbeat by a `mobile`
   * connection only (`electron`/`url` connections never send these — see
   * `sendHeartbeat` in `adhdisplay-companion/src/lib/pairing.ts`) — same
   * "overwritten every heartbeat, never defaulted" semantics as `label`.
   * Absent means this machine hasn't heartbeated since this field was added
   * (a pre-Update-Channel client) — this must stay visibly `unknown`
   * server-side rather than being defaulted to look current, per the Update
   * Channel spec §5.3's "fail visible" rule.
   */
  versionCode?: number
  /** Human-readable app version, e.g. `"0.2.13"` — `app.json`'s own `version` field at build time. */
  versionName?: string
  /** `Updates.runtimeVersion` — determines OTA eligibility (spec §2.3's `fingerprint` policy). */
  runtimeVersion?: string
  /** `Updates.updateId` — which bundle is actually running; `null` while still on the embedded (never-OTA'd) bundle. */
  updateId?: string | null
  /** `Updates.isEmbeddedLaunch` — distinguishes "no OTA applied yet" from "an OTA bundle is running." */
  isEmbeddedLaunch?: boolean
  updateTier?: DisplayUpdateTier
  /**
   * Admin-set image-resolution ceiling for this unit — see `DisplayMaxImagePx`. Absent means
   * `'auto'`.
   *
   * Same "survives the heartbeat" semantics as `customLabel`: this is typed by an admin in Display
   * Manager, so it must live in a field `mergeDisplayMachineHeartbeat` never overwrites, unlike
   * `label`/`versionName`/`updateTier` which every heartbeat re-reports.
   */
  maxImagePx?: DisplayMaxImagePx
  /**
   * Admin-set CSS layout width for this unit — see `DisplayRenderWidth` for what it does and the
   * measurement that motivated it. Absent means `'auto'` (today's `width=device-width`), so an
   * existing unit is unaffected until an admin opts it in.
   *
   * Same "survives the heartbeat" semantics as `customLabel`/`maxImagePx`: an admin types this in
   * Display Manager, so it must live in a field `mergeDisplayMachineHeartbeat` never overwrites.
   */
  renderWidthPx?: DisplayRenderWidth
}

/**
 * A `mobile` (ADHDisplay Companion) device that has announced itself via
 * `POST /display-machines/pairing-heartbeat` but hasn't yet been approved by
 * an admin clicking Approve in Display Manager. A separate, parallel array
 * to `DisplayMachine` — not a `pairingStatus` field bolted onto it — so
 * every existing consumer of `admin.displayMachines` (Display Manager's own
 * assignment dropdown, `server/assistant/entities/displayManager.ts`,
 * `server/storageCleanup.ts`'s staleness sweep, `ScreenDisplay.tsx`'s
 * machine lookup, `DeveloperDocsView.tsx`) keeps assuming every entry there
 * is a real, joined display, with no filtering to add. Precedent:
 * `admin.displayMachineCloseRequests` already lives alongside
 * `admin.displayMachines` as its own array for a related-but-distinct
 * concern.
 */
export interface DisplayPairingRequest {
  machineID: string
  label: string
  createdAt: string
  lastSeenAt: string
}

export type DisplayUpdateProgressStatus = 'downloading' | 'installing' | 'awaiting-heartbeat' | 'update-failed'

/**
 * One in-flight (or recently failed) update run for one display — tracked
 * separately from `DisplayMachine` for the same reason `DisplayPairingRequest`
 * above is (see its own doc comment): hub-decided/hub-progressed fields the
 * device itself doesn't report. A device can't report its own "installing"
 * — during a Tier 2/3 install it's expected to be mid-process-kill (Update
 * Channel spec §3.3.4) — so this array is written and cleared entirely by
 * the hub, never by a device's own heartbeat.
 *
 * Deliberately has no `'current'` status: once a device's own heartbeat
 * shows it reached `targetUpdateId`, the hub removes its entry here
 * entirely rather than recording a terminal "current" one —
 * `resolveDisplayUpdateState` (`src/utils/displayUpdateState.ts`) already
 * derives `current` for free from the ordinary heartbeat data at that exact
 * moment, so a stored "current" status would just be a redundant, separately
 * decaying copy of the same fact.
 *
 * Tier 1 (OTA) completion is detected via `targetUpdateId` (the bundle the
 * hub pushed); Tier 2/3 (APK, commit 7) via `targetVersionCode` (the native
 * build the hub pushed) — exactly one of the two is ever set per entry,
 * matching whichever mechanism `pushUpdateTriggersForNewEntries` in
 * `server/index.ts` actually dispatched for that run. `status` starts at
 * `awaiting-heartbeat` directly for an OTA push (there's no
 * server-observable "downloading"/"installing" phase for a pure OTA fetch)
 * — `downloading`/`installing` are real, reachable states for a Tier 2/3
 * run, though nothing reports those intermediate transitions back to the
 * hub yet (the device is expected to go mid-process-kill during the actual
 * install per spec §3.3.4, so there's a narrow, real window to report from
 * before that happens — not built in this pass; every APK push today also
 * starts at `awaiting-heartbeat` directly, same as OTA).
 */
export interface DisplayUpdateProgress {
  machineID: string
  status: DisplayUpdateProgressStatus
  startedAt: string
  /** The `Updates.updateId` this run expects to see reported on a future heartbeat — how the hub recognizes both completion (`mergeDisplayMachineHeartbeat` in `server/index.ts`) and staleness (the update-failure sweep, same file). Set only for a Tier 1 (OTA) run. */
  targetUpdateId?: string
  /** The `versionCode` this run expects to see reported on a future heartbeat — same completion/staleness mechanism as `targetUpdateId`, for a Tier 2/3 (APK) run instead. */
  targetVersionCode?: number
}

/**
 * A `mobile` (ADHDisplay Companion) machine's own remote-navigation
 * override — the display's own D-pad "commit" (Remote Screen Navigation
 * spec §D1) locally overriding its admin-assigned screen until an admin
 * either reassigns it (which clears this entry — deliberate/explicit beats
 * local/older, see `server/index.ts`'s own write-handler side effect) or
 * clears it directly via Display Manager's "Return to assigned" action
 * (commit 11). A separate, parallel array to `DisplayMachine` for the same
 * reason `DisplayPairingRequest`/`DisplayUpdateProgress` above are (see
 * their own doc comments) — this is hub-persisted state a device's own
 * heartbeat never reports and never should, since the override is written
 * by the hub in response to the device's own `screen-override` WS message
 * (`server/deviceSocket.ts`), not by the heartbeat route.
 *
 * `effectiveScreen = override ?? assignment` is resolved in exactly one
 * place, hub-side (`resolveEffectiveScreen` in `server/index.ts`) — the
 * display never decides which of the two it's showing, it only ever
 * renders whatever `effective-screen` push it was last given. A *preview*
 * (browsing before pressing OK) never reaches this far — it's client-local
 * only, see `adhdisplay-companion/src/lib/remoteNav.ts` (commit 10b).
 */
export interface DisplayScreenOverride {
  machineID: string
  screenId: string
  setAt: string
}
