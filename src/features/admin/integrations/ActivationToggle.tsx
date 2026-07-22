import type { ChangeEvent } from 'react'
import './ActivationToggle.scss'

interface ActivationToggleProps {
  id: string
  checked: boolean
  disabled?: boolean
  /** Always used as the input's `aria-label` (there's no visible text next to the box — it sits right beside the integration's own name in a `<summary>` row, so repeating it as a visible label would be redundant). */
  label: string
  /** Shown via `window.confirm` before turning the integration off — matches this app's convention for confirming an action elsewhere (e.g. `admin.common.confirmDelete`). Not asked when turning it *on*, only when deactivating. */
  confirmMessage: string
  onChange: (checked: boolean) => void
}

/**
 * The Integrations page's own enable/disable control — adapted from a
 * Uiverse.io checkbox design (see README credits), used specifically for
 * moving an integration between the "Available" and "Activated" categories.
 * Distinct from the plain `Checkbox` component used everywhere else in the
 * admin: this one is the actual on/off switch for a whole integration
 * (not a settings sub-option), so it gets its own more prominent look and
 * asks for confirmation before switching off — that side effect (a live
 * screen losing its weather/transit slide) is easy to trigger by accident
 * with a single click otherwise. Sits in the integration's own `<summary>`
 * row (to the left of the disclosure chevron), so its own click must not
 * also toggle that `<details>` open/closed — hence `stopPropagation`.
 */
export function ActivationToggle({ id, checked, disabled, label, confirmMessage, onChange }: ActivationToggleProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.checked
    if (!next && !window.confirm(confirmMessage)) {
      event.target.checked = true
      return
    }
    onChange(next)
  }

  return (
    <label className="activation-toggle" htmlFor={id} onClick={(event) => event.stopPropagation()}>
      <input id={id} className="activation-toggle__input" type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={handleChange} />
      <span className="activation-toggle__box">
        <span className="activation-toggle__sheen" />
        <svg className="activation-toggle__check" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            clipRule="evenodd"
            d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 10-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
            fillRule="evenodd"
          />
        </svg>
      </span>
    </label>
  )
}
