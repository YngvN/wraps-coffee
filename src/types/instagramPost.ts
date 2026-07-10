/** A single Instagram post entry, as stored in `src/data/instagram.json` and edited via the admin Instagram view. */
export interface InstagramPost {
  id: string
  imageUrl: string
  postUrl: string
  alt: string
}
