import type { SyncedKey } from '../src/types/sync'
import * as store from './store'

/**
 * Purges the public website's edge cache after this app pushes new data to it.
 *
 * **Why this exists.** The website's read endpoints are cached at Netlify's
 * edge specifically so ordinary visitor traffic stops waking the shared
 * database on every page view (see that project's own
 * `netlify/functions/shared/http.ts`). Caching only works if something says
 * when the data changed — and this app is the only thing that knows, since it
 * is the only writer.
 *
 * **Entirely best-effort.** Every failure here is logged and dropped: a purge
 * that doesn't happen means the website serves a slightly stale menu until its
 * own TTL expires, which is exactly what it did before any of this existed. It
 * must never turn into a failed save, so no caller awaits it and none of the
 * bridge's own error reporting is wired to it.
 *
 * Requires the website's base URL (Settings → For developers). With that
 * unset, purging is silently skipped.
 */

/** Matches the `CACHE_TAGS` values in the website repo's own `shared/http.ts` — a contract with a separate repo, so renaming one means changing both. */
const TAGS_BY_KEY: Partial<Record<SyncedKey, string>> = {
  'admin.products': 'menu',
  'admin.categoryPrices': 'menu',
  // Not menu *content*, but menu *order* — a catalogue/category reorder re-pushes the products table (see `CATALOGUE_ORDER_KEYS`), so the same tag has to be purged for the new order to actually be served.
  'admin.catalogues': 'menu',
  'admin.contactInfo': 'contact-info',
  'admin.events': 'events',
  'admin.messageBoards': 'message-board',
  'admin.messageBoardPosts': 'message-board',
  'admin.appearanceThemes': 'theme',
}

/** A purge is a nicety, not a sync step — it must never hold up the push that triggered it. */
const PURGE_TIMEOUT_MS = 5000

/**
 * Which website cache tags a synced key's own data feeds into.
 *
 * @param keys The keys just pushed.
 * @returns The distinct tags to purge, empty when none of the keys are public.
 */
export function tagsForKeys(keys: Iterable<SyncedKey>): string[] {
  const tags = new Set<string>()
  for (const key of keys) {
    const tag = TAGS_BY_KEY[key]
    if (tag) tags.add(tag)
  }
  return [...tags]
}

/**
 * Asks the website to drop the edge-cached copies of the given tags.
 *
 * Fire-and-forget: resolves either way, and never throws.
 *
 * @param tags Cache tags, usually from {@link tagsForKeys}.
 */
export async function purgeWebsiteCache(tags: string[]): Promise<void> {
  if (tags.length === 0) return

  const websiteUrl = store.getWebsiteUrl()
  if (!websiteUrl) return

  // The website checks this against its own `API_KEY`, which is this very key
  // — the admin copies it across when setting the site up.
  const apiKey = store.getDeveloperApiKey()
  if (!apiKey) {
    console.warn('[neon] skipping cache purge: no developer key has been generated yet')
    return
  }

  try {
    const response = await fetch(`${websiteUrl}/.netlify/functions/purge-cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
    })

    if (!response.ok) {
      console.warn(`[neon] cache purge rejected (${response.status}) for: ${tags.join(', ')}`)
      return
    }

    console.log(`[neon] purged website cache: ${tags.join(', ')}`)
  } catch (error) {
    console.warn('[neon] cache purge failed:', error instanceof Error ? error.message : String(error))
  }
}

/** Convenience wrapper for the common "one or more keys were just pushed" case. */
export function purgeForKeys(keys: Iterable<SyncedKey>): void {
  void purgeWebsiteCache(tagsForKeys(keys))
}
