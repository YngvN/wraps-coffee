/**
 * Seeds (or, with `--remove`, cleans up) the 5 synthetic pane-resize-stutter screens via the server's
 * real `/login` + WS `write` sync protocol — the same path the admin dashboard itself uses, so the TV
 * companion app can load these screens exactly like any real one (see the plan's "seeded via the
 * server's real sync path" design decision).
 *
 * Always read-modify-writes the FULL array for `admin.screens`/`admin.products`/`admin.catalogues` and
 * backs up each file before its first write — `server/store.ts`'s `set()` is a wholesale overwrite with
 * no server-side merge, so anything less would silently wipe every real record. See the plan's verified
 * clobber-risk fix.
 *
 * Usage:
 *   npx tsx diagnostics/pane-resize-stutter/scripts/01-seed-screens.ts --username admin --password 1234
 *   npx tsx diagnostics/pane-resize-stutter/scripts/01-seed-screens.ts --username admin --password 1234 --remove
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Catalogue } from '../../../src/types/category'
import type { Product } from '../../../src/types/product'
import type { ScreenConfig } from '../../../src/types/screen'
import type { SyncedKey } from '../../../src/types/sync'
import { buildAllScenarioScreens } from '../lib/buildScenarioScreens'
import { backupSyncedKeyFile, isDiagId, login, openSyncSession, resolveServerUrls } from '../lib/seedClient'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')

function parseArgs(argv: string[]) {
  const args = new Map<string, string>()
  let remove = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--remove') {
      remove = true
      continue
    }
    if (argv[i].startsWith('--')) {
      args.set(argv[i].slice(2), argv[i + 1])
      i++
    }
  }
  return { args, remove }
}

async function main() {
  const { args, remove } = parseArgs(process.argv.slice(2))
  const username = args.get('username') ?? 'admin'
  const password = args.get('password') ?? '1234'
  const config = { host: args.get('host'), wsPort: args.get('wsPort') ? Number(args.get('wsPort')) : undefined, contentPort: args.get('contentPort') ? Number(args.get('contentPort')) : undefined }

  const { token } = await login(username, password, config)
  const keys: SyncedKey[] = ['admin.screens', 'admin.products', 'admin.catalogues']
  const session = await openSyncSession(token, keys, config)

  for (const key of keys) backupSyncedKeyFile(REPO_ROOT, key)

  const currentScreens = (session.snapshot['admin.screens'] as ScreenConfig[] | undefined) ?? []
  const currentProducts = (session.snapshot['admin.products'] as Product[] | undefined) ?? []
  const currentCatalogues = (session.snapshot['admin.catalogues'] as Catalogue[] | undefined) ?? []

  const nonDiagScreens = currentScreens.filter((screen) => !isDiagId(screen.screenID))
  const nonDiagProducts = currentProducts.filter((product) => !isDiagId(product.itemID))
  const nonDiagCatalogues = currentCatalogues.filter((catalogue) => !isDiagId(catalogue.id))

  if (remove) {
    session.write('admin.screens', nonDiagScreens)
    session.write('admin.products', nonDiagProducts)
    session.write('admin.catalogues', nonDiagCatalogues)
    console.log(`Removed ${currentScreens.length - nonDiagScreens.length} diagnostic screen(s), ${currentProducts.length - nonDiagProducts.length} product(s), ${currentCatalogues.length - nonDiagCatalogues.length} catalogue(s).`)
  } else {
    const scenarios = buildAllScenarioScreens()
    const nextScreens = [...nonDiagScreens, ...scenarios.map((scenario) => scenario.screen)]
    const nextProducts = [...nonDiagProducts, ...scenarios.flatMap((scenario) => scenario.products)]
    const nextCatalogues = [...nonDiagCatalogues, ...scenarios.flatMap((scenario) => (scenario.catalogue ? [scenario.catalogue] : []))]

    session.write('admin.screens', nextScreens)
    session.write('admin.products', nextProducts)
    session.write('admin.catalogues', nextCatalogues)

    const { contentUrl } = resolveServerUrls(config)
    console.log('Seeded diagnostic screens:')
    for (const scenario of scenarios) console.log(`  ${scenario.variant}: ${contentUrl}/screens/${scenario.screen.screenID}?unattended=1`)
    console.log(`\nTotal screens after seeding: ${nextScreens.length} (was ${currentScreens.length}). Verify no existing screen went missing before proceeding.`)
  }

  // The write above is fire-and-forget over the socket — give it a moment to actually reach the server
  // (and get persisted to disk) before closing the connection.
  await new Promise((resolve) => setTimeout(resolve, 500))
  session.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
