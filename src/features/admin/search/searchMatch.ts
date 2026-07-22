import type { SearchResultEntry } from './searchTypes'

/**
 * How well `entry` matches `normalizedQuery` (already trimmed/lowercased),
 * lowest number wins: `0` the title starts with it, `1` the title contains
 * it elsewhere, `2` the subtitle contains it, `3` a keyword contains it.
 * `null` means no match at all. Same plain substring posture the
 * page-scoped Integrations search already uses (see
 * `IntegrationSearchResults.tsx`'s own `matches()`), just ranked so a
 * search like "Kylling" surfaces every matching product near the top
 * instead of interleaved with unrelated keyword-only hits.
 */
function matchRank(entry: SearchResultEntry, normalizedQuery: string): number | null {
  const title = entry.title.toLowerCase()
  if (title.startsWith(normalizedQuery)) return 0
  if (title.includes(normalizedQuery)) return 1
  if (entry.subtitle?.toLowerCase().includes(normalizedQuery)) return 2
  if (entry.keywords.some((keyword) => keyword.toLowerCase().includes(normalizedQuery))) return 3
  return null
}

/** Filters `entries` to whatever matches `query` at all, ranked best-first (see `matchRank`), then alphabetically within the same rank. */
export function searchEntries(entries: SearchResultEntry[], query: string): SearchResultEntry[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []
  return entries
    .map((entry) => ({ entry, rank: matchRank(entry, normalizedQuery) }))
    .filter((scored): scored is { entry: SearchResultEntry; rank: number } => scored.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.entry.title.localeCompare(b.entry.title))
    .map((scored) => scored.entry)
}
