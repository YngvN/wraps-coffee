import { useLanguage } from '../../i18n'
import { SCREEN_BACKGROUND_COLORS } from '../../types/screen'
import './BackgroundColorPicker.scss'

interface BackgroundColorPickerProps {
  backgroundColor: string
  onChange: (backgroundColor: string) => void
}

/**
 * Swatch picker for a screen's fixed background color palette
 * (`SCREEN_BACKGROUND_COLORS`) — never affected by the site's own light/dark
 * mode. Shared by both of the display's whole-screen "Edit appearance"
 * panels (the absolute `TextSizeEditor` and the percentage-based
 * `GlobalTextSizeScaler`).
 */
export function BackgroundColorPicker({ backgroundColor, onChange }: BackgroundColorPickerProps) {
  const { t } = useLanguage()

  return (
    <div className="background-color-picker">
      <span>{t('screenDisplay.textSizeEditor.backgroundColorLabel')}</span>
      <div className="background-color-picker__swatches">
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
