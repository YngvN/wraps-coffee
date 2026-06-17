import { useCallback, useEffect, useRef } from 'react'
import postsData from '../data/instagram.json'
import { useLanguage } from '../i18n'
import './InstagramCarousel.scss'

/** A single Instagram post entry from instagram.json. */
interface InstagramPost {
  id: string
  imageUrl: string
  postUrl: string
  alt: string
}

const posts = postsData as InstagramPost[]

// Render three copies so the user can scroll infinitely in both directions.
// The track starts scrolled to the middle copy; whenever scrollLeft drifts into
// the first or third copy the scroll handler silently jumps back to the
// identical position in the middle copy.
const tripledPosts = [...posts, ...posts, ...posts]

/** Gap between items in pixels — must match the CSS gap on .instagram-carousel__track. */
const ITEM_GAP = 12

/** Milliseconds between automatic scroll steps. */
const AUTO_SCROLL_INTERVAL = 2500

/** Instagram camera icon (inline SVG). */
function InstagramIcon() {
  return (
    <svg
      className="instagram-carousel__icon"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" />
    </svg>
  )
}

/**
 * Infinitely scrollable strip of Instagram post thumbnails. Posts are rendered
 * three times and the track is initialised at the middle copy; a scroll listener
 * silently teleports to the middle copy whenever the user scrolls near either
 * edge, giving the appearance of endless scrolling in both directions.
 *
 * Auto-scrolls every {@link AUTO_SCROLL_INTERVAL} ms until the user interacts
 * (mouse hover or touch), after which it stops permanently.
 */
export function InstagramCarousel() {
  const { t } = useLanguage()
  const trackRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopAutoScroll = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startAutoScroll = useCallback(() => {
    stopAutoScroll()
    timerRef.current = setInterval(() => {
      const track = trackRef.current
      if (!track) return
      const item = track.firstElementChild as HTMLElement | null
      const step = item ? item.offsetWidth + ITEM_GAP : 412
      track.scrollBy({ left: step, behavior: 'smooth' })
    }, AUTO_SCROLL_INTERVAL)
  }, [stopAutoScroll])

  // Silently jump to the equivalent position in the middle copy when the user
  // scrolls into the first or third copy.
  const handleScroll = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const pageWidth = track.scrollWidth / 3
    if (track.scrollLeft < pageWidth * 0.25) {
      track.scrollLeft += pageWidth
    } else if (track.scrollLeft > pageWidth * 1.75) {
      track.scrollLeft -= pageWidth
    }
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    // Initialise at the start of the middle copy.
    track.scrollLeft = track.scrollWidth / 3

    track.addEventListener('scroll', handleScroll, { passive: true })
    startAutoScroll()

    return () => {
      track.removeEventListener('scroll', handleScroll)
      stopAutoScroll()
    }
  }, [handleScroll, startAutoScroll, stopAutoScroll])

  return (
    <div className="instagram-carousel">
      <a
        className="instagram-carousel__header"
        href="https://www.instagram.com/wraps.coffee/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('home.instagram.follow')}
      >
        <InstagramIcon />
        <span className="instagram-carousel__handle">{t('home.instagram.handle')}</span>
        <span className="instagram-carousel__follow">{t('home.instagram.follow')}</span>
      </a>
      <div
        ref={trackRef}
        className="instagram-carousel__track"
        role="list"
        aria-label={t('home.instagram.follow')}
        onMouseEnter={stopAutoScroll}
        onTouchStart={stopAutoScroll}
      >
        {tripledPosts.map((post, index) => (
          <a
            key={`${post.id}-${index}`}
            className="instagram-carousel__item"
            href={post.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            role="listitem"
          >
            <img src={post.imageUrl} alt={post.alt} loading="lazy" />
          </a>
        ))}
      </div>
    </div>
  )
}
