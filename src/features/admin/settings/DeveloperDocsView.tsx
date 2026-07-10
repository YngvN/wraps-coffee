import { Card } from '../../../components'
import { useLanguage } from '../../../i18n'
import './DeveloperDocsView.scss'

/** Every `SYNCED_KEY` (see `src/types/sync.ts`) paired with its own one-line description key — kept in sync with that list by hand; see CLAUDE.md's "Keep docs in sync" rule. */
const SYNCED_KEY_DOCS: { key: string; descKey: string }[] = [
  { key: 'admin.products', descKey: 'admin.settings.developerDocs.keyProducts' },
  { key: 'admin.ratings', descKey: 'admin.settings.developerDocs.keyRatings' },
  { key: 'admin.categoryPrices', descKey: 'admin.settings.developerDocs.keyCategoryPrices' },
  { key: 'admin.messages', descKey: 'admin.settings.developerDocs.keyMessages' },
  { key: 'admin.reviews', descKey: 'admin.settings.developerDocs.keyReviews' },
  { key: 'admin.events', descKey: 'admin.settings.developerDocs.keyEvents' },
  { key: 'admin.contactInfo', descKey: 'admin.settings.developerDocs.keyContactInfo' },
  { key: 'admin.textSizePresets', descKey: 'admin.settings.developerDocs.keyTextSizePresets' },
  { key: 'admin.screensaverClockFormat', descKey: 'admin.settings.developerDocs.keyScreensaverClockFormat' },
  { key: 'admin.screenLockPin', descKey: 'admin.settings.developerDocs.keyScreenLockPin' },
  { key: 'admin.screensaverSchedule', descKey: 'admin.settings.developerDocs.keyScreensaverSchedule' },
  { key: 'admin.screens', descKey: 'admin.settings.developerDocs.keyScreens' },
  { key: 'admin.extensions', descKey: 'admin.settings.developerDocs.keyExtensions' },
  { key: 'admin.sidebarSettings', descKey: 'admin.settings.developerDocs.keySidebarSettings' },
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

GET /uploads/<filename>           (public — no token needed)
GET /uploads/<filename>?size=small   (800px WebP, if it exists)
GET /uploads/<filename>?size=thumb   (240px WebP, if it exists)

GET /uploads                      (Authorization: Bearer <token> — lists every original)
→ 200 [{ "filename", "url", "thumbUrl", "sizeBytes", "uploadedAt" }, ...]

DELETE /uploads/<filename>        (Authorization: Bearer <token>)
→ 204   (also removes its -small/-thumb companions; idempotent)`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.extensionsTitle')}>
        <p>{t('admin.settings.developerDocs.extensionsIntro')}</p>
        <pre>
          <code>{`GET /extensions/lookup?address=<text>
→ 200 { "coordinates": { "lat", "lon" } | null, "nearbyStops": [{ "id", "name", "modes": [...] }] }

GET /extensions/departures?stopId=<id>&count=<n>
→ 200 { "stopName", "departures": [{ "line", "mode", "destination", "expectedDepartureTime", "realtime" }] }

GET /extensions/weather?lat=<lat>&lon=<lon>&hours=<n>
→ 200 { "hourly": [{ "time", "temperatureC", "precipitationMm", "symbolCode" }] }`}</code>
        </pre>
      </Card>
    </div>
  )
}
