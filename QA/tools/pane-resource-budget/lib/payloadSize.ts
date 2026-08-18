import { MAX_PANE_CUSTOM_CSS_LENGTH, MAX_PANE_CUSTOM_HTML_LENGTH, type ScreenConfig } from '../../../../src/types/screen'
import type { PayloadSizeReport } from '../types'

const DEFAULT_NEAR_CAP_THRESHOLD = 0.9

/**
 * A plain JSON-size check, no browser required — the hard per-field `MAX_PANE_CUSTOM_CSS_LENGTH`/
 * `MAX_PANE_CUSTOM_HTML_LENGTH` caps already bound one pane's own worst case, but not what a whole
 * screen with several such panes looks like at once (the sync payload every connected admin/kiosk
 * client receives on every write to that screen).
 */
export function computePayloadSizeReport(screen: ScreenConfig, nearCapThreshold = DEFAULT_NEAR_CAP_THRESHOLD): PayloadSizeReport {
  const totalBytes = Buffer.byteLength(JSON.stringify(screen), 'utf8')
  const slots = Object.values(screen.paneSlots)
  const cssThresholdChars = MAX_PANE_CUSTOM_CSS_LENGTH * nearCapThreshold
  const htmlThresholdChars = MAX_PANE_CUSTOM_HTML_LENGTH * nearCapThreshold

  let panesNearCssCap = 0
  let panesNearHtmlCap = 0
  for (const slot of slots) {
    if ((slot.customCss?.length ?? 0) >= cssThresholdChars) panesNearCssCap += 1
    if ((slot.customHtml?.length ?? 0) >= htmlThresholdChars) panesNearHtmlCap += 1
  }

  return {
    screenId: screen.screenID,
    totalBytes,
    paneCount: slots.length,
    panesNearCssCap,
    panesNearHtmlCap,
    nearCapThreshold,
  }
}

export function formatPayloadSizeReport(report: PayloadSizeReport): string {
  const kb = (report.totalBytes / 1024).toFixed(1)
  return `[payload] ${report.screenId}: ${kb} KB total, ${report.paneCount} panes, ${report.panesNearCssCap} near CSS cap, ${report.panesNearHtmlCap} near HTML cap (>=${Math.round(report.nearCapThreshold * 100)}%)`
}
