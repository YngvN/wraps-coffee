import qrcode from 'qrcode-generator'

/** The four QR error-correction levels, weakest to strongest. `L` corrects ~7% of the symbol, `M` ~15%, `Q` ~25%, `H` ~30%. */
export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

/** Strongest-first, for `boostLevel` below. */
const LEVELS_STRONGEST_FIRST: QrErrorCorrectionLevel[] = ['H', 'Q', 'M', 'L']

/**
 * Corner radius of a module run, in module units.
 *
 * Purely cosmetic — the codes should read as rounded rather than hard-edged. Kept below `0.5` (half a
 * module) so a lone 1x1 module stays a rounded square rather than collapsing to a circle, which is
 * where corner erosion starts costing a decoder real edge definition.
 */
const CORNER_RADIUS = 0.3

/** A rectangular region of the symbol to leave blank, in module coordinates — what the embedded logo sits in. */
export interface QrExcavation {
  x: number
  y: number
  width: number
  height: number
}

export interface QrCodeGeometry {
  /** Modules per side. Also the `viewBox` extent, so the path below is in module coordinates. */
  moduleCount: number
  /** SVG path data for every dark module, as merged rounded runs. */
  path: string
  /** The level actually used — may be stronger than requested, see `buildQrGeometry`. */
  level: QrErrorCorrectionLevel
}

/**
 * Builds `value`'s QR symbol at the smallest version that holds it at `minLevel`, then upgrades the
 * error correction as far as that *same* version allows.
 *
 * This reproduces `qrcode.react`'s own `boostLevel` behaviour, which defaulted to on and which this
 * module would otherwise silently lose when it replaced that library. Version (and therefore module
 * count, and therefore rasterisation cost) is what the caller is paying for; a stronger level that
 * fits inside the version already chosen costs nothing at all, so there is never a reason to decline
 * it. The result is "never denser than `minLevel` asked for, never weaker than it could have had for
 * free".
 */
function buildBoosted(value: string, minLevel: QrErrorCorrectionLevel): { qr: ReturnType<typeof qrcode>; level: QrErrorCorrectionLevel } {
  // `0` asks the library for the minimum version that fits — the whole point of the exercise.
  const base = qrcode(0, minLevel)
  base.addData(value)
  base.make()

  const moduleCount = base.getModuleCount()
  // Every QR version N is `17 + 4N` modules per side; inverting gives the version the library picked.
  const version = (moduleCount - 17) / 4

  for (const candidate of LEVELS_STRONGEST_FIRST) {
    if (candidate === minLevel) break
    try {
      // Pinned to `version`, not `0` — a stronger level is only free if it needs no bigger symbol.
      // `make()` throws when the data does not fit, which is the "not free" signal.
      const boosted = qrcode(version as Parameters<typeof qrcode>[0], candidate)
      boosted.addData(value)
      boosted.make()
      if (boosted.getModuleCount() === moduleCount) return { qr: boosted, level: candidate }
    } catch {
      // Does not fit at this version — try the next level down.
    }
  }
  return { qr: base, level: minLevel }
}

/**
 * Formats a module coordinate as compactly as SVG allows — three decimals is far inside a single
 * module's precision, and the leading zero of `0.3` is redundant to a path parser.
 *
 * Worth the fuss because this runs four times per corner, four corners per run, and several hundred
 * runs per code, times every QR pane on screen. The path string is built, handed to the DOM and
 * re-parsed by the renderer on every mount, and mount is exactly the moment this whole change is
 * trying to make cheaper.
 */
function n(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded).replace(/^(-?)0\./, '$1.')
}

/**
 * A rounded rectangle subpath, in module coordinates.
 *
 * Quadratic curves with the control point sitting on the corner, rather than true circular arcs
 * (`a`): four numbers per corner instead of seven, which is roughly 40% less path data for the same
 * shape. A quadratic is a parabola rather than a quarter circle, but at these radii the difference is
 * far below one device pixel at any size these codes are ever drawn at.
 */
function roundedRect(x: number, y: number, width: number, height: number, radius: number): string {
  // Never more than half the shorter side, or the corners would overlap and the shape would invert.
  const r = Math.min(radius, width / 2, height / 2)
  const horizontal = width - 2 * r
  const vertical = height - 2 * r
  return (
    `M${n(x + r)} ${n(y)}` +
    `h${n(horizontal)}` +
    `q${n(r)} 0 ${n(r)} ${n(r)}` +
    `v${n(vertical)}` +
    `q0 ${n(r)} ${n(-r)} ${n(r)}` +
    `h${n(-horizontal)}` +
    `q${n(-r)} 0 ${n(-r)} ${n(-r)}` +
    `v${n(-vertical)}` +
    `q0 ${n(-r)} ${n(r)} ${n(-r)}z`
  )
}

/**
 * One run of horizontally-adjacent modules. Runs are merged rather than each module drawn separately:
 * it is what keeps the path to roughly one subpath per run instead of one per dark module, which on a
 * 37x37 symbol is the difference between ~200 subpaths and ~680. An isolated module comes out a
 * rounded square, a horizontal pair or triple a pill.
 */
function roundedRun(x: number, y: number, width: number, radius: number): string {
  return roundedRect(x, y, width, 1, Math.min(radius, 0.5))
}

/** Side of a QR finder pattern, in modules — fixed by the spec at 7, for every version. */
const FINDER_SIZE = 7

/**
 * How round the finder patterns are, as a fraction of each ring's own side. Applied to all three
 * concentric parts so they stay visually coherent as they shrink (7 -> ~1.96, 5 -> ~1.4, 3 -> ~0.84
 * modules of radius).
 */
const FINDER_RADIUS_FRACTION = 0.28

/**
 * The three big squares in the corners, drawn as concentric rounded squares rather than as module
 * runs.
 *
 * Without this they come out visibly wrong. A finder pattern is a 7x7 dark ring, a 5x5 light ring and
 * a 3x3 dark centre, and the run-merging above draws each of its rows as its own separate pill — so
 * the ring renders as a stack of horizontal stripes instead of a square outline. Drawing them
 * explicitly is what gives the "rounded square" look, and it is also *cheaper*: three subpaths per
 * finder instead of roughly eleven runs.
 *
 * The 5x5 middle ring is emitted as a hole, which is why the rendered path uses `fill-rule="evenodd"`
 * (see `QrCodeSvg`). Module runs never overlap each other, so that rule changes nothing else.
 *
 * The geometry is fixed by the QR spec for every version, so it is safe to draw from constants rather
 * than read back out of the matrix.
 */
function finderPattern(x: number, y: number): string {
  const outer = roundedRect(x, y, FINDER_SIZE, FINDER_SIZE, FINDER_SIZE * FINDER_RADIUS_FRACTION)
  const hole = roundedRect(x + 1, y + 1, 5, 5, 5 * FINDER_RADIUS_FRACTION)
  const centre = roundedRect(x + 2, y + 2, 3, 3, 3 * FINDER_RADIUS_FRACTION)
  return outer + hole + centre
}

/**
 * **Experiment (2026-08-16) — cache `buildQrGeometry`'s result across mounts, not just within one.**
 *
 * `QrCodeSvg`'s own `useMemo` already avoids recomputing this on a re-render of an *already-mounted*
 * instance, but a QR pane's crossfade slot (`useCrossfadeSlot`) mounts a **fresh** component instance
 * into the alternate slot on every single stage transition — a brand-new `useMemo` with nothing in
 * it, so the whole encode-and-rasterise cost repeats every time even when the code being drawn is
 * byte-identical to one already drawn a moment ago. That's true far more often than it looks: a
 * `linkMode: 'custom'` code never changes at all, and a `linkMode: 'news'` one only changes as often
 * as the headline it follows does (`useCurrentNewsHeadline`) — on a stage-driven screen that's the
 * headline's own rotation length (`DEFAULT_NEWS_HEADLINE_COUNT` headlines), not every transition.
 *
 * `buildQrGeometry` is a pure function of its own three arguments — no DOM, no randomness — so unlike
 * the shrink-to-fit scale this cache needs no seeding pass and no invalidation: the same inputs
 * always produce the same output, forever, so a cache hit is simply correct rather than merely a
 * good guess. Flip to `Boolean(0)` to bypass it. See `ARM_A_DEFERRED_SEARCH` (`useShrinkToFitFontScale.ts`)
 * for why this is `Boolean(1)` and not a literal `true`.
 */
const CACHE_QR_GEOMETRY = Boolean(1)

/** Bounds the cache below — comfortably more than any kiosk's own QR pane count times the handful of distinct excavation boxes a logo toggle produces, while staying bounded against a `'news'`-linked pane cycling through many distinct headlines over a long uptime. Evicts least-recently-written first. */
const GEOMETRY_CACHE_LIMIT = 64

const geometryCache = new Map<string, QrCodeGeometry>()

function geometryCacheKey(value: string, minLevel: QrErrorCorrectionLevel, excavation: QrExcavation | undefined): string {
  const e = excavation ? `${excavation.x},${excavation.y},${excavation.width},${excavation.height}` : ''
  return `${minLevel}|${e}|${value}`
}

/**
 * Encodes `value` and returns the geometry needed to draw it as a single `<path>` in a
 * `0 0 moduleCount moduleCount` viewBox.
 *
 * `excavation` (the embedded logo's own box, in module coordinates) is skipped while emitting, which
 * is this module's replacement for `qrcode.react`'s `imageSettings.excavate` — the caller draws the
 * logo itself on top. Excavating is what the error-correction level has to be strong enough to
 * survive, so the two are chosen together: see `QrCodeSlide`'s own call site.
 */
export function buildQrGeometry(value: string, minLevel: QrErrorCorrectionLevel, excavation?: QrExcavation): QrCodeGeometry {
  if (CACHE_QR_GEOMETRY) {
    const key = geometryCacheKey(value, minLevel, excavation)
    const cached = geometryCache.get(key)
    if (cached) return cached
    const geometry = buildQrGeometryUncached(value, minLevel, excavation)
    geometryCache.delete(key)
    geometryCache.set(key, geometry)
    while (geometryCache.size > GEOMETRY_CACHE_LIMIT) geometryCache.delete(geometryCache.keys().next().value as string)
    return geometry
  }
  return buildQrGeometryUncached(value, minLevel, excavation)
}

function buildQrGeometryUncached(value: string, minLevel: QrErrorCorrectionLevel, excavation?: QrExcavation): QrCodeGeometry {
  const { qr, level } = buildBoosted(value, minLevel)
  const moduleCount = qr.getModuleCount()

  const isClear = (row: number, col: number): boolean => {
    if (!excavation) return false
    return col >= excavation.x && col < excavation.x + excavation.width && row >= excavation.y && row < excavation.y + excavation.height
  }

  /** Top-left corners of the three finder patterns. Their positions are fixed by the spec for every version. */
  const finderOrigins = [
    { x: 0, y: 0 },
    { x: moduleCount - FINDER_SIZE, y: 0 },
    { x: 0, y: moduleCount - FINDER_SIZE },
  ]
  /** Finder modules are drawn by `finderPattern` instead, so the run walk below has to leave them out or they would be painted twice — and the second, striped version would fill the hole back in under `evenodd`. */
  const isFinder = (row: number, col: number): boolean =>
    finderOrigins.some((o) => col >= o.x && col < o.x + FINDER_SIZE && row >= o.y && row < o.y + FINDER_SIZE)

  const parts: string[] = finderOrigins.map((o) => finderPattern(o.x, o.y))
  for (let row = 0; row < moduleCount; row++) {
    let runStart: number | null = null
    for (let col = 0; col <= moduleCount; col++) {
      const dark = col < moduleCount && qr.isDark(row, col) && !isClear(row, col) && !isFinder(row, col)
      if (dark && runStart === null) runStart = col
      else if (!dark && runStart !== null) {
        parts.push(roundedRun(runStart, row, col - runStart, CORNER_RADIUS))
        runStart = null
      }
    }
  }

  return { moduleCount, path: parts.join(''), level }
}
