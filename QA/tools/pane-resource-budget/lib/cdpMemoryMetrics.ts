import type { CDPSession, Page } from 'playwright'
import type { MemorySample } from '../types'

/**
 * Extends `diagnostics/pane-resize-stutter/lib/cdpTrace.ts`'s own CDP session-setup pattern
 * (`page.context().newCDPSession(page)`, works against a Playwright-launched Chromium and, via
 * `chromium.connectOverCDP()`, Electron or an adb-forwarded TV WebView debug socket alike) with the two
 * metrics that file doesn't capture: `Performance.getMetrics()` for JS heap size and
 * `Memory.getDOMCounters()` for DOM node/listener/document counts. Ported as a sibling file rather than
 * modifying `cdpTrace.ts` itself — that directory is explicitly throwaway/safe-to-delete for its own
 * stutter investigation, so this tool (meant to be kept and re-run) carries its own copy instead of
 * depending on a directory liable to disappear.
 */
export async function openMemoryMetricsSession(page: Page): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page)
  await client.send('Performance.enable')
  return client
}

/** One point-in-time sample of JS heap size + DOM/listener/document counts — see `MemorySample`'s own doc comment for why both `Performance.getMetrics()` and `Memory.getDOMCounters()` are read together rather than picking one. */
export async function sampleMemoryMetrics(client: CDPSession): Promise<MemorySample> {
  const [perf, dom] = await Promise.all([
    client.send('Performance.getMetrics') as Promise<{ metrics: { name: string; value: number }[] }>,
    client.send('Memory.getDOMCounters') as Promise<{ documents: number; nodes: number; jsEventListeners: number }>,
  ])
  const metric = (name: string) => perf.metrics.find((m) => m.name === name)?.value ?? 0
  return {
    timestamp: Date.now(),
    jsHeapUsedBytes: metric('JSHeapUsedSize'),
    jsHeapTotalBytes: metric('JSHeapTotalSize'),
    domNodes: dom.nodes,
    domDocuments: dom.documents,
    jsEventListeners: dom.jsEventListeners,
    /** `Performance.getMetrics()`'s own `Nodes` counter — kept alongside `Memory.getDOMCounters()`'s `nodes` as a cross-check, since the two are computed by different internal subsystems and a large divergence between them is itself a signal worth surfacing rather than silently picking one. */
    perfApiNodes: metric('Nodes'),
  }
}
