import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import { availableLanguages, useLanguage, type LanguageCode } from '../i18n'
import { PlusIcon } from './PlusIcon'
import './LanguageTabs.scss'

interface LanguageTabsProps {
  /** Which languages currently have a tab, in display order. */
  activeLanguages: LanguageCode[]
  selected: LanguageCode
  onSelect: (language: LanguageCode) => void
  /** Called with the language to add once it's been picked (directly, when there's only one language left to add). */
  onAddLanguage: (language: LanguageCode) => void
  /** i18n key for the "+ Add language" button's own label. */
  addLabelKey: string
  /** The selected language's own fields (e.g. a name `Input`, a description `Textarea`) — slides/fades in from the direction its own tab sits relative to the previously selected one, and back out the same way, whenever `selected` changes. */
  children: ReactNode
}

const contentVariants = {
  initial: (direction: 1 | -1) => ({ x: direction === 1 ? 16 : -16, opacity: 0 }),
  animate: { x: 0, opacity: 1 },
  exit: (direction: 1 | -1) => ({ x: direction === 1 ? -16 : 16, opacity: 0 }),
}

/**
 * A small tab bar for switching which language's inputs a bilingual-content
 * form (e.g. `CategoryForm`/`ProductForm`/`CatalogueForm`) currently shows —
 * only the cafe's own standard pane language is active by default (plus, for
 * an already-existing record, any other language that already has content —
 * see `initialActiveLanguages` in `src/utils/bilingual.ts`), so filling in a
 * second language is opt-in rather than mandatory. `availableLanguages` (from
 * `languages.json`) is read live, so a language added there later becomes
 * pickable here automatically, with no change needed in this component.
 *
 * The active tab is marked by a small underline (`.language-tabs__tab-indicator`)
 * that slides between tabs via a shared `layoutId` rather than snapping —
 * `LayoutGroup` scopes that shared id to this one component instance, so two
 * of these open at once (unlikely, but not impossible) never animate into
 * each other's indicator. `children` (the actual field(s) for whichever
 * language is currently selected) slide/fade the same way `SlideTransition`
 * does for full views, just over a much smaller distance suited to a single
 * form field rather than a whole page — the direction follows the clicked
 * tab's own position relative to the previously selected one, derived via
 * the same render-time "previous value" comparison `SplitLayout` uses for
 * its own pane-growth diffing (a plain `useState` compared against the
 * incoming prop, conditionally updated during render — React's own
 * sanctioned pattern for this, safe unlike mutating a ref during render).
 */
export function LanguageTabs({ activeLanguages, selected, onSelect, onAddLanguage, addLabelKey, children }: LanguageTabsProps) {
  const { t } = useLanguage()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [prevSelected, setPrevSelected] = useState(selected)
  const [direction, setDirection] = useState<1 | -1>(1)
  if (prevSelected !== selected) {
    const prevIndex = activeLanguages.indexOf(prevSelected)
    const nextIndex = activeLanguages.indexOf(selected)
    setDirection(nextIndex >= prevIndex ? 1 : -1)
    setPrevSelected(selected)
  }

  const remaining = availableLanguages.filter((language) => !activeLanguages.includes(language.code))

  const handleAddClick = () => {
    if (remaining.length === 1) {
      onAddLanguage(remaining[0].code)
      return
    }
    setPickerOpen((open) => !open)
  }

  const handlePick = (language: LanguageCode) => {
    onAddLanguage(language)
    setPickerOpen(false)
  }

  return (
    <div className="language-tabs-wrapper">
      <div className="language-tabs">
        <LayoutGroup>
          <div className="language-tabs__list" role="tablist">
            {activeLanguages.map((code) => {
              const label = availableLanguages.find((language) => language.code === code)?.label ?? code
              const isActive = code === selected
              return (
                <button
                  key={code}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`language-tabs__tab${isActive ? ' language-tabs__tab--active' : ''}`}
                  onClick={() => onSelect(code)}
                >
                  {label}
                  {isActive && (
                    <motion.span
                      className="language-tabs__tab-indicator"
                      layoutId="language-tabs__tab-indicator"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </LayoutGroup>

        {remaining.length > 0 && (
          <div className="language-tabs__add">
            <button type="button" className="language-tabs__add-button" onClick={handleAddClick}>
              <PlusIcon />
              {t(addLabelKey)}
            </button>
            {pickerOpen && remaining.length > 1 && (
              <div className="language-tabs__picker">
                {remaining.map((language) => (
                  <button key={language.code} type="button" className="language-tabs__picker-option" onClick={() => handlePick(language.code)}>
                    {language.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="language-tabs__content">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={selected}
            custom={direction}
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="language-tabs__content-inner"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
