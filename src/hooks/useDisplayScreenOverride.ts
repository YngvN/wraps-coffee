import type { DisplayScreenOverride } from '../types/displayMachine'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.displayScreenOverride'

/** One remote-navigation screen override per mobile display that's set one via its TV remote, and a setter — written by the hub in response to a device's own `screen-override` WS message (see `server/deviceSocket.ts`), cleared by Display Manager's own "Return to assigned" action (commit 11) or automatically whenever an admin reassigns that display's screen (see `server/index.ts`'s own `admin.displayMachines` write-handler side effect). See `DisplayScreenOverride`'s own doc comment for the full precedence model. */
export function useDisplayScreenOverride() {
  return useLocalStorage<DisplayScreenOverride[]>(STORAGE_KEY, [])
}
