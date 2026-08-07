import { writeFileSync } from 'node:fs'
import type { CDPSession, Page } from 'playwright'

/**
 * Chromium-only (CDP is Chromium-specific) — see the plan's Playwright-harness design decision for why
 * Firefox instead relies solely on `rafDeltaCapture.ts`. Covers layout/style-recalc/paint timing plus
 * the `console.timeStamp` markers `transitionMarkers.ts` emits. Includes the `.stack` category so
 * `Layout`/`UpdateLayoutTree` events carry JS call stacks — what `traceParse.ts`'s forced-sync-layout
 * heuristic (P2.3) looks at. Exact event/field names are Chrome-version-dependent; verify once against
 * a trace loaded in real DevTools per the plan's own sanity-check step before trusting the parsed
 * numbers across every automated run.
 */
const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'disabled-by-default-devtools.timeline.stack',
  'blink.user_timing',
  'loading',
]

export interface CapturedTrace {
  traceEvents: TraceEvent[]
}

/** The subset of Chrome's trace-event JSON shape this tooling actually reads — the full format has many more optional fields, left as `unknown` passthrough via the index signature so nothing is silently dropped when the raw file is written back out. */
export interface TraceEvent {
  name: string
  cat: string
  ph: string
  ts: number
  dur?: number
  pid: number
  tid: number
  args?: Record<string, unknown>
  [key: string]: unknown
}

export interface CdpTraceCapture {
  stop: () => Promise<CapturedTrace>
}

/**
 * Starts a raw Chrome trace-event capture over an existing CDP session — the same low-level mechanism
 * regardless of whether `page` came from a Playwright-launched Chromium, `chromium.connectOverCDP()`
 * into Electron, or `chromium.connectOverCDP()` into an adb-forwarded WebView debug socket. See the
 * plan's "one shared parser" design decision. Loadable as-is in real Chrome DevTools' Performance panel
 * for spot-checking (`traceEvents` is the standard shape it expects).
 */
export async function startCdpTrace(page: Page): Promise<CdpTraceCapture> {
  const client: CDPSession = await page.context().newCDPSession(page)
  const events: TraceEvent[] = []

  // Playwright's own CDP protocol types this payload loosely (`{ [key: string]: string }[]`) since it
  // doesn't know Chrome's actual trace-event shape — cast to the shape this tooling relies on.
  client.on('Tracing.dataCollected', (params) => {
    events.push(...(params.value as unknown as TraceEvent[]))
  })
  const tracingComplete = new Promise<void>((resolve) => client.once('Tracing.tracingComplete', () => resolve()))

  await client.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { includedCategories: TRACE_CATEGORIES },
  })

  return {
    stop: async () => {
      await client.send('Tracing.end')
      await tracingComplete
      return { traceEvents: events }
    },
  }
}

export function writeTraceFile(filePath: string, trace: CapturedTrace): void {
  writeFileSync(filePath, JSON.stringify(trace))
}
