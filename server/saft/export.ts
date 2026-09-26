/**
 * The SAF-T Cash Register export (Skatteetaten's "Norwegian_SAF-T_Cash_Register_Schema_v_1.00"),
 * built from the journal alone, laid out like Skatteetaten's example file:
 *
 * - `header`: the period, the software, the file version;
 * - `company`: organisation number, name, VAT registration and address; its master data — VAT codes,
 *   staff (`employees`, by employee number), products (`articles`) and every code used (`basics`:
 *   article groups per category, line, transaction, payment and event types);
 * - one `location` (the store) with a `cashregister` per register, holding its `event`s — everything
 *   journaled, X/Z reports with their `eventReport` — and its signed `cashtransaction`s (sales, returns
 *   and training sales, with lines, VAT, payments, signature and key version).
 *
 * Events journaled with no register (a price change made in the dashboard, a staff change, a server
 * start) belong to no till; the schema only allows events under a register, so they're listed under
 * the lowest-numbered one.
 */
import { vatOfGross } from '../../src/lib/vat'
import { osloDate, osloTime } from '../../src/lib/osloTime'
import type { Catalogue } from '../../src/types/category'
import type { JournalEntry } from '../../src/types/journal'
import type { Product } from '../../src/types/product'
import type { RegisterReport } from '../../src/types/registerReport'
import type { StoreLegalDetails } from '../../src/types/storeSettings'
import { formatSignedAmount } from '../journal/signing'
import type { CashRegister } from '../register/registers'
import type { StaffMember } from '../register/staff'
import { ARTICLE_GROUP_CODES, DEFAULT_ARTICLE_GROUP, EVENT_TYPES, LINE_TYPES, PAYMENT_TYPES, TRANSACTION_TYPES, type SaftBasic } from './codes'
import { eventReport } from './report'
import { el, group, saftId, toXml, type XmlNode } from './xml'

export interface SaftExportInput {
  /** The journal entries in the period (all registers, or the chosen one), oldest first. */
  entries: JournalEntry[]
  /** The whole journal, to count each sale's copies. */
  allEntries: JournalEntry[]
  /** The period, as Oslo dates `YYYY-MM-DD`. */
  from: string
  to: string
  legal: StoreLegalDetails
  storeName: string
  registers: CashRegister[]
  staff: StaffMember[]
  products: Product[]
  catalogues: Catalogue[]
  software: { name: string; version: string; companyName: string }
  now: Date
}

const money = (ore: number) => formatSignedAmount(ore)
/** Our VAT code per rate: the standard SAF-T code itself (25 % → 3, 15 % → 31, 12 % → 33, 0 % → 0). */
export const vatCode = (ratePercent: number) => ({ 25: '3', 15: '31', 12: '33' })[ratePercent] ?? '0'

type SaleLine = { itemID: string; name: string; quantity: number; unitPriceOre: number; vatRate: number; group?: { id: string } }
type SalePayment = { method: string; amountOre: number; reference?: string }

/** "Ulvenveien 1" → street and number; the whole text is the street when there's no trailing number. */
function splitStreet(street: string): { streetname: string; number?: string } {
  const match = /^(.*?)\s+(\d+\s*[A-Za-z]?)$/.exec(street.trim())
  return match ? { streetname: match[1], number: match[2].replace(/\s/g, '') } : { streetname: street.trim() }
}

function address(name: 'streetAddress', legal: StoreLegalDetails): XmlNode {
  const street = splitStreet(legal.streetAddress)
  return group(name, [el('streetname', street.streetname), el('number', street.number), el('city', legal.city), el('postalCode', legal.postalCode), el('country', 'NO')])
}

function basic(entry: SaftBasic): XmlNode {
  return group('basic', [
    el('basicType', entry.basicType),
    el('basicID', saftId(entry.basicID)),
    el('predefinedBasicID', entry.predefinedBasicID),
    el('basicDesc', entry.basicDesc),
  ])
}

/** The whole export as an XML document. */
export function buildSaftExport(input: SaftExportInput): string {
  const { entries, legal } = input
  const date = (iso: string) => osloDate(new Date(iso))
  const time = (iso: string) => osloTime(new Date(iso))
  const empID = (actor: string | null) => saftId(input.staff.find((member) => member.id === actor)?.employeeNumber)
  const categories = input.catalogues.flatMap((catalogue) => catalogue.categories)
  const productGroupId = (itemID: string) =>
    input.products.find((product) => product.itemID === itemID)?.category ?? input.products.find((product) => product.itemID === itemID)?.catalogueId
  const lowestRegister = Math.min(...input.registers.map((register) => register.number), Number.POSITIVE_INFINITY)
  const copiesOf = (seq: number) => input.allEntries.filter((entry) => entry.type === 'copy' && entry.data.originalSeq === seq).length
  const rates = [...new Set([0, 15, 25, ...entries.flatMap((entry) => ((entry.data.lines as SaleLine[] | undefined) ?? []).map((line) => line.vatRate))])]

  const header = group('header', [
    el('fiscalYear', input.from.slice(0, 4)),
    el('startDate', input.from),
    el('endDate', input.to),
    el('curCode', 'NOK'),
    el('dateCreated', osloDate(input.now)),
    el('timeCreated', osloTime(input.now)),
    el('softwareDesc', input.software.name),
    el('softwareVersion', input.software.version),
    el('softwareCompanyName', input.software.companyName),
    el('auditfileVersion', '1.0'),
    el('headerComment', `${input.storeName}: ${input.from} – ${input.to}`),
  ])

  const masterData: XmlNode[] = [
    group(
      'vatCodeDetails',
      rates.map((rate) =>
        group('vatCodeDetail', [el('vatCode', vatCode(rate)), el('dateOfEntry', input.from), el('vatDesc', `MVA ${rate} %`), el('standardVatCode', vatCode(rate))]),
      ),
    ),
    group(
      'employees',
      input.staff.map((member) => {
        const [firstName, ...rest] = member.name.split(/\s+/)
        return group('employee', [
          el('empID', saftId(member.employeeNumber)),
          el('dateOfEntry', date(member.createdAt)),
          el('timeOfEntry', time(member.createdAt)),
          el('firstName', firstName),
          el('surName', rest.join(' ') || '-'),
          group('employeeRole', [el('roleType', member.role === 'manager' ? 'Manager' : 'Employee')]),
        ])
      }),
    ),
    group(
      'articles',
      input.products.map((product) =>
        group('article', [
          el('artID', saftId(product.itemID)),
          el('dateOfEntry', input.from),
          el('artGroupID', saftId(productGroupId(product.itemID))),
          el('artDesc', product.name.no || product.name.en),
        ]),
      ),
    ),
    group('basics', [
      ...categories.map((category) =>
        basic({
          basicType: '04',
          basicID: category.id,
          predefinedBasicID: category.saftArticleGroup && ARTICLE_GROUP_CODES[category.saftArticleGroup] ? category.saftArticleGroup : DEFAULT_ARTICLE_GROUP,
          basicDesc: category.name.no || category.name.en,
        }),
      ),
      ...input.catalogues.map((catalogue) => basic({ basicType: '04', basicID: catalogue.id, predefinedBasicID: '04999', basicDesc: catalogue.name.no || catalogue.name.en })),
      ...LINE_TYPES.map(basic),
      ...TRANSACTION_TYPES.map(basic),
      ...Object.values(PAYMENT_TYPES).map(basic),
      ...Object.values(EVENT_TYPES).map((entry) => basic(entry as SaftBasic)),
    ]),
  ]

  const event = (entry: JournalEntry, register: CashRegister): XmlNode | null => {
    const type = EVENT_TYPES[entry.type]
    if (!type) return null
    const isReport = entry.type === 'xReport' || entry.type === 'zReport'
    return group('event', [
      el('eventID', entry.seq),
      el('eventType', type.basicID),
      el('transID', entry.type === 'sale' || entry.type === 'return' || entry.type === 'trainingSale' ? entry.seq : (entry.data.originalSeq as number | undefined)),
      el('empID', empID(entry.actor)),
      el('eventDate', date(entry.at)),
      el('eventTime', time(entry.at)),
      el('eventText', eventText(entry)),
      isReport
        ? eventReport(entry.data.report as RegisterReport, {
            orgNumber: legal.orgNumber,
            companyName: legal.companyName,
            registerID: String(register.number),
            date: date(entry.at),
            time: time(entry.at),
            paymentType: (method) => PAYMENT_TYPES[method]?.basicID ?? 'CASH',
            vatCode,
          })
        : null,
    ])
  }

  const transaction = (entry: JournalEntry): XmlNode | null => {
    if (!entry.signed) return null
    const isReturn = entry.type === 'return'
    const type = isReturn ? 'D' : 'C'
    const lines = (entry.data.lines as SaleLine[] | undefined) ?? []
    const vat = (entry.data.vat as { ratePercent: number; basisOre: number; vatOre: number }[] | undefined) ?? []
    const payments = (entry.data.payments as SalePayment[] | undefined) ?? []
    const sign = isReturn ? -1 : 1
    return group('cashtransaction', [
      el('nr', entry.signed.nr),
      el('transID', entry.seq),
      el('transType', isReturn ? 'RETURNSAL' : 'CASHSAL'),
      el('transAmntIn', money(entry.signed.amountInOre)),
      el('transAmntEx', money(entry.signed.amountExOre)),
      el('amntTp', type),
      el('empID', empID(entry.actor)),
      el('transDate', entry.signed.transDate),
      el('transTime', entry.signed.transTime),
      ...lines.map((line, index) => {
        const gross = sign * line.unitPriceOre * line.quantity
        const lineVat = vatOfGross(gross, line.vatRate)
        return group('ctLine', [
          el('nr', entry.signed?.nr),
          el('lineID', index + 1),
          el('lineType', isReturn ? 'RET' : 'SAL'),
          el('artGroupID', saftId(line.group?.id || productGroupId(line.itemID))),
          el('artID', saftId(line.itemID)),
          el('qnt', sign * line.quantity),
          el('lineAmntIn', money(gross)),
          el('lineAmntEx', money(gross - lineVat)),
          el('amntTp', type),
          el('empID', empID(entry.actor)),
          el('lineDate', entry.signed?.transDate),
          el('lineTime', entry.signed?.transTime),
          group('vat', [
            el('vatCode', vatCode(line.vatRate)),
            el('vatPerc', line.vatRate.toFixed(2)),
            el('vatAmnt', money(lineVat)),
            el('vatAmntTp', type),
            el('vatBasAmnt', money(gross - lineVat)),
          ]),
        ])
      }),
      ...vat.map((rate) =>
        group('vat', [
          el('vatCode', vatCode(rate.ratePercent)),
          el('vatPerc', rate.ratePercent.toFixed(2)),
          el('vatAmnt', money(rate.vatOre)),
          el('vatAmntTp', type),
          el('vatBasAmnt', money(rate.basisOre)),
        ]),
      ),
      group('rounding', [el('roundingAmnt', money(0))]),
      ...payments.map((payment) =>
        group('payment', [
          el('paymentType', PAYMENT_TYPES[payment.method]?.basicID ?? 'CASH'),
          el('paidAmnt', money(payment.amountOre)),
          el('empID', empID(entry.actor)),
          el('curCode', 'NOK'),
          el('exchRt', '1.000000'),
          el('paymentRefID', payment.reference),
        ]),
      ),
      el('signature', entry.signed.signature),
      el('keyVersion', entry.signed.keyVersion),
      el('receiptNum', entry.receiptNumber),
      el('receiptCopyNum', copiesOf(entry.seq)),
      el('receiptProformaNum', 0),
      el('receiptDeliveryNum', 0),
      el('voidTransaction', 'false'),
      el('trainingID', entry.type === 'trainingSale' ? 'true' : 'false'),
    ])
  }

  const registers = input.registers.filter((register) =>
    entries.some((entry) => entry.register === register.number || (entry.register === null && register.number === lowestRegister)),
  )
  const location = group('location', [
    el('name', input.storeName || legal.companyName),
    address('streetAddress', legal),
    ...registers.map((register) => {
      const mine = entries.filter((entry) => entry.register === register.number || (entry.register === null && register.number === lowestRegister))
      return group('cashregister', [
        el('registerID', String(register.number)),
        el('regDesc', register.name),
        ...mine.map((entry) => event(entry, register)),
        ...mine.map(transaction),
      ])
    }),
  ])

  const company = group('company', [
    el('companyIdent', legal.orgNumber),
    el('companyName', legal.companyName),
    el('taxRegistrationCountry', 'NO'),
    el('taxRegIdent', legal.vatRegistered ? `${legal.orgNumber}MVA` : undefined),
    address('streetAddress', legal),
    ...masterData,
    location,
  ])

  const root = toXml(group('auditfile', [header, company]))
  return `<?xml version="1.0" encoding="UTF-8"?>\n${root.replace('<auditfile>', '<auditfile xmlns="urn:StandardAuditFile-Taxation-CashRegister:NO">')}\n`
}

/** A short plain-language line for events that need one. */
function eventText(entry: JournalEntry): string | undefined {
  const data = entry.data as Record<string, unknown>
  switch (entry.type) {
    case 'drawerOpen':
      return `reason ${data.reason}${data.orderId ? `; order ${data.orderId}` : ''}`
    case 'lineCorrection':
      return `${data.correction}; amount ${formatSignedAmount(Number(data.amountOre ?? 0))}`
    case 'void':
      return `amount ${formatSignedAmount(Number(data.amountOre ?? 0))}`
    case 'float':
      return `float ${formatSignedAmount(Number(data.amountOre ?? 0))}`
    case 'cashCount':
      return `expected ${formatSignedAmount(Number(data.expectedOre ?? 0))}; counted ${formatSignedAmount(Number(data.countedOre ?? 0))}; difference ${formatSignedAmount(Number(data.differenceOre ?? 0))}`
    case 'priceChange':
      return `${data.scope} ${data.id}: ${JSON.stringify(data.from)} → ${JSON.stringify(data.to)}`.slice(0, 250)
    case 'copy':
      return `copy of receipt ${data.originalReceiptNumber}`
    case 'return':
      return `return of receipt ${data.originalReceiptNumber}; reason ${data.reason}`
    case 'xReport':
      return 'X-report'
    case 'zReport':
      return 'Z-report'
    default:
      return undefined
  }
}
