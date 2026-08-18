// Desktop counterpart to scale-compare-inject.mts — identical measurement logic, so the TV's numbers
// and desktop's are directly comparable. Reports EVERY catalogue slot found (not just the first), with
// the crossfade-slot disambiguation the QA report §10 warns about: reading `querySelector` alone can
// land on a hidden/outgoing slot and produce a confident wrong answer.
import { chromium } from 'playwright'

const BASE_URL = process.env.QA_BASE_URL ?? 'http://localhost:4173'
const SCREEN_ID = 'screen-624ebb7c-9fb9-493c-86c5-ac2baa8d5210'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(7600)

const source = `(() => {
  var out = []
  var slots = document.querySelectorAll('.split-layout__pane-content-inner')
  for (var i = 0; i < slots.length; i++) {
    var contentInner = slots[i]
    if (!contentInner.querySelector('.catalogue-slide__item')) continue
    var contentOuter = contentInner.closest('.split-layout__pane-content')
    var measured = contentInner.firstElementChild || contentInner
    var raw = contentInner.style.getPropertyValue('--slide-item-title-size').trim()
    var base = contentOuter ? contentOuter.style.getPropertyValue('--slide-item-title-size').trim() : ''
    var cs = getComputedStyle(contentInner)
    var outerCs = contentOuter ? getComputedStyle(contentOuter) : null
    out.push({
      slotIndex: i,
      paneId: contentInner.closest('[data-pane-id]') ? contentInner.closest('[data-pane-id]').getAttribute('data-pane-id') : null,
      appliedItemTitle: raw,
      baseItemTitle: base,
      resolvedScale: raw && base ? (parseFloat(raw) / parseFloat(base)).toFixed(4) : null,
      itemsRendered: contentInner.querySelectorAll('.catalogue-slide__item').length,
      scrollH: measured.scrollHeight,
      clientH: contentOuter ? contentOuter.clientHeight : null,
      overflowH: contentOuter ? measured.scrollHeight - contentOuter.clientHeight : null,
      paneW: contentOuter ? contentOuter.clientWidth : null,
      // The visibility tests that distinguish the live slot from the outgoing one.
      innerOpacity: cs.opacity,
      outerOpacity: outerCs ? outerCs.opacity : null,
      outerContentVisibility: outerCs ? outerCs.contentVisibility : null,
      outerTransform: outerCs ? outerCs.transform : null,
      imagesInItems: contentInner.querySelectorAll('.catalogue-slide__item-image').length,
    })
  }
  return {
    stage: document.querySelector('.split-layout') ? document.querySelector('.split-layout').getAttribute('data-stage') : null,
    contentPhase: document.querySelector('.split-layout') ? document.querySelector('.split-layout').getAttribute('data-content-phase') : null,
    catalogueSlots: out,
  }
})()`

console.log(JSON.stringify(await page.evaluate(source), null, 2))
await browser.close()
