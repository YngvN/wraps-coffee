import type { ImageFit } from '../../types/screen'
import './ImageSlide.scss'

interface ImageSlideProps {
  imageUrl: string
  /** 'contain' (the default) shrinks the image to fit without cropping; 'cover' scales it to fill the entire slide edge to edge, cropping as needed. */
  fit?: ImageFit
}

/** Fullscreen slide showing a single image (e.g. a logo or an Instagram photo) — no text, no text-size settings. */
export function ImageSlide({ imageUrl, fit = 'contain' }: ImageSlideProps) {
  return (
    <div className={`image-slide${fit === 'cover' ? ' image-slide--cover' : ''}`}>
      {imageUrl && <img className="image-slide__image" src={imageUrl} alt="" />}
    </div>
  )
}
