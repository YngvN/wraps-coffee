import { useRef, useState } from 'react'
import { CloseIcon } from '../../../components'
import { useLanguage } from '../../../i18n'
import { normalizeGtin } from '../../../lib/gtin'
import type { ProductSort } from './productList'
import { SearchIcon, SortIcon } from './RegisterIcons'

interface RegisterProductToolbarProps {
  query: string
  onQueryChange: (query: string) => void
  sort: ProductSort
  onSortChange: (sort: ProductSort) => void
  /** A barcode scanner types into whatever field has focus: a full barcode ending in Enter here is a scan, not a search. */
  onScan: (code: string) => void
}

const SORTS: ProductSort[] = ['menu', 'name', 'popular']

/**
 * Above the register's product tiles: a search box (results replace the tiles while it has text) and
 * the sort order — menu order, A–Å, or most popular. A scanner used while the search box has focus
 * still adds the product, because a whole barcode followed by Enter is treated as a scan.
 */
export function RegisterProductToolbar({ query, onQueryChange, sort, onSortChange, onScan }: RegisterProductToolbarProps) {
  const { t } = useLanguage()
  // Read-only until someone taps it: the Companion app gives the page focus on every load, which lands on
  // the first field on the page — this one — and a focused editable field pops the on-screen keyboard.
  const [editable, setEditable] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="register__toolbar">
      <label className="register__search">
        <SearchIcon className="register__search-icon" />
        <input
          ref={input}
          readOnly={!editable}
          onPointerDown={() => {
            if (editable) return
            setEditable(true)
            // Focus after React has made it editable, so the keyboard opens on this first tap.
            requestAnimationFrame(() => input.current?.focus())
          }}
          onBlur={() => setEditable(false)}
          type="search"
          value={query}
          placeholder={t('screenDisplay.register.searchPlaceholder')}
          aria-label={t('screenDisplay.register.search')}
          enterKeyHint="search"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            const code = normalizeGtin(query)
            if (!code) return
            event.preventDefault()
            onQueryChange('')
            onScan(code)
          }}
        />
        {query && (
          <button type="button" className="register__search-clear" onClick={() => onQueryChange('')} aria-label={t('screenDisplay.register.clearSearch')}>
            <CloseIcon />
          </button>
        )}
      </label>
      <div className="register__sort" role="radiogroup" aria-label={t('screenDisplay.register.sortLabel')}>
        <SortIcon className="register__sort-icon" />
        {SORTS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={sort === option}
            className={sort === option ? 'register__chip register__chip--active' : 'register__chip'}
            onClick={() => onSortChange(option)}
          >
            {t(`screenDisplay.register.sort.${option}`)}
          </button>
        ))}
      </div>
    </div>
  )
}
