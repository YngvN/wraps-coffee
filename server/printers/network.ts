/**
 * Network receipt printers: finding them on the LAN, and sending them a job.
 *
 * Receipt printers take raw ESC/POS on TCP port 9100 ("JetDirect"/"AppSocket") — there is no
 * handshake and no driver, a job is just bytes written to the socket. Discovery combines two
 * sources, because neither alone finds every printer: many advertise `_pdl-datastream._tcp` over
 * mDNS, but plenty of cheap ones advertise nothing and are only found by trying port 9100 across the
 * local subnet.
 */
import { Bonjour } from 'bonjour-service'
import { Socket } from 'node:net'
import { networkInterfaces } from 'node:os'
import { DEFAULT_RAW_PRINTER_PORT, looksLikeReceiptPrinter, type DiscoveredPrinter } from '../../src/types/printer'

/** How long a single connection attempt may take — generous for a sleepy Wi-Fi printer, short enough that a 254-host sweep finishes in a few seconds. */
const CONNECT_TIMEOUT_MS = 600

/** Parallel connection attempts during a sweep. */
const SCAN_CONCURRENCY = 64

/** How long to listen for mDNS answers. */
const MDNS_BROWSE_MS = 2500

/**
 * Sends one job to a network printer and resolves once every byte has been written and the socket
 * closed. Rejects on connection failure or timeout, so the caller can tell the user the receipt
 * wasn't printed.
 */
export function sendToNetworkPrinter(host: string, port: number, bytes: Uint8Array, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    const fail = (error: Error) => {
      socket.destroy()
      reject(error)
    }
    socket.setTimeout(timeoutMs, () => fail(new Error(`Printer ${host}:${port} did not respond`)))
    socket.once('error', fail)
    socket.connect(port, host, () => {
      socket.end(Buffer.from(bytes), () => {
        socket.destroy()
        resolve()
      })
    })
  })
}

/** Whether `host` accepts a TCP connection on `port` within `timeoutMs`. */
export function isPortOpen(host: string, port: number, timeoutMs = CONNECT_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket()
    const done = (open: boolean) => {
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, host, () => done(true))
  })
}

/** Whether an IPv4 address is in a private (RFC 1918) range — the only networks worth scanning for a café's printers. */
export function isPrivateIPv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/**
 * Every host in the /24 of each of this machine's own private IPv4 addresses (excluding the machine
 * itself). A /24 covers home and café networks; scanning larger ones would take minutes. Interfaces
 * with a public address are skipped, so the scan never sweeps someone else's network.
 */
export function localSubnetHosts(): string[] {
  const hosts = new Set<string>()
  const own = new Set<string>()
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal || !isPrivateIPv4(address.address)) continue
      own.add(address.address)
      const prefix = address.address.split('.').slice(0, 3).join('.')
      for (let last = 1; last < 255; last++) hosts.add(`${prefix}.${last}`)
    }
  }
  for (const address of own) hosts.delete(address)
  return [...hosts]
}

/** Tries `port` on every host, `SCAN_CONCURRENCY` at a time, and returns the ones that answered. */
export async function scanHostsForPort(hosts: string[], port: number, timeoutMs = CONNECT_TIMEOUT_MS): Promise<string[]> {
  const open: string[] = []
  let next = 0
  const worker = async () => {
    while (next < hosts.length) {
      const host = hosts[next++]
      if (await isPortOpen(host, port, timeoutMs)) open.push(host)
    }
  }
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, hosts.length) }, worker))
  return open.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/** Printers advertising raw printing over mDNS (`_pdl-datastream._tcp`), listened for `MDNS_BROWSE_MS`. */
export function browseMdnsPrinters(durationMs = MDNS_BROWSE_MS): Promise<DiscoveredPrinter[]> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour()
    const found = new Map<string, DiscoveredPrinter>()
    // Destroyed on every path, including a browse that throws — a leaked instance keeps its sockets open.
    let browser: ReturnType<InstanceType<typeof Bonjour>['find']>
    try {
      browser = bonjour.find({ type: 'pdl-datastream' }, (service) => {
        const host = service.addresses?.find((address) => address.includes('.')) ?? service.host
        if (!host) return
        found.set(host, {
          transport: 'network',
          name: service.name,
          host,
          port: service.port || DEFAULT_RAW_PRINTER_PORT,
          source: 'mdns',
          likelyReceipt: looksLikeReceiptPrinter(service.name),
        })
      })
    } catch {
      bonjour.destroy()
      resolve([])
      return
    }
    setTimeout(() => {
      browser.stop()
      bonjour.destroy()
      resolve([...found.values()])
    }, durationMs)
  })
}

/**
 * Every network printer the server can find right now: mDNS answers first (they carry a real name),
 * then any other host answering on port 9100. Deduplicated by address.
 */
export async function discoverNetworkPrinters(): Promise<DiscoveredPrinter[]> {
  const [advertised, answering] = await Promise.all([browseMdnsPrinters().catch(() => []), scanHostsForPort(localSubnetHosts(), DEFAULT_RAW_PRINTER_PORT)])
  const byHost = new Map(advertised.map((printer) => [printer.host, printer]))
  for (const host of answering) {
    if (!byHost.has(host)) byHost.set(host, { transport: 'network', name: host, host, port: DEFAULT_RAW_PRINTER_PORT, source: 'scan', likelyReceipt: false })
  }
  return [...byHost.values()]
}
