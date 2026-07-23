import { useActiveAppearanceTheme } from '../../hooks/useAppearanceThemes'
import { useLanguage } from '../../i18n'
import './BackgroundColorPicker.scss'

interface BackgroundColorPickerProps {
  /** `undefined` means no color chosen — shown as "Transparent" (or `transparentLabel`, if given) when `allowTransparent` is on. */
  backgroundColor: string | undefined
  onChange: (backgroundColor: string | undefined) => void
  /** Adds a reset swatch (selecting `undefined`) before the palette — used for a slot's own color, whose standard/default is showing the screen's own background through. Omit where a color is always required (the screen's own background). */
  allowTransparent?: boolean
  /** Overrides the generic "Background color" label — used to distinguish a specific slot's own picker (e.g. "Slot 1 color") from the screen's own. */
  label?: string
  /** Overrides the reset swatch's own "Transparent" label — used where `undefined` means something else, like an automatic contrast-based color rather than true transparency (e.g. the pane border color). */
  transparentLabel?: string
}

/**
 * Swatch picker for a screen's background color, drawn from the store's
 * currently active appearance theme (see `useActiveAppearanceTheme`, managed
 * under Settings → Store settings → Appearance) — never affected by the
 * site's own light/dark mode. Shared by the display's whole-screen "Edit
 * appearance" panel and its per-slot editor.
 */
export function BackgroundColorPicker({ backgroundColor, onChange, allowTransparent, label, transparentLabel }: BackgroundColorPickerProps) {
  const { t } = useLanguage()
  const activeTheme = useActiveAppearanceTheme()
  const resolvedTransparentLabel = transparentLabel ?? t('screenDisplay.textSizeEditor.transparentLabel')

  return (
    <div className="background-color-picker">
      <span>{label ?? t('screenDisplay.textSizeEditor.backgroundColorLabel')}</span>
      <div className="background-color-picker__swatches">
        {allowTransparent && (
          <button
            type="button"
            className={`background-color-picker__swatch background-color-picker__swatch--transparent${backgroundColor === undefined ? ' background-color-picker__swatch--active' : ''}`}
            onClick={() => onChange(undefined)}
            aria-label={resolvedTransparentLabel}
            title={resolvedTransparentLabel}
          />
        )}
        {activeTheme.colors.map((color) => {
          const colorLabel = color.locked ? t(`screenDisplay.textSizeEditor.colors.${color.id}`) : color.hex
          return (
            <button
              key={color.id}
              type="button"
              className={`background-color-picker__swatch${backgroundColor === color.hex ? ' background-color-picker__swatch--active' : ''}`}
              style={{ backgroundColor: color.hex }}
              onClick={() => onChange(color.hex)}
              aria-label={colorLabel}
              title={colorLabel}
            />
          )
        })}
      </div>
    </div>
  )
}
