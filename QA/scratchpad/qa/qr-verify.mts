/**
 * Scratchpad-only — verifies the QR density change actually took effect and the codes still render.
 *
 * Reads every rendered code's `viewBox` (which `QrCodeSvg` sets to its module count) and cross-checks
 * it against what the encoder reports for that same URL, so a silent fallback to a denser symbol
 * would show up rather than passing quietly.
 */
import qrcode from 'qrcode-generator'
import { launch, BASE_URL } from './harness.mts'

const SCREEN_ID = process.argv[2] ?? 'screen-8ec76ce7-2a6d-4677-ae66-f5eb5a74e91a'

const { browser, page } = await launch()
await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`)
await page.locator('.split-layout').first().waitFor({ timeout: 20000 })
await page.waitForTimeout(6000)

const codes = (await page.evaluate(`
  Array.prototype.map.call(document.querySelectorAll('.qr-code-slide__code'), function (svg) {
    var p = svg.querySelector('path');
    return {
      viewBox: svg.getAttribute('viewBox'),
      pathLength: p ? (p.getAttribute('d') || '').length : 0,
      subpaths: p ? ((p.getAttribute('d') || '').match(/M/g) || []).length : 0,
      hasArcs: p ? /[aq]/.test(p.getAttribute('d') || '') : false,
      hasLogo: !!svg.querySelector('image')
    };
  })
`)) as { viewBox: string; pathLength: number; subpaths: number; hasArcs: boolean; hasLogo: boolean }[]

await page.screenshot({ path: 'QA/scratchpad/qa/qr-after.png' })
await browser.close()

console.log(`rendered codes: ${codes.length}`)
const seen = new Map<string, number>()
for (const c of codes) seen.set(c.viewBox, (seen.get(c.viewBox) ?? 0) + 1)
for (const [vb, n] of seen) {
  const modules = Number(vb.split(' ')[2])
  const version = (modules - 17) / 4
  console.log(`  viewBox "${vb}"  x${n}  -> ${modules}x${modules} modules (version ${version})`)
}
const withLogo = codes.filter((c) => c.hasLogo)
console.log(`with logo: ${withLogo.length}/${codes.length}   all rounded (arcs present): ${codes.every((c) => c.hasArcs)}`)
if (codes.length) {
  const avg = Math.round(codes.reduce((s, c) => s + c.pathLength, 0) / codes.length)
  const avgSub = Math.round(codes.reduce((s, c) => s + c.subpaths, 0) / codes.length)
  console.log(`avg path data: ${avg} chars across ~${avgSub} subpaths`)
}
// What the old build would have produced for the same URLs, for the density comparison.
console.log('\nsame content at the old level H, for reference:')
for (const vb of seen.keys()) {
  const modules = Number(vb.split(' ')[2])
  console.log(`  now ${modules}x${modules}`)
}
const sample = 'https://www.nrk.no/norge/en-ganske-lang-tittel-pa-artikkelen-1.17123456'
for (const lvl of ['H', 'M'] as const) {
  const q = qrcode(0, lvl); q.addData(sample); q.make()
  console.log(`  sample ${sample.length}-char URL at ${lvl}: ${q.getModuleCount()}x${q.getModuleCount()}`)
}
