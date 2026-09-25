import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { availableLanguages, useLanguage } from '../../../i18n'
import type { OrdersLanguage } from './useOrdersLanguage'
import type { OrdersTheme } from './useOrdersTheme'
import './OrdersSettingsMenu.scss'

interface OrdersSettingsMenuProps {
  theme: OrdersTheme
  onThemeChange: (theme: OrdersTheme) => void
  language: OrdersLanguage
  onLanguageChange: (language: OrdersLanguage) => void
}

/** A gear glyph, `currentColor`-stroked like the shared icons in `src/components/`. Local to the board since nothing else needs one yet. */
function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

const THEMES: OrdersTheme[] = ['light', 'dark']

/**
 * The ⚙ button at the top right of the staff board and the small menu it opens: the board's Light/Dark
 * look (`useOrdersTheme`) and its language (`useOrdersLanguage` — "Automatic" follows the pane, or one
 * of the app's languages, listed from `availableLanguages` so a new language appears here by itself).
 * Tapping outside the menu closes it.
 */
export function OrdersSettingsMenu({ theme, onThemeChange, language, onLanguageChange }: OrdersSettingsMenuProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  return (
    <div className="orders-settings">
      <button type="button" className="orders-settings__button" onClick={() => setOpen((value) => !value)} aria-label={t('screenDisplay.orders.settings')} aria-expanded={open}>
        <GearIcon />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="orders-settings__backdrop" onClick={() => setOpen(false)} />
            <motion.div
              className="orders-settings__menu"
              role="menu"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.15 }}
            >
              <span className="orders-settings__label">{t('screenDisplay.orders.themeLabel')}</span>
              <div className="orders-settings__segmented">
                {THEMES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="menuitemradio"
                    aria-checked={theme === option}
                    className={theme === option ? 'orders-settings__option orders-settings__option--active' : 'orders-settings__option'}
                    onClick={() => onThemeChange(option)}
                  >
                    {t(`screenDisplay.orders.theme.${option}`)}
                  </button>
                ))}
              </div>
              <span className="orders-settings__label">{t('screenDisplay.orders.languageLabel')}</span>
              <div className="orders-settings__segmented orders-settings__segmented--wrap">
                {[{ code: 'auto' as const, label: t('screenDisplay.orders.languageAuto') }, ...availableLanguages].map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={language === option.code}
                    className={language === option.code ? 'orders-settings__option orders-settings__option--active' : 'orders-settings__option'}
                    onClick={() => onLanguageChange(option.code)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
