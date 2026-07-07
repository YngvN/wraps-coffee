import './ImageSlide.scss'

interface ImageSlideProps {
  imageUrl: string
}

/** Fullscreen slide showing a single centered image (e.g. a logo or an Instagram photo) — no text, no text-size settings, just the image scaled to fit without cropping. */
export function ImageSlide({ imageUrl }: ImageSlideProps) {
  return (
    <div className="image-slide">
      {imageUrl && <img className="image-slide__image" src={imageUrl} alt="" />}
    </div>
  )
}
