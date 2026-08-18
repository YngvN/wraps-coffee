import type { LanguageCode } from '../../i18n'
import type { ScreenConfig } from '../../types/screen'
import { getPersistedSlotTextSizes } from '../../utils/screenStages'
import { resolveContentTextSizes } from '../../utils/textSizeVars'
import { ScaledScreenPreview } from './ScaledScreenPreview'
import { SplitLayout } from './SplitLayout'

interface ScreenPreviewCaptureCanvasProps {
  screen: ScreenConfig
  stage: number
  defaultPaneLanguage: LanguageCode
}

/**
 * Off-screen renderer used only by `screenPreviewCapture.ts`: the same
 * `ScaledScreenPreview`+`SplitLayout` pairing `ScreenCard.tsx` mounts live
 * for its grid thumbnail, rendered here into a detached container instead
 * (see the caller, which sizes that container to `referenceCanvasSize` so
 * `ScaledScreenPreview`'s own `fit="contain"` scale factor comes out to
 * exactly 1) so a static screenshot can be captured from it without ever
 * needing a live card mounted in the actual Screens grid.
 */
export function ScreenPreviewCaptureCanvas({ screen, stage, defaultPaneLanguage }: ScreenPreviewCaptureCanvasProps) {
  return (
    <ScaledScreenPreview aspectRatio={screen.previewAspectRatio} fit="contain">
      <SplitLayout
        screen={screen}
        resolveTextSizes={(leafId, textSizeStage, content) => resolveContentTextSizes(content, getPersistedSlotTextSizes(screen, leafId, textSizeStage))}
        stage={stage}
        defaultPaneLanguage={defaultPaneLanguage}
        captureMode
      />
    </ScaledScreenPreview>
  )
}
