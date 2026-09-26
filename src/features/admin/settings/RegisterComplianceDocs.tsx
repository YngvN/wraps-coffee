import { Card } from '../../../components'
import { useLanguage } from '../../../i18n'

/**
 * The developer docs' card for training mode and the SAF-T export. Split out of the other register
 * cards; kept accurate by hand against `server/register/training.ts` and `server/saft/routes.ts`
 * (keep-in-sync). The full system description is `docs/kassasystem/systembeskrivelse.md`.
 */
export function RegisterComplianceDocs() {
  const { t } = useLanguage()
  return (
    <Card title={t('admin.settings.developerDocs.registerComplianceTitle')}>
      <p>{t('admin.settings.developerDocs.registerComplianceIntro')}</p>
      <pre>
        <code>{`POST /register/training                    (a signed-in manager) { "deviceId", "sessionToken", "on": boolean } → 200 { "ok": true, "training": boolean }
   While on (GET /register/config → "training": true), POST /register/checkout journals a signed "trainingSale", prints a
   "Treningskvittering", creates no order and touches no stock, and answers { "order", "training": true, "via"?, "data"? }.
   Returns, provider payments and Z reports answer 409 { "reason": "training" }.

GET /register/admin/saft?from=YYYY-MM-DD&to=YYYY-MM-DD&register=<number>?   (Authorization: Bearer <token>; the "store" section)
→ 200 application/xml, "SAF-T Cash Register_<org number>_<timestamp>.xml" — Skatteetaten's schema v1.00, from the journal
→ 400 (bad dates)   → 409 { "reason": "legalDetailsMissing" }
GET /register/admin/public-key             (same access) → 200 PEM: every signing key's public half, "# keyVersion n" above each

Category.saftArticleGroup (in "admin.catalogues"): the SAF-T article group code (04xxx) a category's sales are exported under; absent = 04006.`}</code>
      </pre>
    </Card>
  )
}
