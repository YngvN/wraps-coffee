import { useState } from 'react'
import { Button, Input } from '../../components'
import { useTextSizePresets } from '../../hooks/useTextSizePresets'
import { useLanguage } from '../../i18n'
import type { TextSizes } from '../../types/screen'
import { BackgroundColorPicker } from './BackgroundColorPicker'
import './TextSizeEditor.scss'

/** One slider row's config: which `TextSizes` field it controls, its label key, and its rem range. */
const SLIDERS: { key: keyof TextSizes; labelKey: string; min: number; max: number }[] = [
  { key: 'heading', labelKey: 'headingLabel', min: 1.5, max: 12 },
  { key: 'itemTitle', labelKey: 'itemTitleLabel', min: 1, max: 7 },
  { key: 'description', labelKey: 'descriptionLabel', min: 0.75, max: 5 },
  { key: 'price', labelKey: 'priceLabel', min: 0.75, max: 6 },
  { key: 'itemPrice', labelKey: 'itemPriceLabel', min: 0.75, max: 6 },
]

interface TextSizeEditorProps {
  textSizes: TextSizes
  onChange: (textSizes: TextSizes) => void
  /** Current value (`undefined` = transparent/no color). Omit `onBackgroundColorChange` to hide the swatch picker entirely. */
  backgroundColor?: string
  onBackgroundColorChange?: (backgroundColor: string | undefined) => void
  /** Shows a "Transparent" swatch in the color picker — used for a slot's own color, whose standard/default is transparent. */
  allowTransparentBackground?: boolean
  /** Resets the sizes (and, when shown, the background color) back to what they were when this editor was opened. Omit to hide the button — there's nothing to restore to when changes are already written live with no "previous" snapshot of their own (the admin form's slot editor). */
  onRestore?: () => void
  /** Called by the "Done" button — typically closes a modal, or (the admin form's inline per-slide editor) returns to the slot's own "Global" tab. Omit to hide the button entirely, for a usage with no such notion of "finishing" (e.g. a flat, always-inline editor with nothing to return to). */
  onDone?: () => void
}

/**
 * Panel with a slider per text role (heading/item title/description/price),
 * plus loading/saving named text size presets shareable across screens. When
 * `onBackgroundColorChange` is provided, also shows a background color
 * swatch picker from the site's fixed brand palette (optionally with a
 * "Transparent" option) — never affected by the site's own light/dark mode;
 * text color follows automatically for contrast. Every change here is
 * applied live via `onChange`/`onBackgroundColorChange` — there is no
 * separate "Save" step, so the caller is expected to persist it (e.g. on the
 * wrapping modal being closed).
 */
export function TextSizeEditor({ textSizes, onChange, backgroundColor, onBackgroundColorChange, allowTransparentBackground, onRestore, onDone }: TextSizeEditorProps) {
  const { t } = useLanguage()
  const [presets, setPresets] = useTextSizePresets()
  const [presetName, setPresetName] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  /** The sizes as they were when this editor opened — the "100%" reference point for the "All" slider below. */
  const [baseline] = useState(() => textSizes)
  const [allPercent, setAllPercent] = useState(100)

  const setSize = (key: keyof TextSizes, value: number) => {
    onChange({ ...textSizes, [key]: value })
  }

  /** The "All" slider — scales every role by the same percentage relative to `baseline`, in one pass, so the individual sliders below move to reflect their new size together. */
  const setAllSize = (percent: number) => {
    setAllPercent(percent)
    const scale = percent / 100
    const next = { ...textSizes }
    SLIDERS.forEach(({ key, min, max }) => {
      next[key] = Math.min(max, Math.max(min, baseline[key] * scale))
    })
    onChange(next)
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
      {onBackgroundColorChange && <BackgroundColorPicker backgroundColor={backgroundColor} onChange={onBackgroundColorChange} allowTransparent={allowTransparentBackground} />}

      <label className="text-size-editor__slider text-size-editor__slider--all">
        <span>
          {t('screenDisplay.textSizeEditor.allLabel')} — {allPercent}%
        </span>
        <input type="range" min={25} max={300} step={5} value={allPercent} onChange={(event) => setAllSize(Number(event.target.value))} />
      </label>

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
        {onRestore && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setAllPercent(100)
              onRestore()
            }}
          >
            {t('screenDisplay.textSizeEditor.restorePrevious')}
          </Button>
        )}
        {onDone && (
          <Button type="button" onClick={onDone}>
            {t('screenDisplay.textSizeEditor.done')}
          </Button>
        )}
      </div>
    </div>
  )
}
