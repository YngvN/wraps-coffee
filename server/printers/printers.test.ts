// Tests for the network printer driver (against a local TCP listener standing in for a printer) and the lpstat parser.
import { strict as assert } from 'node:assert'
import { createServer, type Server } from 'node:net'
import { test } from 'node:test'
import { buildReceipt, decodeEscPos } from '../../src/lib/receipt'
import { isPortOpen, isPrivateIPv4, scanHostsForPort, sendToNetworkPrinter } from './network'
import { printJob } from './routes'
import { parseLpstat } from './system'

/** A fake raw printer: resolves with everything a client sent once it disconnects. */
function fakePrinter(): Promise<{ server: Server; port: number; received: Promise<Buffer> }> {
  return new Promise((resolve) => {
    let deliver: (data: Buffer) => void = () => {}
    const received = new Promise<Buffer>((done) => (deliver = done))
    const server = createServer((socket) => {
      const chunks: Buffer[] = []
      socket.on('data', (chunk) => chunks.push(chunk))
      socket.on('end', () => deliver(Buffer.concat(chunks)))
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({ server, port: typeof address === 'object' && address ? address.port : 0, received })
    })
  })
}

test('a job reaches the printer byte for byte', async () => {
  const { server, port, received } = await fakePrinter()
  const bytes = Uint8Array.from([0x1b, 0x40, 0x41, 0x0a, 0x1d, 0x56, 66, 0])
  await sendToNetworkPrinter('127.0.0.1', port, bytes)
  assert.deepEqual([...(await received)], [...bytes])
  server.close()
})

test('printJob sends a real receipt over the network transport', async () => {
  const { server, port, received } = await fakePrinter()
  const order = { id: 'web-zz99', items: [{ itemID: 'a', name: 'Latte', quantity: 1, unitPrice: 55 }], totalPrice: 55, customerName: 'Kari', customerPhone: '', pickupTime: '12:00', status: 'ready' as const, createdAt: new Date().toISOString() }
  await printJob({ id: 'p', name: 'Test', transport: 'network', host: '127.0.0.1', port, paperWidthMm: 80 }, buildReceipt(order, { storeName: 'Kafé', language: 'no', paperWidthMm: 80, printedAt: new Date() }))
  const preview = decodeEscPos(new Uint8Array(await received))
  assert.ok(preview.lines.some((line) => line.text.includes('#ZZ99')))
  assert.ok(preview.lines.some((line) => line.text.includes('Kafé')))
  assert.equal(preview.cut, true)
  server.close()
})

test('sending to a closed port rejects instead of hanging', async () => {
  const { server, port } = await fakePrinter()
  server.close()
  await new Promise((resolve) => setTimeout(resolve, 50))
  await assert.rejects(sendToNetworkPrinter('127.0.0.1', port, Uint8Array.from([0x41]), 2000))
})

test('the port scan finds a listening printer and skips closed ports', async () => {
  const { server, port } = await fakePrinter()
  assert.equal(await isPortOpen('127.0.0.1', port), true)
  assert.deepEqual(await scanHostsForPort(['127.0.0.1'], port), ['127.0.0.1'])
  server.close()
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual(await scanHostsForPort(['127.0.0.1'], port), [])
})

test('parseLpstat reads queue names and device URIs', () => {
  const output = 'device for EPSON_TM_T20III: usb://EPSON/TM-T20III?serial=X1\ndevice for Office: ipp://192.168.0.5/ipp/print\nsomething else\n'
  assert.deepEqual(parseLpstat(output), [
    { name: 'EPSON_TM_T20III', uri: 'usb://EPSON/TM-T20III?serial=X1' },
    { name: 'Office', uri: 'ipp://192.168.0.5/ipp/print' },
  ])
})

test('only private IPv4 ranges are ever scanned', () => {
  for (const address of ['10.0.0.5', '172.16.1.1', '172.31.255.1', '192.168.0.213']) assert.equal(isPrivateIPv4(address), true, address)
  for (const address of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '193.168.0.1', '100.64.0.1']) assert.equal(isPrivateIPv4(address), false, address)
})
