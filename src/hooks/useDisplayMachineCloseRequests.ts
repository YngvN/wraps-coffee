import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.displayMachineCloseRequests'

/**
 * `machineID`s an admin has asked to close remotely (see Display Manager's
 * own remove button, `DisplayManagerView.tsx`) — every live `DisplayConnect`/
 * `DisplayWindow` tab watches this list for its own id (see
 * `useDisplayMachineRegistration`) and closes itself, pruning its own entry
 * back out once it acts on it. A request for a machine that's already gone
 * (or never responds) is harmless leftover state — like every synced key,
 * it's file-persisted (see `server/store.ts`'s generic `set`/`loadKey`), so
 * it does survive a server restart, but it's small and self-pruning enough
 * in practice that this is never worth cleaning up proactively.
 */
export function useDisplayMachineCloseRequests() {
  return useLocalStorage<string[]>(STORAGE_KEY, [])
}
