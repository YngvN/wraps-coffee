import { toBlob } from 'html-to-image'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageProvider, type LanguageCode } from '../../i18n'
import { deleteUpload, isOwnUploadUrl, uploadImage } from '../../lib/localServer'
import { DEFAULT_PREVIEW_ASPECT_RATIO, type ScreenConfig } from '../../types/screen'
import { RESIZE_SETTLE_MS } from '../../hooks/shrinkToFitScheduler'
import { CONTENT_TRANSITION_DURATION_SECONDS, PANE_TRANSITION_STAGGER_SECONDS } from './paneGrowthMotion'
import { referenceCanvasSize } from './screenPreviewGeometry'
import { ScreenPreviewCaptureCanvas } from './ScreenPreviewCaptureCanvas'

/** Matches `useShrinkToFitScale.ts`/`useShrinkToFitFontScale.ts`'s own (unexported) `MUTATION_SETTLE_MS` — how long those hooks wait after a DOM mutation (e.g. an image finishing load) before remeasuring for shrink-to-fit. Duplicated here rather than imported since neither hook file exports it; kept as a named constant so the relationship stays visible rather than being a bare number in the wait sequence below. */
const MUTATION_SETTLE_MS = 500

/** How long to wait for every in-flight `<img>` inside a capture to finish loading before giving up and capturing anyway — a screenshot with one slow/broken image is still strictly better than blocking a save's background capture forever. */
const IMAGE_LOAD_TIMEOUT_MS = 4000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Two animation frames — ensures whatever was just mounted/changed has actually committed a paint, not just a React commit. */
function nextTwoFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

async function waitForImagesToLoad(container: HTMLElement): Promise<void> {
  const pending = Array.from(container.querySelectorAll('img')).filter((img) => !img.complete)
  if (pending.length === 0) return
  await Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
      ),
    ),
    sleep(IMAGE_LOAD_TIMEOUT_MS),
  ])
}

/**
 * Mounts `ScreenPreviewCapture` into a detached, off-screen container sized
 * to exactly `referenceCanvasSize` (so `ScaledScreenPreview`'s own
 * `fit="contain"` scale factor comes out to 1, a full-resolution capture),
 * waits for it to visually settle, snapshots it, then tears the whole thing
 * down again — so the live instance this needs only ever exists for a few
 * seconds, once per stage, rather than staying mounted.
 */
async function captureOneStage(screen: ScreenConfig, stage: number, defaultPaneLanguage: LanguageCode): Promise<Blob | null> {
  const { width, height } = referenceCanvasSize(screen.previewAspectRatio ?? DEFAULT_PREVIEW_ASPECT_RATIO)
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '-10000px'
  container.style.width = `${width}px`
  container.style.height = `${height}px`
  container.style.pointerEvents = 'none'
  document.body.appendChild(container)
  const root = createRoot(container)

  try {
    // `SplitLayout` (via `PaneLanguageScope`/slide components) reads
    // `useLanguage()`, which needs a real `LanguageContext` provider — the
    // app's own root normally supplies one (`main.tsx`), but this off-screen
    // root is mounted standalone, outside that tree entirely.
    root.render(createElement(LanguageProvider, null, createElement(ScreenPreviewCaptureCanvas, { screen, stage, defaultPaneLanguage })))

    // Settle sequence — see the plan's own reasoning for each step: fonts,
    // a mount-time content crossfade, in-flight images, a shrink-to-fit
    // remeasure those images can retrigger, then one more paint.
    await document.fonts.ready
    await nextTwoFrames()
    await sleep((CONTENT_TRANSITION_DURATION_SECONDS + PANE_TRANSITION_STAGGER_SECONDS) * 1000)
    await waitForImagesToLoad(container)
    await sleep(RESIZE_SETTLE_MS + MUTATION_SETTLE_MS)
    await nextTwoFrames()

    const canvas = container.querySelector<HTMLElement>('.scaled-screen-preview__canvas')
    if (!canvas) return null
    return await toBlob(canvas, { pixelRatio: 1 })
  } catch (error) {
    // `html-to-image` sometimes rejects with a raw DOM `Event` (a failed
    // `<img>`/`<link>` load inside the captured subtree) rather than an
    // `Error` — surface the actual failing element/URL when that happens,
    // since a bare `Event` object logs as opaque otherwise.
    const eventDetail =
      error instanceof Event
        ? { type: error.type, target: (error.target as HTMLImageElement | HTMLLinkElement | null)?.outerHTML?.slice(0, 300) }
        : undefined
    console.warn(`[screenPreviewCapture] failed to capture stage ${stage} of screen "${screen.screenID}" — its card will keep live-rendering until a later save succeeds.`, error, eventDetail)
    return null
  } finally {
    root.unmount()
    container.remove()
  }
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
      newUrls.push(await uploadImage(file, token))
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
