import type { ServerResponse } from 'node:http'
import Parser from 'rss-parser'
import { NEWS_SOURCES, type NewsHeadline } from '../src/types/news'
import { sendJson } from './http'

/**
 * Headlines don't need transit's 20s freshness — 10 minutes balances
 * "reasonably fresh for a kiosk display" against not hammering 7 different
 * outlets' own servers on every screen's own poll.
 */
const HEADLINES_CACHE_MS = 10 * 60_000

interface CacheEntry {
  expires: number
  value: NewsHeadline[]
}

/** Per-source cache, same "tiny in-memory TTL cache, no disk persistence" posture as `integrations.ts`'s own `cached()` — this is derived/external data, never user-authored. Keyed per source (not per request) so one slow/broken feed's cache doesn't get invalidated by a request for a different combination of sources. */
const headlinesCache = new Map<string, CacheEntry>()

/**
 * `media:content` isn't part of `rss-parser`'s own normalized `Item` shape
 * (only a plain `<enclosure>` is) — it's how NRK's own feed carries its lead
 * image, the one seeded source that doesn't use `<enclosure>` for it (VG,
 * Aftenposten, Dagbladet, Nettavisen, Dagsavisen and Klar Tale all do, and
 * so already get an image via `item.enclosure` with no extra config). Only
 * `$.url` is read from it; `xml2js`'s own default parsing puts an element's
 * attributes under `$` and leaves this fully untyped by `rss-parser` itself.
 */
interface ItemWithMedia extends Parser.Item {
  'media:content'?: { $?: { url?: string } }
}

const parser = new Parser<Record<string, never>, ItemWithMedia>({ customFields: { item: ['media:content'] } })

/** Strips a handful of common inline HTML tags a feed's own summary occasionally carries (e.g. Dagbladet's) — `contentSnippet` is usually already plain text, but this is a cheap safety net rather than trusting every one of the 7 feeds to always agree. */
function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim()
}

/** Fetches and normalizes one source's own feed, cached independently. Never throws — a broken/slow feed resolves to `[]` so it doesn't take the other requested sources down with it (see `handleHeadlines`). */
async function fetchSourceHeadlines(sourceId: string): Promise<NewsHeadline[]> {
  const source = NEWS_SOURCES.find((candidate) => candidate.id === sourceId)
  if (!source) return []

  const hit = headlinesCache.get(sourceId)
  if (hit && hit.expires > Date.now()) return hit.value

  try {
    const feed = await parser.parseURL(source.feedUrl)
    const headlines: NewsHeadline[] = feed.items
      .filter((item) => item.title && item.link)
      .map((item) => ({
        sourceId,
        title: item.title!,
        link: item.link!,
        publishedAt: item.isoDate ?? undefined,
        description: item.contentSnippet ? stripHtml(item.contentSnippet) : undefined,
        imageUrl: item.enclosure?.url ?? item['media:content']?.$?.url ?? undefined,
        categories: item.categories && item.categories.length > 0 ? item.categories : undefined,
        author: item.creator ?? undefined,
      }))
    headlinesCache.set(sourceId, { expires: Date.now() + HEADLINES_CACHE_MS, value: headlines })
    return headlines
  } catch (error) {
    console.error(`[news] failed to fetch/parse "${sourceId}":`, error)
    return hit?.value ?? []
  }
}

/**
 * Serves `GET /news/headlines?sources=<id,id,...>&count=<n>` — `count` is a
 * *per-source* cap, not a cap on the combined list: each requested source
 * contributes up to its own `count` newest headlines, merged and sorted
 * newest-first only after that. Capping the *combined* list instead (the
 * original behavior) meant a handful of frequently-posting sources crowded
 * out everything else, so enabling more sources didn't actually give a
 * rotating pane more variety — the opposite of what an admin picking
 * several sources would expect. Unknown source ids are silently ignored
 * (matches how an unset/removed `locationId`/`stopId` elsewhere in this app
 * degrades gracefully rather than erroring).
 */
export async function handleHeadlines(res: ServerResponse, sourceIds: string[], count: number) {
  try {
    const perSource = await Promise.all(sourceIds.map((sourceId) => fetchSourceHeadlines(sourceId)))
    const merged = perSource
      .flatMap((headlines) => headlines.slice(0, count))
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    sendJson(res, 200, { headlines: merged })
  } catch (error) {
    console.error('[news] headlines request failed:', error)
    sendJson(res, 502, { error: 'Could not fetch news headlines' })
  }
}
