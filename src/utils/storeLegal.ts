import { isValidOrgNumber } from '../lib/orgNumber'
import type { StoreLegalDetails, StoreSettings } from '../types/storeSettings'

/** A legal detail the register needs before it can print receipts or reports. */
export type MissingLegalDetail = 'companyName' | 'orgNumber' | 'streetAddress' | 'postalCode' | 'city'

/**
 * Which of the store's legal details are missing or invalid (an org number with a bad check digit
 * counts as missing). Empty means the register may print receipts, X/Z reports and SAF-T exports.
 */
export function missingLegalDetails(settings: Pick<StoreSettings, 'legal'> | null | undefined): MissingLegalDetail[] {
  const legal = settings?.legal
  const missing: MissingLegalDetail[] = []
  if (!legal?.companyName.trim()) missing.push('companyName')
  if (!legal || !isValidOrgNumber(legal.orgNumber)) missing.push('orgNumber')
  if (!legal?.streetAddress.trim()) missing.push('streetAddress')
  if (!legal || !/^\d{4}$/.test(legal.postalCode.trim())) missing.push('postalCode')
  if (!legal?.city.trim()) missing.push('city')
  return missing
}

/** Blank legal details, for a form that has none yet. */
export const EMPTY_LEGAL_DETAILS: StoreLegalDetails = {
  companyName: '',
  orgNumber: '',
  vatRegistered: true,
  inForetaksregisteret: false,
  streetAddress: '',
  postalCode: '',
  city: '',
}
