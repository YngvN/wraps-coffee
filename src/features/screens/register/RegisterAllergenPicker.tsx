import { useLanguage } from '../../../i18n'
import { ALLERGEN_OPTIONS, type AllergenCode } from '../../../types/product'

interface RegisterAllergenPickerProps {
  value: AllergenCode[]
  onChange: (value: AllergenCode[]) => void
  /** Open Food Facts allergen tags that matched none of ours — shown for staff to decide by hand. */
  toCheck: string[]
  /** Whether the allergens came from Open Food Facts, which always gets a "check the packaging" warning. */
  fromOpenFoodFacts: boolean
}

/**
 * The product editor's allergen toggles (every code in `ALLERGEN_OPTIONS`, by its full name). Allergens
 * suggested by Open Food Facts come pre-selected but always with a warning to check the packaging, and
 * any tag that couldn't be matched is listed so it isn't silently lost.
 */
export function RegisterAllergenPicker({ value, onChange, toCheck, fromOpenFoodFacts }: RegisterAllergenPickerProps) {
  const { t } = useLanguage()
  const toggle = (code: AllergenCode) => onChange(value.includes(code) ? value.filter((candidate) => candidate !== code) : [...value, code])

  return (
    <fieldset className="register-editor__allergens">
      <legend className="orders-settings__label">{t('screenDisplay.register.allergens')}</legend>
      {fromOpenFoodFacts && <p className="register-editor__warning">{t('screenDisplay.register.allergensFromOff')}</p>}
      {toCheck.length > 0 && (
        <p className="register-editor__warning register-editor__warning--strong">{t('screenDisplay.register.allergensToCheck', { tags: toCheck.join(', ') })}</p>
      )}
      <div className="register-editor__allergen-grid">
        {ALLERGEN_OPTIONS.map((option) => (
          <button
            key={option.code}
            type="button"
            aria-pressed={value.includes(option.code)}
            className={value.includes(option.code) ? 'register__chip register__chip--active' : 'register__chip'}
            onClick={() => toggle(option.code)}
          >
            {t(`menu.allergens.items.${option.i18nKey}.title`)}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
