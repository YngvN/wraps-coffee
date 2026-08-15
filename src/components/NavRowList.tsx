import type { ReactNode } from 'react'
import { ChevronRightIcon } from './ChevronRightIcon'
import './NavRowList.scss'

/** One row in a `NavRowList` — a single destination the list can open. */
export interface NavRowItem {
  /** Stable React key. Use whatever the row opens (e.g. a sub-view name), so it doubles as a readable test hook. */
  id: string
  /** The row's own visible label. Pass an already-translated string — this component never calls `t()` itself. */
  label: string
  /** Optional leading icon, e.g. an `ADMIN_NAV_ICONS` entry. */
  icon?: ReactNode
  onClick: () => void
}

interface NavRowListProps {
  /**
   * The rows, in display order. Array-driven rather than `children`-driven on
   * purpose: it lets a caller apply a permission gate as a plain `.filter()`
   * or conditional spread over data, instead of wrapping individual rows in
   * JSX conditionals.
   */
  items: NavRowItem[]
  className?: string
}

/**
 * A compact grouped list of navigation rows — a label, an optional leading
 * icon, and a trailing chevron — rendered as one bounded surface.
 *
 * Replaces the pattern where each destination got its own full-width card
 * carrying a title, a description sentence and a lone button. At six
 * destinations that produced six large boxes whose actual content was one
 * button each, spread down the page and interleaved with unrelated inline
 * settings. A single grouped list reads as a menu, which is what it is.
 */
export function NavRowList({ items, className }: NavRowListProps) {
  return (
    <ul className={['nav-row-list', className].filter(Boolean).join(' ')}>
      {items.map((item) => (
        <li key={item.id}>
          <button type="button" className="nav-row-list__row" onClick={item.onClick} data-row-id={item.id}>
            {item.icon && <span className="nav-row-list__icon">{item.icon}</span>}
            <span className="nav-row-list__label">{item.label}</span>
            <span className="nav-row-list__chevron" aria-hidden="true">
              <ChevronRightIcon />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
