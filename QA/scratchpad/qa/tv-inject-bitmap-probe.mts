/**
 * Scratchpad-only — not part of the app. Appends `bitmapProbe.mts` to the *built* `dist/index.html`,
 * alongside whatever `tv-inject-sampler.mts` already injected, so one TV run reports both its frame
 * numbers and what the `CatalogueBitmap` capture actually produced.
 *
 * Separate from `tv-inject-sampler.mts` rather than folded into it because this probe is specific to
 * one experiment and should not ride along on every future run the way the capability probe does.
 *
 * Usage: npx tsx QA/scratchpad/qa/tv-inject-bitmap-probe.mts <collector-origin>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { bitmapProbeSource } from './bitmapProbe.mts'

const MARKER = '<!-- qa-bitmap-probe -->'
const INDEX = 'dist/index.html'

const collector = process.argv[2]
if (!collector) throw new Error('usage: tv-inject-bitmap-probe.mts <collector-origin>')

const html = readFileSync(INDEX, 'utf-8')
if (html.includes(MARKER)) {
  console.log('[bitmap-probe] already injected — rebuild first to start clean')
  process.exit(0)
}
writeFileSync(INDEX, html.replace('</body>', `${MARKER}\n<script>${bitmapProbeSource(`${collector}/debug`)}</script>\n</body>`))
console.log(`[bitmap-probe] injected into ${INDEX}, posting to ${collector}/debug`)
