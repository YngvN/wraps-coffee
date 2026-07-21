import { useEffect, useRef, useState } from 'react'
import { Button, Input } from '../../components'
import { useTextSizePresets } from '../../hooks/useTextSizePresets'
import { useLanguage } from '../../i18n'
import type { TextSizes } from '../../types/screen'
import './TextSizeEditor.scss'

/** The two choices `overflowMode`/`onOverflowModeChange` toggle between — see `ScreenSlot.overflowMode`'s own doc comment. */
const OVERFLOW_MODES: { key: 'shrink' | 'scroll'; labelKey: string }[] = [
  { key: 'shrink', labelKey: 'shrinkToFitOption' },
  { key: 'scroll', labelKey: 'allowScrollingOption' },
]

/** One slider row's config: which `TextSizes` field it controls, its label key, and its range — a percentage of the pane's own smaller dimension (`cqmin`), see `TextSizes`' own doc comment. */
const SLIDERS: { key: keyof TextSizes; labelKey: string; min: number; max: number }[] = [
  { key: 'heading', labelKey: 'headingLabel', min: 5, max: 38 },
  { key: 'itemTitle', labelKey: 'itemTitleLabel', min: 3, max: 22 },
  { key: 'description', labelKey: 'descriptionLabel', min: 2.5, max: 16 },
  { key: 'price', labelKey: 'priceLabel', min: 2.5, max: 19 },
  { key: 'itemPrice', labelKey: 'itemPriceLabel', min: 2.5, max: 19 },
]

interface TextSizeEditorProps {
  textSizes: TextSizes
  onChange: (textSizes: TextSizes) => void
  /** Whether this pane's content shrinks to fit or is allowed to overflow (vertically) and scroll instead — see `ScreenSlot.overflowMode`. */
  overflowMode: 'shrink' | 'scroll'
  onOverflowModeChange: (mode: 'shrink' | 'scroll') => void
  /** Resets the sizes back to what they were when this editor was opened. Omit to hide the button — there's nothing to restore to when changes are already written live with no "previous" snapshot of their own (the admin form's slot editor). */
  onRestore?: () => void
  /** Called by the "Done" button — typically closes a modal, or (the admin form's inline per-slide editor) returns to the slot's own "Global" tab. Omit to hide the button entirely, for a usage with no such notion of "finishing" (e.g. a flat, always-inline editor with nothing to return to). */
  onDone?: () => void
}

/**
 * Panel with a slider per text role (heading/item title/description/price),
 * plus loading/saving named text size presets shareable across screens — a
 * pane's own background color lives in `PaneEditor`'s own "Background"
 * sub-view instead (see `BackgroundColorPicker`), not here. Every change
 * here is applied live via `onChange` — there is no separate "Save" step, so
 * the caller is expected to persist it (e.g. on the wrapping modal being
 * closed).
 */
export function TextSizeEditor({ textSizes, onChange, overflowMode, onOverflowModeChange, onRestore, onDone }: TextSizeEditorProps) {
  const { t } = useLanguage()
  const [presets, setPresets] = useTextSizePresets()
  const [presetName, setPresetName] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  /** The sizes as they were when this editor opened — the "100%" reference point for the "All" slider below. */
  const [baseline] = useState(() => textSizes)
  const [allPercent, setAllPercent] = useState(100)
  const justSavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (justSavedTimeoutRef.current !== undefined) clearTimeout(justSavedTimeoutRef.current)
    }
  }, [])

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
    if (justSavedTimeoutRef.current !== undefined) clearTimeout(justSavedTimeoutRef.current)
    justSavedTimeoutRef.current = setTimeout(() => setJustSaved(false), 2000)
  }

  return (
    <div className="text-size-editor">
      <div className="text-size-editor__overflow-mode" role="group" aria-label={t('screenDisplay.textSizeEditor.overflowModeLabel')}>
        {OVERFLOW_MODES.map(({ key, labelKey }) => (
          <button
            key={key}
            type="button"
            className={`text-size-editor__overflow-mode-option${overflowMode === key ? ' text-size-editor__overflow-mode-option--active' : ''}`}
            onClick={() => onOverflowModeChange(key)}
          >
            {t(`screenDisplay.textSizeEditor.${labelKey}`)}
          </button>
        ))}
      </div>

      <label className="text-size-editor__slider text-size-editor__slider--all">
        <span>
          {t('screenDisplay.textSizeEditor.allLabel')} — {allPercent}%
        </span>
        <input type="range" min={25} max={300} step={5} value={allPercent} onChange={(event) => setAllSize(Number(event.target.value))} />
      </label>

      {SLIDERS.map(({ key, labelKey, min, max }) => (
        <label key={key} className="text-size-editor__slider">
          <span>
            {t(`screenDisplay.textSizeEditor.${labelKey}`)} — {textSizes[key].toFixed(1)}%
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={0.1}
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
