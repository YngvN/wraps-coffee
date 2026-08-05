import { useEffect, useState } from 'react'
import { getLanIp, getScreenAddressSettings } from '../lib/localServer'
import { DEFAULT_SCREEN_ADDRESS_SETTINGS, type ScreenAddressSettings } from '../types/screenAddress'
import { deriveMdnsName } from '../utils/mdnsName'
import { useStoreSettings } from './useStoreSettings'

/**
 * This page's own origin (protocol + host + port), addressed the same way as
 * a screen's own link (see `ScreensView.tsx` and Settings → Advanced's
 * `ScreenAddressSettings`) — so a URL built from it (e.g. for a QR code) is
 * reachable from a different device on the same network, not just this one.
 * `mdns` (the default) uses the store's advertised `.local` name; `custom`
 * uses the admin-typed host; `automatic` falls back to the machine's actual
 * LAN IP (fetched once via `getLanIp`) in place of `localhost`/`127.0.0.1`.
 * Any other hostname is already LAN-reachable as-is, so no lookup is needed.
 */
export function useLanOrigin(): string {
  const [lanIp, setLanIp] = useState<string | null>(null)
  const [addressSettings, setAddressSettings] = useState<ScreenAddressSettings>(DEFAULT_SCREEN_ADDRESS_SETTINGS)
  const [storeSettings] = useStoreSettings()

  useEffect(() => {
    getScreenAddressSettings()
      .then(setAddressSettings)
      .catch(() => setAddressSettings(DEFAULT_SCREEN_ADDRESS_SETTINGS))
  }, [])

  useEffect(() => {
    if (addressSettings.mode !== 'automatic') return
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') return
    getLanIp()
      .then(setLanIp)
      .catch(() => setLanIp(null))
  }, [addressSettings.mode])

  const host =
    addressSettings.mode === 'custom' && addressSettings.customHost
      ? addressSettings.customHost
      : addressSettings.mode === 'mdns' && storeSettings.name.trim()
        ? `${deriveMdnsName(storeSettings.name)}.local`
        : window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? (lanIp ?? window.location.hostname)
          : window.location.hostname

  return `${window.location.protocol}//${host}${window.location.port ? `:${window.location.port}` : ''}`
}
