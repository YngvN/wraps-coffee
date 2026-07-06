import ratingsSeed from '../data/ratings.json'
import type { PlatformRating } from '../components/RatingBadges'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.ratings'

/** Returns the live platform ratings and a setter that persists edits to localStorage, overlaying `ratings.json` until a real backend exists. */
export function useRatings() {
  return useLocalStorage<PlatformRating[]>(STORAGE_KEY, ratingsSeed as PlatformRating[])
}
