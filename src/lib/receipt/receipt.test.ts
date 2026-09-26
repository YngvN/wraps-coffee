// Tests for the ESC/POS builder, the order receipt layout and the preview decoder.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { OrderRecord } from '../../types/order'
import { buildReceipt, charsPerLine, decodeEscPos, encodePc865, EscPosBuilder, previewAsText, twoColumns, wrapText } from './index'

const order: OrderRecord = {
  id: 'web-a1b2',
  items: [
    { itemID: 'i1', name: 'Latte', quantity: 2, unitPrice: 55 },
    { itemID: 'i2', name: 'Kyllingwrap med ekstra ost og jalapeños fra kjøkkenet', quantity: 1, unitPrice: 119 },
  ],
  totalPrice: 229,
  customerName: 'Ørjan Åsheim',
  customerPhone: '+47 400 00 000',
  pickupTime: '16:20',
  notes: 'Nøtteallergi! Ingen pesto',
  status: 'preparing',
  createdAt: new Date(2026, 8, 25, 16, 5).toISOString(),
}

const options = { storeName: 'Wraps & Coffee', language: 'no' as const, paperWidthMm: 80 as const, printedAt: new Date(2026, 8, 25, 16, 40) }

test('encodePc865 maps Norwegian letters, falls back for the rest', () => {
  assert.deepEqual(encodePc865('æøåÆØÅ'), [0x91, 0x9b, 0x86, 0x92, 0x9d, 0x8f])
  assert.deepEqual(encodePc865('Aa 1'), [0x41, 0x61, 0x20, 0x31])
  assert.deepEqual(encodePc865('ş'), [0x73], 'accent stripped when that leaves ASCII')
  assert.deepEqual(encodePc865('–…'), [0x2d, 0x2e, 0x2e, 0x2e])
  assert.deepEqual(encodePc865('漢'), [0x3f])
  assert.deepEqual(encodePc865('a\tb'), [0x61, 0x62], 'control characters dropped')
})

test('builder emits the expected commands, and the decoder reads them back', () => {
  const bytes = new EscPosBuilder().init().align('center').bold(true).size(2, 2).line('Hei på deg').cut().bytes()
  assert.deepEqual([...bytes.slice(0, 5)], [0x1b, 0x40, 0x1b, 0x74, 5])
  const preview = decodeEscPos(bytes)
  assert.deepEqual(preview.lines, [{ text: 'Hei på deg', align: 'center', bold: true, size: [2, 2] }])
  assert.equal(preview.cut, true)
  assert.deepEqual(preview.unknownCommands, [])
})

test('wrapText and twoColumns never exceed the width', () => {
  for (const line of wrapText('en veldig lang merknad om allergier som må leses nøye av alle', 20)) assert.ok(line.length <= 20, line)
  assert.deepEqual(wrapText('abcdefghij', 4), ['abcd', 'efgh', 'ij'])
  assert.deepEqual(wrapText('abc', 0), ['a', 'b', 'c'], 'a width below 1 is clamped instead of looping forever')
  assert.deepEqual(twoColumns('2 x Latte', '110 kr', 20), ['2 x Latte     110 kr'])
  for (const line of twoColumns('1 x Kyllingwrap med ekstra ost', '119 kr', 20)) assert.ok(line.length <= 20, line)
})

test('an order receipt has every necessary field, fits 80 mm, and ends in a cut', () => {
  const preview = decodeEscPos(buildReceipt(order, options))
  const text = preview.lines.map((line) => line.text).join('\n')
  assert.deepEqual(preview.unknownCommands, [])
  assert.equal(preview.cut, true)
  for (const expected of ['Wraps & Coffee', '#A1B2', 'Nettbestilling', 'Ørjan Åsheim', '+47 400 00 000', '16:20', '25.09.2026 16:05', '2 x Latte', '110 kr', '119 kr', 'Nøtteallergi! Ingen pesto', 'TOTALT', '229 kr', 'Skrevet ut 25.09.2026 16:40']) {
    assert.ok(text.includes(expected), `missing "${expected}"`)
  }
  for (const line of preview.lines) assert.ok(line.text.length * line.size[0] <= charsPerLine(80), `too wide: "${line.text}"`)
  assert.ok(preview.lines.some((line) => line.bold && line.text.includes('Nøtteallergi')), 'notes are bold')
})

test('58 mm receipts wrap to 32 characters, and English labels work', () => {
  const preview = decodeEscPos(buildReceipt({ ...order, source: 'wolt', notes: undefined }, { ...options, paperWidthMm: 58, language: 'en' }))
  for (const line of preview.lines) assert.ok(line.text.length * line.size[0] <= 32, `too wide: "${line.text}"`)
  const text = preview.lines.map((line) => line.text).join('\n')
  assert.ok(text.includes('Wolt') && text.includes('TOTAL') && text.includes('Customer'))
  assert.ok(!text.includes('NOTE'), 'no notes section without notes')
  assert.ok(previewAsText(preview, 32).length > 0)
})

test('a register sale prints as an order ticket: its counter number and items, no prices or payment', () => {
  const sale: OrderRecord = {
    id: 'reg-0001',
    source: 'register',
    displayNumber: 'K7',
    items: [{ itemID: 'soda', name: 'Cola', quantity: 1, unitPrice: 30 }],
    totalPrice: 30,
    customerName: '',
    customerPhone: '',
    pickupTime: '',
    status: 'completed',
    createdAt: new Date(2026, 8, 25, 16, 5).toISOString(),
    payment: { method: 'cash', amount: 30, paidAt: new Date(2026, 8, 25, 16, 5).toISOString() },
  }
  const text = previewAsText(decodeEscPos(buildReceipt(sale, options)))
  assert.match(text, /#K7/)
  assert.match(text, /Kassesalg/)
  assert.match(text, /ORDRESEDDEL [–-] IKKE KVITTERING/)
  assert.match(text, /1 x Cola/)
  assert.doesNotMatch(text, /30 kr/)
  assert.doesNotMatch(text, /TOTALT|Betalt|Kontant/)
  assert.doesNotMatch(text, /Kunde:/)
  assert.doesNotMatch(text, /Hentes:/)
})
