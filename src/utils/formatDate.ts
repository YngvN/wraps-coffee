export function formatDate(date: Date | string, locale = 'en-US'): string {
  const value = typeof date === 'string' ? new Date(date) : date

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(value)
}
