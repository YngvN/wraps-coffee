import { usePaneCustomContent } from '../../../hooks/usePaneCustomContent'
import type { LanguageCode } from '../../../i18n'
import type { PaneId, ScreenConfig } from '../../../types/screen'
import { PaneVisual } from '../../screens/PaneVisual'
import { getPersistedSlotTextSizes, resolveSlotBackgroundColor, resolveSlotBackgroundImage, resolveSlotContent, resolveSlotLanguage, resolveSlotTextColor } from '../../../utils/screenStages'
import { resolveContentBackgroundImage } from '../../../utils/screenSlots'
import { backgroundImageTextStyle, getScreenColorVars, slotBackgroundColorStyle, slotTextColorStyle } from '../../../utils/screenColors'
import { resolveContentTextSizes } from '../../../utils/textSizeVars'
import { textSizesToCssVars } from '../../../utils/textSizeVars'
import './ScreenPanePreview.scss'

interface ScreenPanePreviewProps {
  screen: ScreenConfig
  paneId: PaneId
  stage: number
  /** Must be distinct between two simultaneous previews of the same real pane (a "Before"/"After" pair) — see `PaneVisual.tsx`'s own doc comment on why a shared `scopeId` would leak one draft's `customCss` onto the other's preview. */
  scopeId: string
  defaultPaneLanguage: LanguageCode
  label: string
}

/**
 * A single static (non-animated, non-crossfading) rendering of one pane at one resolved stage — the
 * assistant's own visual preview, reused for both the before/after review (`AssistantPanel.tsx`'s own
 * `screenPane` branch) and its candidate-list thumbnails. Wraps `PaneVisual` in the *exact* same
 * `.split-layout__pane`/`.split-layout__pane-content` classes the real kiosk display uses (see
 * `LayoutPane.tsx`), so it inherits the real CSS (background/overflow/sizing) rather than needing a
 * parallel copy of it — the same "shared, not duplicated" reasoning `PaneVisual.tsx` itself already
 * documents. `newsSlots`/`stageTick` are intentionally omitted (`[]`/`undefined`): this is a static
 * preview, not a live-ticking one, so a `'news'`/`'qrcode'`-automatic-mode pane simply shows its own
 * empty state here — a disclosed, minor fidelity gap, not a bug.
 */
export function ScreenPanePreview({ screen, paneId, stage, scopeId, defaultPaneLanguage, label }: ScreenPanePreviewProps) {
  const slot = screen.paneSlots[paneId]
  // `usePaneCustomContent` must be called unconditionally (rules of hooks) — before the `!slot` early
  // return below, not after.
  const scopedCss = usePaneCustomContent(scopeId, slot?.customCss)
  if (!slot) return null

  const content = resolveSlotContent(slot, stage)
  const backgroundColor = resolveSlotBackgroundColor(slot, stage)
  const textColor = resolveSlotTextColor(slot, stage)
  const slotBackgroundImage = resolveSlotBackgroundImage(slot, stage)
  const backgroundImage = resolveContentBackgroundImage(content, slotBackgroundImage)
  const language = resolveSlotLanguage(slot, stage) ?? defaultPaneLanguage
  const textSizes = getPersistedSlotTextSizes(screen, paneId, stage)

  const style = {
    ...textSizesToCssVars(resolveContentTextSizes(content, textSizes)),
    ...slotBackgroundColorStyle(backgroundColor),
    ...backgroundImageTextStyle(backgroundImage?.overlay),
    ...(backgroundColor ? { color: 'var(--screen-text)' } : {}),
    ...slotTextColorStyle(textColor),
  }

  return (
    <div className="screen-pane-preview">
      <span className="screen-pane-preview__label">{label}</span>
      <div className="split-layout__pane screen-pane-preview__box" style={backgroundColor ? (getScreenColorVars(backgroundColor) as object) : undefined}>
        {scopedCss && <style>{scopedCss}</style>}
        <PaneVisual
          scopeId={scopeId}
          className="split-layout__pane-content"
          style={style}
          content={content}
          backgroundImage={backgroundImage}
          overlay={backgroundImage?.overlay}
          language={language}
          customHtml={slot.customHtml}
          customHtmlPlacement={slot.customHtmlPlacement}
          newsSlots={[]}
          stageTick={undefined}
          stage={stage}
          paddingCqmin={content.padding}
        />
      </div>
    </div>
  )
}
