import postsSeed from '../data/instagram.json'
import type { InstagramPost } from '../types/instagramPost'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.instagramPosts'

/** Returns the live Instagram posts and a setter that persists edits to localStorage, overlaying `instagram.json` until a real backend exists. */
export function useInstagramPosts() {
  return useLocalStorage<InstagramPost[]>(STORAGE_KEY, postsSeed as InstagramPost[])
}
