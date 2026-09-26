/** Company branding for this store/business — the name shown in the browser tab, sidebar and login page, and used to derive the kiosk screens' own mDNS `.local` name (see `src/utils/mdnsName.ts`). Contact details live in the separate `ContactInfo` type, reached as a sub-view of the Store settings admin page. */
export interface StoreSettings {
  name: string
  slogan?: string
  /** Uploaded image URLs — may be empty. The first one (if any) is used wherever a single logo is shown (sidebar header, login page). */
  logos: string[]
  /** Uploaded image URL. Falls back to the app's static default favicon when unset. */
  favicon?: string
  /** The business's legal details, printed on register receipts and X/Z reports and written into the SAF-T export. Missing until set in Settings → Store → Company details. */
  legal?: StoreLegalDetails
}

/**
 * The business behind the register, as Norwegian receipts must show it (bokføringsforskriften § 5-3-12
 * via kassasystemforskrifta § 2-8-4). Receipts, reports and exports refuse to run until
 * `missingLegalDetails` finds nothing missing.
 */
export interface StoreLegalDetails {
  /** The registered company name, which may differ from the store's display `name`. */
  companyName: string
  /** Nine-digit organisation number, digits only. */
  orgNumber: string
  /** VAT-registered: receipts print "MVA" after the org number and show VAT per rate. */
  vatRegistered: boolean
  /** Registered in Foretaksregisteret: receipts print "Foretaksregisteret" (required for e.g. an AS). */
  inForetaksregisteret: boolean
  streetAddress: string
  postalCode: string
  city: string
}
