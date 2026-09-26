// Tests for the legal receipt layout: required content, the large legal headings, and VAT.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { decodeEscPos, previewAsText } from './escposPreview'
import { buildLegalReceipt, formatOre, type LegalReceiptData } from './legalReceipt'

const sale: LegalReceiptData = {
  kind: 'sale',
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
  register: { number: 1, name: 'Kasse 1' },
  cashier: 'Kari',
  receiptNumber: 12,
  at: new Date('2026-09-25T12:02:07Z'),
  displayNumber: 'K3',
  lines: [
    { name: 'Kylling Tandoori', quantity: 2, unitPriceOre: 14900, vatRate: 15 },
    { name: 'Krus', quantity: 1, unitPriceOre: 9900, vatRate: 25 },
  ],
  totalOre: 39700,
  vat: [
    { ratePercent: 25, basisOre: 7920, vatOre: 1980, grossOre: 9900 },
    { ratePercent: 15, basisOre: 25913, vatOre: 3887, grossOre: 29800 },
  ],
  payments: [{ method: 'card', amountOre: 39700 }],
}

const print = (data: LegalReceiptData, language: 'no' | 'en' = 'no') => {
  const preview = decodeEscPos(buildLegalReceipt(data, { language, paperWidthMm: 80 }))
  return { text: previewAsText(preview, 48), preview }
}

test('a sales receipt carries every required part', () => {
  const { text } = print(sale)
  for (const part of [
    'Wraps Ulven AS',
    'Ulvenveien 1',
    '0581 Oslo',
    'Org.nr. 974 761 076 MVA',
    'Foretaksregisteret',
    'Salgskvittering nr. 12',
    '25.09.2026 14:02:07',
    'Kasse 1 (nr. 1)',
    'Kari',
    '2 x Kylling Tandoori',
    '298,00',
    '397,00 kr',
    '25 % av 79,20',
    '19,80',
    '15 % av 259,13',
    '38,87',
    'Sum MVA',
    'Kort',
  ]) {
    assert.ok(text.includes(part), `missing "${part}" in:\n${text}`)
  }
  assert.equal(text.includes('KOPI'), false)
})

test('a copy is headed KOPI at double size, above the amounts at normal size', () => {
  const { text, preview } = print({ ...sale, kind: 'copy', receiptNumber: 1, originalReceiptNumber: 12, printedAt: new Date('2026-09-25T13:00:00Z') })
  const kopi = preview.lines.find((line) => line.text.trim() === 'KOPI')
  const total = preview.lines.find((line) => line.text.includes('397,00 kr'))
  assert.ok(kopi && total)
  assert.ok(kopi.size[1] >= total.size[1] * 1.5, 'KOPI must be at least 50 % taller than the amounts')
  assert.ok(text.includes('Salgskvittering nr. 12'))
  assert.ok(text.includes('Kopi nr.'))
})

test('a pro forma says it is no receipt, in large letters, and shows no payment', () => {
  const { text, preview } = print({ ...sale, kind: 'proForma', receiptNumber: 4, payments: [] })
  assert.ok(text.includes('Foreløpig nr. 4'))
  assert.ok(preview.lines.some((line) => line.text.includes('IKKE KVITTERING') && line.size[0] >= 2))
  assert.equal(text.includes('Kort'), false)
})

test('the legal headings stay Norwegian on an English receipt', () => {
  const { text } = print({ ...sale, kind: 'copy', receiptNumber: 1, originalReceiptNumber: 12 }, 'en')
  assert.ok(text.includes('KOPI'))
  assert.ok(text.includes('Salgskvittering nr. 12'))
  assert.ok(text.includes('Served by'))
  assert.ok(text.includes('397.00 kr'))
})

test('a business not registered for VAT prints no VAT', () => {
  const { text } = print({ ...sale, legal: { ...sale.legal, vatRegistered: false } })
  assert.equal(text.includes('MVA'), false)
})

test('øre formatting', () => {
  assert.equal(formatOre(14900, 'no'), '149,00')
  assert.equal(formatOre(5, 'en'), '0.05')
  assert.equal(formatOre(-1990, 'no'), '-19,90')
})

test('a return receipt is negative, names the sale it reverses and the reason', () => {
  const { text } = print({
    ...sale,
    kind: 'return',
    receiptNumber: 2,
    originalReceiptNumber: 12,
    returnReason: 'Reklamasjon',
    lines: [{ name: 'Kylling Tandoori', quantity: 1, unitPriceOre: 14900, vatRate: 15 }],
    totalOre: -14900,
    vat: [{ ratePercent: 15, basisOre: -12957, vatOre: -1943, grossOre: -14900 }],
    payments: [{ method: 'card', amountOre: -14900 }],
  })
  for (const part of ['Returkvittering nr. 2', 'Salgskvittering nr. 12', 'Reklamasjon', '-149,00', '-149,00 kr', '-19,43', 'Tilbakebetalt']) {
    assert.ok(text.includes(part), `missing "${part}" in:\n${text}`)
  }
})

test('a training receipt says it is no receipt, in large letters, top and bottom, in its own series', () => {
  const { text, preview } = print({ ...sale, kind: 'training', receiptNumber: 3 })
  assert.ok(text.includes('Treningskvittering nr. 3'))
  const marked = preview.lines.filter((line) => line.text.includes('IKKE KVITTERING') && line.size[0] >= 2)
  assert.equal(marked.length, 2)
  assert.equal(text.includes('Salgskvittering nr.'), false)
})
