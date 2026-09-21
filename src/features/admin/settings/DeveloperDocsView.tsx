import { useEffect, useState } from 'react'
import { Button, Card } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { getDeveloperKey, regenerateDeveloperKey } from '../../../lib/localServer'
import './DeveloperDocsView.scss'

/** Every `SYNCED_KEY` (see `src/types/sync.ts`) paired with its own one-line description key — kept in sync with that list by hand; see the `keep-in-sync` skill. */
const SYNCED_KEY_DOCS: { key: string; descKey: string }[] = [
  { key: 'admin.products', descKey: 'admin.settings.developerDocs.keyProducts' },
  { key: 'admin.categoryPrices', descKey: 'admin.settings.developerDocs.keyCategoryPrices' },
  { key: 'admin.catalogues', descKey: 'admin.settings.developerDocs.keyCatalogues' },
  { key: 'admin.messages', descKey: 'admin.settings.developerDocs.keyMessages' },
  { key: 'admin.events', descKey: 'admin.settings.developerDocs.keyEvents' },
  { key: 'admin.contactInfo', descKey: 'admin.settings.developerDocs.keyContactInfo' },
  { key: 'admin.storeSettings', descKey: 'admin.settings.developerDocs.keyStoreSettings' },
  { key: 'admin.appearanceThemes', descKey: 'admin.settings.developerDocs.keyAppearanceThemes' },
  { key: 'admin.textSizePresets', descKey: 'admin.settings.developerDocs.keyTextSizePresets' },
  { key: 'admin.clockFormat', descKey: 'admin.settings.developerDocs.keyClockFormat' },
  { key: 'admin.dateFormat', descKey: 'admin.settings.developerDocs.keyDateFormat' },
  { key: 'admin.paneLanguage', descKey: 'admin.settings.developerDocs.keyPaneLanguage' },
  { key: 'admin.screensaverSchedule', descKey: 'admin.settings.developerDocs.keyScreensaverSchedule' },
  { key: 'admin.dashboardScreensaver', descKey: 'admin.settings.developerDocs.keyDashboardScreensaver' },
  { key: 'admin.screens', descKey: 'admin.settings.developerDocs.keyScreens' },
  { key: 'admin.displayMachines', descKey: 'admin.settings.developerDocs.keyDisplayMachines' },
  { key: 'admin.displayMachineCloseRequests', descKey: 'admin.settings.developerDocs.keyDisplayMachineCloseRequests' },
  { key: 'admin.displayPairingRequests', descKey: 'admin.settings.developerDocs.keyDisplayPairingRequests' },
  { key: 'admin.displayUpdateState', descKey: 'admin.settings.developerDocs.keyDisplayUpdateState' },
  { key: 'admin.displayScreenOverride', descKey: 'admin.settings.developerDocs.keyDisplayScreenOverride' },
  { key: 'admin.integrations', descKey: 'admin.settings.developerDocs.keyIntegrations' },
  { key: 'admin.transitDepartures', descKey: 'admin.settings.developerDocs.keyTransitDepartures' },
  { key: 'admin.sidebarSettings', descKey: 'admin.settings.developerDocs.keySidebarSettings' },
  { key: 'admin.orders', descKey: 'admin.settings.developerDocs.keyOrders' },
  { key: 'admin.messageBoards', descKey: 'admin.settings.developerDocs.keyMessageBoards' },
  { key: 'admin.messageBoardPosts', descKey: 'admin.settings.developerDocs.keyMessageBoardPosts' },
  { key: 'admin.woltConfig', descKey: 'admin.settings.developerDocs.keyWoltConfig' },
  { key: 'admin.woltOrders', descKey: 'admin.settings.developerDocs.keyWoltOrders' },
  { key: 'admin.foodoraConfig', descKey: 'admin.settings.developerDocs.keyFoodoraConfig' },
  { key: 'admin.foodoraOrders', descKey: 'admin.settings.developerDocs.keyFoodoraOrders' },
]

/**
 * Reference documentation for the local LAN server's HTTP and WebSocket
 * API — everything a custom client (a script, a different display app, a
 * kiosk not built with this codebase) would need to read or write this
 * cafe's own data. Purely static content (no live requests made from this
 * page itself); kept accurate by hand against `server/index.ts` and
 * `src/types/sync.ts` — see the `keep-in-sync` skill, which
 * exists specifically so future endpoint/key changes update this page too.
 */
export function DeveloperDocsView() {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [isLoadingKey, setIsLoadingKey] = useState(true)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    getDeveloperKey(session.token)
      .then(setApiKey)
      .catch(() => setKeyError(t('admin.settings.developerDocs.keyLoadError')))
      .finally(() => setIsLoadingKey(false))
  }, [session, t])

  const handleRegenerate = () => {
    if (!session) return
    setIsRegenerating(true)
    setKeyError(null)
    regenerateDeveloperKey(session.token)
      .then(setApiKey)
      .catch(() => setKeyError(t('admin.settings.developerDocs.keyRegenerateError')))
      .finally(() => setIsRegenerating(false))
  }

  return (
    <div className="developer-docs">
      <Card title={t('admin.settings.developerDocs.overviewTitle')}>
        <p>{t('admin.settings.developerDocs.overviewText')}</p>
      </Card>

      <Card title={t('admin.settings.developerDocs.authTitle')}>
        <p>{t('admin.settings.developerDocs.authText')}</p>
        <p>{t('admin.settings.developerDocs.loginText')}</p>
        <pre>
          <code>{`POST /login
{ "username": "...", "password": "..." }

→ 200 { "token": "...", "username": "...", "role": "admin" | "subadmin" | "limited", "allowedSections"?: [...] }
→ 401 { "error": "Invalid username or password" }`}</code>
        </pre>
        <p>{t('admin.settings.developerDocs.logoutText')}</p>
        <pre>
          <code>{`POST /logout
{ "token": "..." }

→ 200 { "ok": true }`}</code>
        </pre>
        <p>{t('admin.settings.developerDocs.roleText')}</p>

        <p>{t('admin.settings.developerDocs.serverInfoText')}</p>
        <pre>
          <code>{`GET /server-info                  (public — no token needed)
→ 200 { "app": "adhdisplay", "lanIp": "192.168.1.23" | null, "version": "0.1.0", "wsPort": 4000, "contentPort": 4173, "storeName"?: "..." }

storeName is the store's own configured name (admin.storeSettings), included only when non-empty — unlike the
mDNS presence advertisement's own copy of this value, this one is not length-capped (no DNS packet-size
constraint applies to a plain JSON response), so it can differ from the mDNS TXT record's version for a very
long name.`}</code>
        </pre>

        <p>{t('admin.settings.developerDocs.screenAddressText')}</p>
        <pre>
          <code>{`GET /screen-address                (public — no token needed)
→ 200 { "mode": "automatic" | "custom" | "mdns", "customHost"?: string, "mdnsName"?: string }

POST /screen-address                (Authorization: Bearer <token>, admin/subadmin only)
{ "mode": "automatic" | "custom" | "mdns", "customHost"?: string, "mdnsName"?: string }
→ 200 { "mode", "customHost"?, "mdnsName"? }   (mdnsName is sanitized server-side to lowercase alphanumeric + hyphens)
→ 403 { "error": "..." }   (a "limited" account's own token)`}</code>
        </pre>

        <p>{t('admin.settings.developerDocs.windowLaunchMethodText')}</p>
        <pre>
          <code>{`GET /window-launch-method          (public — no token needed)
→ 200 { "method": "auto" | "electron" | "edge" }

POST /window-launch-method         (Authorization: Bearer <token>, admin/subadmin only)
{ "method": "auto" | "electron" | "edge" }
→ 200 { "method" }
→ 403 { "error": "..." }   (a "limited" account's own token)`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.usersTitle')}>
        <p>{t('admin.settings.developerDocs.usersIntro')}</p>
        <pre>
          <code>{`GET /users                        (Authorization: Bearer <token>, admin/subadmin only)
→ 200 [{ "id", "username", "role", "allowedSections"? }, ...]   (no passwords included)

POST /users                       (Authorization: Bearer <token>, admin/subadmin only)
{ "username": "...", "password": "...", "role": "admin" | "subadmin" | "limited", "allowedSections"?: [...] }
→ 200 { "id", "username", "role", "allowedSections"? }
→ 403 { "error": "..." }   (a "subadmin" token creating an "admin"-role account)
→ 409 { "error": "..." }   (username already taken)

DELETE /users/<id>                (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "ok": true }
→ 400 { "error": "..." }   (deleting your own account, or the last remaining admin account)
→ 403 { "error": "..." }   (a "subadmin" token deleting an "admin"-role account)
→ 404 { "error": "User not found" }

POST /users/<id>/password         (Authorization: Bearer <token>, admin/subadmin only)
{ "password": "..." }
→ 200 { "ok": true }
→ 404 { "error": "User not found" }`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.syncTitle')}>
        <p>{t('admin.settings.developerDocs.syncIntro')}</p>
        <p className="developer-docs__endpoint">
          <code>ws://&lt;this page&apos;s hostname&gt;:4000</code>
        </p>

        <p>{t('admin.settings.developerDocs.syncHelloText')}</p>
        <pre>
          <code>{`{ "type": "hello", "keys": ["admin.products", "admin.screens"] }`}</code>
        </pre>

        <p>{t('admin.settings.developerDocs.syncSnapshotText')}</p>
        <pre>
          <code>{`{ "type": "snapshot", "state": {
  "admin.products": { "seeded": false, "value": [...], "revision": 42 },
  "admin.screens": { "seeded": false, "value": [...], "revision": 7 }
} }`}</code>
        </pre>

        <p>{t('admin.settings.developerDocs.syncUpdateText')}</p>
        <pre>
          <code>{`{ "type": "update", "key": "admin.products", "value": [...], "revision": 43 }`}</code>
        </pre>
        <p>{t('admin.settings.developerDocs.syncRevisionText')}</p>

        <p>{t('admin.settings.developerDocs.syncWriteText')}</p>
        <pre>
          <code>{`{ "type": "write", "key": "admin.products", "value": [...], "token": "..." }`}</code>
        </pre>

        <h3>{t('admin.settings.developerDocs.syncKeysTitle')}</h3>
        <ul className="developer-docs__key-list">
          {SYNCED_KEY_DOCS.map(({ key, descKey }) => (
            <li key={key}>
              <code>{key}</code>
              <span>{t(descKey)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t('admin.settings.developerDocs.uploadsTitle')}>
        <p>{t('admin.settings.developerDocs.uploadsIntro')}</p>
        <pre>
          <code>{`POST /uploads                     (Authorization: Bearer <token>, body = raw file bytes, max 25MB — format is sniffed from the bytes, not the Content-Type header; HEIC/HEIF/TIFF/AVIF are accepted and converted to JPEG)
→ 201 { "url": "http://.../uploads/<uuid>.<ext>" }
POST /uploads?purpose=screen-preview   (same, but stored as "screen-preview-<uuid>.<ext>" and hidden from GET /uploads below)

POST /uploads/video                (Authorization: Bearer <token>, body = raw file bytes, any format, max 500MB)
→ 202 { "id", "filename": "<uuid>.mp4", "url", "status": "processing" }
  (transcodes to H.264/AAC MP4 in the background — poll GET /uploads for this filename until "status" clears or becomes "failed")

POST /uploads/video/<id>/retry     (Authorization: Bearer <token>)
→ 202 { "id", "filename", "status": "processing" }   (re-attempts a failed transcode from its still-staged source, no re-upload needed)
→ 404   (staged source already gone — succeeded, deleted, or swept after 48h abandoned)

GET /uploads/<filename>           (public — no token needed)
GET /uploads/<filename>?size=thumb   (240px WebP — an image's thumbnail, or a video's poster frame, if it exists)
GET /uploads/<filename>?size=tiny    (480px WebP, images only, if it exists)
GET /uploads/<filename>?size=small   (800px WebP, images only, if it exists)
GET /uploads/<filename>?size=medium  (1600px WebP, images only, if it exists)
GET /uploads/<filename>?size=blur    (480px WebP, pre-blurred, images only, if it exists)
   (any missing variant falls back to the original — e.g. an upload saved before that size existed)

GET /uploads                      (Authorization: Bearer <token> — lists every original, image or video)
→ 200 [{ "filename", "url", "thumbUrl", "sizeBytes", "uploadedAt", "kind": "image" | "video", "status"?: "processing" | "failed", "errorMessage"?, "displayName"? }, ...]
   (excludes auto-captured screen previews — files named "screen-preview-<uuid>.<ext>", plus any
    captured before that prefix existed. They still exist, are still served by GET /uploads/<filename>,
    and still count toward /uploads/storage; they're just not offered as browsable media. Read them
    from a screen's own previewImages instead.)

PATCH /uploads/<filename>/name     (Authorization: Bearer <token>, body = { "displayName": string })
→ 200 { "displayName" }   (empty string clears it)

GET /uploads/storage               (Authorization: Bearer <token>)
→ 200 { "usedBytes", "availableBytes" }

DELETE /uploads/<filename>        (Authorization: Bearer <token>)
→ 204   (also removes its -small/-thumb/-blur companions and any status/name markers; idempotent)`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.displayManagerTitle')}>
        <p>{t('admin.settings.developerDocs.displayManagerIntro')}</p>
        <pre>
          <code>{`POST /display-machines/heartbeat  (public — no token needed, same LAN-trust posture as /server-info)
{ "machineID": "...", "label": "...", "connectionType": "electron" | "url" | "mobile", "monitors": [{ "id": "...", "label": "..." }],
  "versionCode"?: number, "versionName"?: string, "runtimeVersion"?: string, "updateId"?: string | null,
  "isEmbeddedLaunch"?: boolean, "updateTier"?: 1 | 2 | 3 }
→ 200 { "ok": true, "monitors": [{ "id", "label", "assignedScreenID" }], "customLabel": "..." | null,
        "maxImagePx": "auto" | 3840 | 1920 | 800 | 480,
        "renderWidthPx": "auto" | 3840 | 2560 | 1920 | 1280, "effectiveScreenID": "..." | null }
→ 400 { "error": "..." }   (malformed body)
→ 409 { "error": "not paired", "needsPairing": true }   ("mobile" only, machineID isn't an approved admin.displayMachines entry yet)

The versionCode/versionName/runtimeVersion/updateId/isEmbeddedLaunch/updateTier fields are only ever
sent by "mobile" (ADHDisplay Companion) — see the Update Channel spec's §5.2. Overwritten unconditionally
on every heartbeat, same as "label"; absent stays absent rather than falling back to a previous value, so
a display that stops reporting these (or never did) is visibly "unknown" in Display Manager rather than
looking current — see resolveDisplayUpdateState in src/utils/displayUpdateState.ts.

"maxImagePx" is an admin-set-going-down field: it caps how large an image this display may
request, and exists because the kiosk page itself can't read it (that page is unauthenticated,
while admin.displayMachines is gated to the "displaymanager" section). The Companion forwards it
into the page URL as ?maxImagePx=. "auto" means "decide from how large the image actually renders".

"renderWidthPx" is admin-set the same way and forwarded the same way (?renderWidthPx=), and is the
CSS layout width the kiosk page rewrites its own viewport meta to before its bundle ever runs (see
the inline script in index.html). It is NOT the panel's resolution and does not change how many
pixels get drawn — it changes the units layout is computed in. It exists because Android's WebView
refuses to render text below 8 CSS px: on a 960x540 CSS viewport a dense pane can need ~5px text,
so shrink-to-fit can never make it fit, while a 1920 viewport puts the same layout comfortably above
the clamp. "auto" keeps index.html's own width=device-width. Measured on the fleet TV, every tier
cleared that clamp for the pane tested (1280 → 12.5px rendered, 1920 → 21.0px), but headroom grows
with the tier, so 1920 is the recommended default.

"effectiveScreenID" is the hub's own single resolved answer to "what should this device actually be
showing right now" — a standing admin.displayScreenOverride entry for this machine (see Remote
Screen Navigation below) if one exists, else "monitors[0].assignedScreenID" above, else null (shows
the standby screensaver). Deliberately not the same value as the plain assignment: ADHDisplay
Companion feeds this into its own remote-nav state on every heartbeat so a dropped "effective-screen"
WS push self-heals within one heartbeat interval, rather than fighting a live override every 20s by
healing toward the raw assignment instead.

Upserts by machineID into admin.displayMachines (a regular synced key, see Live data above) —
preserves each existing monitor's own assignedScreenID (matched by monitor id) and the machine's
own admin-set fields, customLabel (a rename), maxImagePx (the image cap) and renderWidthPx (the
layout width), rather than overwriting them — every
heartbeat's own "label" is that machine's self-reported name (e.g. "Display 3"), always
overwritten as-is, so an admin-typed rename has to live in this separate field to actually stick.
Actually assigning a Screen or renaming a machine is a normal authenticated write to that same key
from the Display Manager page, not this route. The response's own "customLabel" (sanitized, see
sanitizeDisplayName) is that same field pushed back down to the calling device — ADHDisplay
Companion persists it locally and starts reporting it as its own "label" from then on, so the
rename survives even a switch to a different server that's never configured a customLabel for this
machine. null when nothing is set; never an empty string. "electron"/"url" join with zero gate,
same as always; a "mobile" connectionType (ADHDisplay Companion) is the one exception — its machineID must
already exist in admin.displayMachines (put there by the approve route below), or this route
rejects it with 409/needsPairing instead of silently joining. That's what makes Display Manager's
"Remove" a real revocation for a mobile device.

Remote-close: Display Manager's own "X" button appends a machineID to
admin.displayMachineCloseRequests (also a regular synced key) instead of calling any route of its
own. Every live /display-connect or Display window watches that list for its own machineID; on a
match it stops its own heartbeat, removes its own admin.displayMachines entry, prunes its own id
back out of the close-request list, then calls window.close() (only effective on a script-opened
window, e.g. a Display window — a no-op on a plain browser tab a user navigated to directly). A
"mobile" device instead just stops re-heartbeating once removed — see the 409 above.`}</code>
        </pre>

        <p>{t('admin.settings.developerDocs.displayPairingText')}</p>
        <pre>
          <code>{`POST /display-machines/pairing-heartbeat  (public — no token needed, same LAN-trust posture as above)
{ "machineID": "...", "label": "..." }
→ 200 { "status": "approved" }   (machineID is already an approved admin.displayMachines entry)
→ 200 { "status": "pending" }    (new or still-pending request — shows up in Display Manager for one-click approval)
→ 400 { "error": "..." }   (malformed body)
→ 429 { "error": "..." }   (too many new machineIDs from this source IP recently)
→ 503 { "error": "..." }   (10 pending requests already in flight — MAX_PENDING_PAIRING_REQUESTS)

Call this every ~5s while unpaired. A pending request lazily expires after 10 minutes with no
heartbeat — see admin.displayPairingRequests above. No secret is ever typed or scanned: the device
just shows up in Display Manager's own "Pending approval" section (label + last-seen + a short
#suffix taken from its own machineID, also shown on the device's own PairingScreen so an admin can
cross-check the card against the physical device) for an admin to approve with one click.

POST /display-machines/<machineID>/approve  (Authorization: Bearer <token>, "displaymanager" section)
(empty body)
→ 200 { "ok": true, "approvedMachineID": "...", "approvedLabel": "..." }
→ 401 { "error": "..." }   /  403 { "error": "..." }   (a "limited" token without the Display Manager section)
→ 404 { "error": "..." }   (no pending request for that machineID at all)
→ 410 { "error": "..." }   (that request expired — the device will show up again on its next heartbeat)

Looks up the pending request directly by the URL's machineID (no cross-matching — the admin is
clicking the specific card for the specific device) and moves it into a real admin.displayMachines
entry (connectionType: "mobile", one synthetic monitor, id "device"), removing it from
admin.displayPairingRequests.`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.updateChannelTitle')}>
        <p>{t('admin.settings.developerDocs.updateChannelIntro')}</p>
        <pre>
          <code>{`GET /updates/manifest             (public — no token needed, the Expo Updates Protocol v1 endpoint
                                    "expo-updates" itself polls, not a route this app's own code calls)
Request headers: expo-protocol-version: 1, expo-platform: android, expo-runtime-version: "...",
                  expo-current-update-id: "..." (optional — the update the client is currently running)
→ 200, Content-Type: multipart/mixed — either a "manifest" part (a new update to fetch and apply) or a
  "directive" part { "type": "noUpdateAvailable" } (nothing published for this runtime version yet, or
  the client is already running what this hub would serve)
→ 400 { "error": "..." }   (missing/unsupported protocol headers)

GET /updates/assets/<hash>?runtimeVersion=&updateId=&path=   (public, same posture as above)
→ 200, the asset/bundle's own bytes, Content-Type from its own published metadata, cached immutably
→ 404 { "error": "..." }   (unknown update, or the hash doesn't match the file on disk)

GET /updates/apk/current           (public, same posture as above)
→ 200, Content-Type: application/vnd.android.package-archive — whatever current-apk.json points at,
  cached immutably (a new native release always gets a new versionCode and its own new file)
→ 404 { "error": "..." }   (no current APK published, or its file isn't on disk)
Downloaded by a Tier 2/3 (device-owner / install-unknown-apps) companion device's own
PackageInstallerModule.kt, which verifies the downloaded bytes' own signing certificate against its
build-time-embedded expectation before installing — this route itself attaches no signature.

POST /updates/apk?versionCode=&versionName=&runtimeVersion=&filename=[&overwrite=1]
                                    (Authorization: Bearer <token>, "displaymanager" section)
Body: the raw .apk bytes (Content-Type: application/vnd.android.package-archive or
application/octet-stream — same raw-binary-body convention /uploads and /uploads/video already use,
no multipart parser anywhere in this codebase)
→ 200 { "versionCode", "versionName", "runtimeVersion" }   (the new CurrentApkInfo)
→ 400 { "error": "..." }   (malformed versionCode/versionName/runtimeVersion/filename; filename doesn't
  match the "adhdisplay-companion-<versionName>-<versionCode>.apk" naming convention build-tv-apk.js
  itself produces; versionCode doesn't match versionName's own major*10000+minor*100+patch; wrong
  Content-Type; body isn't a signed APK — not a zip, or missing AndroidManifest.xml/a META-INF
  signing-block entry)
→ 401 { "error": "..." }   /   403 { "error": "..." }   (a "limited" token without the Display Manager
  section — the request is destroyed rather than left dangling, so a large unsent body doesn't leave
  the connection in a bad state)
→ 409 { "error": "..." }   (this versionCode is older than, or the same as, what's already published —
  pass ?overwrite=1 to publish it anyway)
→ 413 { "error": "..." }   (over the 250MB cap — enforced mid-transfer, not after the full body lands)
Streams to a ".part" temp file first, validates it, then atomically renames into place — an aborted
upload never leaves a truncated file at the exact path GET /updates/apk/current serves from. Prunes
every APK beyond the newest 3 versionCodes on success (each publish is 60MB+, twice over counting the
backup mirror). This is the one Tier 2/3 counterpart to OTA's own still-entirely-out-of-band publish
process below — see build-tv-apk.js's own dist/ output for what to upload here.

POST /updates/rollback             (Authorization: Bearer <token>, "displaymanager" section)
{ "runtimeVersion": "...", "rolledBack": boolean }
→ 200 { "ok": true }
→ 400 { "error": "..." }   (malformed body)
Flips one runtime version's rollback pin (server/updates.ts's setRollbackFlag) and immediately
pushes every currently-known display on that exact runtime version toward whatever this hub now
serves for it — spec §2.6: rollback is "serving the prior manifest and pushing the reload trigger,"
not a passive flag an admin has to separately re-trigger per device.

GET /updates/status                (Authorization: Bearer <token> — any authenticated session)
→ 200 { "currentApk": { "versionCode", "versionName", "runtimeVersion" } | null,
         "currentUpdateIdByRuntimeVersion": { "<runtimeVersion>": "<updateId>", ... },
         "rolledBackRuntimeVersions": ["<runtimeVersion>", ...] }

Mechanism dispatch: when Display Manager writes a new admin.displayUpdateState entry for a machine
(the update button or the staged bulk queue), the hub decides check-update (Tier 1, OTA) vs
install-update (Tier 2/3, APK) purely from that machine's own current updateTier field on
admin.displayMachines — never from anything the client wrote (see pushUpdateTriggersForNewEntries
in server/index.ts). A pending run completes the moment a later heartbeat reports the exact
updateId (OTA) or versionCode (APK) the hub pushed it toward; 10 minutes without that match marks
it update-failed (no automatic retry).

OTA bundle publishing is still out-of-band — this hub only serves it. A build process drops a
published update's own files under
server/data/updates/bundles/<runtimeVersion>/<updateId>/ (a metadata.json plus the actual bundle/asset
files it describes), with no HTTP route to do this through — "current" and "previous" per runtime
version are just the newest and second-newest published folders by their own createdAt, unless
Display Manager's own "revert to previous update" action has pinned that runtime version back (see
server/updates.ts's setRollbackFlag). Retention beyond current+previous is the publish process's own
job to prune, not enforced by this server. Native APK publishing, by contrast, now has a real route
— see POST /updates/apk above — which handles both the write and its own retention (newest 3
versionCodes) itself.`}</code>
        </pre>

        <p>{t('admin.settings.developerDocs.updateChannelSocketText')}</p>
        <pre>
          <code>{`ws://<this page's hostname>:4000   (same socket the Sync/WS card above uses — a companion device's
                                     own connection is distinguished purely by sending "device-hello"
                                     first, never "hello"/"write"; see server/deviceSocket.ts)

Device → hub:
{ "type": "device-hello", "machineID": "..." }
  Sent once per connection/reconnect, no token — same LAN-trust posture as the heartbeat route (this
  machineID must already be an approved admin.displayMachines entry). The hub replies immediately
  with this device's own current "navigable-set" and "effective-screen" (both below).

{ "type": "screen-override", "screenId": "..." }
  Sent once, on the remote's own OK press committing a screen selection (Remote Screen Navigation
  spec §D1) — never per-keypress while browsing. No machineID field: the hub identifies the sender
  from its own device-hello registration, not a client-supplied id. Writes admin.displayScreenOverride
  and echoes "effective-screen" back once committed.

Hub → device:
{ "type": "check-update" }                       (Tier 1 — see the mechanism-dispatch note above)
{ "type": "install-update", "mechanism": "apk" }  (Tier 2/3 — see the mechanism-dispatch note above)
{ "type": "navigable-set", "screens": [{ "screenId", "name", "previewImage": "..." | null }, ...] }
  Every published screen this device may browse to — hub-decided, never client-enumerated (so a
  café unit can't browse to another venue's screen or an unpublished draft). Pushed on device-hello
  and again whenever admin.screens itself changes, to every currently-connected device.
  "previewImage" is that screen's own stage-1 previewImages entry (see the Screens section above),
  reduced to a path+query relative to this server's own origin (e.g. "/uploads/x.webp?size=medium")
  rather than the absolute URL stored server-side, since that URL is baked to whichever origin the
  screenshot happened to be uploaded from — meaningless to a device reaching this server a different
  way. null for a screen with no screenshot yet. ADHDisplay Companion downloads and caches these
  on-device (see its own README) and shows the cached copy instead of live-loading the real kiosk
  page while browsing with the remote — only committing (OK) ever triggers a real page load.
{ "type": "effective-screen", "screenId": "..." | null }
  What this device should actually be showing right now — admin.displayScreenOverride's own entry
  for this machine if one exists, else its normal admin.displayMachines assignment, else null (shows
  the standby screensaver). See resolveEffectiveScreen in server/index.ts — this is the *only* place
  that precedence is decided; the device never chooses between the two itself. Pushed on
  device-hello and again whenever whichever of the two currently applies actually changes — an
  admin's own assignment write always wins over a standing override (clearing it) if both would
  otherwise apply, per spec §D1's writer precedence.`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.backupTitle')}>
        <p>{t('admin.settings.developerDocs.backupIntro')}</p>
        <pre>
          <code>{`GET /backups/status               (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "folderBackupAvailable": boolean, "updatedAt": string | null }

GET /backups                      (Authorization: Bearer <token>, admin/subadmin only)
→ 200, Content-Type: application/zip, Content-Disposition: attachment; filename="adhdisplay-backup-...zip"

POST /backups/restore              (Authorization: Bearer <token>, admin/subadmin only, Content-Type: application/zip, body = raw zip bytes)
→ 200 { "ok": true }
→ 400 { "error": "..." }   (not a recognized backup zip)

POST /backups/restore-from-folder  (Authorization: Bearer <token>, admin/subadmin only, no body)
→ 200 { "ok": true }
→ 400 { "error": "..." }   (no sibling ADHDisplayBackup folder found)`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.storageCleanupTitle')}>
        <p>{t('admin.settings.developerDocs.storageCleanupIntro')}</p>
        <pre>
          <code>{`GET /storage-cleanup/preview      (Authorization: Bearer <token>, admin/subadmin only)
→ 200 {
    "retentionDays": number, "displayMachineStaleDays": number,
    "orders": [{ "id", "createdAt", "customerName", "totalPrice" }],
    "messages": [{ "id", "receivedAt", "subject", "name" }],
    "messageBoardPosts": [{ "id", "title", "expiresAt" }],
    "displayMachines": [{ "machineID", "label", "lastSeenAt" }],
    "images": [{ "filename", "url", "thumbUrl", "sizeBytes", "uploadedAt" }]
  }
Never deletes anything — purely a computed preview of what's currently prunable (orders/messages
older than retentionDays, expired message-board posts, display machines not seen in
displayMachineStaleDays, and uploaded images no longer referenced by any product/event/message-board
post/screen, live or draft).

POST /storage-cleanup/apply       (Authorization: Bearer <token>, admin/subadmin only, JSON body)
body = { "orderIds"?, "messageIds"?, "messageBoardPostIds"?, "displayMachineIds"?, "imageFilenames"? }
→ 200 { "deletedOrders", "deletedMessages", "deletedMessageBoardPosts", "deletedDisplayMachines", "deletedImages" }
Deletes only the ids/filenames given, and only after re-checking each one still qualifies as
prunable at this exact moment — an id that's no longer stale (e.g. a display machine that
reconnected) or an image that started being referenced since the preview was fetched is silently
skipped rather than deleted anyway.`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.screensSnapshotsTitle')}>
        <p>{t('admin.settings.developerDocs.screensSnapshotsIntro')}</p>
        <pre>
          <code>{`GET /screens-snapshots                                    (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "snapshots": [{ "tier": "daily"|"weekly", "id": string, "capturedAt": string, "screenCount": number }] }
Every retained snapshot across both tiers, newest-first by its real capture timestamp (not the
tier id's own date/week, which can lag it — see server/screensSnapshots.ts).

GET /screens-snapshots/for-screen?screenID=<id>           (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "snapshots": [...] }
Same shape, filtered to snapshots where this one screen's own entry genuinely differs from live.

GET /screens-snapshots/:tier/:id/diff                      (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "diff": [{ "screenID", "name", "status": "changed"|"onlyInSnapshot"|"onlyInLive" }] }
→ 404 { "error": "..." }   (snapshot not found)
Which screens actually differ between the live store and this snapshot — shown before a whole-array
restore commits to overwriting every screen.

POST /screens-snapshots/:tier/:id/restore                  (Authorization: Bearer <token>, admin/subadmin only, no body)
→ 200 { "ok": true }
→ 404 { "error": "..." }
Overwrites the entire live admin.screens array with this snapshot's own version, applied
immediately (no draft/preview staging) — copies back any of its own pinned images not already
present in server/uploads/.

POST /screens-snapshots/:tier/:id/restore-screen/:screenID[?force=1]  (Authorization: Bearer <token>, admin/subadmin only, no body)
→ 200 { "ok": true }
→ 404 { "error": "..." }   (snapshot, or this screen within it, not found)
→ 409 { "error": "...", "hasDraft": true }   (this screen has an unpublished draft — retry with ?force=1 once confirmed)
Overwrites just this one screen's own entry — every other screen is untouched.

Snapshots are captured automatically (daily, keeping the last 7; weekly, keeping the last 8) by an
in-process scheduler, calendar-boundary checked so a missed boundary (server offline) self-heals on
the next check rather than being silently skipped. Referenced images are pinned lazily — only copied
into a snapshot the moment the live original would otherwise be deleted, capped at 4096px on the
longer side (best-effort, off the synchronous delete path) — never proactively copied at capture
time. Included whole in the regular backup zip (server/data/screens-snapshots/ is just another
subfolder under server/data, which the zip export/import already walks generically).`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.integrationsTitle')}>
        <p>{t('admin.settings.developerDocs.integrationsIntro')}</p>
        <pre>
          <code>{`GET /integrations/lookup?address=<text>
→ 200 { "coordinates": { "lat", "lon" } | null, "nearbyStops": [{ "id", "name", "modes": [...] }] }

GET /integrations/stops/search?query=<text>
→ 200 { "stops": [{ "id", "name", "modes": [...] }] }
   (searches stop places by name anywhere, not just near a given address)

GET /integrations/departures?stopId=<id>&count=<n>
→ 200 { "stopName", "departures": [{ "line", "lineName"?, "mode", "authorityId"?, "authorityName"?, "lineColor"?, "lineTextColor"?, "destination", "expectedDepartureTime", "aimedDepartureTime", "realtime", "platform"?, "cancelled" }] }
   (on-demand only — the transit pane itself reads the "admin.transitDepartures" synced key instead, kept fresh by the local server's own background poller; see Live data below)

GET /integrations/weather?lat=<lat>&lon=<lon>&hours=<n>
→ 200 { "hourly": [{ "time", "temperatureC", "precipitationMm", "symbolCode", "windSpeedMs"?, "windFromDirectionDeg"?, "humidityPercent"?, "precipitationProbabilityPercent"?, "uvIndex"?, "pressureHpa"? }] }
   (fields marked ? come from MET's "complete" dataset and are only present when MET reports one for that hour — e.g. "uvIndex" outside daylight)`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.newsTitle')}>
        <p>{t('admin.settings.developerDocs.newsIntro')}</p>
        <pre>
          <code>{`GET /news/headlines?sources=<id,id,...>&count=<n>
→ 200 { "headlines": [{ "sourceId", "title", "link", "publishedAt"?, "description"?, "imageUrl"?, "categories"?, "author"? }] }
   ("count" is a per-source cap — each requested source contributes up to its own "count" newest headlines, merged and sorted newest-first)

GET /news/image?src=<url>[&w=<px>]
→ 200, the image, served from this server's own disk cache (refreshed at most once per hour)
→ 400 { "error": "..." }   (missing/invalid "src")
→ 502 { "error": "..." }   (couldn't fetch it, and no cached copy exists yet either)
   ("w" downscales to the nearest allowed width at or above it — 320, 480, 800 or 1280 — and caches
    that size as its own file; omitted, or larger than 1280, serves the original bytes unchanged)`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.woltTitle')}>
        <p>{t('admin.settings.developerDocs.woltIntro')}</p>
        <pre>
          <code>{`GET /wolt/credentials              (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "venueId": string | null, "apiKey": string | null, "useDevelopmentEnvironment": boolean }

POST /wolt/credentials             (Authorization: Bearer <token>, admin/subadmin only)
{ "venueId": string | null, "apiKey": string | null, "useDevelopmentEnvironment": boolean }
→ 200 { "venueId": string | null, "apiKey": string | null, "useDevelopmentEnvironment": boolean }   (re-syncs immediately)
   ("useDevelopmentEnvironment" picks Wolt's development/test host over its production one — see Settings → Testing)

POST /wolt/sync                    (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "ok": true }               (triggers an immediate sync instead of waiting for the next poll)
→ 502 { "error": "..." }

POST /wolt/status/<orderId>        (Authorization: Bearer <token>, admin/subadmin, or "limited" with the "orders" section)
{ "status": "received" | "accepted" | "preparing" | "ready" | "completed" | "cancelled" }
→ 200 { "ok": true }               (pushes the status to Wolt, then updates "admin.woltOrders" locally)
→ 404 { "error": "..." }           (no Wolt order with that id)
→ 502 { "error": "..." }           (Wolt itself rejected the push)`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.foodoraTitle')}>
        <p>{t('admin.settings.developerDocs.foodoraIntro')}</p>
        <pre>
          <code>{`GET /foodora/credentials           (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "venueId": string | null, "apiKey": string | null, "useDevelopmentEnvironment": boolean }

POST /foodora/credentials          (Authorization: Bearer <token>, admin/subadmin only)
{ "venueId": string | null, "apiKey": string | null, "useDevelopmentEnvironment": boolean }
→ 200 { "venueId": string | null, "apiKey": string | null, "useDevelopmentEnvironment": boolean }   (re-syncs immediately)
   ("useDevelopmentEnvironment" is wired the same way as Wolt's — see Settings → Testing — but no real base URL is configured yet)

POST /foodora/sync                 (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "ok": true }               (triggers an immediate sync instead of waiting for the next poll)
→ 502 { "error": "..." }

POST /foodora/status/<orderId>     (Authorization: Bearer <token>, admin/subadmin, or "limited" with the "orders" section)
{ "status": "received" | "accepted" | "preparing" | "ready" | "completed" | "cancelled" }
→ 200 { "ok": true }               (pushes the status to Foodora, then updates "admin.foodoraOrders" locally)
→ 404 { "error": "..." }           (no Foodora order with that id)
→ 502 { "error": "..." }           (Foodora itself rejected the push, or no partner API access exists yet)`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.assistantTitle')}>
        <p>{t('admin.settings.developerDocs.assistantIntro')}</p>
        <pre>
          <code>{`GET /assistant/credentials         (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "hasKey": boolean, "provider": "local" | "claude", "productNameCandidateSuggestionsEnabled": boolean }   (never the raw key)

POST /assistant/credentials        (Authorization: Bearer <token>, admin/subadmin only)
{ "apiKey"?: string | null, "provider"?: "local" | "claude", "productNameCandidateSuggestionsEnabled"?: boolean }   (any field independently updatable)
→ 200 { "hasKey": boolean, "provider": "local" | "claude", "productNameCandidateSuggestionsEnabled": boolean }
   ("productNameCandidateSuggestionsEnabled" gates tier 5 of the product-name resolution ladder — see /assistant/lookup's own "clarifyItem"/"aliasHarvest" note below — a model call over the full product list that only ever fires once the deterministic fold/alias/Levenshtein tiers all miss, and whose output is never auto-applied regardless of this setting; defaults true)

POST /assistant/intent             (Authorization: Bearer <token>, any authenticated session)
{ "message": string, "uiLanguage": "no" | "en", "model"?: "claude-haiku-4-5"|"claude-sonnet-4-5"|"claude-opus-4-5", "history"?: string, "provider"?: "local" | "claude" }
→ 200 { "entity": string, "action": "create"|"update"|"delete"|"resetPassword"|"trigger", "searchText": string | null, "reply": string | null, "lookupEntities": string[] | null, "historyContext": string | null }
→ 400 { "error": "..." }           (couldn't confidently tell what was meant)
→ 409 { "error": "..." }           (Claude: no API key configured; Local: the Ollama host/models aren't configured yet, or a local model's reply still wasn't usable after retrying — see /assistant/ollama-config below)
   ("lookupEntities" set (never alongside "reply") means the message was a factual data question — call /assistant/lookup with those entity keys instead of showing "reply" directly)
   ("history" is raw recent-transcript text, only ever sent on the first call of a turn; the response's "historyContext" is that turn's already-resolved conversation context — for a strong model it's the raw text passed straight through, for a weaker/local one it's condensed via one extra summarization call — and gets threaded straight into whichever of /assistant/select-item, /assistant/fill-fields, or /assistant/lookup comes next in the same turn, never re-resolved)

POST /assistant/select-item        (Authorization: Bearer <token>, any authenticated session)
{ "entity": string, "action": string, "message": string, "searchText": string, "uiLanguage": "no" | "en", "priorItemID"?: string, "model"?: "claude-haiku-4-5"|"claude-sonnet-4-5"|"claude-opus-4-5", "historyContext"?: string, "provider"?: "local" | "claude" }
→ 200 { "itemID": string | null, "candidates": [{ "id", "label" }] }

POST /assistant/fill-fields        (Authorization: Bearer <token>, any authenticated session)
{ "entity": string, "action": string, "message": string, "uiLanguage": "no" | "en", "itemID"?: string, "priorDraft"?: unknown, "image"?: { "mediaType", "base64Data" }, "model"?: "claude-haiku-4-5"|"claude-sonnet-4-5"|"claude-opus-4-5", "history"?: string, "historyContext"?: string, "provider"?: "local" | "claude", "conversationId"?: string }
→ 200 { "draft": unknown, "issues": [{ "code", "params"? }], "flaggedChecks": string[] }
   ("history"/"historyContext" are mutually exclusive — see /assistant/intent's own note; "history" is only ever sent here for the one call path that bypasses /assistant/intent entirely, a correction typed while reviewing a proposed draft)
   ("conversationId" is this chat's own client-generated id — consulted only by one server-side post-check (server/assistant/postChecks/fillFields.ts's "catalogueId-context-consistency"), to look up this conversation's recent dialog focus; "flaggedChecks" names any post-check that still failed after its own one retry — a non-empty array means the client should warn rather than silently trust this draft, see server/assistant/postChecks/framework.ts)

POST /assistant/lookup             (Authorization: Bearer <token>, any authenticated session)
{ "message": string, "uiLanguage": "no" | "en", "entities": string[], "model"?: "claude-haiku-4-5"|"claude-sonnet-4-5"|"claude-opus-4-5", "chunkSizePreference"?: "auto"|"small"|"medium"|"large"|"custom", "customChunkRecordCount"?: number, "historyContext"?: string, "provider"?: "local" | "claude", "itemSearchText"?: string }
→ 200 { "status": "ready", "reply": string }         (answers a factual question about the cafe's own current data, grounded only in that entity's real live records — never outside knowledge; re-filters "entities" through the session's own access the same way every other route does)
→ 200 { "status": "clarifyItem", "entityKey": string, "candidates": [{ "id", "label" }], "aliasHarvest"?: { "query": string, "tier": "4" | "5", "presentationId": string } }   ("itemSearchText" resolved to 2+ real candidates with no confident single pick — show them as a plain pick-one list, same shape as /assistant/select-item's own, and re-answer via /assistant/lookup-item once the admin picks one, rather than silently guessing. "aliasHarvest" is set only when these candidates came from the product-name resolution ladder's own tier 4/5 fuzzy match — see server/assistant/productNameResolution.ts — rather than this same status's other, unrelated source (2+ real items sharing a searched-for name); pass it straight back, unchanged, as /assistant/lookup-item's own "aliasHarvest" once the admin picks one, so that exact query resolves instantly next time)
→ 400 { "error": "..." }           (missing message, uiLanguage, or entities)
   ("itemSearchText" — from /assistant/intent's own "searchText" — engages a single-item fast path when "entities" names exactly one entity and the question was actually about one specific, already-named item (e.g. "how much does the Chicken Fajitas wrap cost?"): resolved to a candidate the same deterministic way /assistant/select-item does, then answered directly from that one record — no batch scan of the whole dataset. Falls through to the normal batch/full-list behavior below only if it's absent or there are 0 real candidates; 2+ candidates with no confident pick returns "clarifyItem" instead, see above)
   (for the "product" entity specifically, a name/label filter that matches zero real records is never answered "found none, here's the whole catalog instead" — it's re-resolved through a deterministic ladder — orthographic fold, confirmed alias memory, folded substring, single-edit typo match, and only then the model-pick tier gated by "productNameCandidateSuggestionsEnabled" above — before falling back to a genuine "no matches" reply; see server/assistant/productNameResolution.ts)
→ 409 { "error": "..." }           (Claude: no API key configured; Local: the Ollama host/models aren't configured yet, or a local model's reply still wasn't usable after retrying)

POST /assistant/lookup-item        (Authorization: Bearer <token>, any authenticated session)
{ "entity": string, "itemID": string, "message": string, "uiLanguage": "no" | "en", "historyContext"?: string, "model"?: "claude-haiku-4-5"|"claude-sonnet-4-5"|"claude-opus-4-5", "provider"?: "local" | "claude", "aliasHarvest"?: { "query": string, "tier": "4" | "5", "presentationId": string } }
→ 200 { "reply": string }         (the continuation call once the admin has picked one candidate off a "clarifyItem" result above — answers directly from that one, now-unambiguous record; never searches or picks anything itself. When "aliasHarvest" is present — passed straight back from the "clarifyItem" result unchanged, see above — this also confirms "itemID" as that exact query's alias before answering)
→ 400 { "error": "..." }           (missing entity, itemID, message, or uiLanguage)
→ 409 { "error": "..." }           (same as /assistant/intent above)
   (large datasets are automatically split into batches and summarized rather than truncated — "chunkSizePreference"/"customChunkRecordCount" override how much data is processed per call at once; both come from AssistantPanel's own kebab-menu chunk-size setting, and an out-of-range "customChunkRecordCount" is clamped server-side, never trusted as-is)
   ("historyContext" is only ever prior conversation, never authoritative — if it conflicts with this call's own live data, the live data always wins)

POST /assistant/title              (Authorization: Bearer <token>, any authenticated session)
{ "transcriptText": string, "uiLanguage": "no" | "en", "model"?: "claude-haiku-4-5"|"claude-sonnet-4-5"|"claude-opus-4-5", "provider"?: "local" | "claude" }
→ 200 { "title": string }         (names a just-finished conversation for the admin's own, per-device conversation log — see useAssistantConversationLog)
   (none of these routes ever write app data — they only ever propose a draft, a title, a lookup answer, or a transcription; the actual write happens from the browser's own existing save/delete path once the admin confirms in the assistant's review step, see server/assistant/types.ts)
   ("provider" on any of these overrides which backend answers just that one call, the same per-device/never-persisted way "model" overrides which Claude model does — see AssistantPanel's own kebab menu, which now lists "Local (Ollama)" alongside the three Claude models (picking a Claude model implicitly sets "provider" to "claude" too, so the two overrides always move together on that side); an invalid/missing value falls back to the shared, admin-configured default from /assistant/credentials. "model" only has any effect when the effective provider is "claude" — the local/Ollama provider ignores it entirely and instead routes deterministically by call shape: any call carrying an "image" uses the configured vision model, everything else uses the thinking model, see /assistant/ollama-config below)
   ("turnVersion"?: number, accepted on every one of the nine routes above and echoed back verbatim on the 200 response (and stamped onto every trace entry the call produced) — a client-assigned, per-tool-call sequence number the admin dashboard uses to tell whether a response is still the latest one in flight by the time it lands, so a late-arriving response from a turn the admin already cancelled/superseded never overwrites newer UI state; purely an echo, no server-side logic branches on it, see useAssistantFlow.ts's own turnVersionRef. Independently, every one of these nine routes also aborts its own real Claude/Ollama call the moment the client disconnects (the request's own "close" event) — a Cancel click, a page navigation, or a lost connection now actually stops the underlying model request instead of letting it run to completion unseen)

GET /assistant/ollama-config       (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "baseUrl": string, "visionModel": string, "thinkingModel": string }   (nothing secret in here, unlike the Claude key above, but still admin/subadmin-gated since it configures the same feature)

POST /assistant/ollama-config      (Authorization: Bearer <token>, admin/subadmin only)
{ "baseUrl"?: string, "visionModel"?: string, "thinkingModel"?: string }   (any field independently updatable; defaults to "http://localhost:11434" / "qwen2.5vl:3b" / "qwen3:4b" until changed)
→ 200 { "baseUrl": string, "visionModel": string, "thinkingModel": string }

POST /assistant/ollama-test        (Authorization: Bearer <token>, admin/subadmin only)
{ "baseUrl"?: string, "visionModel"?: string, "thinkingModel"?: string }   (an unsaved draft to test — omitted fields fall back to the saved config)
→ 200 { "ok": true, "installedModels": string[], "visionModelInstalled": boolean, "thinkingModelInstalled": boolean } | { "ok": false, "error": string }
   (hits the Ollama host's own /api/tags — never throws on an unreachable host, always resolves 200 with "ok": false instead, so the Integrations page's "Test connection" button always gets a clean result to show)

POST /assistant/ollama-pull        (Authorization: Bearer <token>, admin/subadmin only)
{ "tag": string }
→ 200 { "ok": true }
→ 502 { "ok": false, "error": string }   (pulls a model tag onto the configured Ollama host via its own /api/pull endpoint — backs the Integrations page's "Download missing model" button and its own model manager's "Add a model" field; first pulls are a one-time few-GB download and can take several minutes. On Windows this normally only comes up for the vision model: the Windows installer already seeds the default thinking model (qwen3:4b) straight into Ollama's model store from a copy bundled inside it, so /assistant/ollama-test reports it installed and the "Download missing model" button never renders for it — see scripts/fetch-ollama-model.mts and installer/adhdisplay.iss)

GET /assistant/ollama-models       (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "ok": true, "models": [{ "name": string, "size": number }] }   ("size" in raw bytes; every tag actually pulled on the host, not just the two configured vision/thinking roles — backs the Integrations page's own model manager submenu)
→ 502 { "ok": false, "error": string }

POST /assistant/ollama-delete      (Authorization: Bearer <token>, admin/subadmin only)
{ "tag": string }
→ 200 { "ok": true }
→ 502 { "ok": false, "error": string }   (removes a model tag from the configured Ollama host via its own /api/delete endpoint — backs the model manager's own "Delete" button; frees disk space, the tag needs pulling again before it can answer anything)

POST /assistant/transcribe         (Authorization: Bearer <token>, any authenticated session)
{ "message": string, "uiLanguage": "no" | "en", "image": { "mediaType", "base64Data" }, "model"?: "claude-haiku-4-5"|"claude-sonnet-4-5"|"claude-opus-4-5", "provider"?: "local" | "claude" }
→ 200 { "text": string }          (the generic "just read this photo" mode — reads any photographed document, not limited to this dashboard's own data, e.g. a menu, a price list, a house listing; never writes anything or proposes a draft, same posture as the five routes above)
→ 400 { "error": "..." }           (missing uiLanguage or image)
→ 409 { "error": "..." }           (same as /assistant/intent above)

GET /assistant/product-name-resolution-log   (Authorization: Bearer <token>, admin/subadmin only)
?limit=number               (optional, defaults to 100, clamped to 500)
→ 200 { "entries": [{ "query": string, "foldedQuery": string, "tier": string, "resolvedProductId": string | null, "confirmed": boolean, "timestamp": string, "presentationId": string }] }
   (debug/measurement surface for the product-name resolution ladder — every tier-2-and-below resolution attempt, most recent last, kept on disk up to the most recent 2000; not a "SyncedKey", nothing here is editable from the dashboard. "confirmed": false is the attempt as first presented; a later "confirmed": true row for the same query/tier is written once an admin actually taps a "did you mean...?" suggestion — see /assistant/lookup-item's own "aliasHarvest" above. "presentationId" pairs a "confirmed": true row with the "confirmed": false row it confirms — needed since the same query text can be asked more than once with different outcomes, so "no later confirmed:true row for this query" alone would misattribute; a "presentationId" that never gets a matching "confirmed": true row was implicitly rejected — there's no separate reject event)`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.websiteTitle')}>
        <p>{t('admin.settings.developerDocs.websiteIntro')}</p>
        <p>{t('admin.settings.developerDocs.websiteNoTunnel')}</p>

        <h3>{t('admin.settings.developerDocs.websiteTablesTitle')}</h3>
        <pre>
          <code>{`Outbound (this app owns the content; a local edit is pushed as a full replace)
  products, category_prices, contact_info, events

Inbound (the website owns creation; only new rows are pulled down, and a single
mutable field is pushed back by id — never an insert or delete from here)
  messages   -> Messages tab   (this app owns "read")
  orders     -> Orders tab     (this app owns "status"/"updated_at")

Push-only mirrors (computed here, never read back — pulling either one down would
overwrite the full local dataset with a filtered projection of itself)
  message_board  the public subset only: posts on a board with "publish to website"
                 on, with expired ones dropped. No board_id column at all.
  site_theme     one row, the *active* appearance theme only, with its website
                 colour roles already resolved from palette ids to hex values.

The schema itself lives in the website repo (netlify/database/migrations/), applied by Netlify on deploy.
This app never creates or migrates a table.`}</code>
        </pre>

        {/* The connection settings themselves moved to Settings → Connect to
            website, which walks through them step by step and verifies the
            result. Deliberately not duplicated here: two editors for one
            setting is how the two drift apart. */}
        <p className="developer-docs__hint">{t('admin.settings.developerDocs.websiteMovedHint')}</p>

        <div className="developer-docs__key-display">
          <span className="developer-docs__key-label">{t('admin.settings.developerDocs.apiKeyLabel')}</span>
          {isLoadingKey ? (
            <span className="developer-docs__hint">{t('admin.settings.developerDocs.keyLoading')}</span>
          ) : apiKey ? (
            <code>{apiKey}</code>
          ) : (
            <span className="developer-docs__hint">{t('admin.settings.developerDocs.noKeyYet')}</span>
          )}
        </div>
        {keyError && <p className="developer-docs__error">{keyError}</p>}
        {session?.role !== 'limited' && (
          <Button type="button" variant="secondary" onClick={handleRegenerate} disabled={isRegenerating}>
            {apiKey ? t('admin.settings.developerDocs.regenerateButton') : t('admin.settings.developerDocs.generateButton')}
          </Button>
        )}

        <p>{t('admin.settings.developerDocs.apiKeyUsage')}</p>
        <pre>
          <code>{`API_KEY=<the key above>          (Website repo's own env, checked server-side by its Netlify Functions)
VITE_API_KEY=<the key above>     (same value, baked into that project's client bundle so its contact/order forms can send it)`}</code>
        </pre>
        <p className="developer-docs__hint">{t('admin.settings.developerDocs.apiKeyCaveat')}</p>

        <h3>{t('admin.settings.developerDocs.developerKeyRoutesTitle')}</h3>
        <pre>
          <code>{`GET /developer-key                (Authorization: Bearer <token>)
→ 200 { "key": string | null }

POST /developer-key/regenerate    (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "key": string }
→ 403 { "error": "..." }   (a "limited" account's own token)

GET /neon-url                     (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "url": string | null,
        "sync": { "pollIntervalSeconds": number, "pollOnlyDuringOpeningHours": boolean },
        "websiteUrl": string | null }

POST /neon-url                    (Authorization: Bearer <token>, admin/subadmin only)
{ "url"?: string | null,          (null or "" clears it; omit the field entirely to leave it unchanged)
  "sync"?: { "pollIntervalSeconds"?: number,            (clamped to 30-3600)
             "pollOnlyDuringOpeningHours"?: boolean },
  "websiteUrl"?: string | null }  (the public site's base URL, used only to purge its edge cache
                                   after a push; null disables purging, nothing else changes)
→ 200 { "url": string | null, "sync": { ... }, "websiteUrl": string | null }

  All three fields are independently optional — sending only "sync" must not clear a saved
  connection string, and vice versa. Changing "url" or "sync" re-enters the bridge immediately
  (no server restart); "websiteUrl" deliberately does not, since restarting for it would start a
  second reconciliation racing the first.

POST /neon-url/test                (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "checks": [ { "id": "database" | "tables" | "liveUpdates" | "website",
                      "status": "ok" | "warning" | "failed" | "skipped",
                      "reason"?: "notConfigured" | "unreachable" | "authFailed" | "missingTables"
                                 | "notSupported" | "notFound" | "unauthorized" | "unknown" } ] }

  Read-only diagnosis used by Settings → Connect to website. Opens its own short-lived
  connection, so it neither disturbs the live bridge nor needs it connected. "reason" is always
  one of the fixed values above and never a raw driver message — pg errors carry the database
  host and sometimes credentials, and this response reaches the browser. While the cafe is open the bridge holds one
  LISTEN connection so new orders and messages arrive immediately, and disconnects outside opening hours so the website's
  database can suspend; "pollIntervalSeconds" is only the backstop pull, floored at 15 minutes. Outbound pushes open their
  own short-lived connection and are immediate regardless.`}</code>
        </pre>
      </Card>
    </div>
  )
}
