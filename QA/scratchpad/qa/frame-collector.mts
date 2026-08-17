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
import type { CapabilityReport } from './capabilityProbe.mts'
import type { CoverProbeReport } from './coverLayerProbe.mts'

const PORT = Number(process.env.QA_COLLECTOR_PORT ?? 4999)
const OUT = process.argv[2] ?? 'QA/scratchpad/qa/tv-frames.json'
/** Where `capabilityProbe.mts`'s own one-shot report lands — a sibling of `OUT` so a run's frame data and the device it was taken on stay together. */
const CAPABILITY_OUT = OUT.replace(/\.json$/, '') + '-capability.json'

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
      const payload = JSON.parse(body) as FrameWindow | CapabilityReport
      // One sink, two payload kinds — the capability probe (`capabilityProbe.mts`) fires once per
      // load and the frame sampler fires once per transition, and running a second server just for
      // the one-shot report would mean a second port to open on the LAN for no benefit.
      if ('kind' in payload && payload.kind === 'capability') {
        writeFileSync(CAPABILITY_OUT, JSON.stringify(payload, null, 2))
        console.log(
          `[capability] Chrome ${payload.chromeVersion ?? '?'}  viewTransitions=${payload.hasViewTransitions}  LoAF=${payload.hasLoAF}  ` +
            `${payload.screen.width}x${payload.screen.height}@${payload.screen.dpr}  cores=${payload.cores ?? '?'}  mem=${payload.deviceMemoryGb ?? '?'}GB\n` +
            `             ${payload.userAgent}\n             -> ${CAPABILITY_OUT}`,
        )
        res.writeHead(204, cors)
        res.end()
        return
      }
      if ('kind' in payload && (payload as { kind: string }).kind === 'cover-probe') {
        const cover = payload as unknown as CoverProbeReport
        console.log(
          `[cover-probe] decode=${cover.decodeMs}ms  image=${cover.imageSize.width}x${cover.imageSize.height}  ` +
            `blocked=${cover.blockedForMs}ms over a ${cover.fadeMs}ms fade`,
        )
        writeFileSync(OUT.replace(/\.json$/, '') + '-cover.json', JSON.stringify(cover, null, 2))
        res.writeHead(204, cors)
        res.end()
        return
      }
      // A free-form escape hatch for one-off in-page diagnostics on a device with no attachable
      // DevTools (see the report's §1): anything posted as `{ kind: 'debug', ... }` is printed and
      // otherwise ignored. Deliberately handled *before* the frame-window fallthrough below — an
      // unrecognised payload would otherwise be pushed into the frame array and silently corrupt the
      // run file it is meant to be diagnosing.
      if ('kind' in payload && (payload as { kind: string }).kind === 'debug') {
        console.log(`[debug] ${JSON.stringify((payload as unknown as Record<string, unknown>).data)}`)
        res.writeHead(204, cors)
        res.end()
        return
      }
      const window = payload as FrameWindow
      windows.push(window)
      writeFileSync(OUT, JSON.stringify(windows, null, 2))
      console.log(
        `#${String(window.index).padStart(2)} ${window.fromStage}->${window.toStage}  ` +
          `frames=${String(window.frames).padStart(3)}  worst=${String(window.worstMs).padStart(6)}ms  ` +
          `mean=${String(window.meanMs).padStart(5)}ms  >20=${String(window.over20).padStart(3)}  >33=${String(window.over33).padStart(3)}  ` +
          // Per-phase debt rather than holding alone — see `debtByPhase`'s own doc comment for the TV
          // result that made a holding-only reading misleading.
          `debt[${['exiting', 'holding', 'idle'].map((p) => `${p[0]}=${window.debtByPhase?.[p] ?? 0}`).join(' ')}]  @${window.worstPhase}  (${window.durationMs}ms)`,
      )
    } catch {
      console.warn('[collector] dropped malformed body')
    }
    res.writeHead(204, cors)
    res.end()
  })
}).listen(PORT, () => console.log(`[collector] listening on :${PORT}, writing ${OUT}`))
