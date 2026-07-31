import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeToClose } from '../hooks/useEscapeToClose'
import { useLanguage } from '../i18n'
import { Button } from './Button'
import { ChevronRightIcon } from './ChevronRightIcon'
import { CopyIcon } from './CopyIcon'
import { EditIcon } from './EditIcon'
import './EditDeleteButtons.scss'
import { MoveIcon } from './MoveIcon'
import { TrashIcon } from './TrashIcon'

/** A second destination offered inside the Edit button's own dropdown menu, alongside the plain Edit action. */
interface EditMenuExtra {
  label: string
  icon: ReactNode
  onClick: () => void
  /** Renders the item as a real link (still intercepted via `onClick`) instead of a plain button, so a real URL/target underneath a `window.open` call — e.g. the Screens list's fullscreen editor — stays right-click/middle-click "open in new tab"-able. */
  href?: string
}

interface EditDeleteButtonsProps {
  onEdit: () => void
  /** Adds a "Duplicate" button between Edit and Delete — e.g. the Screens list, whose cards need a copy action the Products/Events lists don't. Omit (as they do) for a plain Edit/Delete pair. */
  onDuplicate?: () => void
  /** Adds a "Move" button between Edit/Duplicate and Delete — e.g. the products board's own cross-catalogue "Move to…" action (`ProductRow.tsx`), which needs a small target picker same-catalogue drag-and-drop can't reach. Omit for a plain Edit/Delete pair. */
  onMove?: () => void
  onDelete: () => void
  /** Turns the plain Edit button into a dropdown menu offering this as a second option alongside Edit — e.g. the Screens list's own "open fullscreen editor" link, which needs a second edit-adjacent destination beyond the dashboard's own form. Omit for a plain single-click Edit button. */
  editMenuExtra?: EditMenuExtra
}

/**
 * The Edit/(optionally Duplicate)/Delete action set shared by every
 * row-based admin list (the Products catalogue/category/product lists, the
 * Events list, the Screens list) — a text label alongside its own icon on
 * regular screens, icon-only (the label hidden via
 * `.edit-delete-buttons__label`'s own media query) on narrow ones, where a
 * full text button set doesn't fit comfortably next to a row's other
 * content. The icon stays regardless, so the action is still recognizable
 * at a glance; `aria-label` keeps it announced correctly either way.
 */
export function EditDeleteButtons({ onEdit, onDuplicate, onMove, onDelete, editMenuExtra }: EditDeleteButtonsProps) {
  const { t } = useLanguage()
  const [isEditMenuOpen, setIsEditMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const triggerWrapperRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)

  useEscapeToClose(isEditMenuOpen, () => setIsEditMenuOpen(false))

  const toggleMenu = () => {
    if (!isEditMenuOpen) {
      const rect = triggerWrapperRef.current?.getBoundingClientRect()
      if (rect) setMenuPosition({ top: rect.bottom + 4, left: rect.left })
    }
    setIsEditMenuOpen((current) => !current)
  }

  // Closes the menu on an outside click/tap (same as `FontPicker`'s own dropdown) or on scroll — the menu is portaled to `document.body` and positioned from the trigger's own bounding rect at open time, so it'd otherwise drift out of place as soon as any scrollable ancestor (e.g. the cards grid) moves.
  useEffect(() => {
    if (!isEditMenuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerWrapperRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setIsEditMenuOpen(false)
    }
    const handleScroll = () => setIsEditMenuOpen(false)
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [isEditMenuOpen])

  return (
    <>
      {editMenuExtra ? (
        <div className="edit-delete-buttons__menu-wrapper" ref={triggerWrapperRef}>
          <Button
            variant="secondary"
            className="edit-delete-buttons__button"
            onClick={toggleMenu}
            aria-label={t('admin.common.edit')}
            aria-haspopup="true"
            aria-expanded={isEditMenuOpen}
          >
            <EditIcon />
            <span className="edit-delete-buttons__label">{t('admin.common.edit')}</span>
            <span className="edit-delete-buttons__menu-caret" aria-hidden="true">
              <ChevronRightIcon />
            </span>
          </Button>
          {isEditMenuOpen &&
            menuPosition &&
            createPortal(
              <ul className="edit-delete-buttons__menu" role="menu" ref={menuRef} style={{ top: menuPosition.top, left: menuPosition.left }}>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="edit-delete-buttons__menu-item"
                    onClick={() => {
                      setIsEditMenuOpen(false)
                      onEdit()
                    }}
                  >
                    <EditIcon />
                    {t('admin.common.edit')}
                  </button>
                </li>
                <li role="none">
                  {editMenuExtra.href ? (
                    <a
                      href={editMenuExtra.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      role="menuitem"
                      className="edit-delete-buttons__menu-item"
                      onClick={(event) => {
                        event.preventDefault()
                        setIsEditMenuOpen(false)
                        editMenuExtra.onClick()
                      }}
                    >
                      {editMenuExtra.icon}
                      {editMenuExtra.label}
                    </a>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      className="edit-delete-buttons__menu-item"
                      onClick={() => {
                        setIsEditMenuOpen(false)
                        editMenuExtra.onClick()
                      }}
                    >
                      {editMenuExtra.icon}
                      {editMenuExtra.label}
                    </button>
                  )}
                </li>
              </ul>,
              document.body,
            )}
        </div>
      ) : (
        <Button variant="secondary" className="edit-delete-buttons__button" onClick={onEdit} aria-label={t('admin.common.edit')}>
          <EditIcon />
          <span className="edit-delete-buttons__label">{t('admin.common.edit')}</span>
        </Button>
      )}
      {onDuplicate && (
        <Button variant="secondary" className="edit-delete-buttons__button" onClick={onDuplicate} aria-label={t('admin.common.duplicate')}>
          <CopyIcon />
          <span className="edit-delete-buttons__label">{t('admin.common.duplicate')}</span>
        </Button>
      )}
      {onMove && (
        <Button variant="secondary" className="edit-delete-buttons__button" onClick={onMove} aria-label={t('admin.products.moveToOtherCatalogue')}>
          <MoveIcon />
          <span className="edit-delete-buttons__label">{t('admin.products.moveToOtherCatalogue')}</span>
        </Button>
      )}
      <Button variant="secondary" className="edit-delete-buttons__button" onClick={onDelete} aria-label={t('admin.common.delete')}>
        <TrashIcon />
        <span className="edit-delete-buttons__label">{t('admin.common.delete')}</span>
      </Button>
    </>
  )
}
