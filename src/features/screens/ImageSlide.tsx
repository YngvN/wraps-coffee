import type { ImageFit } from '../../types/screen'
import { pickImageVariant } from '../../utils/responsiveImage'
import './ImageSlide.scss'

interface ImageSlideProps {
  imageUrl: string
  /** 'contain' (the default) shrinks the image to fit without cropping; 'cover' scales it to fill the entire slide edge to edge, cropping as needed. */
  fit?: ImageFit
  /** When the slot itself is being resized to match this image (see `SplitLayout`'s own use of `imageResizeRatioPatch`), the pane is already sized to hug the image tightly — this slide's usual margin around a `contain`-fit image would otherwise show up as a visible gap on every side, so it's dropped here instead. */
  resizeToFit?: boolean
}

/** Fullscreen slide showing a single image (e.g. a logo or an Instagram photo) — no text, no text-size settings. */
export function ImageSlide({ imageUrl, fit = 'contain', resizeToFit }: ImageSlideProps) {
  return (
    <div className={`image-slide${fit === 'cover' ? ' image-slide--cover' : ''}${resizeToFit ? ' image-slide--resize-to-fit' : ''}`}>
      {imageUrl && <img className="image-slide__image" src={pickImageVariant(imageUrl)} alt="" />}
    </div>
  )
}
