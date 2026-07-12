import { availableLanguages, useLanguage, type LanguageCode } from '../../i18n'
import './PaneLanguagePicker.scss'

interface PaneLanguagePickerProps {
  /** `undefined` means "use the cafe's own Standard pane language" (see `useDefaultPaneLanguage`) — its own button, not just an absence of selection. */
  language: LanguageCode | undefined
  onChange: (language: LanguageCode | undefined) => void
  /** The Standard pane language's own current value, shown on its button (e.g. "Standard (Norsk)") so it's clear what "inherit" actually resolves to right now. */
  defaultLanguage: LanguageCode
}

/**
 * Button row for a pane's own language override — one button per language
 * configured in `languages.json` (see `availableLanguages`), plus a
 * "Standard" button resetting back to the cafe's own shared default. Shared
 * by both places a pane can be edited from (see `PaneEditor`'s own
 * "Language" sub-view), same pattern as `BackgroundColorPicker`'s own
 * reset-to-transparent swatch.
 */
export function PaneLanguagePicker({ language, onChange, defaultLanguage }: PaneLanguagePickerProps) {
  const { t } = useLanguage()
  const defaultLabel = availableLanguages.find((option) => option.code === defaultLanguage)?.label ?? defaultLanguage

  return (
    <div className="pane-language-picker">
      <button
        type="button"
        className={`pane-language-picker__option${language === undefined ? ' pane-language-picker__option--active' : ''}`}
        onClick={() => onChange(undefined)}
      >
        {t('admin.screens.paneLanguageStandardLabel', { language: defaultLabel })}
      </button>
      {availableLanguages.map((option) => (
        <button
          key={option.code}
          type="button"
          className={`pane-language-picker__option${language === option.code ? ' pane-language-picker__option--active' : ''}`}
          onClick={() => onChange(option.code)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
