import { motion, type Transition, type Variants } from 'framer-motion'
import type { CSSProperties, Ref } from 'react'
import type { NewsSlotSettings } from '../../hooks/useCurrentNewsHeadline'
import type { LanguageCode } from '../../i18n'
import type { BackgroundImage, BackgroundImageOverlay, ScreenSlotContent } from '../../types/screen'
import { getBackgroundImageUrl } from '../../utils/responsiveImage'
import { PaneLanguageScope } from './PaneLanguageScope'
import { SlotContent } from './SlotContent'

interface PaneVisualProps {
  /** What CSS scoping (`scopePaneCustomCss`) and the `data-pane-scope` attribute both key on for this instance — see `LayoutPane.tsx`'s own doc comment on why this is not always the pane's own bare `PaneId` (a screen-qualified default there; an explicit `${paneId}:before`/`${paneId}:after`/candidate-id elsewhere, for every caller that can render more than one instance of the same real pane at once). */
  scopeId: string
  content: ScreenSlotContent
  backgroundImage: BackgroundImage | undefined
  overlay: BackgroundImageOverlay | undefined
  language: LanguageCode
  /** The full computed style object for this pane's own instance — background-color/text-color CSS vars, `textSizeVars`, overlay tint (see `screenColors.ts`'s `slotBackgroundColorStyle`/`backgroundImageTextStyle`/`slotTextColorStyle`) — computed by the caller (identically in `LayoutPane.tsx` and every assistant preview, from the same shared utilities) and applied here to the outer element. */
  style?: CSSProperties
  customHtml: string | undefined
  /** Falls back to `'after'`, matching `ScreenSlot.customHtmlPlacement`'s own default. */
  customHtmlPlacement?: 'before' | 'after'
  /** Every currently-resolved `'news'`-kind pane on this same screen — see `SlotContent`'s own prop of the same name. */
  newsSlots: NewsSlotSettings[]
  stageTick: number | undefined
  stage: number
  onRequestStageAdvance?: () => void
  captureMode?: boolean
  /** This pane's own inner-padding CSS custom property — see `OwnBackgroundImageFields.padding`'s own doc comment. */
  paddingCqmin?: number
  /** Forwarded to the outer element — `LayoutPane`'s own crossfade slot ref, for `useShrinkToFitScale`/`useShrinkToFitFontScale`. Omit for a static (non-shrink-tracked) caller like the assistant's own preview. */
  outerRef?: Ref<HTMLDivElement>
  /** Forwarded to `.split-layout__pane-content-inner` — same purpose as `outerRef`, for the *inner* element those hooks measure. */
  contentInnerRef?: Ref<HTMLDivElement>
  className?: string
  /** When given, the outer element renders as a `motion.div` driven by these — `LayoutPane.tsx`'s own crossfade transition. Omitted entirely for a static caller (a plain, unanimated `<div>`). `initial: false` (as opposed to a variant name) skips the mount-time entrance pose entirely — see `LayoutPane.tsx`'s own `stageStatic` prop doc comment for when that's needed. */
  motionProps?: { variants: Variants; initial: string | false; animate: string; transition: Transition }
}

/**
 * Paints one fully-resolved pane snapshot — background layer, the content box (`SlotContent`,
 * language-scoped, with `customHtml` positioned before/after it per `customHtmlPlacement`), all inside
 * a `data-pane-scope`-tagged root. Shared by **both** `LayoutPane.tsx`'s own real crossfade-driven
 * render (one instance per active crossfade slot, up to two at once) **and** every assistant preview
 * (the candidate list's own thumbnails, the before/after review) — extracted so the two can never
 * visually drift apart, same reasoning `PaneEditor.tsx` is already shared between the two admin
 * editors (see this repo's CLAUDE.md).
 *
 * Deliberately does **not** render its own `<style>` tag at all — the scoped CSS a `customCss` value
 * produces (`scopePaneCustomCss`/`usePaneCustomContent`) is the *caller's* responsibility to render as
 * a sibling. `LayoutPane.tsx` renders exactly one, at its own outer `.split-layout__pane` level, shared
 * by both of its own simultaneous crossfade-slot `PaneVisual` instances (two slots of the same real
 * pane always share the same `customCss`, since it's a single value across every stage — see
 * `ScreenSlot.customCss`'s own doc comment — so a second identical `<style>` tag would be pure waste);
 * a standalone caller (no `LayoutPane` in the picture, e.g. the assistant's own before/after preview)
 * renders its own single sibling `<style>` next to its own single `PaneVisual` instance instead.
 */
export function PaneVisual({
  scopeId,
  content,
  backgroundImage,
  overlay,
  language,
  style,
  customHtml,
  customHtmlPlacement,
  newsSlots,
  stageTick,
  stage,
  onRequestStageAdvance,
  captureMode,
  paddingCqmin,
  outerRef,
  contentInnerRef,
  className,
  motionProps,
}: PaneVisualProps) {
  const placement = customHtmlPlacement ?? 'after'
  const slotBlur = backgroundImage?.blur ?? true

  const inner = (
    <>
      {backgroundImage && (
        <div className="split-layout__pane-bg">
          <div
            className="split-layout__pane-bg-image"
            style={{ backgroundImage: `url(${getBackgroundImageUrl(backgroundImage.imageUrl, slotBlur)})`, filter: slotBlur ? 'blur(4px)' : 'none' }}
          />
          {overlay && overlay !== 'none' && <div className={`split-layout__pane-bg-overlay split-layout__pane-bg-overlay--${overlay}`} />}
        </div>
      )}
      <div
        className="split-layout__pane-content-inner"
        ref={contentInnerRef}
        style={paddingCqmin !== undefined ? ({ '--pane-padding': `${paddingCqmin}cqmin` } as CSSProperties) : undefined}
      >
        {/*
          `customHtml` is rendered as a sibling *outside* `PaneLanguageScope`/`SlotContent` — deliberately
          not nested inside whichever element `useShrinkToFitScale`/`useShrinkToFitFontScale` observe via
          their own `MutationObserver` (see `LayoutPane.tsx`'s own hook calls, which watch this exact
          `contentInnerRef` subtree) — injected HTML mutating in place would otherwise trigger avoidable
          remeasure cycles on content that didn't actually change size. `dangerouslySetInnerHTML` is fed
          only the already-validated, already-sanitized stored string (see `src/utils/paneCustomContent.ts`)
          — the one and only use of it in this codebase.
        */}
        {customHtml && placement === 'before' && <div className="split-layout__pane-custom-html" dangerouslySetInnerHTML={{ __html: customHtml }} />}
        <PaneLanguageScope language={language}>
          <SlotContent slot={content} newsSlots={newsSlots} stageTick={stageTick} stage={stage} onRequestStageAdvance={onRequestStageAdvance} captureMode={captureMode} />
        </PaneLanguageScope>
        {customHtml && placement === 'after' && <div className="split-layout__pane-custom-html" dangerouslySetInnerHTML={{ __html: customHtml }} />}
      </div>
    </>
  )

  const rootProps = {
    className,
    style,
    'data-pane-scope': scopeId,
  }

  if (motionProps) {
    return (
      <motion.div ref={outerRef} {...rootProps} variants={motionProps.variants} initial={motionProps.initial} animate={motionProps.animate} transition={motionProps.transition}>
        {inner}
      </motion.div>
    )
  }
  return (
    <div ref={outerRef} {...rootProps}>
      {inner}
    </div>
  )
}
