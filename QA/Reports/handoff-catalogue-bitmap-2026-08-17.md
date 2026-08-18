# Continue: the catalogue-as-bitmap direction

## Start here

Read `QA/Reports/kiosk-performance-consolidated-2026-08-16.md` in full first. It is the single source
of truth for the kiosk stutter investigation: §1 device/access, §2 measurement methodology (READ THIS
— three incompatible regimes exist, never mix them), §3 established facts 1-17, §4 refuted approaches
(do not re-try these), §9 tooling, §10 traps that have already cost time.

**That report is current only through fact 17.** Everything in this document was measured on
2026-08-17, after it was last written, and is NOT in it. Writing these findings into it is itself an
outstanding task (see "Outstanding work" below).

## What this session established

The prior session found that adding **one catalogue pane** to the otherwise-free `Empty test` fixture
costs 48ms/frame sustained, and attributed it to the deferred shrink-to-fit search still running in
`idle`. **That attribution was half right, and wrong about the half that matters.**

All arms below: regime C, on the TV, `Empty test` (`screen-4d546476-e34b-43d8-b17a-60a430eb48cd`)
with one catalogue pane on leaf `pane-165995c1-7fb3-41b9-b8ed-957daf274735` (the leaf whose box goes
960x1080 -> 960x540 between stages 3 and 4), content = the full `food-menu` catalogue, 7 categories /
55 available items. Medians via `summarize-frames.mts`.

| arm | worst | debt | e / h / i | n | run file |
|---|---:|---:|---|---:|---|
| blank pane (the fixture's own floor) | 20ms | 0ms | 0 / 0 / 0 | 39 | `tv-emptytest.json` |
| **baseline catalogue** | 180ms | 1080ms | 100 / 400 / 660 | 63 | `cat-A0-base.json` |
| shrink search ablated | 170ms | 470ms | 0 / 370 / 120 | 72 | `cat-A1-noshrink.json` |
| fixed layout box only, live DOM | 200ms | 580ms | 0 / 360 / 180 | 65 | `cat-E2-fixedlayout.json` |
| **fixed box + its own CQ container, live DOM** | 80ms | 210ms | 0 / 140 / 40 | 60 | `cat-E3-container.json` |
| **catalogue as cross-mount-cached bitmap** | 40ms | 20ms | 0 / 0 / 0 | 60 | `cat-E-bitmap.json` |

### CONFIRMED — the catalogue's cost is two independent things, not one

Ablating the shrink search outright (fact 8's V1b arm, re-armed as `ABLATE_MEASUREMENT`) removes only
**56% of the debt**, and specifically:

- `idle` debt 660 -> 120 and `exiting` 100 -> 0. The shrink search **is** that, exactly as the prior
  session inferred.
- `holding` debt 400 -> 370 and worst frame 180 -> 170. **Untouched.** The shrink search is not the
  holding cost and is not the worst frame at all.

The residual is the half that matters most: `holding` is the phase the geometry commits and content
mounts in, and the worst frame is what a viewer perceives as the stutter.

### CONFIRMED — the residual is container-query units re-resolving through the animated resize

`.split-layout__pane` declares `container-type: size` (`SplitLayout.scss:122`), so every
`--slide-*-size` — all `cqmin` lengths from `textSizesToCssVars` — resolves against **the pane's own
box**. During a stage transition that box is animated, so every font size in the catalogue changes on
**every frame of the glide**, and each change re-lays-out the whole catalogue.

The cleanest evidence is the E2/E3 pair: those two arms differ by **one CSS line** —
`container-type: size` on the fixed-size raster host — and that line moves holding debt 360 -> 140 and
total debt 580 -> 210. Pinning the host's width/height alone (E2) does nothing, because the host is a
*descendant* of the pane and its contents still resolve `cqmin` against the pane.

**Do not treat the two costs as additive against the 1080ms baseline.** Removing one changes the
other's cost; quote the arms, not a decomposition.

### CONFIRMED — a bitmap reaches the fixture floor; live DOM does not

The cached-bitmap arm is statistically indistinguishable from having no catalogue pane at all (40ms /
20ms, zero debt in all three phases, range [0-140] against the baseline's [80-5140]). The best
live-DOM arm (E3) stops at 80ms / 210ms. The remaining 210ms is text re-rasterising as the transform
scale changes, which only a real raster avoids. **The user has confirmed by eye that E3 still
visibly stutters somewhat; the bitmap does not.**

### CONFIRMED — three implementation traps, each of which silently invalidates the arm

1. **`useCrossfadeSlot` mounts a fresh slide instance on every transition** (report fact 16), so a
   per-instance capture re-captures every stage change. First implementation did exactly this and the
   arm went bimodal — free when it reused a bitmap, seconds when it re-captured. Fixed with a
   module-level cache keyed on content (`bitmapCache`), the same shape as `qrCodePath.ts`'s
   `geometryCache` and `shrinkScaleStore`.
2. **`toPng` never settles against cross-origin Google Fonts.** It inlines every `@font-face` source,
   and Google splits 7 families into ~100 `unicode-range` subset files. Looked exactly like a hang.
   **This is now fixed at the root** — fonts are self-hosted (see below) — but the memoised
   `ensureFontEmbedCss` and the `CAPTURE_TIMEOUT_MS` bound both still matter.
3. **Without `fitIntoRaster` the capture silently truncates the menu.** The raster is a fixed window
   with `overflow: hidden`, and the pane's own `useShrinkToFitFontScale` cannot notice, because
   content inside the raster can never overflow the *pane* — it settles at scale 1 on its first probe
   and shrinks nothing. Observed on the TV as a bitmap containing only the first of seven categories.

### Shipped this session (not experimental — build and lint clean at v0.2.71)

**Self-hosted Google Fonts, offline-capable.** `scripts/fetch-google-fonts.mts` (`npm run
fonts:fetch`) downloads all 999 families from `src/data/googleFonts.json` as woff2 into
`public/fonts/` — 2000 files, 36 MB, restricted to `latin`/`latin-ext`/`vietnamese` subsets (without
that restriction the CJK families alone — `Noto Sans SC/JP/KR`, `Nanum*`, `M PLUS` — take it to
hundreds of MB). `index.html` loads one generated stylesheet; `useGoogleFontLoader` was deleted along
with its three call sites. Fonts are gitignored and fetched at build time by `build-installer.yml`
and `build-with-apk.ps1`, matching how the Node/Ollama installers are already handled; the installer
ships them via its existing `..\public\*` entry. `public/fonts/LICENSES.md` is generated alongside
(redistribution obliges it) and README has a Credits section.

Measured effect on the bitmap path: font-embed CSS 198KB -> 70KB, and **first capture 30-60s+ -> 5s**
on the TV.

**Deliberately NOT used:** `github.com/google/fonts`. That repo is ~1.5 GB of TTF/OTF *sources* for
~1800 families. The CSS API serves woff2 — 3-5x smaller, and exactly the 999 families the picker
offers.

## The open problem — the aspect-ratio limitation

This is the thing to solve, and it is why the bitmap is not shippable as it stands.

The bitmap is captured at one fixed size (the viewport, 960x540 CSS on this TV) and **fitted, not
re-wrapped**, via a contain transform (`min(hostW/rasterW, hostH/rasterH)`). A pane whose aspect
differs from the raster's letterboxes and uses less of its box than live DOM would, at
correspondingly smaller type. On `Empty test`'s extreme stages the probe caught fit scales of 0.36,
0.11 and **0.015** — at that last one the menu is a ~14px sliver.

The consolidated report's §8 step 4 predicted exactly this, listing `CatalogueSlide` as a *wrong*
candidate for the fixed-raster treatment because it must genuinely re-wrap. That objection is about
appearance and it stands. The counter-argument is the measurement: the bitmap is the only arm that
reaches the floor.

Ideas not yet tried, roughly in order of promise:

1. **Capture per aspect bucket.** Key `bitmapCache` on (content, aspect bucket) instead of (content,
   raster size), and capture a handful of bitmaps — one per aspect the screen's stages actually use.
   `computeLayoutGeometry` can enumerate every stage's rect for a pane up front, so the set is known
   and finite, and `warmShrinkScales.ts` already establishes the pattern of pre-rendering every stage
   off-screen at boot. This would make each stage's bitmap correctly re-wrapped for its own shape.
   **Most promising; nothing about it is measured yet.**
2. **Re-capture on aspect change, off the transition path.** Cheaper to build than (1) but pays a
   capture during `idle` after each transition, which is the phase the shrink search was moved into
   and is not free.
3. **Accept letterboxing for panes near the raster's aspect, fall back to live DOM otherwise.** A
   hybrid; needs a threshold and doubles the code paths.

## Also unmeasured / unfinished

- **The bitmap arm has not been re-measured since font embedding landed.** The 40ms/20ms figure
  predates it. Embedding is a one-time capture cost and should not move per-transition numbers, but
  that is an assumption, not a measurement.
- **The E3 arm has not been re-measured since `fitIntoRaster` landed**, and that changes the resolved
  type scale. Its 80ms/210ms is not currently quotable.
- **No real-screen confirmation.** Everything here is `Empty test`, which has 11 stages at extreme
  ratios and may amplify. Use **`Ny test`** (`screen-624ebb7c-9fb9-493c-86c5-ac2baa8d5210`, catalogue
  on `pane-1a58563b` at stage 3) — **`Screen 3 (verify)` (`1783715372380`) no longer exists in the
  store**, so the report's §9 fixtures table is stale on that row. A `ny-base.json` run was started
  and abandoned part-way; treat it as junk.
- **Text legibility at kiosk distance has not been assessed** for a downscaled 960x540 raster.
- **The `cqmin`-freeze alternative was never built.** Instead of a raster host at all, stop
  `--slide-*-size` from re-resolving for the ~300ms the geometry glides (freeze to the target box's
  resolved px, release on `idle`). It keeps live re-flowing DOM, real glyphs, the full menu and the
  true pane shape — no aspect compromise anywhere — and should capture most of E3's win. Arguably the
  better direction; worth building and measuring before committing to bitmaps.

## Code state

**Nothing is committed.** Version is 0.2.71. `npm run build` and `npm run lint` are both clean.

New files:

| file | what |
|---|---|
| `src/features/screens/CatalogueBitmap.tsx` / `.scss` | the whole bitmap experiment: capture, module-level `bitmapCache`, `fitIntoRaster`, `ensureFontEmbedCss`, `liveOnly` mode |
| `src/hooks/useRasterFitScale.ts` | the contain-fit ResizeObserver, extracted from `QrCodeSlide`'s own private `useQrRasterScale` and now shared by both (QR passes a square raster) |
| `scripts/fetch-google-fonts.mts` | the font downloader (shipped, not experimental) |
| `QA/scratchpad/qa/emptytest-variant.mts` | swaps `Empty test`'s target pane between `blank`/`catalogue`/`cat-small`/`cat-mid` over the sync WebSocket — **no rebuild needed**, which makes content-size arms nearly free |
| `QA/scratchpad/qa/bitmapProbe.mts` + `tv-inject-bitmap-probe.mts` | in-page probe reporting capture status, fit scale, host box, bitmap dimensions, data-URL bytes and embedded-font-CSS bytes. **Essential** — a failed/blank/truncated capture is otherwise indistinguishable from a successful one by frame numbers alone |

`QA/scratchpad/qa/frame-collector.mts` gained a `{ kind: 'debug' }` route for that probe.

Experiment flags, **all currently in their shipping/off state** — never commit any as `Boolean(1)`,
and never write one as a literal `true` (report §10):

| flag | file | state |
|---|---|---|
| `CATALOGUE_AS_BITMAP` | `CatalogueSlide.tsx` | `Boolean(0)` |
| `CATALOGUE_FIXED_LAYOUT_ONLY` | `CatalogueSlide.tsx` | `Boolean(0)` — only meaningful with the above on |
| `ABLATE_MEASUREMENT` | `useShrinkToFitFontScale.ts` | `Boolean(0)` |
| `REFLOW_HIDE_ENABLED` | `SplitLayout.tsx` | `Boolean(1)` — **pre-existing**, not this session's; a motion fix from an earlier session, measured performance-neutral |

Arm combinations: bitmap = `CATALOGUE_AS_BITMAP` on, `CATALOGUE_FIXED_LAYOUT_ONLY` off. E3 (live DOM,
pinned container) = both on.

**The `Empty test` fixture currently has the catalogue pane installed** (it shipped blank before this
session). `npx tsx QA/scratchpad/qa/emptytest-variant.mts blank` restores it.

## Guardrails

- Regime C only. `debtByPhase` is the primary metric, not `worstMs`. >=5 rotations, medians, and
  treat a change as real only if the median moves >30% with non-overlapping ranges (report §2).
- Never read a raw run file; always go through `summarize-frames.mts`. Gate run length with
  `wait-frames.mts`, never raw file length (report §10).
- After every build confirm `grep -c qa-frame-sampler dist/index.html` returns 0, or you are
  measuring the previous arm (report §10).
- **Never rebuild while a run is in progress** — the PWA's `registerType: 'autoUpdate'` service
  worker can reload the TV mid-run onto the new build.
- Ask before running Playwright/browser automation against this app (project CLAUDE.md).

## Traps found this session, beyond the report's §10

- **The collector's port 4999 must be verified free *and* the new collector verified started.** If
  the previous collector is still alive the new one dies with `EADDRINUSE` — and because the old one
  is still listening, the next arm's frames land in the **previous arm's file**. This happened and
  cost a run. Check `lsof -ti:4999` after starting, not just before.
- **A live collector rewrites its entire in-memory window array to its file on every POST.** Editing
  or splitting a run file while its collector still runs gets silently clobbered. Kill it first.
- Both of the above are recoverable: `trimToLastLoad`'s own rule (`index` restarting marks a page
  load) lets a contaminated file be split back into its arms by hand.
- **`grep -c` exits non-zero when the count is 0**, which silently breaks `&&` chains in build/verify
  one-liners.
- **`adb exec-out screencap` frequently lands mid-transition**, where pane content is suppressed and
  the pane reads as blank — which looks exactly like a failed capture. Take a burst of 4-6 and pick a
  settled one; cross-check against the probe rather than trusting a single frame.

## Outstanding, unrelated to the bitmap direction

Writing this session's findings — the two-cost split, the `cqmin` mechanism, the arm table above —
into `QA/Reports/kiosk-performance-consolidated-2026-08-16.md` as facts 18+ and refreshing its §9
fixtures table (`Screen 3 (verify)` is gone). This has not been done.
