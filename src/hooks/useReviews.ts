import reviewsSeed from '../data/reviews.json'
import type { Review } from '../components/ReviewCarousel'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.reviews'

/** Reviews grouped by language, as stored in `src/data/reviews.json`. */
export interface ReviewsByLanguage {
  no: Review[]
  en: Review[]
}

/** Returns the live customer reviews and a setter that persists edits to localStorage, overlaying `reviews.json` until a real backend exists. */
export function useReviews() {
  return useLocalStorage<ReviewsByLanguage>(STORAGE_KEY, reviewsSeed as ReviewsByLanguage)
}
