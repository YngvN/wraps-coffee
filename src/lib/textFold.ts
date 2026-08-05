/**
 * Bump whenever a rule in `fold()` changes. Every stored `name_folded` value
 * and every confirmed alias row carries the `foldVersion` it was computed
 * under — a stale version is treated as absent rather than silently trusted,
 * so a rule change can never produce a false match against data folded under
 * the old rules.
 */
export const FOLD_VERSION = 1

const DIACRITIC_MAP: [RegExp, string][] = [
  [/æ/g, 'ae'],
  [/ø/g, 'o'],
  [/å/g, 'a'],
  [/è/g, 'e'],
  [/é/g, 'e'],
  [/ü/g, 'u'],
  [/ö/g, 'o'],
  [/ä/g, 'ae'],
]

const DOUBLED_CONSONANTS: [RegExp, string][] = [
  [/kk/g, 'k'],
  [/ff/g, 'f'],
  [/tt/g, 't'],
  [/pp/g, 'p'],
  [/ll/g, 'l'],
  [/ss/g, 's'],
  [/mm/g, 'm'],
  [/nn/g, 'n'],
  [/rr/g, 'r'],
  [/dd/g, 'd'],
  [/gg/g, 'g'],
  [/bb/g, 'b'],
]

/**
 * Deterministic orthographic fold for product-name resolution — bridges
 * Norwegian/Italian/English spelling variants of the same word (e.g.
 * "mokka" vs "Mocha") without any model call. Not phonetically exhaustive by
 * design: it only needs to be applied identically to a stored name and a
 * query, since anything it fails to bridge is caught by confirmed alias
 * memory after one admin confirmation (see `productNameResolution.ts`).
 *
 * Rule order is load-bearing — do not reorder without re-checking every
 * vector this function is tested against. In particular: digraphs (rule 3)
 * must run before the `c`-context rules (4-6), or e.g. "macchiato" folds
 * incorrectly; doubled-consonant collapsing (rule 8) must run after 3-7, or
 * digraph/substitution output escapes collapsing (e.g. "tzatziki"'s two
 * z's, each turned into a lone "s" by rule 7, must not be treated as a
 * double).
 */
export function fold(input: string): string {
  let s = input.toLowerCase().trim().replace(/\s+/g, ' ')

  for (const [pattern, replacement] of DIACRITIC_MAP) s = s.replace(pattern, replacement)

  s = s.replace(/sch/g, 'sk')
  s = s.replace(/ch/g, 'k')
  s = s.replace(/ph/g, 'f')
  s = s.replace(/th/g, 't')

  s = s.replace(/cc(?=[eiy])/g, 'ks')
  s = s.replace(/c(?=[eiy])/g, 's')
  s = s.replace(/c(?=[aouk]|\s|$)/g, 'k')

  s = s.replace(/z/g, 's')
  s = s.replace(/x/g, 'ks')
  s = s.replace(/w/g, 'v')
  s = s.replace(/qu/g, 'kv')

  for (const [pattern, replacement] of DOUBLED_CONSONANTS) s = s.replace(pattern, replacement)

  s = s.replace(/[^a-z0-9]/g, '')

  return s
}
