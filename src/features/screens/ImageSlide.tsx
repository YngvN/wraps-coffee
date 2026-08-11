import { useState } from 'react'
import { useStoreSettings } from '../../hooks/useStoreSettings'
import { normalizeUploadUrl } from '../../lib/localServer'
import type { ImageFit } from '../../types/screen'
import { pickImageVariant } from '../../utils/responsiveImage'
import './ImageSlide.scss'

interface ImageSlideProps {
  imageUrl: string
  /** 'contain' (the default) shrinks the image to fit without cropping; 'cover' scales it to fill the entire slide edge to edge, cropping as needed. */
  fit?: ImageFit
  /** When the slot itself is being resized to match this image (see `SplitLayout`'s own use of `mediaResizeRatioPatch`), the pane is already sized to hug the image tightly — this slide's usual margin around a `contain`-fit image would otherwise show up as a visible gap on every side, so it's dropped here instead. */
  resizeToFit?: boolean
}

/**
 * Fullscreen slide showing a single image (e.g. a logo or an Instagram photo)
 * — no text, no text-size settings.
 *
 * Falls back to the store's own logo (see `useStoreSettings`) if the image
 * itself fails to load, rather than leaving the browser's default broken-image
 * icon on a kiosk display nobody is standing next to. That silence is exactly
 * how a real breakage went unnoticed until it was spotted on a TV: every
 * uploaded image on this install was stored with the uploading admin's own
 * `localhost` origin baked in, which no other device can resolve (see
 * `normalizeUploadUrl`, which is the actual fix for that). With no logo
 * configured either, a muted empty placeholder shows instead — still a
 * deliberate "this didn't load" state rather than nothing at all.
 */
export function ImageSlide({ imageUrl, fit = 'contain', resizeToFit }: ImageSlideProps) {
  const [storeSettings] = useStoreSettings()
  /**
   * Which URL failed, rather than a plain `didFail` boolean — a pane's own
   * content can change to a *different* image while this slide stays mounted
   * (a stage advance, an admin edit), and that new one deserves its own
   * attempt instead of inheriting the previous one's failure. Comparing
   * against the current `imageUrl` re-arms automatically, with no reset
   * effect to keep in sync.
   */
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined)
  const hasFailed = Boolean(imageUrl) && failedUrl === imageUrl
  const logoUrl = storeSettings.logos[0]

  return (
    <div className={`image-slide${fit === 'cover' ? ' image-slide--cover' : ''}${resizeToFit ? ' image-slide--resize-to-fit' : ''}`}>
      {imageUrl && !hasFailed && (
        <img className="image-slide__image" src={pickImageVariant(imageUrl)} alt="" onError={() => setFailedUrl(imageUrl)} />
      )}
      {/* Deliberately no `onError` of its own — a logo that also fails would
          otherwise loop this back through the same state update forever. */}
      {hasFailed && logoUrl && <img className="image-slide__fallback-logo" src={normalizeUploadUrl(logoUrl)} alt="" />}
      {hasFailed && !logoUrl && <div className="image-slide__fallback-placeholder" />}
    </div>
  )
}
