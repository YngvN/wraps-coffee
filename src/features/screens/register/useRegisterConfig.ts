import { useCallback, useEffect, useState } from 'react'
import { fetchRegisterConfig, type RegisterConfig } from '../../../lib/registerApi'

/**
 * What the server tells this register tablet about itself (`GET /register/config`): the live payment
 * providers, which cash register it is, how many staff can sign in, whether receipts can be printed and
 * whether the opening float is still to be counted. Fetched on load, whenever the connection comes back,
 * and on `refresh` (after a float or a Z report); `null` until then (and always off a register tablet).
 */
export function useRegisterConfig(deviceId: string | null, online: boolean): { config: RegisterConfig | null; refresh: () => void } {
  const [config, setConfig] = useState<RegisterConfig | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!deviceId || !online) return
    let alive = true
    fetchRegisterConfig(deviceId)
      .then((value) => {
        if (alive) setConfig(value)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [deviceId, online, version])
  const refresh = useCallback(() => setVersion((value) => value + 1), [])
  return { config, refresh }
}
