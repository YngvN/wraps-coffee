/**
 * Scratchpad-only — not part of the app. Driver for **Step 2's P2 cover-layer probe**
 * (`coverLayerProbe.mts`), which see for what is being tested and why.
 *
 * Does four things:
 *
 *  1. Generates a full-screen cover image into `dist/` — a saturated magenta/cyan gradient, chosen so
 *     it cannot be confused with any real pane content and so partial paint or tearing shows up as a
 *     broken gradient rather than as an ambiguous colour shift.
 *  2. Injects the probe into the built `dist/index.html` (same delivery as `tv-inject-sampler.mts`).
 *  3. Restarts the companion so the WebView reloads with the probe in it.
 *  4. Samples the panel with `adb exec-out screencap` as fast as the device allows, right through the
 *     probe's armed window, and reports the overlay's measured coverage per sample.
 *
 * The sampling is the point: `screencap` reads SurfaceFlinger's composited output from outside the
 * WebView process, so it keeps working while the WebView's main thread is blocked — which is exactly
 * the interval that cannot be observed from inside the page.
 *
 * Usage: npx tsx QA/scratchpad/qa/tv-cover-probe.mts [collector-origin]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { coverLayerProbeSource, type CoverProbeMode } from './coverLayerProbe.mts'

const COLLECTOR = process.argv[2] ?? 'http://192.168.0.213:4999'
/** `'hold'` (default) asks the required question, `'fade'` the bonus one — see `CoverProbeMode`. */
const MODE = (process.argv[3] as CoverProbeMode | undefined) ?? 'hold'
const INDEX = 'dist/index.html'
const IMAGE_REL = 'qa-cover-probe.png'
const IMAGE_PATH = path.join('dist', IMAGE_REL)
const MARKER = '<!-- qa-cover-probe -->'
const OUT_DIR = 'QA/scratchpad/qa/cover-probe-frames'

// `screencap` costs ~1.4-2.4s per sample on this device, so the fade and the block both have to be
// long enough to contain several samples — a 4s block yielded only one usable frame on the first run.
// 10s each gives ~5 samples inside the block, which is what turns "the layer survived" into a
// measurable *progression* and so answers the second question as well as the first.
const ARM_DELAY_MS = 15_000
const FADE_MS = 10_000
const BLOCK_MS = 10_000
/** Generous tail: the probe arms `ARM_DELAY_MS` after its own script runs, which is well after the app launch this window is timed from (the WebView still has to boot and load the page). */
const SAMPLE_WINDOW_MS = ARM_DELAY_MS + FADE_MS + 20_000

function adb(args: string[]): Buffer {
  return execFileSync('adb', args, { maxBuffer: 64 * 1024 * 1024 })
}

/** The cover image, at the panel's own resolution. A gradient rather than a flat fill so a partially-composited or torn frame is visibly distinguishable from a cleanly-held one. */
async function makeCoverImage(width: number, height: number): Promise<void> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff00c8"/><stop offset="100%" stop-color="#00e5ff"/>
    </linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/>
  </svg>`
  await sharp(Buffer.from(svg)).png().toFile(IMAGE_PATH)
  console.log(`[probe] cover image ${width}x${height} -> ${IMAGE_PATH}`)
}

/**
 * How much of this frame is the cover gradient, 0..1 — measured as the fraction of sampled pixels
 * whose hue falls in the magenta..cyan band the gradient occupies and which are saturated enough not
 * to be ordinary UI chrome. Also returns mean channel values, which is what actually reveals a *fade*:
 * an overlay at 40% opacity over dark pane content reads as a partial, and rising, magenta level.
 */
async function measureCoverage(png: Buffer): Promise<{ coverage: number; meanR: number; meanG: number; meanB: number }> {
  const { data, info } = await sharp(png).resize(160, 90, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  let hits = 0
  let sumR = 0
  let sumG = 0
  let sumB = 0
  const pixels = info.width * info.height
  for (let i = 0; i < pixels; i++) {
    const r = data[i * info.channels]
    const g = data[i * info.channels + 1]
    const b = data[i * info.channels + 2]
    sumR += r
    sumG += g
    sumB += b
    // The gradient is magenta (255,0,200) -> cyan (0,229,255): in both, blue is high and blue clearly
    // exceeds green *or* red is high with green low. Ordinary content on these fixtures is grey,
    // white or dark, where the channels track each other closely.
    if (b > 90 && (Math.abs(b - g) > 45 || Math.abs(r - g) > 60)) hits += 1
  }
  return {
    coverage: hits / pixels,
    meanR: Math.round(sumR / pixels),
    meanG: Math.round(sumG / pixels),
    meanB: Math.round(sumB / pixels),
  }
}

async function main() {
  // Deliberately *not* `wm size`, which reports this panel as 3840x2160. The WebView renders at a
  // 960x540 CSS viewport at devicePixelRatio 2 (see the P1 capability report), so its backing store —
  // and therefore the only size a cover bitmap ever needs to be — is 1920x1080. Generating the
  // 4K image the panel advertises inflates both the decode cost being measured and the memory
  // figure the plan's A-t2 depends on, by 4x, for no gain in fidelity.
  const size = adb(['shell', 'wm', 'size']).toString().trim()
  const width = 1920
  const height = 1080
  console.log(`[probe] panel reports "${size}"; cover generated at WebView backing-store size ${width}x${height}`)

  mkdirSync(OUT_DIR, { recursive: true })
  if (!existsSync(IMAGE_PATH)) await makeCoverImage(width, height)

  const html = readFileSync(INDEX, 'utf-8')
  if (!html.includes(MARKER)) {
    const script = `${MARKER}\n<script>${coverLayerProbeSource(`${COLLECTOR}/cover`, `/${IMAGE_REL}`, ARM_DELAY_MS, FADE_MS, BLOCK_MS, MODE)}</script>\n`
    writeFileSync(INDEX, html.replace('</body>', `${script}</body>`))
    console.log(`[probe] injected into ${INDEX} (mode=${MODE} arm=${ARM_DELAY_MS}ms fade=${FADE_MS}ms block=${BLOCK_MS}ms)`)
  } else {
    console.log('[probe] already injected — rebuild first to change mode')
  }

  console.log('[probe] restarting companion...')
  adb(['shell', 'am', 'force-stop', 'no.adhdisplay.companion'])
  adb(['shell', 'monkey', '-p', 'no.adhdisplay.companion', '-c', 'android.intent.category.LAUNCHER', '1'])

  const startedAt = Date.now()
  const samples: { atMs: number; coverage: number; meanR: number; meanG: number; meanB: number }[] = []
  let n = 0
  while (Date.now() - startedAt < SAMPLE_WINDOW_MS) {
    const atMs = Date.now() - startedAt
    let png: Buffer
    try {
      png = adb(['exec-out', 'screencap', '-p'])
    } catch {
      continue
    }
    const measured = await measureCoverage(png)
    samples.push({ atMs, ...measured })
    // Only the frames that actually show something are worth keeping on disk.
    if (measured.coverage > 0.02) writeFileSync(path.join(OUT_DIR, `f${String(n).padStart(3, '0')}-${atMs}ms.png`), png)
    n += 1
  }

  console.log(`\n=== ${samples.length} samples over ${SAMPLE_WINDOW_MS}ms ===`)
  for (const s of samples) {
    const bar = '#'.repeat(Math.round(s.coverage * 40))
    console.log(
      `  t=${String(s.atMs).padStart(6)}ms  cover=${(s.coverage * 100).toFixed(1).padStart(5)}%  ` +
        `rgb=${String(s.meanR).padStart(3)},${String(s.meanG).padStart(3)},${String(s.meanB).padStart(3)}  ${bar}`,
    )
  }
  writeFileSync(path.join(OUT_DIR, 'samples.json'), JSON.stringify(samples, null, 2))
  console.log(`\n[probe] frames + samples.json in ${OUT_DIR}`)
  console.log('[probe] REBUILD before any frame measurement — this leaves the probe in dist/index.html')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
