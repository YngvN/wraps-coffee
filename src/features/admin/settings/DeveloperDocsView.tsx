import { useEffect, useState } from 'react'
import { Button, Card, Input } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { getDeveloperKey, getNeonUrl, regenerateDeveloperKey, setNeonUrl } from '../../../lib/localServer'
import './DeveloperDocsView.scss'

/** Masks the password segment of a `postgres://user:password@host/db` connection string for display, leaving the user/host/db visible so an admin can confirm it points at the right project without exposing the actual secret. Falls back to returning `url` unchanged if it doesn't match the expected shape. */
function maskNeonUrl(url: string): string {
  return url.replace(/:\/\/([^:/@]+):([^@]+)@/, '://$1:••••••••@')
}

/** Every `SYNCED_KEY` (see `src/types/sync.ts`) paired with its own one-line description key — kept in sync with that list by hand; see CLAUDE.md's "Keep docs in sync" rule. */
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
  { key: 'admin.integrations', descKey: 'admin.settings.developerDocs.keyIntegrations' },
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
 * `src/types/sync.ts` — see CLAUDE.md's "Keep docs in sync" rule, which
 * exists specifically so future endpoint/key changes update this page too.
 */
export function DeveloperDocsView() {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [isLoadingKey, setIsLoadingKey] = useState(true)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)

  const [neonUrl, setNeonUrlValue] = useState<string | null>(null)
  const [isLoadingNeonUrl, setIsLoadingNeonUrl] = useState(() => session?.role !== 'limited')
  const [isEditingNeonUrl, setIsEditingNeonUrl] = useState(false)
  const [neonUrlDraft, setNeonUrlDraft] = useState('')
  const [isSavingNeonUrl, setIsSavingNeonUrl] = useState(false)
  const [neonUrlError, setNeonUrlError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    getDeveloperKey(session.token)
      .then(setApiKey)
      .catch(() => setKeyError(t('admin.settings.developerDocs.keyLoadError')))
      .finally(() => setIsLoadingKey(false))
  }, [session, t])

  useEffect(() => {
    if (!session || session.role === 'limited') return
    getNeonUrl(session.token)
      .then(setNeonUrlValue)
      .catch(() => setNeonUrlError(t('admin.settings.developerDocs.neonUrlLoadError')))
      .finally(() => setIsLoadingNeonUrl(false))
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

  const startEditingNeonUrl = () => {
    setNeonUrlDraft(neonUrl ?? '')
    setNeonUrlError(null)
    setIsEditingNeonUrl(true)
  }

  const saveNeonUrl = (value: string | null) => {
    if (!session) return
    setIsSavingNeonUrl(true)
    setNeonUrlError(null)
    setNeonUrl(session.token, value)
      .then((saved) => {
        setNeonUrlValue(saved)
        setIsEditingNeonUrl(false)
      })
      .catch(() => setNeonUrlError(t('admin.settings.developerDocs.neonUrlSaveError')))
      .finally(() => setIsSavingNeonUrl(false))
  }

  const handleClearNeonUrl = () => {
    if (window.confirm(t('admin.settings.developerDocs.neonUrlClearConfirm'))) saveNeonUrl(null)
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
→ 200 { "lanIp": "192.168.1.23" | null }`}</code>
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
  "admin.products": { "seeded": false, "value": [...] },
  "admin.screens": { "seeded": false, "value": [...] }
} }`}</code>
        </pre>

        <p>{t('admin.settings.developerDocs.syncUpdateText')}</p>
        <pre>
          <code>{`{ "type": "update", "key": "admin.products", "value": [...] }`}</code>
        </pre>

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
          <code>{`POST /uploads                     (Authorization: Bearer <token>, Content-Type: image/*, body = raw file bytes, max 10MB)
→ 201 { "url": "http://.../uploads/<uuid>.<ext>" }

POST /uploads/video                (Authorization: Bearer <token>, body = raw file bytes, any format, max 500MB)
→ 202 { "id", "filename": "<uuid>.mp4", "url", "status": "processing" }
  (transcodes to H.264/AAC MP4 in the background — poll GET /uploads for this filename until "status" clears or becomes "failed")

POST /uploads/video/<id>/retry     (Authorization: Bearer <token>)
→ 202 { "id", "filename", "status": "processing" }   (re-attempts a failed transcode from its still-staged source, no re-upload needed)
→ 404   (staged source already gone — succeeded, deleted, or swept after 48h abandoned)

GET /uploads/<filename>           (public — no token needed)
GET /uploads/<filename>?size=small   (800px WebP, images only, if it exists)
GET /uploads/<filename>?size=thumb   (240px WebP — an image's thumbnail, or a video's poster frame, if it exists)

GET /uploads                      (Authorization: Bearer <token> — lists every original, image or video)
→ 200 [{ "filename", "url", "thumbUrl", "sizeBytes", "uploadedAt", "kind": "image" | "video", "status"?: "processing" | "failed", "errorMessage"?, "displayName"? }, ...]

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
{ "machineID": "...", "label": "...", "connectionType": "electron" | "url", "monitors": [{ "id": "...", "label": "..." }] }
→ 200 { "ok": true }
→ 400 { "error": "..." }   (malformed body)

Upserts by machineID into admin.displayMachines (a regular synced key, see Live data above) —
preserves each existing monitor's own assignedScreenID (matched by monitor id) and the machine's
own customLabel (an admin's rename, set via Display Manager) rather than overwriting them — every
heartbeat's own "label" is that machine's self-reported name (e.g. "Display 3"), always
overwritten as-is, so an admin-typed rename has to live in this separate field to actually stick.
Actually assigning a Screen or renaming a machine is a normal authenticated write to that same key
from the Display Manager page, not this route.

Remote-close: Display Manager's own "X" button appends a machineID to
admin.displayMachineCloseRequests (also a regular synced key) instead of calling any route of its
own. Every live /display-connect or Display window watches that list for its own machineID; on a
match it stops its own heartbeat, removes its own admin.displayMachines entry, prunes its own id
back out of the close-request list, then calls window.close() (only effective on a script-opened
window, e.g. a Display window — a no-op on a plain browser tab a user navigated to directly).`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.backupTitle')}>
        <p>{t('admin.settings.developerDocs.backupIntro')}</p>
        <pre>
          <code>{`GET /backups/status               (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "folderBackupAvailable": boolean, "updatedAt": string | null }

GET /backups                      (Authorization: Bearer <token>, admin/subadmin only)
→ 200, Content-Type: application/zip, Content-Disposition: attachment; filename="wrapscoffee-backup-...zip"

POST /backups/restore              (Authorization: Bearer <token>, admin/subadmin only, Content-Type: application/zip, body = raw zip bytes)
→ 200 { "ok": true }
→ 400 { "error": "..." }   (not a recognized backup zip)

POST /backups/restore-from-folder  (Authorization: Bearer <token>, admin/subadmin only, no body)
→ 200 { "ok": true }
→ 400 { "error": "..." }   (no sibling WrapsCoffeeBackup folder found)`}</code>
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

      <Card title={t('admin.settings.developerDocs.integrationsTitle')}>
        <p>{t('admin.settings.developerDocs.integrationsIntro')}</p>
        <pre>
          <code>{`GET /integrations/lookup?address=<text>
→ 200 { "coordinates": { "lat", "lon" } | null, "nearbyStops": [{ "id", "name", "modes": [...] }] }

GET /integrations/stops/search?query=<text>
→ 200 { "stops": [{ "id", "name", "modes": [...] }] }
   (searches stop places by name anywhere, not just near a given address)

GET /integrations/departures?stopId=<id>&count=<n>
→ 200 { "stopName", "departures": [{ "line", "lineName"?, "mode", "destination", "expectedDepartureTime", "aimedDepartureTime", "realtime", "platform"?, "cancelled" }] }

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

GET /news/image?src=<url>
→ 200, the image, served from this server's own disk cache (refreshed at most once per hour)
→ 400 { "error": "..." }   (missing/invalid "src")
→ 502 { "error": "..." }   (couldn't fetch it, and no cached copy exists yet either)`}</code>
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
→ 200 { "hasKey": boolean, "provider": "local" | "claude" }   (never the raw key)

POST /assistant/credentials        (Authorization: Bearer <token>, admin/subadmin only)
{ "apiKey"?: string | null, "provider"?: "local" | "claude" }   (either field independently updatable)
→ 200 { "hasKey": boolean, "provider": "local" | "claude" }

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
{ "entity": string, "action": string, "message": string, "uiLanguage": "no" | "en", "itemID"?: string, "priorDraft"?: unknown, "image"?: { "mediaType", "base64Data" }, "model"?: "claude-haiku-4-5"|"claude-sonnet-4-5"|"claude-opus-4-5", "history"?: string, "historyContext"?: string, "provider"?: "local" | "claude" }
→ 200 { "draft": unknown, "issues": [{ "code", "params"? }] }
   ("history"/"historyContext" are mutually exclusive — see /assistant/intent's own note; "history" is only ever sent here for the one call path that bypasses /assistant/intent entirely, a correction typed while reviewing a proposed draft)

POST /assistant/lookup             (Authorization: Bearer <token>, any authenticated session)
{ "message": string, "uiLanguage": "no" | "en", "entities": string[], "model"?: "claude-haiku-4-5"|"claude-sonnet-4-5"|"claude-opus-4-5", "chunkSizePreference"?: "auto"|"small"|"medium"|"large"|"custom", "customChunkRecordCount"?: number, "historyContext"?: string, "provider"?: "local" | "claude", "itemSearchText"?: string }
→ 200 { "status": "ready", "reply": string }         (answers a factual question about the cafe's own current data, grounded only in that entity's real live records — never outside knowledge; re-filters "entities" through the session's own access the same way every other route does)
→ 200 { "status": "clarifyItem", "entityKey": string, "candidates": [{ "id", "label" }] }   ("itemSearchText" resolved to 2+ real candidates with no confident single pick — show them as a plain pick-one list, same shape as /assistant/select-item's own, and re-answer via /assistant/lookup-item once the admin picks one, rather than silently guessing)
→ 400 { "error": "..." }           (missing message, uiLanguage, or entities)
   ("itemSearchText" — from /assistant/intent's own "searchText" — engages a single-item fast path when "entities" names exactly one entity and the question was actually about one specific, already-named item (e.g. "how much does the Chicken Fajitas wrap cost?"): resolved to a candidate the same deterministic way /assistant/select-item does, then answered directly from that one record — no batch scan of the whole dataset. Falls through to the normal batch/full-list behavior below only if it's absent or there are 0 real candidates; 2+ candidates with no confident pick returns "clarifyItem" instead, see above)
→ 409 { "error": "..." }           (Claude: no API key configured; Local: the Ollama host/models aren't configured yet, or a local model's reply still wasn't usable after retrying)

POST /assistant/lookup-item        (Authorization: Bearer <token>, any authenticated session)
{ "entity": string, "itemID": string, "message": string, "uiLanguage": "no" | "en", "historyContext"?: string, "model"?: "claude-haiku-4-5"|"claude-sonnet-4-5"|"claude-opus-4-5", "provider"?: "local" | "claude" }
→ 200 { "reply": string }         (the continuation call once the admin has picked one candidate off a "clarifyItem" result above — answers directly from that one, now-unambiguous record; never searches or picks anything itself)
→ 400 { "error": "..." }           (missing entity, itemID, message, or uiLanguage)
→ 409 { "error": "..." }           (same as /assistant/intent above)
   (large datasets are automatically split into batches and summarized rather than truncated — "chunkSizePreference"/"customChunkRecordCount" override how much data is processed per call at once; both come from AssistantPanel's own kebab-menu chunk-size setting, and an out-of-range "customChunkRecordCount" is clamped server-side, never trusted as-is)
   ("historyContext" is only ever prior conversation, never authoritative — if it conflicts with this call's own live data, the live data always wins)

POST /assistant/title              (Authorization: Bearer <token>, any authenticated session)
{ "transcriptText": string, "uiLanguage": "no" | "en", "model"?: "claude-haiku-4-5"|"claude-sonnet-4-5"|"claude-opus-4-5", "provider"?: "local" | "claude" }
→ 200 { "title": string }         (names a just-finished conversation for the admin's own, per-device conversation log — see useAssistantConversationLog)
   (none of these routes ever write app data — they only ever propose a draft, a title, a lookup answer, or a transcription; the actual write happens from the browser's own existing save/delete path once the admin confirms in the assistant's review step, see server/assistant/types.ts)
   ("provider" on any of these overrides which backend answers just that one call, the same per-device/never-persisted way "model" overrides which Claude model does — see AssistantPanel's own kebab menu, which now lists "Local (Ollama)" alongside the three Claude models (picking a Claude model implicitly sets "provider" to "claude" too, so the two overrides always move together on that side); an invalid/missing value falls back to the shared, admin-configured default from /assistant/credentials. "model" only has any effect when the effective provider is "claude" — the local/Ollama provider ignores it entirely and instead routes deterministically by call shape: any call carrying an "image" uses the configured vision model, everything else uses the thinking model, see /assistant/ollama-config below)

GET /assistant/ollama-config       (Authorization: Bearer <token>, admin/subadmin only)
→ 200 { "baseUrl": string, "visionModel": string, "thinkingModel": string }   (nothing secret in here, unlike the Claude key above, but still admin/subadmin-gated since it configures the same feature)

POST /assistant/ollama-config      (Authorization: Bearer <token>, admin/subadmin only)
{ "baseUrl"?: string, "visionModel"?: string, "thinkingModel"?: string }   (any field independently updatable; defaults to "http://localhost:11434" / "qwen2.5vl:3b" / "qwen2.5:3b-instruct" until changed)
→ 200 { "baseUrl": string, "visionModel": string, "thinkingModel": string }

POST /assistant/ollama-test        (Authorization: Bearer <token>, admin/subadmin only)
{ "baseUrl"?: string, "visionModel"?: string, "thinkingModel"?: string }   (an unsaved draft to test — omitted fields fall back to the saved config)
→ 200 { "ok": true, "installedModels": string[], "visionModelInstalled": boolean, "thinkingModelInstalled": boolean } | { "ok": false, "error": string }
   (hits the Ollama host's own /api/tags — never throws on an unreachable host, always resolves 200 with "ok": false instead, so the Integrations page's "Test connection" button always gets a clean result to show)

POST /assistant/ollama-pull        (Authorization: Bearer <token>, admin/subadmin only)
{ "tag": string }
→ 200 { "ok": true }
→ 502 { "ok": false, "error": string }   (pulls a model tag onto the configured Ollama host via its own /api/pull endpoint — backs the Integrations page's "Download missing model" button; first pulls are a one-time few-GB download and can take several minutes)

POST /assistant/transcribe         (Authorization: Bearer <token>, any authenticated session)
{ "message": string, "uiLanguage": "no" | "en", "image": { "mediaType", "base64Data" }, "model"?: "claude-haiku-4-5"|"claude-sonnet-4-5"|"claude-opus-4-5", "provider"?: "local" | "claude" }
→ 200 { "text": string }          (the generic "just read this photo" mode — reads any photographed document, not limited to this dashboard's own data, e.g. a menu, a price list, a house listing; never writes anything or proposes a draft, same posture as the five routes above)
→ 400 { "error": "..." }           (missing uiLanguage or image)
→ 409 { "error": "..." }           (same as /assistant/intent above)`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.websiteTitle')}>
        <p>{t('admin.settings.developerDocs.websiteIntro')}</p>
        <p>{t('admin.settings.developerDocs.websiteNoTunnel')}</p>

        {session?.role !== 'limited' && (
          <>
            <div className="developer-docs__key-display">
              <span className="developer-docs__key-label">{t('admin.settings.developerDocs.neonUrlLabel')}</span>
              {isLoadingNeonUrl ? (
                <span className="developer-docs__hint">{t('admin.settings.developerDocs.keyLoading')}</span>
              ) : isEditingNeonUrl ? (
                <Input
                  className="developer-docs__neon-url-input"
                  type="text"
                  value={neonUrlDraft}
                  onChange={(event) => setNeonUrlDraft(event.target.value)}
                  placeholder="postgres://user:password@host/db?sslmode=require"
                  autoFocus
                />
              ) : neonUrl ? (
                <code>{maskNeonUrl(neonUrl)}</code>
              ) : (
                <span className="developer-docs__hint">{t('admin.settings.developerDocs.noNeonUrlYet')}</span>
              )}
            </div>
            {neonUrlError && <p className="developer-docs__error">{neonUrlError}</p>}
            {!isLoadingNeonUrl && (
              <div className="developer-docs__actions">
                {isEditingNeonUrl ? (
                  <>
                    <Button type="button" variant="secondary" onClick={() => saveNeonUrl(neonUrlDraft)} disabled={isSavingNeonUrl}>
                      {t('admin.common.save')}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setIsEditingNeonUrl(false)} disabled={isSavingNeonUrl}>
                      {t('admin.common.cancel')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="secondary" onClick={startEditingNeonUrl} disabled={isSavingNeonUrl}>
                      {neonUrl ? t('admin.settings.developerDocs.editButton') : t('admin.settings.developerDocs.addButton')}
                    </Button>
                    {neonUrl && (
                      <Button type="button" variant="secondary" onClick={handleClearNeonUrl} disabled={isSavingNeonUrl}>
                        {t('admin.settings.developerDocs.clearButton')}
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

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
→ 200 { "url": string | null }

POST /neon-url                    (Authorization: Bearer <token>, admin/subadmin only)
{ "url": string | null }          (null or "" clears it — reconnects the bridge immediately either way)
→ 200 { "url": string | null }`}</code>
        </pre>
      </Card>
    </div>
  )
}
