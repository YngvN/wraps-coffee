import type { DisplayMachine } from '../types/displayMachine'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.displayMachines'

/** Every machine (or `/display-connect` browser tab) that has ever heartbeated in, and a setter for admin edits (assigning a Screen to a monitor) — see `POST /display-machines/heartbeat` in `server/index.ts` for how a heartbeat itself updates this same key. */
export function useDisplayMachines() {
  return useLocalStorage<DisplayMachine[]>(STORAGE_KEY, [])
}
