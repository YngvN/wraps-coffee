import { useLanguage } from '../i18n'
import './RatingBadges.scss'

/** A 24x24 outline star shape, reused at full size and clipped for partial fills. */
const STAR_PATH = 'M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279L12 19.771l-7.416 3.642 1.48-8.279L0 9.306l8.332-1.151z'

/** A single platform rating shown by {@link RatingBadges}. */
export interface PlatformRating {
  /** Name of the review platform (e.g. "Google"). */
  platform: string
  /** Average rating out of 5, e.g. `4.5`. */
  rating: number
}

interface RatingBadgesProps {
  /** Ratings to display, one badge per entry. */
  ratings: PlatformRating[]
  className?: string
}

/**
 * Renders a 5-star icon whose fill reflects `rating` (0-5), supporting
 * half-star increments via a clipped overlay.
 */
function StarRating({ rating }: { rating: number }) {
  return (
    <span className="rating-badges__stars">
      {Array.from({ length: 5 }, (_, index) => {
        const fill = Math.min(1, Math.max(0, rating - index))
        return (
          <span className="rating-badges__star" key={index}>
            <svg className="rating-badges__star-icon rating-badges__star-icon--empty" viewBox="0 0 24 24">
              <path d={STAR_PATH} />
            </svg>
            {fill > 0 && (
              <svg
                className="rating-badges__star-icon rating-badges__star-icon--filled"
                viewBox="0 0 24 24"
                style={{ clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)` }}
              >
                <path d={STAR_PATH} />
              </svg>
            )}
          </span>
        )
      })}
    </span>
  )
}

/**
 * Grid of badges showing the cafe's average rating on third-party review
 * platforms (e.g. Google, Facebook) as large 5-star icons with the platform
 * name. Wraps to two columns so at most two badges sit side by side.
 */
export function RatingBadges({ ratings, className }: RatingBadgesProps) {
  const { t } = useLanguage()

  return (
    <ul className={['rating-badges', className].filter(Boolean).join(' ')}>
      {ratings.map(({ platform, rating }) => (
        <li
          className="rating-badges__item"
          key={platform}
          aria-label={t('home.menu.ratings.score', { rating: rating.toFixed(1), platform })}
        >
          <StarRating rating={rating} />
          <span className="rating-badges__platform" aria-hidden="true">
            {platform}
          </span>
        </li>
      ))}
    </ul>
  )
}
