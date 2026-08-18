import { motion, type Transition, type Variants } from 'framer-motion'
import type { CSSProperties } from 'react'
import type { PaneId } from '../../types/screen'
import { readSlideBitmap, slideBitmapKey } from './slideBitmapStore'
import './SlideBitmapLayer.scss'

interface SlideBitmapLayerProps {
  screenID: string
  paneId: PaneId
  /** The stage whose captured appearance to show — the stage being transitioned **into**, since this covers the frames where the pane is moving toward that stage's own box. */
  stage: number
  /** The fingerprint `LayoutPane` publishes on the pane element — see `SLIDE_IDENTITY_ATTRIBUTE`. A hit therefore means "a picture of exactly this content". */
  contentFingerprint: string
  /** The screen's own transition poses (`resolveTransitionVariants`) — the same set the live slots animate with, so a bitmap-backed pane moves exactly like every other pane on the screen. */
  variants: Variants
  /** Which pose to hold: `'animate'` at rest, `'exit'` while the stage transition is playing. */
  pose: 'animate' | 'exit'
  transition: Transition
  /**
   * Skip this layer's own entrance and render straight at `pose`.
   *
   * Set when the *pane* is structurally new this stage and is already playing its own grow-in
   * (`growEntranceFrom` — a `clip-path` reveal over `PANE_GROWTH_DURATION_SECONDS`). Without this the
   * picture slides in at the same time as the pane clip-reveals around it, and two entrance animations
   * on one pane read as a snap rather than as either animation. Observed on `Empty test`, whose stage 1
   * holds a single pane and whose stage 2 splits it in two — the only structural transition on that
   * fixture, and the only stage where the jump was reported.
   *
   * This is the same rule `LayoutPane` already applies to the live slot (`initial: stageStatic ? false :
   * 'initial'`), for the same reason.
   */
  suppressEntrance?: boolean
}

/**
 * Shows a pre-rendered picture of this pane.
 *
 * Renders nothing at all when the store has no capture for this exact (screen, pane, stage, content) —
 * a miss is the ordinary case on a cold boot or after a content edit, and the pane simply renders live
 * exactly as it did before any of this existed.
 *
 * **Drawn at its captured size and animated by the screen's own transition, never stretched to track the
 * box.** The earlier version scaled the image independently on each axis (`width / bitmap.width` and
 * `height / bitmap.height`) so it would follow the pane through a resize. For a QR code or a photo that
 * is right; for a photograph of *text* it distorts every glyph, and on a screen whose `transitionStyle`
 * is `'slide'` it replaced the slide with a squash for the whole moving window — which is exactly what
 * the artefact looked like on the TV. So the image now keeps its own aspect and pixel size (the capture
 * was taken at this pane's box for this stage, so at rest it lands 1:1 and the pane clips nothing), and
 * the *layer* takes the same `variants`/pose the live slots take. A resize therefore reveals or clips
 * more of the picture rather than deforming it.
 *
 * Both properties Framer animates here — `opacity` and `transform` — are compositor-only, so the whole
 * move costs nothing per frame, which is the same reason `QR_FIXED_RASTER` works (report fact 17).
 */
export function SlideBitmapLayer({ screenID, paneId, stage, contentFingerprint, variants, pose, transition, suppressEntrance }: SlideBitmapLayerProps) {
  const bitmap = readSlideBitmap(slideBitmapKey(screenID, paneId, stage, contentFingerprint))
  if (!bitmap) return null

  return (
    <motion.div
      className="slide-bitmap-layer"
      aria-hidden="true"
      data-slide-bitmap="ready"
      variants={variants}
      initial={suppressEntrance ? false : 'initial'}
      animate={pose}
      transition={transition}
    >
      <img
        className="slide-bitmap-layer__image"
        src={bitmap.url}
        alt=""
        // Explicit and matching the capture — the picture is never resampled, so text stays exactly as
        // sharp as the live DOM it stands in for.
        style={{ width: bitmap.width, height: bitmap.height } as CSSProperties}
        draggable={false}
      />
    </motion.div>
  )
}
