/**
 * Scratchpad-only — not part of the app. A tiny CORS-open HTTP sink the in-page frame sampler
 * (`frameSampler.mts`) POSTs each completed transition window to, so the Android TV — which has no
 * attachable DevTools on a release build — can still report the same in-page numbers the desktop run
 * reads directly out of the page. Prints each window as it lands and appends them to a JSON file.
 *
 * Usage: npx tsx QA/scratchpad/qa/frame-collector.mts <out.json>
 */
import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import type { FrameWindow } from './frameSampler.mts'

const PORT = Number(process.env.QA_COLLECTOR_PORT ?? 4999)
const OUT = process.argv[2] ?? 'QA/scratchpad/qa/tv-frames.json'

const windows: FrameWindow[] = []

createServer((req, res) => {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return
  }
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    try {
      const window = JSON.parse(body) as FrameWindow
      windows.push(window)
      writeFileSync(OUT, JSON.stringify(windows, null, 2))
      console.log(
        `#${String(window.index).padStart(2)} ${window.fromStage}->${window.toStage}  ` +
          `frames=${String(window.frames).padStart(3)}  worst=${String(window.worstMs).padStart(6)}ms  ` +
          `mean=${String(window.meanMs).padStart(5)}ms  >16.7=${String(window.over16_7).padStart(3)}  >20=${String(window.over20).padStart(3)}  >33=${String(window.over33).padStart(3)}  (${window.durationMs}ms)`,
      )
    } catch {
      console.warn('[collector] dropped malformed body')
    }
    res.writeHead(204, cors)
    res.end()
  })
}).listen(PORT, () => console.log(`[collector] listening on :${PORT}, writing ${OUT}`))
