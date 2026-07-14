import { useEffect } from 'react'
import { useStoreSettings } from '../../../hooks/useStoreSettings'

/** The browser's default favicon (`index.html`'s own static `<link rel="icon">`), restored whenever no store favicon is set. */
const DEFAULT_FAVICON_HREF = '/src/assets/images/logo/favicon.ico'

/**
 * Renders nothing — just keeps the browser tab's title and favicon in sync
 * with the store's own branding (see `StoreSettingsView`), live, on every
 * route (`/admin/*` and `/screens/:screenId` alike). Mounted once near the
 * app root in `main.tsx`.
 */
export function StoreBrandingEffect() {
  const [storeSettings] = useStoreSettings()

  useEffect(() => {
    document.title = storeSettings.name.trim() || 'Store Dashboard'
  }, [storeSettings.name])

  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = storeSettings.favicon || DEFAULT_FAVICON_HREF
  }, [storeSettings.favicon])

  return null
}
