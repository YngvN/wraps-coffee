import { Card } from '../../../components'
import { useLanguage } from '../../../i18n'

/**
 * The developer docs' cards for the Register: its tablet routes, the barcode catalogue, the payment
 * scaffolding and its admin routes. Split out of `DeveloperDocsView.tsx` (already very large) and
 * rendered from it; kept accurate by hand against `server/register/`, `server/barcodes/` and
 * `server/payments/` — see the `keep-in-sync` skill.
 */
export function RegisterDeveloperDocs() {
  const { t } = useLanguage()
  return (
    <>
      <Card title={t('admin.settings.developerDocs.registerTitle')}>
        <p>{t('admin.settings.developerDocs.registerIntro')}</p>
        <pre>
          <code>{`GET /register/config?deviceId=<id>        (public — device trust: an approved display showing a Register pane)
→ 200 { "pinSet": boolean, "providers": [{ "id": "zettle" | "vipps", "method": "card" | "vipps" }] }   (only providers that are configured and live — none yet)
→ 403 { "error": "..." }

POST /register/checkout                    (device trust)
{ "deviceId": string, "clientOrderId": string (8–64 chars), "lines": [{ "productId": string, "quantity": number, "allowSoldOut"?: boolean }],
  "serving": "takeaway" | "eatIn", "expectedTotal": number, "method": "card" | "cash" | "vipps", "customerName"?: string }
→ 201 { "order": OrderRecord }              (priced from "admin.products", appended to "admin.registerOrders"; status "completed"
                                             when every line is readyToServe, otherwise "received")
→ 200 { "order": OrderRecord }              (that clientOrderId was already sold — the same order, never a second one)
→ 409 { "ok": false, "reason": "priceChanged", "totalPrice": number }
→ 400 { "ok": false, "reason": "empty" | "badQuantity" | "unknownProduct" | "noPrice" | "soldOut", "productId"?: string }

POST /register/pickup                      (device trust; off when the pane's allowPickupScan is false)
{ "deviceId": string, "payload": "WRAPS-PICKUP:<order id>:<code>" | "<5-character code, e.g. "#K7M2Q">", "force"?: boolean }
→ 200 { "result": "completed" | "alreadyCompleted", "order": OrderRecord }
→ 409 { "result": "notReady" | "cancelled", "order": OrderRecord }   ("notReady" completes with "force": true)
→ 404 { "result": "notFound" }   → 400 { "result": "invalid" }   → 403 { "result": "disabled" }

POST /register/unlock                      (device trust) { "deviceId": string, "pin": string }
→ 200 { "token": string, "expiresAt": number }   (2 min idle, 10 min at most; memory only)
→ 401 { "reason": "wrongPin" }   → 429 { "reason": "lockedOut", "retryAfterMs": number }   → 409 { "reason": "noPin" }
POST /register/lock                        (device trust) { "deviceId": string } → 200 { "ok": true }

POST /register/drawer                      (device trust) opens the cash drawer on a printer's drawer port (ESC p pulse)
{ "deviceId": string, "reason": "sale", "orderId": string, "printerId"?: string }        (a cash sale, once, within 3 minutes)
{ "deviceId": string, "reason": "manual", "unlockToken": string, "printerId"?: string }  (by hand, needs the staff PIN)
→ 200 { "ok": true, "via": "server" | "device" }   ("device": a USB printer on the tablet — the tablet sends the pulse)
→ 401 { "reason": "locked" }   → 409 { "reason": "unknownOrder" | "notCash" | "tooLate" | "alreadyOpened" | "noPrinter" }   → 502 { "reason": "printerFailed" }
   Every opening is logged server-side (server/data/cash-drawer-log.json, in the backup).

POST /register/products                    (device trust + "unlockToken" in the body)
{ "deviceId": string, "unlockToken": string, "product": { "itemID"?: string, "name": { "no": string, "en": string }, "price"?: Price,
  "barcode"?: string, "image"?: string, "available"?: boolean, "readyToServe"?: boolean, "trackStock"?: boolean,
  "stockQuantity"?: number, "allergens"?: string[], "category"?: string, "catalogueId"?: string } }
→ 201 / 200 { "product": Product }   → 400 { "reason": "noName" | "badPrice" | "badBarcode" | "duplicateBarcode" | ... }
→ 401 { "reason": "locked" }

POST /register/uploads?deviceId=<id>&unlock=<token>   (device trust + unlock; body = raw image bytes, like POST /uploads)
→ 201 { "url": string }

POST /register/orders/:id/status           (Authorization: Bearer <token>; the "orders" section) { "status": OrderStatus }
→ 200 { "ok": true }   → 404 { "error": "..." }

GET /register/pin                          (Authorization: Bearer <token>; the "store" section) → 200 { "isSet": boolean }
POST /register/pin                         (same access) { "pin": "4–6 digits" | null } → 200 { "isSet": boolean }   (locks every register)`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.barcodesTitle')}>
        <p>{t('admin.settings.developerDocs.barcodesIntro')}</p>
        <pre>
          <code>{`GET /register/barcodes/:code?deviceId=<id>   (device trust)
GET /barcodes/:code                           (Authorization: Bearer <token>; the "products" section)
→ 200 { "kind": "product", "product": Product }         (one of our own products has this barcode)
→ 200 { "kind": "entry", "entry": BarcodeEntry }         (a saved draft, or just fetched from Open Food Facts and saved)
→ 200 { "kind": "unknown" }                              (nobody knows it; misses are remembered for 7 days)
→ 200 { "kind": "unavailable", "retryAfterMs"?: number } (Open Food Facts unreachable or our 10/min limit reached — not remembered)
→ 400 { "kind": "invalid" }                              (not a valid EAN-8 / UPC-A / EAN-13 / GTIN-14)`}</code>
        </pre>
      </Card>

      <Card title={t('admin.settings.developerDocs.paymentsTitle')}>
        <p>{t('admin.settings.developerDocs.paymentsIntro')}</p>
        <pre>
          <code>{`POST /register/payments                    (device trust)
{ ...the /register/checkout body without "method", "provider": "zettle" | "vipps" }
→ 201 { "intent": { "id": string, "provider": string, "state": "pending", "totalPrice": number,
        "start": { "kind": "qr", "qrUrl": string } | { "kind": "device", "action": "zettle-charge" } } }
→ 409 { "reason": "priceChanged", "totalPrice": number }   → 503 { "error": "..." }   (provider not ready)

GET  /register/payments/:id?deviceId=<id>  → 200 { "intent": { ..., "state": "pending" | "authorized" | "captured" | "failed" | "cancelled" | "expired", "order"?: OrderRecord } }
POST /register/payments/:id/device-result  { "deviceId": string, "ok": boolean } → 200 { "intent": ... }   (a payment the tablet took itself)
POST /register/payments/:id/cancel         { "deviceId": string } → 200 { "intent": ... }

GET  /vipps/credentials, /zettle/credentials   (Authorization: Bearer <token>; admin/subadmin only)
POST /vipps/credentials, /zettle/credentials   (same access; body = the credentials, blanks stored as null) → 200 { "ok": true }`}</code>
        </pre>
      </Card>
    </>
  )
}
