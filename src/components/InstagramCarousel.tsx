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

/** Milliseconds of inactivity before auto-scroll resumes. */
const RESUME_DELAY = 5000

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
 * Infinitely scrollable strip of Instagram post thumbnails with prev/next arrow
 * buttons. Posts are rendered three times and the track is initialised at the
 * middle copy; a scroll listener silently teleports to the middle copy whenever
 * the user scrolls near either edge, giving the appearance of endless scrolling.
 *
 * Auto-scrolls every {@link AUTO_SCROLL_INTERVAL} ms until the user interacts
 * (mouse hover or touch), after which it stops permanently.
 */
export function InstagramCarousel() {
  const { t } = useLanguage()
  const trackRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const getStep = () => {
    const item = trackRef.current?.firstElementChild as HTMLElement | null
    return item ? item.offsetWidth + ITEM_GAP : 412
  }

  const scrollTo = useCallback((direction: 'prev' | 'next') => {
    const step = getStep()
    trackRef.current?.scrollBy({ left: direction === 'next' ? step : -step, behavior: 'smooth' })
  }, [])

  const stopAutoScroll = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startAutoScroll = useCallback(() => {
    stopAutoScroll()
    timerRef.current = setInterval(() => {
      trackRef.current?.scrollBy({ left: getStep(), behavior: 'smooth' })
    }, AUTO_SCROLL_INTERVAL)
  }, [stopAutoScroll])

  const scheduleResume = useCallback(() => {
    if (resumeTimerRef.current !== null) clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = setTimeout(startAutoScroll, RESUME_DELAY)
  }, [startAutoScroll])

  const pauseAutoScroll = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
    stopAutoScroll()
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

    track.scrollLeft = track.scrollWidth / 3

    track.addEventListener('scroll', handleScroll, { passive: true })
    startAutoScroll()

    return () => {
      track.removeEventListener('scroll', handleScroll)
      stopAutoScroll()
      if (resumeTimerRef.current !== null) clearTimeout(resumeTimerRef.current)
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

      <div className="instagram-carousel__stage">
        <button
          type="button"
          className="instagram-carousel__arrow instagram-carousel__arrow--prev"
          aria-label={t('home.instagram.prev')}
          onClick={() => { scrollTo('prev'); scheduleResume() }}
        >
          <svg width="32" height="64" viewBox="0 0 32 64" fill="none" aria-hidden="true">
            <polyline points="26,4 6,32 26,60" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div
          ref={trackRef}
          className="instagram-carousel__track"
          role="list"
          aria-label={t('home.instagram.follow')}
          onMouseEnter={pauseAutoScroll}
          onMouseLeave={scheduleResume}
          onTouchStart={pauseAutoScroll}
          onTouchEnd={scheduleResume}
          onTouchCancel={scheduleResume}
        >
          {tripledPosts.map((post, index) => (
            <a
              key={`${post.id}-${index}`}
              className="instagram-carousel__item"
              href={post.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              role="listitem"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
            >
              <img src={post.imageUrl} alt={post.alt} loading="lazy" draggable={false} />
            </a>
          ))}
        </div>

        <button
          type="button"
          className="instagram-carousel__arrow instagram-carousel__arrow--next"
          aria-label={t('home.instagram.next')}
          onClick={() => { scrollTo('next'); scheduleResume() }}
        >
          <svg width="32" height="64" viewBox="0 0 32 64" fill="none" aria-hidden="true">
            <polyline points="6,4 26,32 6,60" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
