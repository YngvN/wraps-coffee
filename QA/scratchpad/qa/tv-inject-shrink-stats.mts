/**
 * Scratchpad-only — not part of the app. Appends `shrinkStatsProbe.mts` to the *built*
 * `dist/index.html`, alongside whatever `tv-inject-sampler.mts` already injected, so one TV run
 * reports both its frame numbers and what `useShrinkToFitFontScale` actually did to produce them.
 *
 * Separate from `tv-inject-sampler.mts` for the same reason `tv-inject-bitmap-probe.mts` is: this
 * probe belongs to one experiment (arm H) and should not ride along on every future run.
 *
 * Usage: npx tsx QA/scratchpad/qa/tv-inject-shrink-stats.mts <collector-origin>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { shrinkStatsProbeSource } from './shrinkStatsProbe.mts'

const MARKER = '<!-- qa-shrink-stats-probe -->'
const INDEX = 'dist/index.html'

const collector = process.argv[2]
if (!collector) throw new Error('usage: tv-inject-shrink-stats.mts <collector-origin>')

const html = readFileSync(INDEX, 'utf-8')
if (html.includes(MARKER)) {
  console.log('[shrink-stats] already injected — rebuild first to start clean')
  process.exit(0)
}
writeFileSync(INDEX, html.replace('</body>', `${MARKER}\n<script>${shrinkStatsProbeSource(`${collector}/debug`)}</script>\n</body>`))
console.log(`[shrink-stats] injected into ${INDEX}, posting to ${collector}/debug`)
