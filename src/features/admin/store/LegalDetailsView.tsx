import { Checkbox, Input, TranslatedText } from '../../../components'
import { useStoreSettings } from '../../../hooks/useStoreSettings'
import { useLanguage } from '../../../i18n'
import { isValidOrgNumber, normalizeOrgNumber } from '../../../lib/orgNumber'
import type { StoreLegalDetails } from '../../../types/storeSettings'
import { EMPTY_LEGAL_DETAILS } from '../../../utils/storeLegal'
import './LegalDetailsView.scss'

/**
 * Admin view for the business's legal details (see `StoreLegalDetails`): company name, organisation
 * number, VAT and Foretaksregisteret registration, and business address. The register prints these on
 * every receipt and report, and refuses to print either until they're complete (`missingLegalDetails`).
 * Reached as a sub-view of Store settings. Deliberately not editable by the AI assistant, see
 * `server/assistant/entities/storeSettings.ts`.
 */
export function LegalDetailsView() {
  const { t } = useLanguage()
  const [storeSettings, setStoreSettings] = useStoreSettings()
  const legal = storeSettings.legal ?? EMPTY_LEGAL_DETAILS

  const update = (patch: Partial<StoreLegalDetails>) => setStoreSettings({ ...storeSettings, legal: { ...legal, ...patch } })

  const orgNumberError = legal.orgNumber && !isValidOrgNumber(legal.orgNumber) ? t('admin.legal.orgNumberInvalid') : undefined
  const postalCodeError = legal.postalCode && !/^\d{4}$/.test(legal.postalCode.trim()) ? t('admin.legal.postalCodeInvalid') : undefined

  return (
    <div className="legal-details-view">
      <TranslatedText as="p" id="admin.legal.description" className="admin-page-description" />
      <div className="legal-details-view__fields">
        <Input
          id="legal-company-name"
          label={t('admin.legal.companyNameLabel')}
          value={legal.companyName}
          onChange={(event) => update({ companyName: event.target.value })}
          required
        />
        <Input
          id="legal-org-number"
          label={t('admin.legal.orgNumberLabel')}
          value={legal.orgNumber}
          inputMode="numeric"
          onChange={(event) => update({ orgNumber: normalizeOrgNumber(event.target.value) })}
          error={orgNumberError}
          required
        />
        <Checkbox
          id="legal-vat-registered"
          label={t('admin.legal.vatRegisteredLabel')}
          checked={legal.vatRegistered}
          onChange={(event) => update({ vatRegistered: event.target.checked })}
        />
        <Checkbox
          id="legal-foretaksregisteret"
          label={t('admin.legal.foretaksregisteretLabel')}
          checked={legal.inForetaksregisteret}
          onChange={(event) => update({ inForetaksregisteret: event.target.checked })}
        />
        <Input
          id="legal-street-address"
          label={t('admin.legal.streetAddressLabel')}
          value={legal.streetAddress}
          onChange={(event) => update({ streetAddress: event.target.value })}
          required
        />
        <div className="legal-details-view__postal">
          <Input
            id="legal-postal-code"
            label={t('admin.legal.postalCodeLabel')}
            value={legal.postalCode}
            inputMode="numeric"
            maxLength={4}
            onChange={(event) => update({ postalCode: event.target.value })}
            error={postalCodeError}
            required
          />
          <Input id="legal-city" label={t('admin.legal.cityLabel')} value={legal.city} onChange={(event) => update({ city: event.target.value })} required />
        </div>
      </div>
    </div>
  )
}
