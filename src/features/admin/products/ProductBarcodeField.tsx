import { useState } from 'react'
import { Button, Input } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { isValidGtin } from '../../../lib/gtin'
import { lookupBarcodeAsAdmin } from '../../../lib/registerAdminApi'
import type { BarcodeEntry } from '../../../types/barcode'

interface ProductBarcodeFieldProps {
  /** The product being edited, so a lookup finding this same product isn't reported as a clash. */
  itemID?: string
  value: string
  onChange: (value: string) => void
  /** Called with what a lookup found, for the form to fill in whatever the admin hasn't typed yet. */
  onFound: (entry: BarcodeEntry) => void
}

/** What the last lookup said, in words for the admin. */
type LookupMessage = { tone: 'ok' | 'warning' | 'error'; text: string }

/**
 * The product form's barcode (EAN/GTIN) field with a "Look up" button. Looking a barcode up asks the
 * local server — our own products first, then its saved barcode catalogue, then Open Food Facts — and
 * hands anything found to the form as suggestions (name, photo, allergens), with the allergens Open
 * Food Facts listed but we couldn't match shown here for the admin to check. Nothing is saved until
 * the form is.
 */
export function ProductBarcodeField({ itemID, value, onChange, onFound }: ProductBarcodeFieldProps) {
  const { t, language } = useLanguage()
  const { session } = useAdminSession()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<LookupMessage | null>(null)
  const code = value.trim()
  const invalid = code !== '' && !isValidGtin(code)

  const lookUp = async () => {
    if (!session || invalid || !code) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await lookupBarcodeAsAdmin(session.token, code)
      if (result.kind === 'entry') {
        onFound(result.entry)
        const unmatched = result.entry.allergensToCheck
        setMessage({
          tone: unmatched.length > 0 ? 'warning' : 'ok',
          text: [
            t('admin.products.barcodeFound', { name: result.entry.name[language === 'en' ? 'en' : 'no'] || result.entry.name.no }),
            unmatched.length > 0 ? t('admin.products.barcodeAllergensToCheck', { tags: unmatched.join(', ') }) : '',
          ]
            .filter(Boolean)
            .join(' '),
        })
      } else if (result.kind === 'product') {
        setMessage(
          result.product.itemID === itemID
            ? { tone: 'ok', text: t('admin.products.barcodeThisProduct') }
            : { tone: 'error', text: t('admin.products.barcodeInUse', { name: result.product.name[language === 'en' ? 'en' : 'no'] || result.product.name.no }) },
        )
      } else {
        setMessage({ tone: 'warning', text: t(`admin.products.barcodeLookup.${result.kind}`) })
      }
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="product-form__barcode">
      <div className="product-form__barcode-row">
        <Input
          id="product-barcode"
          label={t('admin.products.barcodeLabel')}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\s/g, ''))}
          error={invalid ? t('admin.products.barcodeInvalid') : undefined}
        />
        <Button type="button" variant="secondary" onClick={() => void lookUp()} disabled={busy || !code || invalid}>
          {busy ? t('admin.products.barcodeLookingUp') : t('admin.products.barcodeLookUp')}
        </Button>
      </div>
      {message && <p className={`product-form__barcode-message product-form__barcode-message--${message.tone}`}>{message.text}</p>}
    </div>
  )
}
