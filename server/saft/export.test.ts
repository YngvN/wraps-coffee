// Tests that the SAF-T export validates against Skatteetaten's schema and carries the journal faithfully.
import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { Catalogue } from '../../src/types/category'
import type { Product } from '../../src/types/product'
import { Journal } from '../journal/journal'
import type { SigningKey } from '../journal/signing'
import { buildRegisterReport } from '../register/reports'
import { hashPin } from '../register/pinHash'
import { buildSaftExport } from './export'

/** A generated item id as the admin creates them: longer than the schema's 35-character ids. */
const LONG_ID = 'wraps-17c23cad-d61f-4530-94ea-dd4fdef122ab'

const SCHEMA = join(dirname(fileURLToPath(import.meta.url)), 'Norwegian_SAF-T_Cash_Register_Schema_v_1.00.xsd')

function fixture() {
  let keys: SigningKey[] = []
  let clock = new Date('2026-09-25T08:00:00Z')
  const journal = new Journal({ dir: mkdtempSync(join(tmpdir(), 'saft-')), keys: { read: () => keys, write: (next) => (keys = next), now: () => clock }, now: () => clock })
  journal.load()
  const tick = () => (clock = new Date(clock.getTime() + 60_000))
  const line = { itemID: LONG_ID, name: 'Kylling & chili', quantity: 2, unitPriceOre: 14900, vatRate: 15, group: { id: 'wraps', name: 'Wraps' } }
  journal.append({ register: null, actor: null, type: 'systemStart', data: {} })
  journal.append({ register: 1, actor: 'kari', type: 'signIn', data: { name: 'Kari' } })
  tick()
  journal.append({ register: 1, actor: 'kari', type: 'float', data: { amountOre: 50000 } })
  const sale = journal.append({
    register: 1,
    actor: 'kari',
    type: 'sale',
    data: { lines: [line], payments: [{ method: 'card', amountOre: 29800 }], totalOre: 29800, vat: [{ ratePercent: 15, basisOre: 25913, vatOre: 3887, grossOre: 29800 }] },
    amounts: { inOre: 29800, exOre: 25913 },
  })
  journal.append({ register: 1, actor: 'kari', type: 'drawerOpen', data: { reason: 'manual' } })
  tick()
  journal.append({ register: 1, actor: 'kari', type: 'copy', data: { originalSeq: sale.seq, originalReceiptNumber: 1, amountOre: 29800 } })
  journal.append({
    register: 1,
    actor: 'ola',
    type: 'return',
    data: {
      originalReceiptNumber: 1,
      reason: 'complaint',
      lines: [{ ...line, quantity: 1 }],
      payments: [{ method: 'card', amountOre: -14900 }],
      totalOre: -14900,
      vat: [{ ratePercent: 15, basisOre: -12957, vatOre: -1943, grossOre: -14900 }],
    },
    amounts: { inOre: -14900, exOre: -12957 },
  })
  journal.append({ register: 1, actor: 'kari', type: 'void', data: { amountOre: 5000 } })
  journal.append({ register: null, actor: 'admin:admin', type: 'priceChange', data: { scope: 'product', id: LONG_ID, from: { price: 149 }, to: { price: 159 } } })
  tick()
  const report = buildRegisterReport(journal.read(), 1, 'Z', clock)
  journal.append({ register: 1, actor: 'ola', type: 'zReport', data: { number: report.zNumber, report } })
  tick()
  // An X right after the Z has nothing in it: no groups, payments or VAT rates.
  journal.append({ register: 1, actor: 'ola', type: 'xReport', data: { report: buildRegisterReport(journal.read(), 1, 'X', clock) } })
  return { journal, saleSeq: sale.seq }
}

function exportXml() {
  const { journal, saleSeq } = fixture()
  const entries = journal.read()
  const xml = buildSaftExport({
    entries,
    allEntries: entries,
    from: '2026-09-25',
    to: '2026-09-25',
    legal: {
      companyName: 'Wraps Ulven AS',
      orgNumber: '974761076',
      vatRegistered: true,
      inForetaksregisteret: true,
      streetAddress: 'Ulvenveien 1',
      postalCode: '0581',
      city: 'Oslo',
    },
    storeName: 'Wraps & Coffee',
    registers: [{ deviceId: 'tab', number: 1, name: 'Kasse 1', createdAt: '' }],
    staff: [
      { id: 'kari', name: 'Kari Nordmann', employeeNumber: '1', role: 'staff', active: true, pin: hashPin('1111'), createdAt: '2026-09-01T08:00:00Z' },
      { id: 'ola', name: 'Ola', employeeNumber: '2', role: 'manager', active: true, pin: hashPin('2222'), createdAt: '2026-09-01T08:00:00Z' },
    ],
    products: [
      { itemID: LONG_ID, category: 'wraps', name: { no: 'Kylling & chili', en: '' }, description: { no: '', en: '' }, allergens: [], dietaryTags: [], available: true } as Product,
    ],
    catalogues: [{ id: 'menu', name: { no: 'Meny', en: '' }, categories: [{ id: 'wraps', name: { no: 'Wraps', en: '' }, saftArticleGroup: '04006' }] } as unknown as Catalogue],
    software: { name: 'ADHDisplay', version: '0.3.24', companyName: 'ADHDisplay' },
    now: new Date('2026-09-26T10:00:00Z'),
  })
  return { xml, saleSeq }
}

test('the export validates against Skatteetaten’s SAF-T Cash Register schema', () => {
  const { xml } = exportXml()
  const file = join(mkdtempSync(join(tmpdir(), 'saft-xml-')), 'export.xml')
  writeFileSync(file, xml)
  const output = execFileSync('xmllint', ['--noout', '--schema', SCHEMA, file], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(output, '')
})

test('the export carries the journal: signed transactions, events, copies counted, report, escaped text', () => {
  const { xml, saleSeq } = exportXml()
  assert.match(xml, /<companyIdent>974761076<\/companyIdent>/)
  assert.match(xml, /<taxRegIdent>974761076MVA<\/taxRegIdent>/)
  assert.match(xml, /<streetname>Ulvenveien<\/streetname>\s*<number>1<\/number>/)
  assert.equal((xml.match(/<cashtransaction>/g) ?? []).length, 2, 'a sale and a return; the copy is an event')
  assert.match(xml, /<transType>RETURNSAL<\/transType>\s*<transAmntIn>-149.00<\/transAmntIn>\s*<transAmntEx>-129.57<\/transAmntEx>\s*<amntTp>D<\/amntTp>/)
  assert.match(xml, new RegExp(`<transID>${saleSeq}</transID>[\\s\\S]*?<receiptCopyNum>1</receiptCopyNum>`))
  assert.match(xml, /<eventType>COPYREC<\/eventType>/)
  assert.match(xml, /<eventType>PRICECHG<\/eventType>/)
  assert.match(xml, /<reportType>Z report<\/reportType>/)
  assert.match(xml, /<artDesc>Kylling &amp; chili<\/artDesc>/)
  assert.match(xml, /<predefinedBasicID>04006<\/predefinedBasicID>/)
  assert.equal(xml.includes(`ID>${LONG_ID}<`), false, 'long ids are shortened (event text may still name them)')
  const artIDs = [...xml.matchAll(/<artID>([^<]*)<\/artID>/g)].map((match) => match[1])
  assert.equal(new Set(artIDs).size, 1, 'the article and its transaction lines shorten the same id identically')
  assert.ok(artIDs[0].length <= 35)
  assert.match(xml, /<reportType>X report<\/reportType>[\s\S]*?<artGroupNum>0<\/artGroupNum>/)
})
