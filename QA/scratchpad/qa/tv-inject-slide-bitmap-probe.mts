/**
 * Scratchpad-only — not part of the app. Appends `slideBitmapProbe.mts` to the *built*
 * `dist/index.html`, alongside whatever `tv-inject-sampler.mts` already injected, so one TV run reports
 * both its frame numbers and what the `SlideBitmapLayer` pipeline actually did.
 *
 * Separate from `tv-inject-bitmap-probe.mts`, which injects the *older* `CatalogueBitmap` probe — that
 * one reads DOM this pipeline never renders and would report `host: 'absent'` for a perfectly healthy
 * run.
 *
 * Usage: npx tsx QA/scratchpad/qa/tv-inject-slide-bitmap-probe.mts <collector-origin>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { slideBitmapProbeSource } from './slideBitmapProbe.mts'

const MARKER = '<!-- qa-slide-bitmap-probe -->'
const INDEX = 'dist/index.html'

const collector = process.argv[2]
if (!collector) throw new Error('usage: tv-inject-slide-bitmap-probe.mts <collector-origin>')

const html = readFileSync(INDEX, 'utf-8')
if (html.includes(MARKER)) {
  console.log('[slide-bitmap-probe] already injected — rebuild first to start clean')
  process.exit(0)
}
writeFileSync(INDEX, html.replace('</body>', `${MARKER}\n<script>${slideBitmapProbeSource(`${collector}/debug`)}</script>\n</body>`))
console.log(`[slide-bitmap-probe] injected into ${INDEX}, posting to ${collector}/debug`)
