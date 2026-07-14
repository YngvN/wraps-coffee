import cataloguesSeed from '../data/catalogues.json'
import type { Catalogue } from '../types/category'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.catalogues'

/** Defensive normalization pass (parity with `normalizeProduct`) — guards against a missing `categories` array on an otherwise-valid record. */
function normalizeCatalogue(catalogue: Catalogue): Catalogue {
  return { ...catalogue, categories: catalogue.categories ?? [] }
}

/** Returns every catalogue (each embedding its own ordered `categories`) and a setter that persists edits — overlaying `catalogues.json` (one seeded "Food menu" catalogue matching every install's original 7 categories) until edited. */
export function useCatalogues() {
  const [catalogues, setCatalogues] = useLocalStorage<Catalogue[]>(STORAGE_KEY, cataloguesSeed as Catalogue[])
  return [catalogues.map(normalizeCatalogue), setCatalogues] as const
}
