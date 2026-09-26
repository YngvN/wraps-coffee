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
          <code>{`Every route checks the tablet (an approved display showing a Register pane). Anything that changes something also needs
the signed-in staff member's "sessionToken" in the body (see Sign-in below); without it: 401 { "reason": "signedOut" }.

GET /register/config?deviceId=<id>        (device trust)
→ 200 { "staffCount": number, "legalReady": boolean, "providers": [{ "id": "zettle" | "vipps", "method": "card" | "vipps" }],   (only providers that are configured and live — none yet)
        "register": { "number": number, "name": string } }   (this tablet's cash register; numbered the first time it asks, never reused)
→ 403 { "error": "..." }

GET /register/staff?deviceId=<id>&pinEveryTime=0|1   (device trust) the login screen's list
→ 200 { "staff": [{ "id": string, "name": string, "role": "staff" | "manager", "needsPin": boolean }] }
POST /register/sign-in                     (device trust)
{ "deviceId": string, "staffId": string, "pin"?: "4 digits", "pinEveryTime": boolean, "idleMinutes": number, "cartItems": number }
→ 200 { "sessionToken": string, "staff": { "id", "name", "role" } }   (PIN once per Oslo day per register, then a name tap;
                                             ends after idleMinutes (max 10) without use, at midnight, or when an admin changes the member)
→ 401 { "reason": "pinRequired" | "wrongPin" }   → 429 { "reason": "lockedOut", "retryAfterMs": number }   → 403 { "reason": "inactive" | "noPin" }
POST /register/sign-out                    (device trust) { "deviceId": string, "sessionToken": string, "reason": "manual" | "idle" } → 200 { "ok": true }

POST /register/checkout                    (signed in)
{ "deviceId": string, "sessionToken": string, "clientOrderId": string (8–64 chars), "lines": [{ "productId": string, "quantity": number, "allowSoldOut"?: boolean }],
  "serving": "takeaway" | "eatIn", "expectedTotal": number, "method": "card" | "cash" | "vipps", "customerName"?: string }
→ 201 { "order": OrderRecord }              (priced from "admin.products", appended to "admin.registerOrders" and journaled as a signed
                                             "sale"; status "completed" when every line is readyToServe, otherwise "received")
→ 200 { "order": OrderRecord }              (that clientOrderId was already sold — the same order, never a second one)
→ 409 { "ok": false, "reason": "priceChanged", "totalPrice": number }
→ 409 { "ok": false, "reason": "legalDetailsMissing" }   (Settings → Store settings → Company details isn't complete; nothing is sold)
→ 400 { "ok": false, "reason": "empty" | "badQuantity" | "unknownProduct" | "noPrice" | "soldOut", "productId"?: string }
   The order gets "receipt": { "number", "journalSeq", "at", "printedAt"?, "copyPrintedAt"? } — its number in this register's sales series.

POST /register/receipts/print              (signed in) { "deviceId", "sessionToken", "orderId": string, "printerId"?: string }
→ 200 { "ok": true, "via": "server", "kind": "original" | "copy" }   (printed on a server printer)
→ 200 { "ok": true, "via": "device", "kind": ..., "data": base64 }   ("usb:…" printer on the tablet: the tablet sends the ESC/POS job)
→ 409 { "reason": "copyLimit" | "legalDetailsMissing" | "noPrinter" }   → 404 { "reason": "unknownOrder" }   → 502 { "reason": "printerFailed" }
   The legal receipt, built from the sale's journal entry: the original ("Salgskvittering") the first time, its one copy ("KOPI",
   journaled as a signed "copy") the second, then refused. The staff board prints a register sale as an order ticket without prices.
POST /register/pro-forma                   (signed in) { "deviceId", "sessionToken", "lines": CartLine[], "serving", "printerId"?: string }
→ 200 { "ok": true, "via": ..., "number": number, "data"?: base64 }   ("Foreløpig kvittering – IKKE KVITTERING FOR KJØP", journaled as a signed "proForma")

POST /register/returns                     (a signed-in manager) { "deviceId", "sessionToken", "orderId": string,
  "lines": [{ "itemID": string, "quantity": number }], "reason": "wrongItem" | "complaint" | "changedMind" | "other", "note"?: string, "printerId"?: string }
→ 200 { "ok": true, "return": OrderReturn, "printed": boolean, "via"?, "data"? }   (journaled as a signed "return" with negative amounts,
                                             linked to the original receipt, added to the order's "returns"; tracked stock goes back)
→ 400 { "reason": "notReturnable" | "nothingToReturn" | "tooMany" | "unknownLine" | "badReason" }   → 409 { "reason": "legalDetailsMissing" }
   The refund is made the way the sale was paid; a cash refund opens the drawer with POST /register/drawer { "reason": "return", "orderId" }.

POST /register/cart-events                 (signed in) journals a cart change before payment (priced by the server)
{ "deviceId", "sessionToken", "kind": "lineCorrection", "correction": "removed" | "decreased", "lines": [{ "productId", "quantity" }], "serving" }
{ "deviceId", "sessionToken", "kind": "void", "lines": [...], "serving" }   (a cart with items cleared without a sale)
→ 200 { "ok": true }

POST /register/pickup                      (signed in; off when the pane's allowPickupScan is false)
{ "deviceId": string, "sessionToken": string, "payload": "WRAPS-PICKUP:<order id>:<code>" | "<5-character code, e.g. "#K7M2Q">", "force"?: boolean }
→ 200 { "result": "completed" | "alreadyCompleted", "order": OrderRecord }
→ 409 { "result": "notReady" | "cancelled", "order": OrderRecord }   ("notReady" completes with "force": true)
→ 404 { "result": "notFound" }   → 400 { "result": "invalid" }   → 403 { "result": "disabled" }

POST /register/drawer                      (signed in) opens the cash drawer on a printer's drawer port (ESC p pulse)
{ "deviceId": string, "sessionToken": string, "reason": "sale", "orderId": string, "printerId"?: string }   (a cash sale, once, within 3 minutes)
{ "deviceId": string, "sessionToken": string, "reason": "return", "orderId": string, "returnNumber": number, "printerId"?: string } (a cash refund, once, within 3 minutes)
{ "deviceId": string, "sessionToken": string, "reason": "manual", "printerId"?: string }                   (by hand)
→ 200 { "ok": true, "via": "server" | "device" }   ("device": a USB printer on the tablet — the tablet sends the pulse)
→ 409 { "reason": "unknownOrder" | "notCash" | "tooLate" | "alreadyOpened" | "noPrinter" }   → 502 { "reason": "printerFailed" }
   Every opening is journaled ("drawerOpen") and also logged in server/data/cash-drawer-log.json.

POST /register/products                    (a signed-in manager; otherwise 403 { "reason": "managerOnly" })
{ "deviceId": string, "sessionToken": string, "product": { "itemID"?: string, "name": { "no": string, "en": string }, "price"?: Price,
  "barcode"?: string, "image"?: string, "available"?: boolean, "readyToServe"?: boolean, "vatCategory"?: "food" | "standard" | "exempt", "trackStock"?: boolean,
  "stockQuantity"?: number, "allergens"?: string[], "category"?: string, "catalogueId"?: string } }
→ 201 / 200 { "product": Product }   → 400 { "reason": "noName" | "badPrice" | "badBarcode" | "duplicateBarcode" | "badVatCategory" | ... }

POST /register/uploads?deviceId=<id>&session=<token>   (a signed-in manager; body = raw image bytes, like POST /uploads)
→ 201 { "url": string }

POST /register/orders/:id/status           (Authorization: Bearer <token>; the "orders" section) { "status": OrderStatus }
→ 200 { "ok": true }   → 404 { "error": "..." }   → 409 { "reason": "registerSaleFinal" }   (a register sale is never cancelled)

GET /register/registers                    (Authorization: Bearer <token>; the "store" section) → 200 { "registers": [{ "number": number, "name": string, "createdAt": ISO }] }
POST /register/registers/:number           (same access) { "name": string } → 200 { "number", "name" } | 400 (unknown number or blank name)
GET /register/admin/staff                  (same access) → 200 { "staff": [{ "id", "name", "employeeNumber", "role", "active", "hasPin" }] }
POST /register/admin/staff                 (same access) { "name": string, "pin": "4 digits", "role"?: "staff" | "manager", "employeeNumber"?: string } → 201 { "member" }
POST /register/admin/staff/:id             (same access) { "name"?, "employeeNumber"?, "role"?, "active"?, "pin"? } → 200 { "member" }
                                             (a new PIN, role or deactivation signs the member out everywhere)
→ 400 { "reason": "noName" | "badRole" | "badPin" | "duplicateEmployeeNumber" }   → 404 { "reason": "unknownStaff" }
GET /register/admin/journal                (same access) → 200 { "entries": number, "problems": JournalProblem[], "checkedAt": ISO }
POST /register/admin/journal/verify        (same access) runs a full integrity check now → same shape`}</code>
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
