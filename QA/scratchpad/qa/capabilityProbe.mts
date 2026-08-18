/**
 * Scratchpad-only — not part of the app. **Step 2's P1 probe** from the mount-stall test plan.
 *
 * The Android TV runs a release build with no attachable DevTools (`webviewDebuggingEnabled` is
 * `{__DEV__}`), so there is no way to ask its WebView what it is from the outside. This asks from the
 * inside instead: injected into the built `dist/index.html` the same way `frameSampler.mts` is, it
 * POSTs one capability report to the collector on first load.
 *
 * It answers two otherwise-expensive questions in a single load:
 *
 *  - **`hasViewTransitions`** — `document.startViewTransition` shipped in Chromium 111. This is the
 *    entire go/no-go for the test plan's path B, and a `false` here kills that path outright (no
 *    polyfill is worth building for it).
 *  - **`hasLoAF`** — `long-animation-frame` shipped in Chromium 123 and reports per-script
 *    `sourceURL`/`functionName` plus a `styleAndLayoutDuration` split. If present, the plan's Step 1a
 *    (a temporary hand-written counter patch across the shrink-to-fit hooks and `SplitLayout`) can be
 *    replaced almost entirely by reading LoAF entries off the device — so this flag is worth knowing
 *    *before* writing any of that instrumentation.
 *
 * `chromeVersion` is parsed out of the UA rather than trusted from a feature flag alone, so the two
 * can be cross-checked against each other — a feature detect that disagrees with the version is a
 * sign the WebView is doing something unusual and worth stopping over.
 */

/** One device's capability report — what `capabilityProbeSource` POSTs. */
export interface CapabilityReport {
  kind: 'capability'
  userAgent: string
  /** Major Chromium version parsed from the UA, or `null` if the UA has no recognisable `Chrome/NNN` token. */
  chromeVersion: number | null
  /** `document.startViewTransition` — path B's availability gate (Chromium 111+). */
  hasViewTransitions: boolean
  /** `long-animation-frame` in `PerformanceObserver.supportedEntryTypes` (Chromium 123+) — would replace most of the plan's Step 1a counter patch. */
  hasLoAF: boolean
  /** Everything `PerformanceObserver` will accept here, verbatim — context for `hasLoAF`, and shows what else is available for attribution without a source patch. */
  supportedEntryTypes: string[]
  /** Whether `performance.memory` is exposed — the only in-page read available for the plan's A-t2 memory-headroom test if adb is unavailable. */
  hasMemoryInfo: boolean
  /** Device pixel dimensions and DPR — confirms the still/snapshot size every bitmap path would actually have to handle, rather than assuming 1920x1080. */
  screen: { width: number; height: number; dpr: number }
  /** `navigator.deviceMemory` in GB if exposed — context for A-t2. */
  deviceMemoryGb: number | null
  /** `navigator.hardwareConcurrency` — how many cores the compositor has to work with alongside the blocked main thread. */
  cores: number | null
}

/**
 * Builds the probe's own source, as a plain string for the same reason `frameSamplerSource` is one:
 * it has to run both under Playwright on desktop and inside a `dist/index.html` on the TV.
 */
export function capabilityProbeSource(postUrl: string): string {
  return `(() => {
  if (window.__qaCapabilityProbe) return;
  window.__qaCapabilityProbe = true;
  var types = [];
  try { types = (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes) || []; } catch (e) {}
  var match = /Chrome\\/(\\d+)/.exec(navigator.userAgent || '');
  var report = {
    kind: 'capability',
    userAgent: navigator.userAgent || '',
    chromeVersion: match ? Number(match[1]) : null,
    hasViewTransitions: typeof document.startViewTransition === 'function',
    hasLoAF: Array.prototype.indexOf.call(types, 'long-animation-frame') !== -1,
    supportedEntryTypes: Array.prototype.slice.call(types),
    hasMemoryInfo: !!(performance && performance.memory),
    screen: { width: screen.width, height: screen.height, dpr: window.devicePixelRatio || 1 },
    deviceMemoryGb: navigator.deviceMemory != null ? navigator.deviceMemory : null,
    cores: navigator.hardwareConcurrency != null ? navigator.hardwareConcurrency : null
  };
  window.__qaCapability = report;
  try {
    fetch(${JSON.stringify(postUrl)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report), keepalive: true });
  } catch (e) {}
})();`
}
