import { Checkbox } from '../../components'
import { useLanguage } from '../../i18n'

interface OtherSettingsEditorProps {
  hideScrollbar: boolean
  onHideScrollbarChange: (hideScrollbar: boolean) => void
}

/**
 * The screen's own catch-all settings that don't belong under any of the
 * other sub-views — currently just whether a scrolling pane's own scrollbar
 * is hidden (`hideScrollbar`) — the same field `ScreenForm.tsx`'s own
 * "Other settings" tab edits, mirrored here for the live display itself
 * (see `ScreenDisplay.tsx`'s `openOtherSettingsEditor` wiring). Live: the
 * change applies immediately, with no separate save step.
 */
export function OtherSettingsEditor({ hideScrollbar, onHideScrollbarChange }: OtherSettingsEditorProps) {
  const { t } = useLanguage()

  return (
    <div className="other-settings-editor">
      <Checkbox
        id="screen-display-hide-scrollbar"
        label={t('admin.screens.hideScrollbarLabel')}
        checked={hideScrollbar}
        onChange={(event) => onHideScrollbarChange(event.target.checked)}
      />
    </div>
  )
}
