import { useEffect, useRef, useState } from 'react'
import googleFonts from '../data/googleFonts.json'
import { useEscapeToClose } from '../hooks/useEscapeToClose'
import { useGoogleFontLoader } from '../hooks/useGoogleFontLoader'
import { Input } from './Input'
import './FontPicker.scss'

/** How many matching font names to show (and load previews for) at once — enough to be useful without loading dozens of fonts per keystroke. */
const MAX_SUGGESTIONS = 8

/** Distinct from `useGoogleFontLoader`'s own default link id, so a `FontPicker`'s suggestion previews never fight over the same `<link>` tag with whatever else (e.g. `ThemeEditorForm`'s already-selected font previews) is loading fonts elsewhere on the same page. */
const SUGGESTIONS_LINK_ID = 'font-picker-suggestions'

const FONT_NAMES = googleFonts as string[]

interface FontPickerProps {
  id: string
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
}

/**
 * A Google Font name text field that suggests matching real font names as
 * you type, searched from a bundled local list (`src/data/googleFonts.json`)
 * rather than Google's own Webfonts API, which needs an API key. Each
 * suggestion is rendered in its own typeface right in the dropdown — the
 * font name itself is the preview. Drop-in replacement for `Input` wherever
 * a value is meant to be a real Google Font family name.
 */
export function FontPicker({ id, label, value, onChange, placeholder, required }: FontPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const query = value.trim().toLowerCase()
  const suggestions = query ? FONT_NAMES.filter((font) => font.toLowerCase().includes(query)).slice(0, MAX_SUGGESTIONS) : []
  const isShowingSuggestions = isOpen && suggestions.length > 0

  useGoogleFontLoader(suggestions, SUGGESTIONS_LINK_ID)
  useEscapeToClose(isOpen, () => setIsOpen(false))

  // Closes the dropdown on an outside click/tap, same "click away" affordance a native `<select>` gets for free.
  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  const handleSelect = (font: string) => {
    onChange(font)
    setIsOpen(false)
  }

  return (
    <div className="font-picker" ref={wrapperRef}>
      <Input
        id={id}
        label={label}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      {isShowingSuggestions && (
        <ul className="font-picker__dropdown" role="listbox">
          {suggestions.map((font) => (
            <li key={font} role="option" aria-selected={font === value}>
              <button type="button" className="font-picker__option" style={{ fontFamily: `'${font}', sans-serif` }} onClick={() => handleSelect(font)}>
                {font}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
