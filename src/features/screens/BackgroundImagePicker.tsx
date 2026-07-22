import { Checkbox, ImageUploadField } from '../../components'
import { useLanguage } from '../../i18n'
import type { BackgroundImage, BackgroundImageOverlay } from '../../types/screen'
import './BackgroundImagePicker.scss'

const OVERLAYS: BackgroundImageOverlay[] = ['none', 'light', 'dark']

interface BackgroundImagePickerProps {
  /** Stable identifier used to build a unique id for the URL field. */
  id: string
  backgroundImage: BackgroundImage | undefined
  onChange: (backgroundImage: BackgroundImage | undefined) => void
}

/**
 * URL field plus a light/dark/none overlay picker and a "Blur" checkbox for
 * a slot's (or one of its slides') own background image — always scaled to
 * cover its pane (see `.split-layout__pane-bg-image`), softened with a blur
 * unless turned off. The overlay both keeps the image from washing out the
 * text drawn over it and picks which of the two the text itself is forced
 * to: lightening pairs with black text, darkening with white (see
 * `backgroundImageTextStyle`). Clearing the URL field removes the image
 * entirely instead of leaving an empty one.
 */
export function BackgroundImagePicker({ id, backgroundImage, onChange }: BackgroundImagePickerProps) {
  const { t } = useLanguage()

  const setImageUrl = (imageUrl: string) => {
    if (!imageUrl) {
      onChange(undefined)
      return
    }
    onChange({ imageUrl, overlay: backgroundImage?.overlay ?? 'none', blur: backgroundImage?.blur ?? true })
  }

  const setOverlay = (overlay: BackgroundImageOverlay) => {
    if (!backgroundImage) return
    onChange({ ...backgroundImage, overlay })
  }

  const setBlur = (blur: boolean) => {
    if (!backgroundImage) return
    onChange({ ...backgroundImage, blur })
  }

  return (
    <div className="background-image-picker">
      <ImageUploadField id={`${id}-url`} value={backgroundImage?.imageUrl ?? ''} onChange={setImageUrl} />
      {backgroundImage && (
        <>
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
          <Checkbox
            id={`${id}-blur`}
            label={t('screenDisplay.textSizeEditor.backgroundImageBlurLabel')}
            checked={backgroundImage.blur ?? true}
            onChange={(event) => setBlur(event.target.checked)}
          />
        </>
      )}
    </div>
  )
}
