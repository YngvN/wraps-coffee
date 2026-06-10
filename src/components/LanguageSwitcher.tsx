import { availableLanguages, useLanguage, type LanguageCode } from '../i18n'
import './LanguageSwitcher.scss'

/** Dropdown for switching the active language (see `src/i18n`). */
export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage()

  return (
    <select
      className="language-switcher"
      value={language}
      onChange={(event) => setLanguage(event.target.value as LanguageCode)}
      aria-label="Language"
    >
      {availableLanguages.map((option) => (
        <option key={option.code} value={option.code}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
