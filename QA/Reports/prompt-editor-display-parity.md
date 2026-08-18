# Prompt — make the editor render what the display actually renders

Paste everything below the line into a fresh session.

---

## Task

Make what an admin sees while authoring a screen match what the kiosk display actually renders. Today
they diverge for **two independent reasons**, and fixing either one alone leaves the other in place.

**Read `QA/Reports/kiosk-performance-consolidated-2026-08-16.md` §11 first** — it has the full evidence,
the file references, the three options with their costs, and the two snags already verified in the
editing path. §1 (the device), §2 (measurement regimes) and §10 (traps that have each already cost a
run) are also load-bearing. Do not re-derive what is already written there.

## The two causes, in one line each

1. **CSS pixel size.** The TV lays out at **960x540** CSS px at `devicePixelRatio` 2. The dashboard
   preview lays out at a fixed **1920** long side (`REFERENCE_LONG_SIDE`, `screenPreviewGeometry.ts`) and
   transform-scales down; the fullscreen editor (`ScreenDisplay.tsx`) renders `SplitLayout` raw into
   whatever the browser window happens to be, with no reference size and no aspect lock. Every absolute
   length in slide CSS therefore resolves to a different fraction of the screen — which is what makes the
   TV fit fewer catalogue columns, resolve a much lower shrink scale, and collapse the gaps that
   `--fit-gap-scale = scale²` derives from it.
2. **`subgrid`.** It shipped in Chromium 117; this fleet's WebView is 116. Every
   `grid-template-columns: subgrid` in `WeatherSlide.scss`/`TransitSlide.scss` is dropped at parse time,
   so the kiosk renders the `@supports not (subgrid)` fallback while any desktop browser renders the
   subgrid path. **Anything verified in a desktop browser has verified a code path the kiosk never
   runs.** One of those fallbacks was already found not to align at all.

## What to decide first, and why it is a real decision

§11.3 lists three options. They are not alternatives to pick one from — **(3) is required either way**,
and (1) and (2) are genuinely different products:

- **(1) size-lock the editor** makes the editor emulate the device. Fast, contained, and it needs a
  per-target viewport to emulate (§11.4 — nothing stores one today; decide between a companion-reported
  value and an interim per-screen field, and say which you chose and why).
- **(2) purge absolute px from slide CSS** makes the rendering resolution-independent so no emulation is
  needed at all. Deeper, and it **changes how existing screens look** — column counts will change. That
  is a visual migration on live content, not a refactor, and it must be checked on the actual TV.

Ask the user which they want before building either. If you have a recommendation, give it in one or two
sentences with the trade-off named, then wait.

## Constraints from this repo (`CLAUDE.md`) that apply here

- **Two editors.** A screen is edited from `src/features/admin/screens/ScreenForm.tsx` *and* the
  fullscreen `src/pages/ScreenDisplay.tsx`. Any new authored setting needs a control in **both**, and
  must be verified in a live browser on both — reusing a shared component does not prove the rendering
  path reads the new field.
- If a new authored field lands, check `server/assistant/registry.ts` for the matching entity.
- If a new synced key lands, update `DeveloperDocsView.tsx` + `SYNCED_KEY_DOCS` + both languages.
- No hardcoded user-facing strings — `src/i18n/languages.json`, both `en` and `no`.
- Version bump on completion: `package.json`, `installer/adhdisplay.iss`, `adhdisplay-companion/package.json`,
  `adhdisplay-companion/app.json`, `installer/adhdisplay-companion.iss` — all five, same string.
- **Ask before running Playwright or any browser automation.**

## How to prove it worked

Parity is a comparison, so verify it as one rather than by eye on one surface:

1. Render the same screen at **960x540** and at the editor's own size, and diff the things that actually
   diverge: resolved shrink scale per (pane, stage), catalogue/event-month column counts, and the
   computed `gap`/`padding` on the slide roots. `QA/scratchpad/qa/shrink-correctness.mts` already reports
   resolved scale and slack per pane/stage.
2. For anything DOM-level, sample **in-page on `requestAnimationFrame`** and pass the sampler to
   Playwright as a **source string**, not a function — `tsx`/esbuild wraps inner functions in a `__name()`
   helper that does not exist in the page, and the failure is silent: the sampler never runs, zero samples
   are collected, and the check reports a confident pass. `body-still-check.mts` and
   `pane-backdrop-check.mts` are working examples of the pattern.
3. Confirm on the TV itself, not only on desktop — that is the entire point of the task. §9 has the
   standard run; note `grep -c qa-frame-sampler dist/index.html` must return 0 after every build, or you
   are looking at the previous build.

## Two traps specific to this area

- **Assert the property that actually does the hiding/sizing, on the element that carries it.** A
  `content-visibility: hidden` ancestor leaves a descendant's own computed values untouched; the `'slide'`
  transition style holds `opacity: 1` in all three poses. Reading the wrong element has produced confident
  wrong answers twice in this investigation, in both directions.
- **A frozen box cannot fill a box whose aspect is changing.** Fact 32 tried it and was refuted: a uniform
  scale only tracks proportional change, and a per-axis scale distorts glyphs. `QR_FIXED_RASTER` works
  only because a QR code is scale-invariant and square — that is a property of that content, not a
  transferable technique. Do not reach for it again here.

---

## Also open, and probably unrelated to parity: the catalogue still jitters on the TV

Reported after everything above was written, on `Ny test` (catalogue on `pane-1a58563b` at stage 3):
**the catalogue jitters a little, repeatedly, at rest.** Not during a transition — while the pane is
settled. Treat this as a separate defect from the parity work; it is here only so it is not lost.

**There is a specific, code-derived mechanism that fits, and it has not been verified yet.**
`useShrinkToFitFontScale`'s search is frame-sliced at one probe per animation frame, and `SearchState`'s
`display` field is documented as "the best fitting scale found so far — what stays *painted* between
probes, so a viewer never sees the intermediate candidates". The `'floor'` step breaks that invariant:

```ts
case 'floor': {
  state.low = MIN_SCALE          // 0.01
  state.high = MIN_LEGIBLE_SCALE // 0.5
  state.display = MIN_SCALE      // <-- paints 1% scale for a frame
  state.step = 'bisect'
  applyScale(state.display)
```

`'floor'` runs only when nothing in `[MIN_LEGIBLE_SCALE, 1]` fits — i.e. for exactly the content a real
catalogue is (55 items, resolving near 0.28). So each such pass paints **scale 0.01 for one frame**, then
climbs back up through the bisection (0.255, then converging on ~0.28) over several more frames. And the
2-second safety poll clears the unchanged-box early-out and re-derives from scratch, so this repeats
**every 2 seconds, forever**, on any below-floor pane.

Suspected fix is one line — do not set `display` to `MIN_SCALE`; keep painting the last known-good scale
while the search re-brackets, which is what `display` exists for. Verify before and after by sampling the
applied `--slide-*-size` on the pane's inner element per animation frame (the string-sampler pattern
above) and looking for the 0.01 frame; the jitter should be visible in the data as a single-frame collapse
followed by a climb, on a ~2s period.

Related context that matters if you touch this hook:

- Consolidated report **fact 27**: the soft floor doubled probes per pass (16 vs 8, simulated) and moved
  `debtByPhase` not at all, so this is an *appearance* defect, not a cost one — do not expect a frame
  measurement to show it.
- For below-floor content the seed is never probed at all (`'full'` routes to `'seed'` only when
  `seed > MIN_LEGIBLE_SCALE`), which is why seeding, `shrinkScaleStore` and `warmShrinkScales` are all
  inert for a catalogue. Fixing that is a separate, larger change with its own measurement.
