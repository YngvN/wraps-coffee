import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Button, CheckIcon, EditDeleteButtons, EditIcon, Modal } from '../../../components'
import { useAppearanceThemes } from '../../../hooks/useAppearanceThemes'
import { useLanguage } from '../../../i18n'
import type { AppearanceTheme } from '../../../types/appearanceTheme'
import { ThemeEditorForm } from './ThemeEditorForm'
import './AppearanceSettingsView.scss'

/**
 * Manages the store's screen-display appearance themes (see `AppearanceTheme`):
 * a card grid of named color-palette-plus-font themes, one of which is
 * active at a time — each card's own font preview is sized to the same
 * relative hierarchy (heading largest, subheading mid, body smallest) those
 * 3 roles actually render at on screen, so it reads as a real type
 * specimen rather than 3 same-sized labels. Reached as a Store Settings
 * submenu (`StoreSettingsView`), same "list + add/edit Modal" pattern as
 * `EventsView`.
 */
export function AppearanceSettingsView() {
  const { t } = useLanguage()
  const [{ themes, activeThemeId }, setAppearanceSettings] = useAppearanceThemes()
  const [editingTheme, setEditingTheme] = useState<AppearanceTheme | null | undefined>(undefined)

  const isFormOpen = editingTheme !== undefined
  const closeForm = () => setEditingTheme(undefined)

  const handleSave = (theme: AppearanceTheme) => {
    setAppearanceSettings((current) => {
      const exists = current.themes.some((existing) => existing.id === theme.id)
      return { ...current, themes: exists ? current.themes.map((existing) => (existing.id === theme.id ? theme : existing)) : [...current.themes, theme] }
    })
    closeForm()
  }

  const handleDelete = (theme: AppearanceTheme) => {
    if (!window.confirm(t('admin.common.confirmDelete'))) return
    setAppearanceSettings((current) => ({ ...current, themes: current.themes.filter((existing) => existing.id !== theme.id) }))
  }

  const setActive = (theme: AppearanceTheme) => setAppearanceSettings((current) => ({ ...current, activeThemeId: theme.id }))

  return (
    <div className="appearance-settings-view">
      <div className="appearance-settings-view__header">
        <Button onClick={() => setEditingTheme(null)}>{t('admin.appearance.addTheme')}</Button>
      </div>

      <ul className="appearance-settings-view__grid">
        <AnimatePresence initial={false}>
          {themes.map((theme) => {
            const isActive = theme.id === activeThemeId
            return (
              <motion.li
                key={theme.id}
                className="appearance-settings-view__card"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <div className="appearance-settings-view__card-title-row">
                  <button
                    type="button"
                    className={`appearance-settings-view__active-toggle${isActive ? ' appearance-settings-view__active-toggle--checked' : ''}`}
                    onClick={() => setActive(theme)}
                    disabled={isActive}
                    aria-pressed={isActive}
                    aria-label={isActive ? t('admin.appearance.activeBadge') : t('admin.appearance.setActive')}
                    title={isActive ? t('admin.appearance.activeBadge') : t('admin.appearance.setActive')}
                  >
                    {isActive && <CheckIcon />}
                  </button>
                  <span className="appearance-settings-view__card-name">{theme.name}</span>
                </div>

                <div className="appearance-settings-view__swatches">
                  {theme.colors.map((color) => (
                    <span key={color.id} className="appearance-settings-view__swatch" style={{ backgroundColor: color.hex }} />
                  ))}
                </div>

                <div className="appearance-settings-view__font-preview">
                  <span className="appearance-settings-view__font-preview-heading" style={{ fontFamily: `'${theme.fonts.heading}', sans-serif` }}>
                    {theme.fonts.heading}
                  </span>
                  <span className="appearance-settings-view__font-preview-subheading" style={{ fontFamily: `'${theme.fonts.subheading}', sans-serif` }}>
                    {theme.fonts.subheading}
                  </span>
                  <span className="appearance-settings-view__font-preview-body" style={{ fontFamily: `'${theme.fonts.body}', sans-serif` }}>
                    {theme.fonts.body}
                  </span>
                </div>

                <div className="appearance-settings-view__card-actions">
                  {isActive || themes.length <= 1 ? (
                    <Button variant="secondary" className="edit-delete-buttons__button" onClick={() => setEditingTheme(theme)} aria-label={t('admin.common.edit')}>
                      <EditIcon />
                      <span className="edit-delete-buttons__label">{t('admin.common.edit')}</span>
                    </Button>
                  ) : (
                    <EditDeleteButtons onEdit={() => setEditingTheme(theme)} onDelete={() => handleDelete(theme)} />
                  )}
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>

      <Modal open={isFormOpen} onClose={closeForm} title={editingTheme ? t('admin.appearance.editTheme') : t('admin.appearance.addTheme')}>
        {isFormOpen && <ThemeEditorForm theme={editingTheme ?? null} onSave={handleSave} onCancel={closeForm} />}
      </Modal>
    </div>
  )
}
