import { useState } from 'react'
import { CopyIcon } from './CopyIcon'
import { copyToClipboard } from '../utils/clipboard'
import './CopyableValue.scss'

interface CopyableValueProps {
  /** The exact text copied to the clipboard. */
  value: string
  /** Shown instead of `value` when the real value shouldn't be displayed in full (e.g. a masked secret). Copying still uses `value`. */
  displayValue?: string
  /** Optional caption above the value, e.g. the name of the variable this belongs in. */
  label?: string
  /** Announced and shown briefly after a successful copy. */
  copiedLabel: string
  ariaLabel?: string
}

/**
 * A value shown in monospace with a one-click copy button.
 *
 * Built for setup instructions that say "put this exact string over there":
 * retyping a 48-character key or a connection string by hand is where those
 * instructions actually fail. Copies via {@link copyToClipboard}, which works
 * over plain HTTP on the LAN — the normal way this dashboard is reached from
 * a second device, and where `navigator.clipboard` doesn't exist.
 *
 * A failed copy is left silent by design: the value is on screen and can be
 * selected manually, so an error banner would add noise without adding a
 * remedy.
 */
export function CopyableValue({ value, displayValue, label, copiedLabel, ariaLabel }: CopyableValueProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!(await copyToClipboard(value))) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="copyable-value">
      {label && <span className="copyable-value__label">{label}</span>}
      <div className="copyable-value__row">
        <button type="button" className="copyable-value__button" onClick={handleCopy} aria-label={ariaLabel ?? label}>
          <CopyIcon />
          <code>{displayValue ?? value}</code>
        </button>
        {/* Polite rather than assertive: a copy confirmation shouldn't interrupt whatever is being read. */}
        <span className="copyable-value__copied" role="status" aria-live="polite">
          {copied ? copiedLabel : ''}
        </span>
      </div>
    </div>
  )
}
