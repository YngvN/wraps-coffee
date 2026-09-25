/**
 * Printers installed in the server machine's own print queue — typically a receipt printer plugged in
 * by USB. Jobs are sent *raw* (the ESC/POS bytes untouched, no driver rendering), which every receipt
 * printer's queue accepts:
 * - macOS/Linux: CUPS — `lpstat -v` to list queues, `lp -d <queue> -o raw` to print;
 * - Windows: the spooler — `Get-Printer` to list, and the `winspool.drv` `WritePrinter` API with a
 *   `RAW` datatype to print, driven from PowerShell so there's no native npm dependency to build.
 */
import { execFile, spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { looksLikeReceiptPrinter, type DiscoveredPrinter } from '../../src/types/printer'

const execFileAsync = promisify(execFile)

/** Parses `LANG=C lpstat -v` output (`device for <queue>: <uri>` per line) into queue name + device URI. */
export function parseLpstat(output: string): { name: string; uri: string }[] {
  return output
    .split('\n')
    .map((line) => /^device for ([^:]+):\s*(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ name: match[1], uri: match[2] }))
}

/** Every queue on this machine, receipt-looking ones flagged. Empty (not an error) when the OS has no print system or no printers. */
export async function listSystemPrinters(): Promise<DiscoveredPrinter[]> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', 'Get-Printer | Select-Object Name,PortName,DriverName | ConvertTo-Json -Compress'], { timeout: 15000 })
      const parsed = JSON.parse(stdout || '[]') as { Name: string; PortName?: string; DriverName?: string } | { Name: string; PortName?: string; DriverName?: string }[]
      return (Array.isArray(parsed) ? parsed : [parsed]).map((printer) => ({
        transport: 'system' as const,
        name: printer.Name,
        systemName: printer.Name,
        source: 'system' as const,
        likelyReceipt: looksLikeReceiptPrinter(`${printer.Name} ${printer.DriverName ?? ''}`),
      }))
    }
    const { stdout } = await execFileAsync('lpstat', ['-v'], { timeout: 10000, env: { ...process.env, LANG: 'C', LC_ALL: 'C' } })
    return parseLpstat(stdout).map(({ name, uri }) => ({ transport: 'system' as const, name, systemName: name, source: 'system' as const, likelyReceipt: looksLikeReceiptPrinter(`${name} ${uri}`) }))
  } catch {
    return []
  }
}

/** C# for the Windows raw print — `WritePrinter` with datatype `RAW`, so the spooler passes the bytes to the printer untouched. */
const WINDOWS_RAW_PRINT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class RawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern int StartDocPrinter(IntPtr handle, int level, DOCINFO info);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
  public static void Send(string printer, byte[] bytes) {
    IntPtr handle;
    if (!OpenPrinter(printer, out handle, IntPtr.Zero)) throw new Exception("Cannot open printer " + printer);
    try {
      if (StartDocPrinter(handle, 1, new DOCINFO { pDocName = "Receipt", pDataType = "RAW" }) == 0) throw new Exception("StartDocPrinter failed");
      StartPagePrinter(handle);
      int written;
      if (!WritePrinter(handle, bytes, bytes.Length, out written) || written != bytes.Length) throw new Exception("WritePrinter failed");
      EndPagePrinter(handle); EndDocPrinter(handle);
    } finally { ClosePrinter(handle); }
  }
}
"@
[RawPrint]::Send($args[0], [System.IO.File]::ReadAllBytes($args[1]))
`

/** Sends one raw job to a system queue. Rejects with the OS's own error if the queue refuses it. */
export async function printToSystemPrinter(systemName: string, bytes: Uint8Array): Promise<void> {
  if (process.platform === 'win32') {
    const dir = await mkdtemp(join(tmpdir(), 'receipt-'))
    try {
      const job = join(dir, 'job.bin')
      const script = join(dir, 'print.ps1')
      await writeFile(job, bytes)
      await writeFile(script, WINDOWS_RAW_PRINT, 'utf-8')
      await execFileAsync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, systemName, job], { timeout: 30000 })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
    return
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn('lp', ['-d', systemName, '-o', 'raw'], { env: { ...process.env, LANG: 'C', LC_ALL: 'C' } })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.once('error', reject)
    child.once('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `lp exited with ${code}`))))
    child.stdin.end(Buffer.from(bytes))
  })
}
