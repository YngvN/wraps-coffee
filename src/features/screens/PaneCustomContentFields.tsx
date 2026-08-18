import { useEffect, useState } from 'react'
import { Button, CollapsibleSection, Textarea } from '../../components'
import { useLanguage } from '../../i18n'
import { MAX_PANE_CUSTOM_CSS_LENGTH, MAX_PANE_CUSTOM_HTML_LENGTH } from '../../types/screen'
import { listAllowedCssProperties, validatePaneCustomCss } from '../../utils/paneCustomCss'
import { listAllowedHtmlTags, validatePaneCustomHtml } from '../../utils/paneCustomHtml'
import './PaneCustomContentFields.scss'

/** How long to wait after the admin stops typing before re-running validation — cheap enough to run on every keystroke, but debounced anyway so a fast typist doesn't see error text flicker mid-word. */
const VALIDATION_DEBOUNCE_MS = 400

interface PaneCustomContentFieldsProps {
  customCss: string | undefined
  onCustomCssChange: (css: string | undefined) => void
  customHtml: string | undefined
  onCustomHtmlChange: (html: string | undefined) => void
  customHtmlPlacement: 'before' | 'after' | undefined
  onCustomHtmlPlacementChange: (placement: 'before' | 'after') => void
}

/** Live debounced validation problem codes for one field, against the *admin* posture (this is always the human editor — the assistant's own narrower posture is validated server-side in `screenPane.ts`, never surfaced through this component). */
function useLiveValidation(value: string | undefined, validate: (value: string) => string[]): string[] {
  const [problems, setProblems] = useState<string[]>([])
  useEffect(() => {
    // Always scheduled via the timer, even for an empty `value` — never a synchronous `setState`
    // directly in the effect body (this codebase's own lint rule; see CLAUDE.md's "Deep-linkable
    // admin views" section for the same rule hit elsewhere).
    const timer = setTimeout(() => setProblems(value ? validate(value) : []), VALIDATION_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `validate` is one of the two stable module-level functions passed in by this file's own two call sites below, never a fresh closure worth re-triggering on
  }, [value])
  return problems
}

/**
 * The two collapsible "Custom CSS"/"Custom HTML" sections shared by both places a pane is edited from
 * (`ScreenForm.tsx`'s own per-slot tab and `ScreenDisplay.tsx`'s in-place `SlotEditor`) — same
 * "shared, not duplicated" posture as `PaneEditor.tsx` itself, which renders this. Always validates
 * against the *admin* posture (see `useLiveValidation`'s own doc comment); this is a live hint for the
 * admin, not the real gate — the server re-validates independently on every write regardless (see
 * `server/index.ts`'s own `admin.screens` `applyUpdate` branch).
 */
export function PaneCustomContentFields({ customCss, onCustomCssChange, customHtml, onCustomHtmlChange, customHtmlPlacement, onCustomHtmlPlacementChange }: PaneCustomContentFieldsProps) {
  const { t } = useLanguage()
  const cssProblems = useLiveValidation(customCss, (value) => validatePaneCustomCss(value, 'admin'))
  const htmlProblems = useLiveValidation(customHtml, (value) => validatePaneCustomHtml(value, 'admin'))

  const problemMessage = (code: string) => t(`admin.screens.paneCustomContent.errors.${code}`)

  return (
    <>
      <CollapsibleSection label={t('admin.screens.paneCustomContent.cssLabel')}>
        <div className="pane-custom-content-fields">
          <p className="pane-custom-content-fields__hint">
            {t('admin.screens.paneCustomContent.cssHint', { properties: listAllowedCssProperties('admin').join(', ') })}
          </p>
          <p className="pane-custom-content-fields__hint">{t('admin.screens.paneCustomContent.cssScopeHint')}</p>
          <Textarea
            id="pane-custom-css"
            value={customCss ?? ''}
            onChange={(event) => onCustomCssChange(event.target.value || undefined)}
            maxLength={MAX_PANE_CUSTOM_CSS_LENGTH}
            rows={5}
            placeholder="color: red;&#10;font-size: 3rem;"
          />
          <div className="pane-custom-content-fields__footer">
            <span className="pane-custom-content-fields__counter">
              {(customCss ?? '').length} / {MAX_PANE_CUSTOM_CSS_LENGTH}
            </span>
            {customCss && (
              <Button type="button" variant="secondary" onClick={() => onCustomCssChange(undefined)}>
                {t('admin.common.clear')}
              </Button>
            )}
          </div>
          {cssProblems.length > 0 && (
            <ul className="pane-custom-content-fields__errors">
              {cssProblems.map((code) => (
                <li key={code}>{problemMessage(code)}</li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection label={t('admin.screens.paneCustomContent.htmlLabel')}>
        <div className="pane-custom-content-fields">
          <p className="pane-custom-content-fields__hint">{t('admin.screens.paneCustomContent.htmlHint', { tags: listAllowedHtmlTags('admin').join(', ') })}</p>
          <p className="pane-custom-content-fields__hint">{t('admin.screens.paneCustomContent.htmlNotTranslatedHint')}</p>
          <div className="pane-custom-content-fields__placement">
            <span>{t('admin.screens.paneCustomContent.placementLabel')}</span>
            <div className="pane-custom-content-fields__placement-buttons">
              <Button type="button" variant={customHtmlPlacement !== 'before' ? 'primary' : 'secondary'} onClick={() => onCustomHtmlPlacementChange('after')}>
                {t('admin.screens.paneCustomContent.placementAfter')}
              </Button>
              <Button type="button" variant={customHtmlPlacement === 'before' ? 'primary' : 'secondary'} onClick={() => onCustomHtmlPlacementChange('before')}>
                {t('admin.screens.paneCustomContent.placementBefore')}
              </Button>
            </div>
          </div>
          <p className="pane-custom-content-fields__hint">{t('admin.screens.paneCustomContent.placementHint')}</p>
          <Textarea
            id="pane-custom-html"
            value={customHtml ?? ''}
            onChange={(event) => onCustomHtmlChange(event.target.value || undefined)}
            maxLength={MAX_PANE_CUSTOM_HTML_LENGTH}
            rows={5}
            placeholder="<p>Today's special!</p>"
          />
          <div className="pane-custom-content-fields__footer">
            <span className="pane-custom-content-fields__counter">
              {(customHtml ?? '').length} / {MAX_PANE_CUSTOM_HTML_LENGTH}
            </span>
            {customHtml && (
              <Button type="button" variant="secondary" onClick={() => onCustomHtmlChange(undefined)}>
                {t('admin.common.clear')}
              </Button>
            )}
          </div>
          {htmlProblems.length > 0 && (
            <ul className="pane-custom-content-fields__errors">
              {htmlProblems.map((code) => (
                <li key={code}>{problemMessage(code)}</li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleSection>
    </>
  )
}
