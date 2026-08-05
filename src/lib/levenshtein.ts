/**
 * Classic Levenshtein edit distance (insert/delete/substitute), used by the
 * product-name resolution ladder's tier 4 (`levenshteinDistance(...) <= 1`)
 * to catch single-typo misspellings that the orthographic fold doesn't
 * already bridge.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      currentRow.push(Math.min(previousRow[j] + 1, currentRow[j - 1] + 1, previousRow[j - 1] + cost))
    }
    previousRow = currentRow
  }

  return previousRow[b.length]
}
