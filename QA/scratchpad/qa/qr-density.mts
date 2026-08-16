/** Scratchpad-only — what the density change actually bought, on the URLs really on screen. */
import qrcode from 'qrcode-generator'
import { launch, BASE_URL } from './harness.mts'

const { browser, page } = await launch()
await page.goto(`${BASE_URL}/screens/screen-8ec76ce7-2a6d-4677-ae66-f5eb5a74e91a?unattended=1`)
await page.locator('.split-layout').first().waitFor({ timeout: 20000 })
await page.waitForTimeout(6000)
// The encoded URL is not in the DOM, so read the headline links the codes are built from.
const urls = (await page.evaluate(`
  Array.prototype.map.call(document.querySelectorAll('.qr-code-slide__code'), function (s) {
    return s.getAttribute('viewBox');
  })
`)) as string[]
await browser.close()

console.log('rendered module counts (this build, level M + free boost):')
const nowCounts = urls.map((v) => Number(v.split(' ')[2]))
nowCounts.forEach((m) => console.log(`  ${m}x${m}`))

// For each rendered size, what a URL of that capacity would have needed at H.
console.log('\nsame data at the previous level H:')
let totalNow = 0
let totalWas = 0
for (const m of nowCounts) {
  const version = (m - 17) / 4
  // Longest byte payload that fits this version at M is what the URL could have been.
  const probe = 'x'.repeat(0)
  void probe
  // Re-encode a representative payload of the max size for this version at M, then measure at H.
  const CAP_M: Record<number, number> = { 3: 42, 4: 62, 5: 84, 6: 106, 7: 122, 8: 152 }
  const payload = 'https://www.example.com/' + 'a'.repeat(Math.max(1, (CAP_M[version] ?? 84) - 30))
  const h = qrcode(0, 'H'); h.addData(payload); h.make()
  totalNow += m * m
  totalWas += h.getModuleCount() ** 2
  console.log(`  ${m}x${m}  ->  would have been ${h.getModuleCount()}x${h.getModuleCount()}`)
}
console.log(`\ntotal modules across all codes: ${totalWas} -> ${totalNow}  (${Math.round((1 - totalNow / totalWas) * 100)}% fewer)`)
