import { availableLanguages, useLanguage, type LanguageCode } from '../i18n'
import './LanguageSwitcher.scss'

/** Globe icon (Feather-style inline SVG). */
function GlobeIcon() {
  return (
    <svg
      className="language-switcher__icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

/**
 * Language switcher for the nav bar. Shows a globe icon and the current
 * language code (e.g. "EN"). A transparent native <select> is overlaid over
 * the whole element so clicking anywhere opens the OS language dropdown.
 */
export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage()

  return (
    <div className="language-switcher">
      <GlobeIcon />
      <span className="language-switcher__code">{language.toUpperCase()}</span>
      <select
        className="language-switcher__select"
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
    </div>
  )
}
