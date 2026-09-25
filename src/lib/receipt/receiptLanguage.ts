import { availableLanguages, type LanguageCode } from '../../i18n/translate'
import type { PrinterSettings } from '../../types/printer'

/** The language receipts print in until the admin picks another in Settings → Printers. */
export const DEFAULT_RECEIPT_LANGUAGE: LanguageCode = 'no'

/**
 * The one language every receipt prints in — the store's own choice (`PrinterSettings.receiptLanguage`),
 * never the language a tablet's screen happens to show, so a counter sale and a kitchen ticket always
 * read the same. Norwegian unless the admin chose otherwise, or the stored choice is no longer a
 * language the app has.
 */
export function resolveReceiptLanguage(settings: Pick<PrinterSettings, 'receiptLanguage'> | undefined): LanguageCode {
  const chosen = settings?.receiptLanguage
  return chosen && availableLanguages.some((option) => option.code === chosen) ? chosen : DEFAULT_RECEIPT_LANGUAGE
}
