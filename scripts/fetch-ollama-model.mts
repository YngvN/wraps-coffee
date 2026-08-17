/**
 * Downloads the AI models the Windows installer bundles, laid out exactly as Ollama's own model
 * store expects them, so a freshly installed kiosk has a working offline assistant with no download.
 *
 * **Why this exists.** The installer already bundles Ollama itself (`installer/OllamaSetup.exe`) but
 * shipped no weights, so the first thing a new kiosk needed was for someone to find Settings ->
 * Integrations -> Ollama and wait out a 2.5 GB pull — on exactly the kind of slow cafe connection
 * that bundling the Ollama binary was meant to avoid waiting on. Seeding the store at install time
 * removes that step entirely.
 *
 * **Why it talks to the registry directly** rather than running `ollama pull` on the build machine:
 * that would mean installing and starting Ollama inside CI just to copy files back out of its store.
 * Ollama serves its models over the plain Docker registry v2 protocol, so a manifest fetch plus one
 * GET per layer produces byte-identical output with nothing installed. Verified against a real
 * `ollama pull qwen3:4b` store: the manifest is stored verbatim as the registry serves it, and every
 * blob (the config blob included) is stored as `blobs/sha256-<hex>` — ':' replaced by '-'.
 *
 * **Why only the thinking model.** `DEFAULT_OLLAMA_CONFIG` (`server/store.ts`) names two defaults:
 * `qwen3:4b` for text and `qwen2.5vl:3b` for vision. Bundling both (~5.7 GB) would push the compiled
 * installer past Inno Setup's 4,200,000,000-byte single-file limit and force disk spanning, which
 * turns one `ADHDisplaySetup.exe` into an .exe plus .bin slices the client has to keep together.
 * Vision therefore keeps its existing on-demand download.
 *
 * Idempotent and resumable: a blob already on disk at its expected size is never re-fetched, and
 * every download lands in a `.part` file that is only renamed into place after its sha256 verifies,
 * so an interrupted or corrupted run can simply be run again.
 *
 * Usage: npx tsx scripts/fetch-ollama-model.mts [--out <dir>] [--model <name:tag>]
 */
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

/**
 * Which models to bundle, as `name:tag` (an explicit `namespace/name:tag` also works).
 *
 * Kept as a list rather than a single constant so adding a second model is a one-line change — but
 * see the module comment above for why it currently holds only the thinking model.
 */
const MODELS = ['qwen3:4b']

/** Ollama's public registry. Same host `ollama pull` itself talks to. */
const REGISTRY = 'https://registry.ollama.ai'

/** The registry answers with a v1 fat manifest unless asked for the v2 one Ollama actually stores. */
const MANIFEST_ACCEPT = 'application/vnd.docker.distribution.manifest.v2+json'

/** The layer holding a model's own licence text, which is what `writeLicenseNotice` redistributes. */
const LICENSE_MEDIA_TYPE = 'application/vnd.ollama.image.license'

/** One entry in a model manifest — the config blob and every layer share this shape. */
interface Descriptor {
  mediaType: string
  digest: string
  size: number
}

interface Manifest {
  config: Descriptor
  layers: Descriptor[]
}

/** A model reference split into the parts the registry URL and the on-disk manifest path both need. */
interface ModelRef {
  /** Almost always `library`, but an explicit `namespace/name:tag` reference is honoured. */
  namespace: string
  name: string
  tag: string
}

interface Args {
  outDir: string
  models: string[]
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const read = (flag: string) => {
    const index = argv.indexOf(flag)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const model = read('--model')
  return {
    // Next to the other third-party binaries the installer bundles and gitignores
    // (`OllamaSetup.exe`, `node-lts-x64.msi`) — see adhdisplay.iss's own header comment.
    outDir: resolve(REPO_ROOT, read('--out') ?? 'installer/ollama-models'),
    models: model ? [model] : MODELS,
  }
}

/** Splits `qwen3:4b` (or `library/qwen3:4b`) into its registry path parts, defaulting tag to `latest`. */
function parseModelRef(reference: string): ModelRef {
  const [path, tag = 'latest'] = reference.split(':')
  const parts = path.split('/')
  return parts.length > 1
    ? { namespace: parts[0], name: parts.slice(1).join('/'), tag }
    : { namespace: 'library', name: path, tag }
}

/** `sha256:abc...` -> `sha256-abc...`, which is how Ollama names the file on disk. */
function blobFileName(digest: string): string {
  return digest.replace(':', '-')
}

/** Fetches with a couple of retries, since a multi-GB blob download is long enough that a transient network failure is expected rather than exceptional. */
async function fetchWithRetry(url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  let lastError = ''
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, init)
      if (response.ok) return response
      lastError = `HTTP ${response.status} ${response.statusText}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, 1000 * attempt))
  }
  throw new Error(`${url} failed after ${attempts} attempts: ${lastError}`)
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${(bytes / 1000).toFixed(1)} kB`
}

/**
 * Streams one blob to disk and verifies its sha256 against the digest that named it.
 *
 * Content-addressed storage makes verification cheap insurance rather than paranoia: a silently
 * truncated 2.5 GB blob would compile into an installer perfectly happily and only fail on a
 * customer's machine, as an Ollama error nobody can trace back to a build. Writing through a `.part`
 * file means a failed or interrupted run leaves nothing that a later run would mistake for a
 * complete blob.
 *
 * Returns false when the blob was already present and correctly sized (nothing downloaded).
 */
async function downloadBlob(baseUrl: string, descriptor: Descriptor, blobsDir: string): Promise<boolean> {
  const target = join(blobsDir, blobFileName(descriptor.digest))
  if (existsSync(target) && statSync(target).size === descriptor.size) return false

  const partial = `${target}.part`
  const response = await fetchWithRetry(`${baseUrl}/blobs/${descriptor.digest}`)
  if (!response.body) throw new Error(`${descriptor.digest}: empty response body`)

  const hash = createHash('sha256')
  const stream = createWriteStream(partial)
  let received = 0
  let lastLoggedPercent = -1

  try {
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk)
      hash.update(buffer)
      received += buffer.byteLength
      if (!stream.write(buffer)) await new Promise((r) => stream.once('drain', r))
      // Only worth logging for the model layer; the small metadata blobs finish in one chunk.
      if (descriptor.size > 100_000_000) {
        const percent = Math.floor((received / descriptor.size) * 10) * 10
        if (percent > lastLoggedPercent) {
          lastLoggedPercent = percent
          console.log(`[ollama]     ${percent}% (${formatBytes(received)} of ${formatBytes(descriptor.size)})`)
        }
      }
    }
    await new Promise<void>((done, fail) => stream.end((error?: Error) => (error ? fail(error) : done())))

    const actual = `sha256:${hash.digest('hex')}`
    if (actual !== descriptor.digest) throw new Error(`digest mismatch: expected ${descriptor.digest}, got ${actual}`)
    if (received !== descriptor.size) throw new Error(`size mismatch: expected ${descriptor.size} bytes, got ${received}`)
  } catch (error) {
    stream.destroy()
    rmSync(partial, { force: true })
    throw error
  }

  renameSync(partial, target)
  return true
}

/**
 * Writes the attribution/licence notice that ships alongside the weights.
 *
 * **Not optional politeness**, exactly as in `fetch-google-fonts.mts`: pulling a model at runtime is
 * use, but bundling its weights into an installer is *redistribution*, and Qwen3 is Apache-2.0,
 * which requires the licence to travel with the files. The text is taken from the model's own
 * `application/vnd.ollama.image.license` layer rather than a hardcoded copy, so it is by
 * construction the licence the publisher actually shipped.
 */
function writeLicenseNotice(outDir: string, entries: { reference: string; license: string }[]) {
  const sections = entries
    .map(({ reference, license }) => `## ${reference}\n\n\`\`\`\n${license.trim()}\n\`\`\`\n`)
    .join('\n')

  const notice = `# Bundled AI model licences

The files in \`blobs/\` and \`manifests/\` are **not** part of this project's own source. They are
model weights and metadata published on the [Ollama](https://ollama.com) model registry, downloaded
by \`scripts/fetch-ollama-model.mts\` and redistributed with this application so the AI assistant
works on a kiosk with no internet access.

Bundled here: ${entries.map((entry) => `\`${entry.reference}\``).join(', ')}.

Qwen3 is published by the Qwen team at Alibaba Cloud under the **Apache License 2.0**
(<https://www.apache.org/licenses/LICENSE-2.0>), which permits redistribution — including bundled in
an installer — provided the licence travels with the files, which is what this file is for. It does
not require this application to change its own licence.

No model is modified: every blob is byte-for-byte what the registry serves, verified by its own
sha256 digest at download time.

Each model's licence text, exactly as its publisher ships it, follows.

${sections}
This file is generated. Re-run \`npm run ollama:fetch\` to refresh it.
`
  writeFileSync(join(outDir, 'LICENSES.md'), notice)
}

async function main() {
  const { outDir, models } = parseArgs()
  const blobsDir = join(outDir, 'blobs')
  mkdirSync(blobsDir, { recursive: true })

  console.log(`[ollama] ${models.length} model(s) -> ${outDir}`)

  /** Store-relative paths of everything seeded, for the installer's own targeted uninstall. */
  const seeded: string[] = []
  const licenses: { reference: string; license: string }[] = []
  let downloaded = 0
  let skipped = 0
  let bytes = 0

  for (const reference of models) {
    const { namespace, name, tag } = parseModelRef(reference)
    const baseUrl = `${REGISTRY}/v2/${namespace}/${name}`
    console.log(`[ollama] ${reference}`)

    const response = await fetchWithRetry(`${baseUrl}/manifests/${tag}`, { headers: { accept: MANIFEST_ACCEPT } })
    // Kept verbatim rather than re-serialised from the parsed object: this is the exact byte stream
    // `ollama pull` writes, and matching it means nothing downstream can depend on our formatting.
    const manifestText = await response.text()
    const manifest = JSON.parse(manifestText) as Manifest

    for (const descriptor of [manifest.config, ...manifest.layers]) {
      const label = descriptor.mediaType.split('.').pop()
      if (await downloadBlob(baseUrl, descriptor, blobsDir)) {
        downloaded++
        bytes += descriptor.size
        console.log(`[ollama]   + ${label} ${formatBytes(descriptor.size)}`)
      } else {
        skipped++
      }
      seeded.push(`blobs/${blobFileName(descriptor.digest)}`)

      if (descriptor.mediaType === LICENSE_MEDIA_TYPE) {
        licenses.push({ reference, license: readFileSync(join(blobsDir, blobFileName(descriptor.digest)), 'utf-8') })
      }
    }

    // Ollama looks the model up by this path, with the tag as the bare filename and no extension.
    const manifestRelative = `manifests/${new URL(REGISTRY).host}/${namespace}/${name}/${tag}`
    const manifestPath = join(outDir, manifestRelative)
    mkdirSync(dirname(manifestPath), { recursive: true })
    writeFileSync(manifestPath, manifestText)
    seeded.push(manifestRelative)
  }

  // Read back by the installer's uninstaller so it can remove exactly what it seeded, instead of
  // either deleting a store that may hold models the admin pulled themselves or leaving gigabytes
  // orphaned behind (see adhdisplay.iss's CurUninstallStepChanged).
  writeFileSync(join(outDir, 'seeded-files.txt'), `${seeded.join('\n')}\n`)
  writeLicenseNotice(outDir, licenses)

  console.log(`[ollama] done: ${downloaded} downloaded (${formatBytes(bytes)}), ${skipped} already present`)
}

main().catch((error) => {
  console.error('[ollama] failed:', error)
  process.exit(1)
})
