import { useLanguage } from '../../i18n'
import { SCREEN_BACKGROUND_COLORS } from '../../types/screen'
import './BackgroundColorPicker.scss'

interface BackgroundColorPickerProps {
  /** `undefined` means no color chosen — shown as "Transparent" when `allowTransparent` is on. */
  backgroundColor: string | undefined
  onChange: (backgroundColor: string | undefined) => void
  /** Adds a "Transparent" swatch (selecting `undefined`) before the palette — used for a slot's own color, whose standard/default is showing the screen's own background through. Omit where a color is always required (the screen's own background). */
  allowTransparent?: boolean
  /** Overrides the generic "Background color" label — used to distinguish a specific slot's own picker (e.g. "Slot 1 color") from the screen's own. */
  label?: string
}

/**
 * Swatch picker for a screen's fixed background color palette
 * (`SCREEN_BACKGROUND_COLORS`) — never affected by the site's own light/dark
 * mode. Shared by the display's whole-screen "Edit appearance" panel and its
 * per-slot editor.
 */
export function BackgroundColorPicker({ backgroundColor, onChange, allowTransparent, label }: BackgroundColorPickerProps) {
  const { t } = useLanguage()

  return (
    <div className="background-color-picker">
      <span>{label ?? t('screenDisplay.textSizeEditor.backgroundColorLabel')}</span>
      <div className="background-color-picker__swatches">
        {allowTransparent && (
          <button
            type="button"
            className={`background-color-picker__swatch background-color-picker__swatch--transparent${backgroundColor === undefined ? ' background-color-picker__swatch--active' : ''}`}
            onClick={() => onChange(undefined)}
            aria-label={t('screenDisplay.textSizeEditor.transparentLabel')}
            title={t('screenDisplay.textSizeEditor.transparentLabel')}
          />
        )}
        {SCREEN_BACKGROUND_COLORS.map((color) => (
          <button
            key={color.hex}
            type="button"
            className={`background-color-picker__swatch${backgroundColor === color.hex ? ' background-color-picker__swatch--active' : ''}`}
            style={{ backgroundColor: color.hex }}
            onClick={() => onChange(color.hex)}
            aria-label={t(`screenDisplay.textSizeEditor.colors.${color.key}`)}
            title={t(`screenDisplay.textSizeEditor.colors.${color.key}`)}
          />
        ))}
      </div>
    </div>
  )
}
