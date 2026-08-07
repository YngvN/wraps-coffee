import AsyncStorage from '@react-native-async-storage/async-storage'

const SCHEMA_VERSION_STORAGE_KEY = 'adhdisplay-companion/schemaVersion'

export interface Migration {
  version: number
  run: () => Promise<void>
}

/**
 * Ordered, version-stamped local migrations, run once at boot (see `App.tsx`).
 * A display can jump many app versions in a single install (see the Update
 * Channel spec's §5.1 "one hop to current"), so every migration between the
 * stored `schemaVersion` and the latest one must run in sequence, not just
 * the latest — and each `run` must be safe to re-run (idempotent), since a
 * Tier 2/3 update kills this process mid-install and could interrupt a chain
 * before the new `schemaVersion` is persisted.
 */
const migrations: Migration[] = []

export async function runPendingMigrations(): Promise<void> {
  const stored = await AsyncStorage.getItem(SCHEMA_VERSION_STORAGE_KEY)
  const storedVersion = stored ? Number(stored) : 0
  const pending = migrations.filter((migration) => migration.version > storedVersion).sort((a, b) => a.version - b.version)
  for (const migration of pending) {
    await migration.run()
    await AsyncStorage.setItem(SCHEMA_VERSION_STORAGE_KEY, String(migration.version))
  }
}
