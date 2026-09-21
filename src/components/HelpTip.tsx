import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useEscapeToClose } from '../hooks/useEscapeToClose'
import { useLanguage } from '../i18n'
import './HelpTip.scss'

/** Gap in px between the trigger and the revealed bubble, and the minimum breathing room kept against the viewport edges. */
const BUBBLE_OFFSET = 8

interface HelpTipProps {
  /**
   * The explanatory content to reveal. Normally an already-translated string
   * (the result of `t(...)`), same as every other label prop in this codebase;
   * `ReactNode` so two short related sentences can be passed as one fragment
   * rather than forcing two separate `?` triggers onto one control.
   */
  text: ReactNode
  /**
   * Accessible name for the trigger button, overriding the shared
   * `admin.common.helpTip` default. Worth passing when several tips sit in
   * one row and "More info" alone wouldn't say which field it belongs to.
   */
  label?: string
  className?: string
}

/**
 * The little `?` button that hides a field's explanatory helper text until
 * it's actually wanted — hover on a mouse, tap on a touch screen, focus +
 * Enter/Space on a keyboard. Replaces the always-rendered `<p className="…__hint">`
 * lines that used to sit permanently under a field, which crowded the admin
 * forms with text most users only need once.
 *
 * The bubble is `position: fixed` and measured from the trigger's own rect
 * rather than absolutely positioned inside its parent, because these tips
 * live inside scrollable, `overflow: hidden` side panels (`FloatingPanel`,
 * the settings cards) that would otherwise clip it. It flips above the
 * trigger when there isn't room below, and is clamped to the viewport
 * horizontally. Any scroll or resize closes it instead of trying to track
 * the trigger — cheaper, and a tooltip that outlives the element it points
 * at is worse than one that simply dismisses.
 *
 * Deliberately not used for conditional status/empty-state messages ("No
 * stops configured yet", "Look up your address first") — those need to stay
 * visible, since they tell the user something about *right now* rather than
 * explaining what a control does.
 */
export function HelpTip({ text, label, className }: HelpTipProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const bubbleId = useId()

  const close = useCallback(() => setOpen(false), [])
  useEscapeToClose(open, close)

  /**
   * Positions the bubble the moment React attaches it. Done here, writing
   * straight to the node, rather than in a `useLayoutEffect` that stores a
   * position in state — that would mean a second render for every open, which
   * this codebase's `react-hooks/set-state-in-effect` rule rightly rejects.
   * The bubble is authored `visibility: hidden` so it never paints at 0,0
   * before this runs.
   */
  const positionBubble = useCallback((node: HTMLDivElement | null) => {
    bubbleRef.current = node

    const trigger = triggerRef.current
    if (!node || !trigger) return

    const triggerRect = trigger.getBoundingClientRect()
    const { height: bubbleHeight, width: bubbleWidth } = node.getBoundingClientRect()

    const spaceBelow = window.innerHeight - triggerRect.bottom
    const placement = spaceBelow < bubbleHeight + BUBBLE_OFFSET && triggerRect.top > spaceBelow ? 'top' : 'bottom'

    const maxLeft = window.innerWidth - bubbleWidth - BUBBLE_OFFSET
    const left = Math.max(BUBBLE_OFFSET, Math.min(triggerRect.left + triggerRect.width / 2 - bubbleWidth / 2, maxLeft))
    const top = placement === 'bottom' ? triggerRect.bottom + BUBBLE_OFFSET : triggerRect.top - bubbleHeight - BUBBLE_OFFSET

    node.dataset.placement = placement
    node.style.top = `${top}px`
    node.style.left = `${left}px`
    node.style.visibility = 'visible'
  }, [])

  // Dismiss on anything that would move the trigger out from under the bubble,
  // plus a click anywhere else. `true` (capture) so a scroll inside any nested
  // scroll container counts, not just the window's own.
  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || bubbleRef.current?.contains(target)) return
      setOpen(false)
    }

    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    document.addEventListener('pointerdown', handlePointerDown, true)

    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [open, close])

  return (
    <span className={`help-tip${className ? ` ${className}` : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="help-tip__trigger"
        aria-label={label ?? t('admin.common.helpTip')}
        aria-expanded={open}
        aria-describedby={open ? bubbleId : undefined}
        // Hover is mouse-only on purpose: on a touch screen the tap already
        // fires `onClick`, and letting it also open on `pointerenter` leaves
        // the bubble stuck open after the finger lifts.
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setOpen(true)
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setOpen(false)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        // Stop both activation paths from reaching an interactive ancestor:
        // several of these tips sit inside `AnimatedDetails`' `role="button"`
        // summary row, which would otherwise expand/collapse the whole
        // section every time the tip is opened.
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
        }}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <div
          ref={positionBubble}
          id={bubbleId}
          role="tooltip"
          className="help-tip__bubble"
          // Hidden until `positionBubble` has measured and placed it, so it
          // never flashes in the top-left corner on its first paint.
          style={{ visibility: 'hidden' }}
        >
          {text}
        </div>
      )}
    </span>
  )
}
