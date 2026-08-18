/**
 * Scratchpad-only — not part of the app. **Step 2's P2 probe** from the mount-stall test plan.
 *
 * Every in-page bitmap path (the plan's A-web, B and C) rests on one untested assumption: that a
 * bitmap layer which is already painted **stays on screen while the WebView's main thread is
 * blocked**. If a low-end Android WebView blanks, white-flashes or tears during a long main-thread
 * block, all three paths die in their in-page form at once and only the native-overlay variant
 * (A-native, `RemoteNavPreview.tsx`) survives. That makes this the highest-value single test in the
 * plan, and it is deliberately independent of the app's own transition machinery.
 *
 * ## Why it runs inside the app rather than as a standalone page
 *
 * The question is about *this* WebView's compositor. The companion builds its own URL from the
 * assigned screen and cannot be pointed at an arbitrary page, and an Android TV has no general
 * browser to open one in — but more importantly, a standalone page would be a different document
 * with a different compositing setup. Injecting into the real `dist/index.html`, on the real kiosk
 * route, over the real `SplitLayout`, measures the thing actually being asked about.
 *
 * ## Why the instrument is `adb exec-out screencap`, not a phone camera
 *
 * The plan originally specified filming the panel, on the reasoning that `requestAnimationFrame` is
 * blocked by definition during the thing being measured, so the page cannot observe itself. That is
 * true, but `screencap` reads SurfaceFlinger's own composited output from *outside* the WebView
 * process entirely — so it is unaffected by the blocked main thread, needs no human holding a phone,
 * and yields exact pixel values rather than a video to eyeball. `tv-cover-probe.mts` drives it.
 *
 * ## What the shape of the result means
 *
 * The overlay is a full-screen image fading `opacity: 0 -> 1` over `FADE_MS`, and the main thread is
 * blocked for the whole fade. Sampling the panel repeatedly through the block distinguishes three
 * outcomes that have completely different consequences:
 *
 *  - **Overlay brightens progressively across samples** — the fade ran on the compositor, through a
 *    blocked main thread. Best case: a crossfade can run *during* the stall, so the cover can be
 *    presented as an animation rather than having to be fully opaque before the stall begins.
 *  - **Overlay is present but frozen at its starting opacity** — the layer survives, but animation
 *    does not progress. Then any cover must be fully painted *before* the mount commits, and the
 *    crossfade back to live has to wait for the main thread. Still workable; changes the design.
 *  - **Panel goes blank / white / tears** — the compositor cannot hold the layer without the main
 *    thread. A-web, B and C are all dead in their in-page forms.
 */

/** What `coverLayerProbeSource` POSTs once the block has finished — the page's own view of the run, which the screencap timeline is correlated against. */
export interface CoverProbeReport {
  kind: 'cover-probe'
  /** Which question this run asked — see `CoverProbeMode`. */
  mode: CoverProbeMode
  /** `performance.now()` at the moment the overlay was made visible and the fade started, ms since page load. */
  fadeStartedAt: number
  /** `performance.now()` when the busy-block began — should be within a frame of `fadeStartedAt`. */
  blockStartedAt: number
  /** How long the busy loop actually held the main thread, ms. Confirms the block really happened and really lasted this long, rather than being optimised away. */
  blockedForMs: number
  /** The fade's nominal duration, ms — how far through it the block ran. */
  fadeMs: number
  /** Natural pixel size of the image actually used as the cover, for the record. */
  imageSize: { width: number; height: number }
  /** `decode()` duration for that image, ms — a free bonus reading of the plan's A-t1 decode cost, taken on the real device. */
  decodeMs: number
}

/**
 * Builds the probe's source. `imageUrl` must be an already-served, full-screen-sized image (see
 * `tv-cover-probe.mts`, which generates one into `dist/`); `armDelayMs` is how long after load the
 * probe waits before running, which is the window the driver uses to get its screencap loop going.
 */
/**
 * Which of the two questions a run is asking. They need different setups and the first run of this
 * probe conflated them, measuring neither:
 *
 *  - `'hold'` — **the required question.** Put the cover up at full opacity, let it genuinely paint,
 *    *then* block. Answers "does an already-painted layer stay on screen through a main-thread
 *    block". This is what A-web, B and C all actually depend on.
 *  - `'fade'` — the bonus question. Start the fade, let it run for `fadeLeadMs` so it is committed and
 *    visibly progressing, *then* block. Answers "does a running compositor animation keep advancing".
 *
 * The lead-in is the whole point of `'fade'`. Setting `opacity` and blocking in the same task — what
 * the first version did — cannot work: the style change is only committed at the next rendering
 * opportunity, which a blocked main thread never reaches, so the transition never starts. That is a
 * genuine finding about arming a crossfade immediately before a stall, but it is not an answer about
 * the compositor.
 */
export type CoverProbeMode = 'hold' | 'fade'

export function coverLayerProbeSource(
  postUrl: string,
  imageUrl: string,
  armDelayMs = 12000,
  fadeMs = 4000,
  blockMs = 4000,
  mode: CoverProbeMode = 'hold',
  /** `'fade'` only: how long the fade is allowed to run before the block starts. Must be at least a few frames. */
  fadeLeadMs = 2000,
): string {
  return `(() => {
  if (window.__qaCoverProbe) return;
  window.__qaCoverProbe = true;

  function run() {
    var img = new Image();
    img.src = ${JSON.stringify(imageUrl)};
    var decodeStart = performance.now();
    img.decode().then(function () {
      var decodeMs = performance.now() - decodeStart;

      // Full-screen, above everything, and pre-promoted onto its own compositor layer *before* the
      // block — \`will-change: opacity\` is what makes the fade a candidate for running off the main
      // thread at all, which is exactly the property under test.
      var MODE = ${JSON.stringify(mode)};
      img.style.cssText = [
        'position:fixed', 'inset:0', 'width:100vw', 'height:100vh',
        'object-fit:cover', 'z-index:2147483647', 'pointer-events:none',
        MODE === 'hold' ? 'opacity:1' : 'opacity:0',
        'will-change:opacity',
        MODE === 'hold' ? '' : 'transition:opacity ${fadeMs}ms linear'
      ].join(';');
      document.body.appendChild(img);

      function block(fadeStartedAt) {
        var blockStartedAt = performance.now();
        var spin = 0;
        while (performance.now() - blockStartedAt < ${blockMs}) { spin += 1; }
        var blockedForMs = performance.now() - blockStartedAt;

        var report = {
          kind: 'cover-probe',
          mode: MODE,
          fadeStartedAt: Math.round(fadeStartedAt),
          blockStartedAt: Math.round(blockStartedAt),
          blockedForMs: Math.round(blockedForMs),
          fadeMs: ${fadeMs},
          imageSize: { width: img.naturalWidth, height: img.naturalHeight },
          decodeMs: Math.round(decodeMs * 10) / 10,
          spin: spin
        };
        window.__qaCoverProbeReport = report;
        try {
          fetch(${JSON.stringify(postUrl)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report), keepalive: true });
        } catch (e) {}

        // Leave the overlay up well past the block so the driver's slow screencap cadence still gets
        // several post-block samples to compare the during-block ones against.
        setTimeout(function () { img.remove(); }, 6000);
      }

      if (MODE === 'hold') {
        // Two frames to commit and paint the overlay, then a further real delay so there is no doubt
        // it is fully composited and on the panel before the main thread stops. Only then block —
        // this is what makes the samples taken during the block interpretable as "the layer held".
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            setTimeout(function () { block(performance.now()); }, 1500);
          });
        });
      } else {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var fadeStartedAt = performance.now();
            img.style.opacity = '1';
            // Let the fade actually run and get committed to the compositor before blocking — see
            // CoverProbeMode. Without this lead-in the transition never starts and the run measures
            // nothing about the compositor at all. (No backticks in comments inside this template
            // literal — one would terminate the string.)
            setTimeout(function () { block(fadeStartedAt); }, ${fadeLeadMs});
          });
        });
      }
    }).catch(function () {});
  }

  setTimeout(run, ${armDelayMs});
})();`
}
