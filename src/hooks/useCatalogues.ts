import { useMemo } from 'react'
import cataloguesSeed from '../data/catalogues.json'
import type { Catalogue } from '../types/category'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.catalogues'

/** Defensive normalization pass (parity with `normalizeProduct`) — guards against a missing `categories` array on an otherwise-valid record. */
function normalizeCatalogue(catalogue: Catalogue): Catalogue {
  return { ...catalogue, categories: catalogue.categories ?? [] }
}

/** Returns every catalogue (each embedding its own ordered `categories`) and a setter that persists edits — overlaying `catalogues.json` (one seeded "Food menu" catalogue matching every install's original 7 categories) until edited. Memoized on `catalogues`' own reference (same reasoning as `useScreens`) so this hook's several callers, including the live "Catalogue" kiosk slide, don't re-run the normalize pass on every unrelated re-render. */
export function useCatalogues() {
  const [catalogues, setCatalogues] = useLocalStorage<Catalogue[]>(STORAGE_KEY, cataloguesSeed as Catalogue[])
  const normalizedCatalogues = useMemo(() => catalogues.map(normalizeCatalogue), [catalogues])
  return [normalizedCatalogues, setCatalogues] as const
}
