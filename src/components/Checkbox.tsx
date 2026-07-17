import type { InputHTMLAttributes } from 'react'
import './Checkbox.scss'

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

/**
 * Shared checkbox control — an outlined box whose border morphs into a
 * checkmark when checked, adapted from a Uiverse.io design (see README
 * credits) to this app's own theme tokens. Deliberately has no `htmlFor` on
 * the wrapping `<label>` — the input is already a descendant, so it's
 * implicitly associated; adding `for={id}` on top of that makes Chromium
 * double-fire the click-forwarding (toggle, then immediately toggle back)
 * whenever the click lands on a sibling like `.checkbox__box` rather than
 * the (now visually hidden) input itself.
 */
export function Checkbox({ label, id, ...props }: CheckboxProps) {
  return (
    <label className="checkbox">
      <input id={id} type="checkbox" {...props} />
      <span className="checkbox__box" aria-hidden="true" />
      <span className="checkbox__label">{label}</span>
    </label>
  )
}
