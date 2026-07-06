import contactInfoSeed from '../data/contactInfo.json'
import type { ContactInfo } from '../types/contactInfo'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.contactInfo'

/** Returns the live cafe contact details/opening hours and a setter that persists edits to localStorage, overlaying `contactInfo.json` until a real backend exists. */
export function useContactInfo() {
  return useLocalStorage<ContactInfo>(STORAGE_KEY, contactInfoSeed as ContactInfo)
}
