import { Checkbox } from '../../components'
import { useLanguage } from '../../i18n'
import { BackgroundColorPicker } from './BackgroundColorPicker'
import './BorderSettingsEditor.scss'

interface BorderSettingsEditorProps {
  showSlotBorders: boolean
  onShowSlotBordersChange: (showSlotBorders: boolean) => void
  borderColor: string | undefined
  onBorderColorChange: (borderColor: string | undefined) => void
}

/**
 * The screen's own shared pane borders: whether they're shown at all, and
 * (only while they are) their color — the same two fields `ScreenForm.tsx`'s
 * own "Borders" tab edits, mirrored here for the live display itself (see
 * `ScreenDisplay.tsx`'s `openBorderEditor`, opened by clicking directly on a
 * divider rather than dragging it). Both are live: changes apply
 * immediately, with no separate save step.
 */
export function BorderSettingsEditor({ showSlotBorders, onShowSlotBordersChange, borderColor, onBorderColorChange }: BorderSettingsEditorProps) {
  const { t } = useLanguage()

  return (
    <div className="border-settings-editor">
      <Checkbox
        id="screen-display-show-slot-borders"
        label={t('admin.screens.showSlotBordersLabel')}
        checked={showSlotBorders}
        onChange={(event) => onShowSlotBordersChange(event.target.checked)}
      />
      {showSlotBorders && (
        <BackgroundColorPicker
          backgroundColor={borderColor}
          onChange={onBorderColorChange}
          allowTransparent
          label={t('admin.screens.borderColorLabel')}
          transparentLabel={t('admin.screens.autoBorderColorLabel')}
        />
      )}
    </div>
  )
}
