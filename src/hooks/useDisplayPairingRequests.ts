import type { DisplayPairingRequest } from '../types/displayMachine'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.displayPairingRequests'

/** Every `mobile` (ADHDisplay Companion) device that's heartbeated in but hasn't been approved yet — see `POST /display-machines/pairing-heartbeat` in `server/index.ts` for how a pairing heartbeat updates this same key, and `POST /display-machines/:machineID/approve` for how an entry here turns into a real `admin.displayMachines` entry and is removed from this list. */
export function useDisplayPairingRequests() {
  return useLocalStorage<DisplayPairingRequest[]>(STORAGE_KEY, [])
}
