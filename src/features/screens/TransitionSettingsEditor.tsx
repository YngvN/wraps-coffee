import { useLanguage } from '../../i18n'
import type { PaneGrowthFallback, ScreenTransitionStyle } from '../../types/screen'
import './TransitionSettingsEditor.scss'

interface TransitionSettingsEditorProps {
  transitionStyle: ScreenTransitionStyle
  onTransitionStyleChange: (style: ScreenTransitionStyle) => void
  paneGrowthFallback: PaneGrowthFallback
  onPaneGrowthFallbackChange: (fallback: PaneGrowthFallback) => void
}

/**
 * The screen's own two animation settings — how a slot's slide change is
 * animated (`transitionStyle`) and which entrance/exit a pane with no
 * existing divider to grow from/collapse into falls back to
 * (`paneGrowthFallback`) — the same two fields `ScreenForm.tsx`'s own
 * "Transitions" tab edits, mirrored here for the live display itself (see
 * `ScreenDisplay.tsx`'s `openTransitionsEditor` wiring). Both are live:
 * changes apply immediately, with no separate save step.
 */
export function TransitionSettingsEditor({
  transitionStyle,
  onTransitionStyleChange,
  paneGrowthFallback,
  onPaneGrowthFallbackChange,
}: TransitionSettingsEditorProps) {
  const { t } = useLanguage()

  return (
    <div className="transition-settings-editor">
      <div className="transition-settings-editor__field">
        <span>{t('admin.screens.transitionStyleLabel')}</span>
        <div className="transition-settings-editor__options">
          <button
            type="button"
            className={`transition-settings-editor__option${transitionStyle === 'fade' ? ' transition-settings-editor__option--active' : ''}`}
            onClick={() => onTransitionStyleChange('fade')}
          >
            {t('admin.screens.transitionFadeLabel')}
          </button>
          <button
            type="button"
            className={`transition-settings-editor__option${transitionStyle === 'slide' ? ' transition-settings-editor__option--active' : ''}`}
            onClick={() => onTransitionStyleChange('slide')}
          >
            {t('admin.screens.transitionSlideLabel')}
          </button>
        </div>
      </div>
      <div className="transition-settings-editor__field">
        <span>{t('admin.screens.paneGrowthFallbackLabel')}</span>
        <div className="transition-settings-editor__options">
          <button
            type="button"
            className={`transition-settings-editor__option${paneGrowthFallback === 'screenEdge' ? ' transition-settings-editor__option--active' : ''}`}
            onClick={() => onPaneGrowthFallbackChange('screenEdge')}
          >
            {t('admin.screens.paneGrowthScreenEdgeLabel')}
          </button>
          <button
            type="button"
            className={`transition-settings-editor__option${paneGrowthFallback === 'fade' ? ' transition-settings-editor__option--active' : ''}`}
            onClick={() => onPaneGrowthFallbackChange('fade')}
          >
            {t('admin.screens.paneGrowthFadeLabel')}
          </button>
        </div>
      </div>
    </div>
  )
}
