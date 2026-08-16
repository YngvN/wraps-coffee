import { toBlob } from 'html-to-image'
import { createElement } from 'react'
import type { LanguageCode } from '../../i18n'
import { deleteUpload, isOwnUploadUrl, uploadImage } from '../../lib/localServer'
import { DEFAULT_PREVIEW_ASPECT_RATIO, type ScreenConfig } from '../../types/screen'
import { withOffscreenStage } from './offscreenStageMount'
import { referenceCanvasSize } from './screenPreviewGeometry'
import { ScreenPreviewCaptureCanvas } from './ScreenPreviewCaptureCanvas'

/**
 * Mounts `ScreenPreviewCapture` into a detached, off-screen container sized
 * to exactly `referenceCanvasSize` (so `ScaledScreenPreview`'s own
 * `fit="contain"` scale factor comes out to 1, a full-resolution capture),
 * waits for it to visually settle, snapshots it, then tears the whole thing
 * down again — so the live instance this needs only ever exists for a few
 * seconds, once per stage, rather than staying mounted.
 *
 * The mount/settle/teardown half lives in `offscreenStageMount.ts`, shared
 * with `warmShrinkScales.ts`; only the screenshotting is specific to this
 * caller.
 */
async function captureOneStage(screen: ScreenConfig, stage: number, defaultPaneLanguage: LanguageCode): Promise<Blob | null> {
  return withOffscreenStage(
    createElement(ScreenPreviewCaptureCanvas, { screen, stage, defaultPaneLanguage }),
    referenceCanvasSize(screen.previewAspectRatio ?? DEFAULT_PREVIEW_ASPECT_RATIO),
    async (container) => {
      const canvas = container.querySelector<HTMLElement>('.scaled-screen-preview__canvas')
      if (!canvas) return null
      return await toBlob(canvas, { pixelRatio: 1 })
    },
    (error) => {
      // `html-to-image` sometimes rejects with a raw DOM `Event` (a failed
      // `<img>`/`<link>` load inside the captured subtree) rather than an
      // `Error` — surface the actual failing element/URL when that happens,
      // since a bare `Event` object logs as opaque otherwise.
      const eventDetail =
        error instanceof Event
          ? { type: error.type, target: (error.target as HTMLImageElement | HTMLLinkElement | null)?.outerHTML?.slice(0, 300) }
          : undefined
      console.warn(`[screenPreviewCapture] failed to capture stage ${stage} of screen "${screen.screenID}" — its card will keep live-rendering until a later save succeeds.`, error, eventDetail)
    },
  )
}

/**
 * Captures one screenshot per stage (1..`stageCount`) of `screen`'s own
 * current appearance, uploads each, and returns the new `previewImages`
 * array — or `null` if any stage's capture/upload failed, in which case
 * nothing is uploaded/deleted and the caller should leave `previewImages`
 * untouched (see this file's own module doc comment for why this is
 * all-or-nothing rather than a partial update).
 *
 * Stages are captured **sequentially**, never concurrently — capturing them
 * in parallel would mount N live `SplitLayout` instances off-screen at
 * once, silently reintroducing the exact "N live instances running
 * simultaneously" cost this whole feature exists to remove from the
 * Screens grid, just moved off-canvas instead of into it.
 *
 * Only once every stage has uploaded successfully are `screen`'s *previous*
 * `previewImages` deleted (fire-and-forget, `isOwnUploadUrl`-guarded, same
 * posture as `ImageUploadField.tsx`'s own replace-and-clean-up-old flow) —
 * so a slow or partially-failing capture never leaves a screen with no
 * preview image at all mid-flight.
 */
export async function captureScreenPreviews(screen: ScreenConfig, token: string, defaultPaneLanguage: LanguageCode): Promise<string[] | null> {
  const stageCount = screen.useStages ? Math.max(1, screen.stageCount ?? 1) : 1
  const newUrls: string[] = []

  for (let stage = 1; stage <= stageCount; stage++) {
    const blob = await captureOneStage(screen, stage, defaultPaneLanguage)
    if (!blob) {
      for (const uploaded of newUrls) void deleteUpload(uploaded, token)
      return null
    }
    try {
      const file = new File([blob], `${screen.screenID}-preview-stage-${stage}.png`, { type: 'image/png' })
      // `purpose` keeps these out of the Media Library and both image pickers — see `uploadImage`.
      newUrls.push(await uploadImage(file, token, undefined, { purpose: 'screen-preview' }))
    } catch {
      for (const uploaded of newUrls) void deleteUpload(uploaded, token)
      return null
    }
  }

  for (const oldUrl of screen.previewImages ?? []) {
    if (isOwnUploadUrl(oldUrl)) void deleteUpload(oldUrl, token)
  }

  return newUrls
}
