import { useLanguage } from '../../../i18n'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const
/** Seven digits: up to 9 999 999 kr, far past any drawer. */
const MAX_DIGITS = 7

interface RegisterAmountPadProps {
  /** The amount typed so far, whole kroner, as digits. */
  value: string
  onChange: (value: string) => void
}

/**
 * An on-screen keypad for a whole-kroner amount — the opening float, or the cash counted at closing —
 * so the tablet's own keyboard never opens. Shows the amount above the keys.
 */
export function RegisterAmountPad({ value, onChange }: RegisterAmountPadProps) {
  const { t } = useLanguage()
  const press = (key: (typeof KEYS)[number]) => {
    if (key === 'clear') return onChange('')
    if (key === 'back') return onChange(value.slice(0, -1))
    if (value.length >= MAX_DIGITS || (value === '0' && key === '0')) return
    onChange(value === '0' ? key : value + key)
  }
  return (
    <div className="register-amount">
      <p className="register-amount__value">{t('menu.price', { price: Number(value || 0) })}</p>
      <div className="register-pin__keys">
        {KEYS.map((key) => (
          <button key={key} type="button" className="register-pin__key" onClick={() => press(key)}>
            {key === 'clear' ? t('screenDisplay.register.pinClear') : key === 'back' ? '⌫' : key}
          </button>
        ))}
      </div>
    </div>
  )
}
