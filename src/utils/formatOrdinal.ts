import type { LanguageCode } from '../i18n'

/** English ordinal suffix for `n` — handles the 11th/12th/13th exception to the usual 1st/2nd/3rd/4th pattern. */
function englishOrdinalSuffix(n: number): string {
  const remainder100 = n % 100
  if (remainder100 >= 11 && remainder100 <= 13) return 'th'
  switch (n % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

/** Formats `n` as a localized ordinal numeral: English suffix rules (1st, 2nd, 3rd, 4th, 11th, 21st, ...) or Norwegian numeral notation (1., 2., 3., ...). Used to build the admin's own "Nth event" dropdown option labels. */
export function formatOrdinal(n: number, language: LanguageCode): string {
  if (language === 'no') return `${n}.`
  return `${n}${englishOrdinalSuffix(n)}`
}
