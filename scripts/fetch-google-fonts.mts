/**
 * Downloads every font this app can display, as self-hosted `woff2`, so the kiosk never needs to
 * reach Google Fonts at runtime.
 *
 * **Why this exists.** Fonts were loaded straight from `fonts.googleapis.com` (see `index.html` and
 * `useGoogleFontLoader`), which makes typography depend on an internet connection a kiosk may not
 * have. It also broke bitmap capture: `html-to-image` has to inline every `@font-face` source into
 * the capture, and doing that against a cross-origin CDN meant ~100 requests per capture — slow
 * enough on the TV to look like a hang. Serving the same fonts same-origin fixes both.
 *
 * **Why not `github.com/google/fonts`.** That repo ships TTF/OTF *sources* for ~1800 families, about
 * 1.5 GB, most of which this app never offers. The CSS API instead serves `woff2` — 3-5x smaller,
 * and exactly the ~999 families in `src/data/googleFonts.json`. Measured across a 12-family spread:
 * ~34 KB per family, so the whole set lands in the tens of MB.
 *
 * **Why only Latin subsets.** Google splits each family into `unicode-range` subsets, and the CJK
 * families in the list (`Noto Sans SC/JP/KR`, `Nanum*`, `M PLUS`, ...) have hundreds of them running
 * to tens of MB each — they alone would take the bundle from tens of MB to hundreds. Keeping
 * `SUBSETS` restricts every family to the ranges this app's own languages actually need (see
 * `src/i18n/languages.json`), which costs a CJK family nothing it would ever render here.
 *
 * Idempotent and resumable: a `woff2` already on disk is never re-fetched, so an interrupted run can
 * simply be run again. Rebuilds the CSS from scratch each time regardless, so a removed family never
 * lingers in it.
 *
 * Usage: npx tsx scripts/fetch-google-fonts.mts [--out <dir>] [--concurrency <n>]
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

/**
 * Which `unicode-range` subsets to keep — matched against the `/* latin *\/`-style comment the CSS
 * API emits before each `@font-face`.
 *
 * `latin` and `latin-ext` cover English and Norwegian (this app's two languages, plus the accented
 * characters a product name might carry). `vietnamese` rides along because Google frequently bundles
 * it into the same variable-font file as latin, so excluding it saves nothing.
 */
const SUBSETS = new Set(['latin', 'latin-ext', 'vietnamese'])

/**
 * A desktop Chrome UA, required rather than cosmetic: the CSS API content-negotiates on it and
 * returns `ttf` to an unrecognised client. Node's default agent gets the larger, wrong format.
 */
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36'

/** Matches what the app asks for at runtime, so a family is downloaded at the weights it will actually be rendered at. */
const WEIGHT_QUERY = ':wght@300..700'

/**
 * Last-resort specs, tried one at a time for a family that rejects both the ranged and the bare
 * query.
 *
 * The CSS API returns **400** for any weight a family does not publish, rather than silently serving
 * the nearest one — so a family offered at a single unusual weight (or in italic only) fails both of
 * the normal queries. Five of the 999 did exactly that: `Buda` exists only at 300, `Coda Caption`
 * only at 800, `UnifrakturCook` only at 700, `Molle` only in italic. Walking the standard weight
 * ladder and then italic finds whatever a family does publish without hardcoding any family names,
 * so a future list change cannot silently reintroduce the gap.
 *
 * Only ever reached by families that already failed twice, so the extra requests cost nothing on a
 * normal run.
 */
const FALLBACK_SPECS = [':wght@400', ':wght@300', ':wght@700', ':wght@500', ':wght@600', ':wght@800', ':wght@900', ':wght@200', ':wght@100', ':ital@1']

interface Args {
  outDir: string
  concurrency: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const read = (flag: string) => {
    const index = argv.indexOf(flag)
    return index >= 0 ? argv[index + 1] : undefined
  }
  return {
    // Under `public/` so Vite copies it into `dist/` on build and the server serves it same-origin
    // with no extra route — and so the installer's existing `..\public\*` entry ships it unchanged.
    outDir: resolve(REPO_ROOT, read('--out') ?? 'public/fonts'),
    concurrency: Number(read('--concurrency') ?? 8),
  }
}

/** Fetches with a couple of retries — 999 families is enough requests that a transient failure is expected rather than exceptional. */
async function fetchWithRetry(url: string, init: RequestInit = {}, attempts = 3): Promise<Response | null> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, headers: { 'user-agent': USER_AGENT, ...(init.headers ?? {}) } })
      if (response.ok) return response
      // 400 means this family does not offer the requested weight range — a real answer, not a
      // transient failure, so the caller retries with a different query rather than this loop
      // hammering an request that will never succeed.
      if (response.status === 400) return null
    } catch {
      // fall through to the backoff below
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, 400 * attempt))
  }
  return null
}

/** One `@font-face` block, paired with the subset comment that preceded it. */
interface FaceBlock {
  subset: string
  css: string
}

/**
 * Splits a CSS API response into its `@font-face` blocks, each tagged with the subset named in the
 * comment above it. The API always emits those comments; a block without one is kept and tagged
 * `unknown` so a format change degrades to "keep everything" rather than silently dropping fonts.
 */
function parseFaces(css: string): FaceBlock[] {
  const blocks: FaceBlock[] = []
  const pattern = /\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(css)) !== null) blocks.push({ subset: match[1], css: match[2] })
  if (blocks.length === 0) {
    const bare = /@font-face\s*\{[^}]*\}/g
    let face: RegExpExecArray | null
    while ((face = bare.exec(css)) !== null) blocks.push({ subset: 'unknown', css: face[0] })
  }
  return blocks
}

/** A filesystem-safe, collision-free name for one downloaded file, derived from the CDN path so the same source always maps to the same local file (which is what makes re-runs skip it). */
function localFileName(family: string, url: string): string {
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const id = url.split('/').pop() ?? 'font.woff2'
  return `${slug}-${id}`
}

/**
 * Writes the attribution/licence notice that ships next to the downloaded fonts.
 *
 * **Not optional politeness.** Linking a font from Google's CDN is use; bundling the `woff2` files
 * into an installer is *redistribution*, and every licence in the Google Fonts catalogue (SIL OFL
 * 1.1, Apache 2.0, UFL 1.0) requires the licence to travel with the files. This notice is what makes
 * the shipped product compliant, so it is generated by the same script that does the downloading
 * rather than being a README paragraph someone has to remember to keep in sync.
 */
function writeLicenseNotice(outDir: string, familyCount: number) {
  const notice = `# Font licences

The \`.woff2\` files in \`files/\` and the generated \`google-fonts.css\` are **not** part of this
project's own source. They are ${familyCount} font families from the [Google Fonts](https://fonts.google.com)
catalogue, downloaded by \`scripts/fetch-google-fonts.mts\` and redistributed with this application so
displays render correct typography without internet access.

Each family remains under its own upstream licence — across the catalogue these are:

- **SIL Open Font License 1.1** — <https://scripts.sil.org/OFL> (the large majority)
- **Apache License 2.0** — <https://www.apache.org/licenses/LICENSE-2.0>
- **Ubuntu Font License 1.0** — <https://ubuntu.com/legal/font-licence>

All three permit redistribution, including bundled in an installer, provided the licence travels with
the files — which is what this file is for. None of them require this application to change its own
licence.

Per-family licence text and full authorship live upstream: the family's page on
<https://fonts.google.com>, or its directory in <https://github.com/google/fonts>. No modifications
are made to any font here — the files are served exactly as delivered by Google's CSS API, restricted
to the Latin subsets this application needs.

This file is generated. Re-run \`npm run fonts:fetch\` to refresh it.
`
  writeFileSync(join(outDir, 'LICENSES.md'), notice)
}

async function main() {
  const { outDir, concurrency } = parseArgs()
  const filesDir = join(outDir, 'files')
  mkdirSync(filesDir, { recursive: true })

  const families: string[] = JSON.parse(readFileSync(join(REPO_ROOT, 'src/data/googleFonts.json'), 'utf-8'))
  console.log(`[fonts] ${families.length} families -> ${outDir}`)

  const cssChunks: string[] = []
  let downloaded = 0
  let skipped = 0
  let failed: string[] = []
  let bytes = 0
  let done = 0

  /** Resolves one family: fetch its CSS, keep the wanted subsets, download any file not already present, and return the rewritten CSS. */
  async function processFamily(family: string): Promise<string | null> {
    const encoded = family.replace(/\s+/g, '+')
    // The weighted query first (matching runtime), then the plain one for a family that offers no
    // such range — a static single-weight display face, of which the list has many — then the
    // explicit ladder for the handful that publish only one unusual weight (see `FALLBACK_SPECS`).
    const get = (spec: string) => fetchWithRetry(`https://fonts.googleapis.com/css2?family=${encoded}${spec}&display=swap`)
    let response = (await get(WEIGHT_QUERY)) ?? (await get(''))
    for (const spec of FALLBACK_SPECS) {
      if (response) break
      response = await get(spec)
    }
    if (!response) {
      failed.push(family)
      return null
    }

    const css = await response.text()
    const kept = parseFaces(css).filter((block) => SUBSETS.has(block.subset) || block.subset === 'unknown')
    const out: string[] = []

    for (const block of kept) {
      const urlMatch = /url\((https:\/\/[^)]+\.woff2)\)/.exec(block.css)
      if (!urlMatch) continue
      const remote = urlMatch[1]
      const name = localFileName(family, remote)
      const target = join(filesDir, name)

      if (existsSync(target)) {
        skipped++
      } else {
        const file = await fetchWithRetry(remote)
        if (!file) {
          failed.push(`${family} (${remote})`)
          continue
        }
        const buffer = Buffer.from(await file.arrayBuffer())
        writeFileSync(target, buffer)
        bytes += buffer.byteLength
        downloaded++
      }
      // Root-relative so it resolves against whatever host/port the local server is on, which is not
      // known at download time and differs between dev, preview and an installed kiosk.
      out.push(block.css.replace(remote, `/fonts/files/${name}`))
    }

    return out.length ? `/* ${family} */\n${out.join('\n')}` : null
  }

  // A bounded worker pool rather than `Promise.all` over all 999 — the CSS API rate-limits, and a
  // thousand parallel requests reliably trips it.
  const queue = [...families]
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (;;) {
      const family = queue.shift()
      if (family === undefined) return
      const chunk = await processFamily(family)
      if (chunk) cssChunks.push(chunk)
      done++
      if (done % 50 === 0) console.log(`[fonts] ${done}/${families.length} families, ${downloaded} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`)
    }
  })
  await Promise.all(workers)

  const header = [
    '/*',
    ' * GENERATED by scripts/fetch-google-fonts.mts — do not edit by hand.',
    ' *',
    ' * Self-hosted Google Fonts, so the kiosk renders correct typography with no internet access',
    ' * and so html-to-image can inline @font-face sources same-origin. Re-run the script to refresh.',
    ` * Families: ${families.length}. Subsets: ${[...SUBSETS].join(', ')}.`,
    ' *',
    ' * Licensing: see the sibling LICENSES.md. These fonts are redistributed, not merely linked,',
    ' * so their licenses ship alongside them.',
    ' */',
    '',
  ].join('\n')
  writeFileSync(join(outDir, 'google-fonts.css'), `${header}${cssChunks.sort().join('\n\n')}\n`)
  writeLicenseNotice(outDir, families.length)

  console.log(`[fonts] done: ${downloaded} downloaded, ${skipped} already present, ${(bytes / 1024 / 1024).toFixed(1)} MB new`)
  if (failed.length) {
    console.warn(`[fonts] ${failed.length} failed:`)
    for (const entry of failed.slice(0, 20)) console.warn(`  - ${entry}`)
    if (failed.length > 20) console.warn(`  ...and ${failed.length - 20} more`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
