/**
 * `GET /register/admin/saft?from=YYYY-MM-DD&to=YYYY-MM-DD&register=<number>?` — the SAF-T Cash Register
 * file for a period (Oslo dates, both inclusive; every register, or just one), as a download named the
 * way Skatteetaten names theirs: `SAF-T Cash Register_<org number>_<timestamp>.xml`. For sessions that
 * may manage store settings. Refused until Settings → Store settings → Company details is complete.
 *
 * `GET /register/admin/public-key` — the public halves of the journal's signing keys (PEM, every version,
 * newest last), which Skatteetaten uses to verify the export's signatures.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { osloDate, osloTime } from '../../src/lib/osloTime'
import type { Catalogue } from '../../src/types/category'
import type { Product } from '../../src/types/product'
import type { StoreSettings } from '../../src/types/storeSettings'
import type { DashboardSection } from '../../src/types/sync'
import { missingLegalDetails } from '../../src/utils/storeLegal'
import { bearerToken, sendJson } from '../http'
import type { Journal } from '../journal/journal'
import type { CashRegister } from '../register/registers'
import type { StaffMember } from '../register/staff'
import { buildSaftExport } from './export'

export interface SaftRouteDeps {
  sessionMay: (token: string, section: DashboardSection) => boolean
  journal: Journal
  readStoreSettings: () => StoreSettings
  readRegisters: () => CashRegister[]
  readStaff: () => StaffMember[]
  readProducts: () => Product[]
  readCatalogues: () => Catalogue[]
  appVersion: string
  /** Every signing key's version and public key. */
  readPublicKeys: () => { version: number; publicKeyPem: string }[]
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Handles the export route; `false` for anything else. */
export function handleSaftRoute(req: IncomingMessage, res: ServerResponse, url: URL, deps: SaftRouteDeps): boolean {
  if (req.method !== 'GET' || (url.pathname !== '/register/admin/saft' && url.pathname !== '/register/admin/public-key')) return false
  if (!deps.sessionMay(bearerToken(req) ?? '', 'store')) {
    sendJson(res, 403, { error: 'Only accounts that can manage store settings can export SAF-T' })
    return true
  }
  if (url.pathname === '/register/admin/public-key') {
    const pem = deps
      .readPublicKeys()
      .map((key) => `# keyVersion ${key.version}\n${key.publicKeyPem.trim()}\n`)
      .join('\n')
    res.writeHead(200, { 'Content-Type': 'application/x-pem-file; charset=utf-8', 'Content-Disposition': 'attachment; filename="kassasystem-offentlig-nokkel.pem"' })
    res.end(pem)
    return true
  }
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  if (!DATE.test(from) || !DATE.test(to) || from > to) {
    sendJson(res, 400, { error: 'Expected from and to as YYYY-MM-DD, from not after to' })
    return true
  }
  const store = deps.readStoreSettings()
  if (!store.legal || missingLegalDetails(store).length > 0) {
    sendJson(res, 409, { reason: 'legalDetailsMissing' })
    return true
  }
  const registerParam = url.searchParams.get('register')
  const register = registerParam ? Number(registerParam) : null
  const allEntries = deps.journal.read()
  const entries = allEntries.filter((entry) => {
    const day = osloDate(new Date(entry.at))
    return day >= from && day <= to && (register === null || entry.register === register || entry.register === null)
  })
  const registers = deps.readRegisters().filter((candidate) => register === null || candidate.number === register)
  const now = new Date()
  const xml = buildSaftExport({
    entries,
    allEntries,
    from,
    to,
    legal: store.legal,
    storeName: store.name,
    registers,
    staff: deps.readStaff(),
    products: deps.readProducts(),
    catalogues: deps.readCatalogues(),
    software: { name: 'ADHDisplay', version: deps.appVersion, companyName: 'ADHDisplay' },
    now,
  })
  const stamp = `${osloDate(now).replace(/-/g, '')}${osloTime(now).replace(/:/g, '')}`
  res.writeHead(200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Content-Disposition': `attachment; filename="SAF-T Cash Register_${store.legal.orgNumber}_${stamp}.xml"`,
  })
  res.end(xml)
  console.log(`[saft] exported ${entries.length} journal entries (${from} – ${to}${register ? `, register ${register}` : ''})`)
  return true
}
