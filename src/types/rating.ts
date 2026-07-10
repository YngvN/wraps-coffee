/** A single platform rating, edited via the admin Reviews view. */
export interface PlatformRating {
  /** Name of the review platform (e.g. "Google"). */
  platform: string
  /** Average rating out of 5, e.g. `4.5`. */
  rating: number
}
