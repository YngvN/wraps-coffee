import { Input } from '../../components'
import { useLanguage } from '../../i18n'
import type { BackgroundImage, BackgroundImageOverlay } from '../../types/screen'
import './BackgroundImagePicker.scss'

const OVERLAYS: BackgroundImageOverlay[] = ['none', 'light', 'dark']

interface BackgroundImagePickerProps {
  /** Stable identifier used to build a unique id for the URL field. */
  id: string
  backgroundImage: BackgroundImage | undefined
  onChange: (backgroundImage: BackgroundImage | undefined) => void
  /** Overrides the generic "Background image" label — used to distinguish a specific slot's own picker from a slide's own. */
  label?: string
}

/**
 * URL field plus a light/dark/none overlay picker for a slot's (or one of
 * its slides') own background image — always shown blurred and scaled to
 * cover its pane (see `.split-layout__pane-bg-image`). The overlay both
 * keeps the image from washing out the text drawn over it and picks which
 * of the two the text itself is forced to: lightening pairs with black
 * text, darkening with white (see `backgroundImageTextStyle`). Clearing the
 * URL field removes the image entirely instead of leaving an empty one.
 */
export function BackgroundImagePicker({ id, backgroundImage, onChange, label }: BackgroundImagePickerProps) {
  const { t } = useLanguage()

  const setImageUrl = (imageUrl: string) => {
    if (!imageUrl) {
      onChange(undefined)
      return
    }
    onChange({ imageUrl, overlay: backgroundImage?.overlay ?? 'none' })
  }

  const setOverlay = (overlay: BackgroundImageOverlay) => {
    if (!backgroundImage) return
    onChange({ ...backgroundImage, overlay })
  }

  return (
    <div className="background-image-picker">
      <Input
        id={`${id}-url`}
        label={label ?? t('screenDisplay.textSizeEditor.backgroundImageLabel')}
        value={backgroundImage?.imageUrl ?? ''}
        onChange={(event) => setImageUrl(event.target.value)}
      />
      {backgroundImage && (
        <div className="background-image-picker__overlays">
          {OVERLAYS.map((overlay) => (
            <button
              key={overlay}
              type="button"
              className={`background-image-picker__overlay-option${backgroundImage.overlay === overlay ? ' background-image-picker__overlay-option--active' : ''}`}
              onClick={() => setOverlay(overlay)}
            >
              {t(`screenDisplay.textSizeEditor.backgroundImageOverlay.${overlay}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
