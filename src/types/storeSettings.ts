/** Company branding for this store/business — the name shown in the browser tab, sidebar and login page, and used to derive the kiosk screens' own mDNS `.local` name (see `src/utils/mdnsName.ts`). Contact details live in the separate `ContactInfo` type, reached as a sub-view of the Store settings admin page. */
export interface StoreSettings {
  name: string
  slogan?: string
  /** Uploaded image URLs — may be empty. The first one (if any) is used wherever a single logo is shown (sidebar header, login page). */
  logos: string[]
  /** Uploaded image URL. Falls back to the app's static default favicon when unset. */
  favicon?: string
}
