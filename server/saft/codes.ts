/**
 * The SAF-T Cash Register codes this register uses, from Skatteetaten's code lists
 * (github.com/Skatteetaten/saf-t, "Cash Register Code Lists"): our own `basicID`s, each mapped to the
 * predefined code it means. They're declared in the export's `basics`, and transactions, payments and
 * events refer to them by `basicID`.
 */
import type { JournalType } from '../../src/types/journal'

/** A `basic`: type 04 article groups (per category, see `export.ts`), 05 line types, 11 transactions, 12 payments, 13 events. */
export interface SaftBasic {
  basicType: '04' | '05' | '11' | '12' | '13'
  basicID: string
  predefinedBasicID?: string
  basicDesc: string
}

export const LINE_TYPES: SaftBasic[] = [
  { basicType: '05', basicID: 'SAL', basicDesc: 'Salgslinje' },
  { basicType: '05', basicID: 'RET', basicDesc: 'Returlinje' },
]

export const TRANSACTION_TYPES: SaftBasic[] = [
  { basicType: '11', basicID: 'CASHSAL', predefinedBasicID: '11001', basicDesc: 'Kontantsalg' },
  { basicType: '11', basicID: 'RETURNSAL', predefinedBasicID: '11006', basicDesc: 'Retur' },
]

/** Payment methods: cash, bank card (the card terminal doesn't tell debit from credit) and Vipps. */
export const PAYMENT_TYPES: Record<string, SaftBasic> = {
  cash: { basicType: '12', basicID: 'CASH', predefinedBasicID: '12001', basicDesc: 'Kontant' },
  card: { basicType: '12', basicID: 'CARD', predefinedBasicID: '12002', basicDesc: 'Bankkort' },
  vipps: { basicType: '12', basicID: 'VIPPS', predefinedBasicID: '12011', basicDesc: 'Vipps' },
}

/** Which event each journal type is in the export. Sales and returns are also transactions; they get a receipt event too. */
export const EVENT_TYPES: Partial<Record<JournalType, SaftBasic>> = {
  systemStart: { basicType: '13', basicID: 'POSSTART', predefinedBasicID: '13001', basicDesc: 'Oppstart av kassesystemet' },
  signIn: { basicType: '13', basicID: 'EMPIN', predefinedBasicID: '13003', basicDesc: 'Pålogging ansatt' },
  signOut: { basicType: '13', basicID: 'EMPOUT', predefinedBasicID: '13004', basicDesc: 'Avlogging ansatt' },
  drawerOpen: { basicType: '13', basicID: 'DRAWOPEN', predefinedBasicID: '13005', basicDesc: 'Kasseskuff åpnet' },
  xReport: { basicType: '13', basicID: 'XREP', predefinedBasicID: '13008', basicDesc: 'X-rapport' },
  zReport: { basicType: '13', basicID: 'ZREP', predefinedBasicID: '13009', basicDesc: 'Z-rapport' },
  parked: { basicType: '13', basicID: 'SUSPEND', predefinedBasicID: '13010', basicDesc: 'Parkert bestilling' },
  resumed: { basicType: '13', basicID: 'RESUME', predefinedBasicID: '13011', basicDesc: 'Hentet parkert bestilling' },
  sale: { basicType: '13', basicID: 'SALREC', predefinedBasicID: '13012', basicDesc: 'Salgskvittering' },
  return: { basicType: '13', basicID: 'RETREC', predefinedBasicID: '13013', basicDesc: 'Returkvittering' },
  copy: { basicType: '13', basicID: 'COPYREC', predefinedBasicID: '13014', basicDesc: 'Kopikvittering' },
  proForma: { basicType: '13', basicID: 'PROFORMA', predefinedBasicID: '13015', basicDesc: 'Foreløpig kvittering' },
  trainingSale: { basicType: '13', basicID: 'TRAINREC', predefinedBasicID: '13017', basicDesc: 'Treningskvittering' },
  priceChange: { basicType: '13', basicID: 'PRICECHG', predefinedBasicID: '13021', basicDesc: 'Prisendring' },
  trainingOn: { basicType: '13', basicID: 'TRAINON', predefinedBasicID: '13023', basicDesc: 'Treningsmodus på' },
  trainingOff: { basicType: '13', basicID: 'TRAINOFF', predefinedBasicID: '13024', basicDesc: 'Treningsmodus av' },
  void: { basicType: '13', basicID: 'VOID', predefinedBasicID: '13028', basicDesc: 'Annullert salg' },
  lineCorrection: { basicType: '13', basicID: 'LINECORR', predefinedBasicID: '13999', basicDesc: 'Linje fjernet eller redusert' },
  float: { basicType: '13', basicID: 'FLOAT', predefinedBasicID: '13999', basicDesc: 'Veksel talt inn' },
  cashCount: { basicType: '13', basicID: 'CASHCOUNT', predefinedBasicID: '13999', basicDesc: 'Opptelling av kasse' },
  cartTakeover: { basicType: '13', basicID: 'TAKEOVER', predefinedBasicID: '13999', basicDesc: 'Handlekurv overtatt av annen ansatt' },
  staffChange: { basicType: '13', basicID: 'STAFFCHG', predefinedBasicID: '13999', basicDesc: 'Endring av ansatte' },
  discount: { basicType: '13', basicID: 'DISCOUNT', predefinedBasicID: '13999', basicDesc: 'Rabatt' },
}

export { ARTICLE_GROUP_CODES, DEFAULT_ARTICLE_GROUP } from '../../src/lib/saftArticleGroups'
