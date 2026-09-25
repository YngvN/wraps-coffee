import { useEffect, useRef } from 'react'
import { EMPTY_BURST, feedKey } from './scanBurst'

/** Whether a key press is meant for a text field (the PIN pad, the product form) rather than the page. A read-only field (the search box before it's tapped) isn't one. */
function isEditable(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  if ((element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') && (element as HTMLInputElement).readOnly) return false
  return element.isContentEditable || element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT'
}

/**
 * Listens for keyboard-wedge scans anywhere on the page (see `scanBurst.ts` for how a scan is told
 * apart from typing) and calls `onScan` with each. Key presses aimed at a text field are left alone,
 * so a scanner used while the product form is open simply types into its focused barcode field.
 *
 * The final Enter of a scan is swallowed: otherwise it would also "click" whichever button was
 * tapped last (Pay, say), which still has focus.
 */
export function useScanInput(onScan: (raw: string) => void, enabled: boolean): void {
  const handler = useRef(onScan)
  useEffect(() => {
    handler.current = onScan
  })

  useEffect(() => {
    if (!enabled) return
    let state = EMPTY_BURST
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditable(event.target)) return
      const inBurst = state.buffer.length > 0
      const result = feedKey(state, event.key, event.timeStamp || performance.now())
      state = result.state
      if (inBurst && (event.key === 'Enter' || event.key === 'Tab')) event.preventDefault()
      if (result.scanned) handler.current(result.scanned)
    }
    // Capture phase, so the swallowed Enter never reaches a focused button's own handler first.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [enabled])
}
