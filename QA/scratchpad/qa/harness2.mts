// Extra batch-review helpers, split out to keep harness.mts diffable.
import type { Page } from 'playwright'
import { exact, waitForSyncFlush } from './harness.mts'

export async function batchCardAction(page: Page, index: number, action: 'confirm' | 'edit' | 'remove') {
  const card = page.locator('.assistant-batch-review__card').nth(index)
  const label = action === 'confirm' ? 'Bekreft' : action === 'edit' ? 'Rediger' : 'Fjern'
  await card.getByRole('button', { name: label, exact: true }).click()
  await waitForSyncFlush(page)
}

export async function clickConfirmAll(page: Page) {
  await page.getByRole('button', { name: 'Bekreft alle', exact: true }).click()
  await waitForSyncFlush(page)
}
export async function clickCancelAll(page: Page) {
  await page.getByRole('button', { name: 'Avbryt alt', exact: true }).click()
  await waitForSyncFlush(page)
}
