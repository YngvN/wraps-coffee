import { createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageProvider } from '../../i18n'
import { RESIZE_SETTLE_MS } from '../../hooks/shrinkToFitScheduler'
import { CONTENT_TRANSITION_DURATION_SECONDS, PANE_TRANSITION_STAGGER_SECONDS } from './paneGrowthMotion'

/**
 * Mounting-and-settling scaffolding shared by everything that needs one stage
 * of a screen rendered *for real* but off-screen — currently
 * `screenPreviewCapture.ts` (which then screenshots it) and
 * `warmShrinkScales.ts` (which only wants the side effect of the shrink hooks
 * having run). Extracted from `screenPreviewCapture.ts`, which owned all of
 * this privately, so a second caller doesn't have to duplicate a settle
 * sequence whose every step exists for a reason discovered the hard way.
 */

/** Matches `useShrinkToFitScale.ts`/`useShrinkToFitFontScale.ts`'s own (unexported) `MUTATION_SETTLE_MS` — how long those hooks wait after a DOM mutation (e.g. an image finishing load) before remeasuring for shrink-to-fit. Duplicated here rather than imported since neither hook file exports it; kept as a named constant so the relationship stays visible rather than being a bare number in the wait sequence below. */
const MUTATION_SETTLE_MS = 500

/** How long to wait for every in-flight `<img>` inside an off-screen mount to finish loading before giving up — a screenshot with one slow/broken image is still strictly better than blocking forever, and a shrink warm-up whose images never arrive is no worse than not warming at all. */
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
 * Mounts `element` into a detached, off-screen container of exactly `size`,
 * waits for it to visually settle, hands the container to `read`, then tears
 * the whole thing down again — so the live instance only ever exists for a
 * few seconds rather than staying mounted.
 *
 * Wrapped in `LanguageProvider` because `SplitLayout` (via
 * `PaneLanguageScope`/the slide components) reads `useLanguage()`, which needs
 * a real `LanguageContext`. The app's own root normally supplies one
 * (`main.tsx`), but this off-screen root is mounted standalone, outside that
 * tree entirely.
 *
 * Returns whatever `read` returned, or `null` if the mount threw — callers
 * treat a failed off-screen render as "skip this one", never as fatal.
 */
export async function withOffscreenStage<T>(
  element: ReactElement,
  size: { width: number; height: number },
  read: (container: HTMLElement) => Promise<T> | T,
  onError?: (error: unknown) => void,
): Promise<T | null> {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '-10000px'
  container.style.width = `${size.width}px`
  container.style.height = `${size.height}px`
  container.style.pointerEvents = 'none'
  document.body.appendChild(container)
  const root = createRoot(container)

  try {
    root.render(createElement(LanguageProvider, null, element))

    // Settle sequence — fonts, a mount-time content crossfade, in-flight
    // images, a shrink-to-fit remeasure those images can retrigger, then one
    // more paint.
    await document.fonts.ready
    await nextTwoFrames()
    await sleep((CONTENT_TRANSITION_DURATION_SECONDS + PANE_TRANSITION_STAGGER_SECONDS) * 1000)
    await waitForImagesToLoad(container)
    await sleep(RESIZE_SETTLE_MS + MUTATION_SETTLE_MS)
    await nextTwoFrames()

    return await read(container)
  } catch (error) {
    onError?.(error)
    return null
  } finally {
    root.unmount()
    container.remove()
  }
}
