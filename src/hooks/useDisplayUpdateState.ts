import type { DisplayUpdateProgress } from '../types/displayMachine'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.displayUpdateState'

/** One in-flight (or recently failed) update run per display, and a setter — written by Display Manager's own "Update to current" button/bulk queue, cleared or timed out server-side (see `mergeDisplayMachineHeartbeat`/`startUpdateFailureSweep` in `server/index.ts`). See `DisplayUpdateProgress`'s own doc comment for why this is a separate synced key rather than a field on `DisplayMachine`. */
export function useDisplayUpdateState() {
  return useLocalStorage<DisplayUpdateProgress[]>(STORAGE_KEY, [])
}
