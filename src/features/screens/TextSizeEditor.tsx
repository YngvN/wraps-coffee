import { useState } from 'react'
import { Button, Input } from '../../components'
import { useTextSizePresets } from '../../hooks/useTextSizePresets'
import { useLanguage } from '../../i18n'
import { SCREEN_BACKGROUND_COLORS, type TextSizes } from '../../types/screen'
import './TextSizeEditor.scss'

/** One slider row's config: which `TextSizes` field it controls, its label key, and its rem range. */
const SLIDERS: { key: keyof TextSizes; labelKey: string; min: number; max: number }[] = [
  { key: 'heading', labelKey: 'headingLabel', min: 1.5, max: 12 },
  { key: 'itemTitle', labelKey: 'itemTitleLabel', min: 1, max: 7 },
  { key: 'description', labelKey: 'descriptionLabel', min: 0.75, max: 5 },
  { key: 'price', labelKey: 'priceLabel', min: 0.75, max: 6 },
]

interface TextSizeEditorProps {
  textSizes: TextSizes
  onChange: (textSizes: TextSizes) => void
  /** Omit both `backgroundColor` and `onBackgroundColorChange` to hide the swatch picker — used when editing a single slot's text sizes, since background color is a whole-screen setting. */
  backgroundColor?: string
  onBackgroundColorChange?: (backgroundColor: string) => void
  onSave: () => void
  onCancel: () => void
}

/**
 * Panel with a slider per text role (heading/item title/description/price),
 * plus loading/saving named text size presets shareable across screens. When
 * `backgroundColor`/`onBackgroundColorChange` are provided (whole-screen
 * editing, not a single slot), also shows a background color swatch picker
 * from the site's fixed brand palette — never affected by the site's own
 * light/dark mode; text color follows automatically for contrast.
 */
export function TextSizeEditor({ textSizes, onChange, backgroundColor, onBackgroundColorChange, onSave, onCancel }: TextSizeEditorProps) {
  const { t } = useLanguage()
  const [presets, setPresets] = useTextSizePresets()
  const [presetName, setPresetName] = useState('')
  const [justSaved, setJustSaved] = useState(false)

  const setSize = (key: keyof TextSizes, value: number) => {
    onChange({ ...textSizes, [key]: value })
  }

  const handleLoadPreset = (presetID: string) => {
    const preset = presets.find((candidate) => candidate.presetID === presetID)
    if (preset) onChange(preset.textSizes)
  }

  const handleSaveAsPreset = () => {
    if (!presetName.trim()) return
    setPresets([...presets, { presetID: `${Date.now()}`, name: presetName.trim(), textSizes }])
    setPresetName('')
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
  }

  return (
    <div className="text-size-editor">
      {backgroundColor !== undefined && onBackgroundColorChange && (
        <div className="text-size-editor__field">
          <span>{t('screenDisplay.textSizeEditor.backgroundColorLabel')}</span>
          <div className="text-size-editor__swatches">
            {SCREEN_BACKGROUND_COLORS.map((color) => (
              <button
                key={color.hex}
                type="button"
                className={`text-size-editor__swatch${backgroundColor === color.hex ? ' text-size-editor__swatch--active' : ''}`}
                style={{ backgroundColor: color.hex }}
                onClick={() => onBackgroundColorChange(color.hex)}
                aria-label={t(`screenDisplay.textSizeEditor.colors.${color.key}`)}
                title={t(`screenDisplay.textSizeEditor.colors.${color.key}`)}
              />
            ))}
          </div>
        </div>
      )}

      {SLIDERS.map(({ key, labelKey, min, max }) => (
        <label key={key} className="text-size-editor__slider">
          <span>
            {t(`screenDisplay.textSizeEditor.${labelKey}`)} — {textSizes[key].toFixed(2)}rem
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={0.05}
            value={textSizes[key]}
            onChange={(event) => setSize(key, Number(event.target.value))}
          />
        </label>
      ))}

      <div className="text-size-editor__presets">
        <label className="text-size-editor__field">
          <span>{t('screenDisplay.textSizeEditor.presetLabel')}</span>
          <select defaultValue="" onChange={(event) => handleLoadPreset(event.target.value)}>
            <option value="" disabled>
              {t('screenDisplay.textSizeEditor.loadPreset')}
            </option>
            {presets.map((preset) => (
              <option key={preset.presetID} value={preset.presetID}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>

        <div className="text-size-editor__save-preset">
          <Input
            id="new-preset-name"
            label={t('screenDisplay.textSizeEditor.presetNamePlaceholder')}
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
          />
          <Button type="button" variant="secondary" onClick={handleSaveAsPreset}>
            {justSaved ? t('screenDisplay.textSizeEditor.presetSaved') : t('screenDisplay.textSizeEditor.saveAsPreset')}
          </Button>
        </div>
      </div>

      <div className="text-size-editor__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('screenDisplay.textSizeEditor.cancel')}
        </Button>
        <Button type="button" onClick={onSave}>
          {t('screenDisplay.textSizeEditor.save')}
        </Button>
      </div>
    </div>
  )
}
