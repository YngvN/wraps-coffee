import { useStoreSettings } from '../../../hooks/useStoreSettings'
import './StoreBrandHeader.scss'

/** The store's own name + first logo (if any), shown above the sidebar nav and above the login form — so Store settings (see `StoreSettingsView`) visibly pays off, not just a settings form nobody sees reflected anywhere. Renders nothing if the store name is still empty (a fresh install before it's been filled in). */
export function StoreBrandHeader() {
  const [storeSettings] = useStoreSettings()
  if (!storeSettings.name.trim()) return null

  return (
    <div className="store-brand-header">
      {storeSettings.logos[0] && <img src={storeSettings.logos[0]} alt="" className="store-brand-header__logo" />}
      <span className="store-brand-header__name">{storeSettings.name}</span>
    </div>
  )
}
