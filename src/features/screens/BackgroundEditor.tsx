import { useLanguage } from '../../i18n'
import type { BackgroundImage } from '../../types/screen'
import { BackgroundColorPicker } from './BackgroundColorPicker'
import { BackgroundImagePicker } from './BackgroundImagePicker'
import './BackgroundEditor.scss'

interface BackgroundEditorProps {
  backgroundColor: string
  onBackgroundColorChange: (backgroundColor: string) => void
  backgroundImage: BackgroundImage | undefined
  onBackgroundImageChange: (backgroundImage: BackgroundImage | undefined) => void
}

/**
 * The screen's own overall background: its fixed palette color (always set,
 * every screen has one) plus, layered on top of that, an optional image
 * spanning the entire screen — blurred and scaled to cover, the same
 * technique as a slot's own background image — visible through any pane
 * that doesn't have its own background color/image. Both are live: changes
 * apply immediately, with no separate save step and no "restore previous"
 * the way the text-size scaler's own edits have.
 */
export function BackgroundEditor({ backgroundColor, onBackgroundColorChange, backgroundImage, onBackgroundImageChange }: BackgroundEditorProps) {
  const { t } = useLanguage()

  return (
    <div className="background-editor">
      <BackgroundColorPicker backgroundColor={backgroundColor} onChange={(color) => color !== undefined && onBackgroundColorChange(color)} />
      <span className="background-editor__image-label">{t('screenDisplay.textSizeEditor.backgroundImageLabel')}</span>
      <BackgroundImagePicker id="screen-background-image" backgroundImage={backgroundImage} onChange={onBackgroundImageChange} />
    </div>
  )
}
