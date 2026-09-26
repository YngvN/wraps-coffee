import { Card } from '../../../components'
import { useLanguage } from '../../../i18n'

/**
 * The developer docs' card for the register's cash handling and reports: the opening float, X/Z reports,
 * the dashboard's Z report list, and the drawer sensor. Split out of `RegisterDeveloperDocs.tsx`, kept
 * accurate by hand against `server/register/reportRoutes.ts` and `staffAdminRoutes.ts` (keep-in-sync).
 */
export function RegisterCashDocs() {
  const { t } = useLanguage()
  return (
    <Card title={t('admin.settings.developerDocs.registerCashTitle')}>
      <p>{t('admin.settings.developerDocs.registerCashIntro')}</p>
      <pre>
        <code>{`GET /register/config also answers "floatNeeded": boolean — no opening float counted since this register's last Z report.

POST /register/float                       (signed in) { "deviceId", "sessionToken", "amountOre": integer } → 200 { "ok": true }   (journaled "float")

POST /register/reports                     (a signed-in manager) { "deviceId", "sessionToken", "kind": "X" | "Z", "countedCashOre"?: integer, "printerId"?: string }
→ 200 { "ok": true, "report": RegisterReport, "printed": boolean, "via"?: "server" | "device", "data"?: base64 }
→ 400 { "reason": "countRequired" }   (a Z needs the counted cash)   → 409 { "reason": "unsettled" | "legalDetailsMissing" }
   The period runs from just after the register's last Z report. An X changes nothing (journaled "xReport"); a Z journals
   "cashCount" { expectedOre, countedOre, differenceOre } and then "zReport" { number, report }, which closes the period.
   RegisterReport carries every field of kassasystemforskrifta § 2-8-2, including grand totals since the register's first sale.

GET  /register/admin/z-reports             (Authorization: Bearer <token>; the "store" section) → 200 { "reports": [{ "seq", "at", "register", "number", "report" }] }
POST /register/admin/z-reports/:seq/print  (same access) → 200 { "result": "printed" } | 404 "notFound" | 409 "noPrinter" | 502 "printerFailed"   (marked KOPI)

POST /register/checkout and POST /register/payments also take "printerId" and answer 409 { "reason": "drawerOpen" } when that
printer's drawer reports being open (ConfiguredPrinter.drawerSensor: "openWhenHigh" | "openWhenLow", read with DLE EOT 1).`}</code>
      </pre>
    </Card>
  )
}
