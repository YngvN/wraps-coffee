import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import './ReviewCarousel.scss'

/** A single customer review shown by {@link ReviewCarousel}. */
export interface Review {
  /** First name of the reviewer. */
  name: string
  /** The review text. */
  review: string
}

interface ReviewCarouselProps {
  /** Reviews to cycle through, one at a time. */
  reviews: Review[]
  /** Milliseconds between automatic transitions. Defaults to 6000. */
  interval?: number
  className?: string
}

/**
 * Cycles through `reviews`, cross-fading in one customer review (with the
 * reviewer's first name) at a time and advancing automatically every
 * `interval` milliseconds.
 */
export function ReviewCarousel({ reviews, interval = 6000, className }: ReviewCarouselProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (reviews.length <= 1) return

    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % reviews.length)
    }, interval)

    return () => clearInterval(timer)
  }, [reviews.length, interval])

  if (reviews.length === 0) return null

  const current = reviews[index]

  return (
    <div className={['review-carousel', className].filter(Boolean).join(' ')}>
      {/* Fixed-height viewport so cross-fading reviews of different lengths don't reflow the page. */}
      <div className="review-carousel__viewport">
        <AnimatePresence mode="wait">
          <motion.figure
            key={index}
            className="review-carousel__item"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <blockquote className="review-carousel__quote">“{current.review}”</blockquote>
            <figcaption className="review-carousel__name">— {current.name}</figcaption>
          </motion.figure>
        </AnimatePresence>
      </div>
    </div>
  )
}
